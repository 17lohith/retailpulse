import { Router } from 'express';
import { z, wrap, validate, HttpError, audit, pageParams } from '../middleware/common.js';
import { requireRole, stripCost } from '../middleware/auth.js';
import { Batch, InventoryState, InventoryInsight, Product, BatchConfirmation, StockCount, Tenant } from '../models/index.js';
import { resolveStore } from '../services/helpers.js';
import { tenantContext, addDays } from '../services/context.js';
import { adjustOnHand, logMovement } from '../services/stock.js';

const r = Router();
const alertDays = (tenant, source) => (source === 'estimated' ? tenant?.settings?.expiryAlertDays?.estimate ?? 30 : tenant?.settings?.expiryAlertDays?.strict ?? 5);

r.get('/state', wrap(async (req, res) => {
  const { page, limit } = pageParams(req.query); const storeId = await resolveStore(req);
  const m = { tenantId: req.tenantId, ...(storeId && { storeId }) };
  if (req.query.velocity) m.velocity = req.query.velocity;
  if (req.query.cover === 'low') m.daysOfCover = { $lt: 3 };
  const [items, total] = await Promise.all([InventoryInsight.find(m).sort({ daysOfCover: 1 }).skip((page - 1) * limit).limit(limit).lean(), InventoryInsight.countDocuments(m)]);
  const prods = await Product.find({ tenantId: req.tenantId, sku: { $in: items.map((i) => i.sku) } }).select('sku name family mrpPaise packSize').lean(); const pm = Object.fromEntries(prods.map((p) => [p.sku, p]));
  res.json({ page, limit, total, items: stripCost(req, items.map((i) => ({ ...i, name: pm[i.sku]?.name, family: pm[i.sku]?.family }))) });
}));

r.get('/batches', wrap(async (req, res) => {
  const { page, limit } = pageParams(req.query); const storeId = await resolveStore(req); const ctx = await tenantContext(req.tenantId);
  const m = { tenantId: req.tenantId, remaining: { $gt: 0 }, ...(storeId && { storeId }) };
  if (req.query.sku) m.sku = req.query.sku;
  if (req.query.status === 'expiring') m.expiryDate = { $gte: ctx.today, $lte: addDays(ctx.today, parseInt(req.query.withinDays) || 7) };
  if (req.query.status === 'expired') m.expiryDate = { $lt: ctx.today };
  if (req.query.status === 'pending') m.status = 'pending_expiry';
  const [items, total] = await Promise.all([Batch.find(m).sort({ expiryDate: 1 }).skip((page - 1) * limit).limit(limit).lean(), Batch.countDocuments(m)]);
  const prods = await Product.find({ tenantId: req.tenantId, sku: { $in: items.map((i) => i.sku) } }).select('sku name family').lean(); const pm = Object.fromEntries(prods.map((p) => [p.sku, p]));
  res.json({ page, limit, total, today: ctx.today, items: stripCost(req, items.map((b) => ({ ...b, name: pm[b.sku]?.name, family: pm[b.sku]?.family,
    daysToExpiry: b.expiryDate ? Math.round((new Date(b.expiryDate) - new Date(ctx.today)) / 864e5) : null }))) });
}));

/** D-018: the system never guesses which batch sold; it notifies and asks the owner. One-tap answers, capped per day. */
r.get('/prompts', wrap(async (req, res) => {
  const ctx = await tenantContext(req.tenantId); const storeId = await resolveStore(req); const cap = Math.min(30, parseInt(req.query.limit) || 8);
  const base = { tenantId: req.tenantId, remaining: { $gt: 0 }, expiryDate: { $type: 'string' }, ...(storeId && { storeId }) };
  const horizon = addDays(ctx.today, 30);
  const [near, multi] = await Promise.all([
    Batch.find({ ...base, expiryDate: { $lte: horizon } }).sort({ expiryDate: 1 }).limit(400).lean(),
    Batch.aggregate([{ $match: base }, { $group: { _id: { s: '$storeId', k: '$sku' }, n: { $sum: 1 }, batches: { $push: { id: '$batchId', exp: '$expiryDate', rec: '$receivedDate', rem: '$remaining', cost: '$costPaise' } } } },
      { $match: { n: { $gte: 2 } } }, { $limit: 600 }]),
  ]);
  const recent = await BatchConfirmation.find({ tenantId: req.tenantId, createdAt: { $gte: new Date(Date.now() - 7 * 864e5) } }).select('batchId').lean();
  const answered = new Set(recent.map((x) => x.batchId)); const prompts = [];
  for (const b of near) {
    const days = Math.round((new Date(b.expiryDate) - new Date(ctx.today)) / 864e5); const win = alertDays(ctx.tenant, b.expirySource);
    if (days < 0) prompts.push({ type: 'expired_unresolved', batchId: b.batchId, storeId: b.storeId, sku: b.sku, remaining: b.remaining, expiryDate: b.expiryDate, days, valuePaise: b.remaining * (b.costPaise || 0), question: `This batch expired ${-days} day(s) ago and ${b.remaining} unit(s) are still on record. What happened to them?`, answers: ['sold', 'discarded', 'returned'] });
    else if (days <= win && !answered.has(b.batchId)) prompts.push({ type: 'expiry_soon', batchId: b.batchId, storeId: b.storeId, sku: b.sku, remaining: b.remaining, expiryDate: b.expiryDate, days, estimated: b.expirySource === 'estimated', valuePaise: b.remaining * (b.costPaise || 0), question: `About ${b.remaining} unit(s) expire in ${days} day(s). Sell these first, mark down, or return to supplier.`, answers: ['acknowledged', 'finished', 'remaining', 'damaged'] });
  }
  for (const g of multi) {
    const bs = g.batches.sort((a, b) => (a.exp < b.exp ? -1 : 1)); const older = bs[0]; const newest = bs[bs.length - 1];
    if (newest.rec >= addDays(ctx.today, -7) && older.exp <= addDays(ctx.today, 60) && !answered.has(older.id))
      prompts.push({ type: 'older_batch', batchId: older.id, storeId: g._id.s, sku: g._id.k, remaining: older.rem, expiryDate: older.exp, days: Math.round((new Date(older.exp) - new Date(ctx.today)) / 864e5),
        valuePaise: older.rem * (older.cost || 0), question: `A new batch arrived while about ${older.rem} unit(s) of the older batch (expires ${older.exp}) are still on record. Sell the older ones first. How many are left?`, answers: ['remaining', 'finished', 'damaged'] });
  }
  prompts.sort((a, b) => (b.type === 'expired_unresolved') - (a.type === 'expired_unresolved') || b.valuePaise - a.valuePaise);
  const top = prompts.slice(0, cap); const pm = Object.fromEntries((await Product.find({ tenantId: req.tenantId, sku: { $in: top.map((p) => p.sku) } }).select('sku name').lean()).map((p) => [p.sku, p.name]));
  res.json({ total: prompts.length, shown: top.length, items: stripCost(req, top.map((p) => ({ ...p, name: pm[p.sku] }))) });
}));

const confirmBody = z.object({ answer: z.enum(['acknowledged', 'finished', 'remaining', 'damaged', 'sold', 'discarded', 'returned']), remaining: z.number().int().min(0).optional(), qty: z.number().int().min(1).optional(), trigger: z.string().optional() });
r.post('/batches/:batchId/confirm', requireRole('staff'), validate(confirmBody), wrap(async (req, res) => {
  const b = await Batch.findOne({ tenantId: req.tenantId, batchId: req.params.batchId });
  if (!b) throw new HttpError(404, 'not_found', 'Batch not found.');
  const ctx = await tenantContext(req.tenantId); const { answer } = req.body; const old = b.remaining; let neu = old; let movement = null;
  if (answer === 'finished' || answer === 'sold') neu = 0;
  else if (answer === 'remaining') { if (req.body.remaining === undefined) throw new HttpError(400, 'validation_failed', 'Please tell us how many are left.'); if (req.body.remaining > old) throw new HttpError(400, 'too_many', `We only have ${old} on record for this batch. Use a stock count to add stock.`); neu = req.body.remaining; }
  else if (answer === 'damaged') neu = Math.max(0, old - (req.body.qty ?? old));
  else if (answer === 'discarded' || answer === 'returned') { neu = 0; movement = answer === 'discarded' ? 'EXPIRY_WRITEOFF' : 'SUPPLIER_RETURN'; }
  const delta = neu - old;
  if (delta !== 0) {
    b.remaining = neu; await adjustOnHand(req.tenantId, b.storeId, b.sku, delta);
    await logMovement(req, { storeId: b.storeId, sku: b.sku, date: ctx.today, type: movement || (answer === 'damaged' ? 'ADJUSTMENT' : 'COUNT_CORRECTION'), reason: `owner answer: ${answer}`, qty: delta, batchId: b.batchId });
  }
  b.confirmed = true; b.confirmedAt = new Date(); await b.save();
  await BatchConfirmation.create({ tenantId: req.tenantId, batchId: b.batchId, sku: b.sku, storeId: b.storeId, answer, remaining: neu, userId: req.user.id, trigger: req.body.trigger });
  audit(req, 'batch_confirm', 'batch', b.batchId, { answer, from: old, to: neu }); res.json({ batchId: b.batchId, remaining: neu, confirmed: true });
}));

r.get('/pending-expiry', wrap(async (req, res) => {
  const storeId = await resolveStore(req);
  const m = { tenantId: req.tenantId, status: 'pending_expiry', ...(storeId && { storeId }) };
  const items = await Batch.find(m).sort({ receivedDate: -1 }).limit(200).lean(); const total = await Batch.countDocuments(m);
  const pm = Object.fromEntries((await Product.find({ tenantId: req.tenantId, sku: { $in: items.map((i) => i.sku) } }).select('sku name').lean()).map((p) => [p.sku, p.name]));
  res.json({ total, items: items.map((i) => ({ ...i, name: pm[i.sku] })) });
}));
r.patch('/batches/:batchId/expiry', requireRole('staff'), validate(z.object({ expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })), wrap(async (req, res) => {
  const ctx = await tenantContext(req.tenantId);
  if (req.body.expiryDate < addDays(ctx.today, -365)) throw new HttpError(400, 'date_too_old', 'That expiry date is more than a year in the past. Please check it.');
  const b = await Batch.findOneAndUpdate({ tenantId: req.tenantId, batchId: req.params.batchId }, { $set: { expiryDate: req.body.expiryDate, expirySource: 'entered', status: 'active' } }, { new: true });
  if (!b) throw new HttpError(404, 'not_found', 'Batch not found.'); audit(req, 'set_expiry', 'batch', b.batchId, req.body); res.json(b);
}));

// ---- manual stock adjustments and counts
r.post('/adjustments', requireRole('staff'), validate(z.object({ storeId: z.string(), sku: z.string(), qty: z.number().int().refine((v) => v !== 0, 'Quantity cannot be zero'),
  reason: z.enum(['damage', 'theft', 'expired', 'found', 'other']) })), wrap(async (req, res) => {
  const storeId = await resolveStore(req); const ctx = await tenantContext(req.tenantId);
  if (!(await Product.exists({ tenantId: req.tenantId, sku: req.body.sku }))) throw new HttpError(404, 'not_found', 'Unknown product.');
  await adjustOnHand(req.tenantId, storeId, req.body.sku, req.body.qty);
  await logMovement(req, { storeId, sku: req.body.sku, date: ctx.today, type: 'ADJUSTMENT', reason: req.body.reason, qty: req.body.qty });
  audit(req, 'adjust_stock', 'sku', req.body.sku, req.body); res.status(201).json({ ok: true });
}));

r.post('/stock-counts', requireRole('staff'), validate(z.object({ storeId: z.string(), lines: z.array(z.object({ sku: z.string(), counted: z.number().int().min(0) })).min(1).max(1000) })), wrap(async (req, res) => {
  const storeId = await resolveStore(req); const ctx = await tenantContext(req.tenantId); const out = [];
  for (const l of req.body.lines) {
    const st = await InventoryState.findOne({ tenantId: req.tenantId, storeId, sku: l.sku }).lean(); const was = st?.onHand ?? 0; const delta = l.counted - was;
    if (delta === 0) { out.push({ sku: l.sku, was, counted: l.counted, variance: 0 }); continue; }
    await adjustOnHand(req.tenantId, storeId, l.sku, delta);
    // reconcile batches: reductions come off the earliest-expiring batch first (FEFO); increases go to the newest batch
    const bs = await Batch.find({ tenantId: req.tenantId, storeId, sku: l.sku, remaining: { $gt: 0 } }).sort({ expiryDate: 1 });
    let left = -delta;
    if (delta < 0) for (const b of bs) { if (left <= 0) break; const t = Math.min(b.remaining, left); b.remaining -= t; left -= t; await b.save(); }
    else if (bs.length) { const nb = bs[bs.length - 1]; nb.remaining += delta; await nb.save(); }
    await logMovement(req, { storeId, sku: l.sku, date: ctx.today, type: 'COUNT_CORRECTION', reason: 'stock count', qty: delta });
    out.push({ sku: l.sku, was, counted: l.counted, variance: delta });
  }
  await StockCount.create({ tenantId: req.tenantId, storeId, userId: req.user.id, lines: out });
  audit(req, 'stock_count', 'store', storeId, { lines: out.length, withVariance: out.filter((x) => x.variance).length });
  res.status(201).json({ lines: out, shrinkUnits: -out.filter((x) => x.variance < 0).reduce((a, x) => a + x.variance, 0) });
}));
export default r;
