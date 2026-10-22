import { Router } from 'express';
import { z, wrap, validate, HttpError, audit, pageParams } from '../middleware/common.js';
import { requireRole, stripCost } from '../middleware/auth.js';
import { Product, Supplier, Sale, Batch, InventoryState, Forecast, Recommendation, InventoryInsight } from '../models/index.js';
import { resolveStore } from '../services/helpers.js';
import { tenantContext, addDays } from '../services/context.js';

const r = Router();
const productBody = z.object({
  sku: z.string().min(1).max(40).optional(), name: z.string().min(2).max(160), brand: z.string().max(80).optional(), family: z.string().max(60).optional(),
  barcode: z.string().max(20).optional(), mrpPaise: z.number().int().min(0), costPaise: z.number().int().min(0).optional(),
  packSize: z.number().int().min(1).default(1), shelfLifeDays: z.number().int().min(1).max(3650).nullable().optional(),
  trackingPolicy: z.enum(['strict', 'estimate', 'off']).default('off'), supplierKey: z.string().optional(), aliases: z.array(z.string()).optional(), active: z.boolean().optional(),
});

r.get('/products', wrap(async (req, res) => {
  const { page, limit } = pageParams(req.query); const q = { tenantId: req.tenantId };
  if (req.query.family) q.family = req.query.family;
  if (req.query.active !== undefined) q.active = req.query.active !== 'false';
  if (req.query.q) q.$or = [{ name: new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { sku: req.query.q }, { barcode: req.query.q }];
  const sort = { name: 1, sku: -1 }[req.query.sort] ? { [req.query.sort]: 1 } : { sku: 1 };
  const [items, total] = await Promise.all([Product.find(q).sort(sort).skip((page - 1) * limit).limit(limit).lean(), Product.countDocuments(q)]);
  const storeId = await resolveStore(req);
  const inv = await InventoryState.find({ tenantId: req.tenantId, ...(storeId && { storeId }), sku: { $in: items.map((i) => i.sku) } }).lean();
  const stock = {}; for (const i of inv) { stock[i.sku] ??= { onHand: 0, onOrder: 0 }; stock[i.sku].onHand += i.onHand; stock[i.sku].onOrder += i.onOrder; }
  res.json({ page, limit, total, items: stripCost(req, items.map((p) => ({ ...p, stock: stock[p.sku] || null }))) });
}));

r.get('/families', wrap(async (req, res) => res.json((await Product.distinct('family', { tenantId: req.tenantId })).filter(Boolean).sort())));

r.get('/products/:sku', wrap(async (req, res) => {
  const ctx = await tenantContext(req.tenantId); const sku = req.params.sku;
  const p = await Product.findOne({ tenantId: req.tenantId, sku }).lean();
  if (!p) throw new HttpError(404, 'not_found', 'Product not found.');
  const storeId = await resolveStore(req); const sf = storeId ? { storeId } : {};
  const from = addDays(ctx.asOf, -89);
  const [series, inv, batches, fc, rec, ins] = await Promise.all([
    Sale.aggregate([{ $match: { tenantId: req.tenantId, sku, date: { $gte: from, $lte: ctx.asOf }, ...sf } }, { $group: { _id: '$date', qty: { $sum: '$qty' }, revenuePaise: { $sum: '$revenuePaise' } } }, { $sort: { _id: 1 } }]),
    InventoryState.find({ tenantId: req.tenantId, sku, ...sf }).lean(),
    Batch.find({ tenantId: req.tenantId, sku, remaining: { $gt: 0 }, ...sf }).sort({ expiryDate: 1 }).limit(20).lean(),
    Forecast.find({ tenantId: req.tenantId, sku, ...sf }).lean(),
    Recommendation.find({ tenantId: req.tenantId, sku, status: 'suggested', ...sf }).lean(),
    InventoryInsight.find({ tenantId: req.tenantId, sku, ...sf }).lean(),
  ]);
  res.json(stripCost(req, { product: p, asOf: ctx.asOf, salesSeries: series.map((s) => ({ date: s._id, qty: s.qty, revenuePaise: s.revenuePaise })),
    inventory: inv, batches, forecasts: fc, recommendations: rec, insight: ins }));
}));

r.post('/products', requireRole('manager'), validate(productBody), wrap(async (req, res) => {
  const b = req.body;
  if (!b.sku) { const n = await Product.countDocuments({ tenantId: req.tenantId }); b.sku = `SKU-${String(n + 1).padStart(5, '0')}-${Date.now().toString(36).slice(-3)}`; }
  const p = await Product.create({ ...b, tenantId: req.tenantId });
  audit(req, 'create', 'product', p.sku); res.status(201).json(p);
}));
r.patch('/products/:sku', requireRole('manager'), validate(productBody.partial()), wrap(async (req, res) => {
  const p = await Product.findOneAndUpdate({ tenantId: req.tenantId, sku: req.params.sku }, { $set: req.body }, { new: true, runValidators: true });
  if (!p) throw new HttpError(404, 'not_found', 'Product not found.');
  audit(req, 'update', 'product', p.sku, req.body); res.json(p);
}));
r.delete('/products/:sku', requireRole('manager'), wrap(async (req, res) => {
  const f = { tenantId: req.tenantId, sku: req.params.sku };
  if (!(await Product.exists(f))) throw new HttpError(404, 'not_found', 'Product not found.');
  const used = (await Sale.exists(f)) || (await Batch.exists(f));
  if (used) throw new HttpError(409, 'in_use', 'This product has sales or stock history, so it cannot be deleted. Mark it inactive instead.');
  await Product.deleteOne(f); await InventoryState.deleteMany(f); audit(req, 'delete', 'product', req.params.sku); res.json({ deleted: true });
}));

// ---- suppliers
const supplierBody = z.object({ supplierKey: z.string().min(1).max(40).optional(), name: z.string().min(2).max(120), leadTimeDays: z.number().int().min(0).max(60).default(2),
  reviewPeriodDays: z.number().int().min(1).max(60).default(3), phone: z.string().max(20).optional() });
r.get('/suppliers', wrap(async (req, res) => res.json(await Supplier.find({ tenantId: req.tenantId }).sort({ name: 1 }).lean())));
r.post('/suppliers', requireRole('manager'), validate(supplierBody), wrap(async (req, res) => {
  const key = req.body.supplierKey || req.body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  const s = await Supplier.create({ ...req.body, supplierKey: key, tenantId: req.tenantId }); audit(req, 'create', 'supplier', key); res.status(201).json(s);
}));
r.patch('/suppliers/:key', requireRole('manager'), validate(supplierBody.partial()), wrap(async (req, res) => {
  const s = await Supplier.findOneAndUpdate({ tenantId: req.tenantId, supplierKey: req.params.key }, { $set: req.body }, { new: true });
  if (!s) throw new HttpError(404, 'not_found', 'Supplier not found.'); audit(req, 'update', 'supplier', s.supplierKey, req.body); res.json(s);
}));
r.delete('/suppliers/:key', requireRole('manager'), wrap(async (req, res) => {
  if (await Product.exists({ tenantId: req.tenantId, supplierKey: req.params.key })) throw new HttpError(409, 'in_use', 'Products still use this supplier.');
  const d = await Supplier.deleteOne({ tenantId: req.tenantId, supplierKey: req.params.key });
  if (!d.deletedCount) throw new HttpError(404, 'not_found', 'Supplier not found.'); audit(req, 'delete', 'supplier', req.params.key); res.json({ deleted: true });
}));
export default r;
