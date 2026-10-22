import { Router } from 'express';
import crypto from 'node:crypto';
import { z, wrap, validate, HttpError, audit, pageParams } from '../middleware/common.js';
import { requireRole, stripCost } from '../middleware/auth.js';
import { Recommendation, Product, Supplier, PurchaseOrder, Batch } from '../models/index.js';
import { resolveStore } from '../services/helpers.js';
import { tenantContext, addDays } from '../services/context.js';
import { adjustOnHand, logMovement } from '../services/stock.js';

const r = Router();
const inr = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 });

r.get('/recommendations', wrap(async (req, res) => {
  const storeId = await resolveStore(req); const ctx = await tenantContext(req.tenantId);
  const status = req.query.status || 'suggested';
  const m = { tenantId: req.tenantId, status: status === 'open' ? { $in: ['suggested', 'approved', 'edited'] } : status, ...(storeId && { storeId }) };
  const urg = req.query.urgency ? String(req.query.urgency).split(',') : ['now', 'soon'];
  if (status === 'suggested' || status === 'open') m.urgency = { $in: urg };
  const recs = await Recommendation.find(m).sort({ urgency: -1, estCostPaise: -1 }).limit(parseInt(req.query.limit) || 300).lean();
  const skus = [...new Set(recs.map((x) => x.sku))];
  const [prods, sups, olderBatches] = await Promise.all([
    Product.find({ tenantId: req.tenantId, sku: { $in: skus } }).select('sku name family packSize trackingPolicy').lean(),
    Supplier.find({ tenantId: req.tenantId }).lean(),
    Batch.find({ tenantId: req.tenantId, sku: { $in: skus }, remaining: { $gt: 0 }, expiryDate: { $type: 'string', $lte: addDays(ctx.today, 21) } }).sort({ expiryDate: 1 }).lean(),
  ]);
  const pm = Object.fromEntries(prods.map((p) => [p.sku, p])); const sm = Object.fromEntries(sups.map((s) => [s.supplierKey, s]));
  const ob = {}; for (const b of olderBatches) ob[`${b.storeId}|${b.sku}`] ??= b;
  const groups = {};
  const order = { now: 0, soon: 1, later: 2 };
  for (const x of recs) {
    const p = pm[x.sku] || {}; const g = (groups[`${x.storeId}|${x.supplierKey}`] ??= { storeId: x.storeId, supplierKey: x.supplierKey, supplierName: sm[x.supplierKey]?.name || x.supplierName, leadTimeDays: sm[x.supplierKey]?.leadTimeDays, totalEstCostPaise: 0, lines: [] });
    const old = ob[`${x.storeId}|${x.sku}`];
    g.totalEstCostPaise += (x.finalQty || 0) * (x.unitCostPaise || 0);
    g.lines.push({ ...x, name: p.name, family: p.family, packSize: p.packSize,
      oldBatchPrompt: old ? { batchId: old.batchId, remaining: old.remaining, expiryDate: old.expiryDate, question: `About ${old.remaining} left from the older batch (expires ${old.expiryDate}). How many are left?` } : null });
  }
  const out = Object.values(groups).map((g) => ({ ...g, lines: g.lines.sort((a, b) => order[a.urgency] - order[b.urgency]) })).sort((a, b) => b.totalEstCostPaise - a.totalEstCostPaise);
  res.json({ today: ctx.today, total: recs.length, groups: stripCost(req, out.map((g) => req.user.role === 'staff' ? { ...g, totalEstCostPaise: undefined, lines: stripCost(req, g.lines) } : g)) });
}));

const act = (patch) => wrap(async (req, res) => {
  const rec = await Recommendation.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!rec) throw new HttpError(404, 'not_found', 'Suggestion not found.');
  if (!['suggested', 'approved', 'edited', 'skipped'].includes(rec.status)) throw new HttpError(409, 'locked', 'This suggestion has already been ordered.');
  rec.set({ ...patch(req, rec), decidedBy: req.user.id, decidedAt: new Date() }); await rec.save();   // .set(): schema-less paths are only persisted via set()
  audit(req, `recommendation_${rec.status}`, 'recommendation', rec._id, { sku: rec.sku, suggested: rec.suggestedQty, final: rec.finalQty, reason: rec.skipReason });
  res.json(rec);
});
r.post('/recommendations/:id/approve', requireRole('manager'), act((req, rec) => ({ status: 'approved', finalQty: rec.suggestedQty })));
r.post('/recommendations/:id/edit', requireRole('manager'), validate(z.object({ finalQty: z.number().int().min(1).max(1_000_000) })), act((req) => ({ status: 'edited', finalQty: req.body.finalQty })));
r.post('/recommendations/:id/skip', requireRole('manager'), validate(z.object({ reason: z.enum(['overstocked', 'supplier_issue', 'not_selling', 'budget', 'other']) })), act((req) => ({ status: 'skipped', skipReason: req.body.reason })));

r.post('/orders/from-recommendations', requireRole('manager'), validate(z.object({ storeId: z.string(), supplierKey: z.string(), recIds: z.array(z.string()).min(1).max(500) })), wrap(async (req, res) => {
  const storeId = await resolveStore(req); const ctx = await tenantContext(req.tenantId);
  const recs = await Recommendation.find({ _id: { $in: req.body.recIds }, tenantId: req.tenantId, storeId, supplierKey: req.body.supplierKey, status: { $in: ['approved', 'edited'] } }).lean();
  if (!recs.length) throw new HttpError(400, 'nothing_approved', 'Approve at least one suggestion for this supplier first.');
  const sup = await Supplier.findOne({ tenantId: req.tenantId, supplierKey: req.body.supplierKey }).lean();
  const prods = Object.fromEntries((await Product.find({ tenantId: req.tenantId, sku: { $in: recs.map((x) => x.sku) } }).lean()).map((p) => [p.sku, p]));
  const lines = recs.map((x) => ({ sku: x.sku, name: prods[x.sku]?.name, orderedQty: x.finalQty, unitCostPaise: x.unitCostPaise || prods[x.sku]?.costPaise || 0, recommendationId: String(x._id) }));
  const poId = `PO-${ctx.today.replaceAll('-', '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const expected = addDays(ctx.today, sup?.leadTimeDays ?? 2);
  const po = await PurchaseOrder.create({ tenantId: req.tenantId, storeId, poId, supplierKey: req.body.supplierKey, orderDate: ctx.today, expectedDate: expected, status: 'SHARED', lines });
  for (const l of lines) await adjustOnHand(req.tenantId, storeId, l.sku, 0, { onOrder: l.orderedQty });
  await Recommendation.updateMany({ _id: { $in: recs.map((x) => x._id) } }, { $set: { status: 'ordered', poId } });
  const total = lines.reduce((a, l) => a + l.orderedQty * l.unitCostPaise, 0);
  const text = [`PURCHASE ORDER ${poId}`, `To: ${sup?.name || req.body.supplierKey}`, `Order date: ${ctx.today}   Expected: ${expected}`, '',
    ...lines.map((l, i) => `${i + 1}. ${l.name} — ${l.orderedQty} pcs`), '', ...(req.user.role === 'staff' ? [] : [`Estimated value: ${inr(total)}`]), 'Please confirm availability and delivery date.'].join('\n');
  audit(req, 'create_po', 'purchase_order', poId, { lines: lines.length }); res.status(201).json({ po, shareText: text });
}));

r.get('/orders', wrap(async (req, res) => {
  const { page, limit } = pageParams(req.query); const storeId = await resolveStore(req);
  const m = { tenantId: req.tenantId, ...(storeId && { storeId }), ...(req.query.status && { status: req.query.status }) };
  const [items, total] = await Promise.all([PurchaseOrder.find(m).sort({ orderDate: -1, poId: -1 }).skip((page - 1) * limit).limit(limit).lean(), PurchaseOrder.countDocuments(m)]);
  const sups = Object.fromEntries((await Supplier.find({ tenantId: req.tenantId }).lean()).map((s) => [s.supplierKey, s.name]));
  res.json({ page, limit, total, items: stripCost(req, items.map((p) => ({ ...p, supplierName: sups[p.supplierKey], lineCount: p.lines?.length || 0 }))) });
}));
r.get('/orders/:poId', wrap(async (req, res) => {
  const po = await PurchaseOrder.findOne({ tenantId: req.tenantId, poId: req.params.poId }).lean();
  if (!po) throw new HttpError(404, 'not_found', 'Order not found.');
  const names = Object.fromEntries((await Product.find({ tenantId: req.tenantId, sku: { $in: po.lines.map((l) => l.sku) } }).select('sku name').lean()).map((p) => [p.sku, p.name]));
  res.json(stripCost(req, { ...po, lines: po.lines.map((l) => ({ ...l, name: l.name || names[l.sku] })) }));
}));
r.post('/orders/:poId/cancel', requireRole('manager'), wrap(async (req, res) => {
  const po = await PurchaseOrder.findOne({ tenantId: req.tenantId, poId: req.params.poId });
  if (!po) throw new HttpError(404, 'not_found', 'Order not found.');
  if (!['DRAFT', 'SHARED', 'OPEN'].includes(po.status)) throw new HttpError(409, 'locked', 'Only open orders can be cancelled.');
  for (const l of po.lines) if (l.receivedQty == null) await adjustOnHand(req.tenantId, po.storeId, l.sku, 0, { onOrder: -l.orderedQty });
  po.status = 'CANCELLED'; await po.save(); audit(req, 'cancel_po', 'purchase_order', po.poId); res.json(po);
}));

const receiveBody = z.object({ invoiceNo: z.string().max(40).optional(), invoiceAmountPaise: z.number().int().min(0).optional(),
  lines: z.array(z.object({ sku: z.string(), receivedQty: z.number().int().min(0), damagedQty: z.number().int().min(0).default(0), expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    batchNo: z.string().max(40).optional(), costPaise: z.number().int().min(0).optional() })).min(1) });
r.post('/orders/:poId/receive', requireRole('staff'), validate(receiveBody), wrap(async (req, res) => {
  const ctx = await tenantContext(req.tenantId);
  const po = await PurchaseOrder.findOne({ tenantId: req.tenantId, poId: req.params.poId });
  if (!po) throw new HttpError(404, 'not_found', 'Order not found.');
  if (!['SHARED', 'DRAFT', 'OPEN', 'PARTIAL'].includes(po.status)) throw new HttpError(409, 'locked', 'This order is already closed.');
  const prods = Object.fromEntries((await Product.find({ tenantId: req.tenantId, sku: { $in: req.body.lines.map((l) => l.sku) } }).lean()).map((p) => [p.sku, p]));
  const variance = []; let pending = 0;
  for (const l of req.body.lines) {
    const pl = po.lines.find((x) => x.sku === l.sku); if (!pl) throw new HttpError(400, 'not_on_order', `${l.sku} is not on this order.`);
    if (l.damagedQty > l.receivedQty) throw new HttpError(400, 'bad_qty', 'Damaged quantity cannot exceed received quantity.');
    const good = l.receivedQty - l.damagedQty; const p = prods[l.sku] || {};
    if (good > 0) {
      let expiryDate = l.expiryDate, expirySource = 'entered', status = 'active';
      if (!expiryDate && p.trackingPolicy === 'strict') { status = 'pending_expiry'; expirySource = null; pending++; }
      else if (!expiryDate && p.trackingPolicy === 'estimate' && p.shelfLifeDays) { expiryDate = addDays(ctx.today, Math.round(p.shelfLifeDays * 0.9)); expirySource = 'estimated'; }
      else if (!expiryDate) expirySource = null;
      const batchId = `B-${po.poId}-${l.sku}`;
      await Batch.create({ tenantId: req.tenantId, storeId: po.storeId, sku: l.sku, batchId: l.batchNo ? `${batchId}-${l.batchNo}` : batchId, poId: po.poId, qty: good, remaining: good,
        costPaise: l.costPaise ?? pl.unitCostPaise, receivedDate: ctx.today, expiryDate, expirySource, status });
      await adjustOnHand(req.tenantId, po.storeId, l.sku, good);
      await logMovement(req, { storeId: po.storeId, sku: l.sku, date: ctx.today, type: 'RECEIPT', reason: `PO ${po.poId}`, qty: good });
    }
    if (l.damagedQty) await logMovement(req, { storeId: po.storeId, sku: l.sku, date: ctx.today, type: 'DAMAGED_ON_ARRIVAL', reason: `PO ${po.poId}`, qty: -l.damagedQty });
    await adjustOnHand(req.tenantId, po.storeId, l.sku, 0, { onOrder: -pl.orderedQty });
    pl.receivedQty = l.receivedQty; pl.damagedQty = l.damagedQty;
    variance.push({ sku: l.sku, ordered: pl.orderedQty, received: l.receivedQty, short: Math.max(0, pl.orderedQty - l.receivedQty), damaged: l.damagedQty,
      costChangePaise: l.costPaise != null ? l.costPaise - pl.unitCostPaise : 0 });
  }
  po.markModified('lines'); po.status = po.lines.every((x) => x.receivedQty != null) ? 'RECEIVED' : 'PARTIAL'; po.receivedDate = ctx.today;
  po.set({ invoiceNo: req.body.invoiceNo, invoiceAmountPaise: req.body.invoiceAmountPaise }); await po.save();
  audit(req, 'receive_po', 'purchase_order', po.poId, { lines: variance.length, pendingExpiry: pending });
  res.json({ status: po.status, variance: stripCost(req, variance), pendingExpiry: pending,
    message: pending ? `${pending} item(s) saved without an expiry date. Add them later from "Pending expiry".` : 'Delivery recorded.' });
}));
export default r;
