import { Router } from 'express';
import mongoose from 'mongoose';
import { z, wrap, validate, HttpError, audit, pageParams } from '../middleware/common.js';
import { requireRole } from '../middleware/auth.js';
import { Tenant, Store, Product, Batch, InventoryState, ImportJob, Job, AuditLog, Sale, Supplier, ForecastRun } from '../models/index.js';
import { tenantContext } from '../services/context.js';

const r = Router();

r.get('/data-quality', wrap(async (req, res) => {
  const t = req.tenantId; const ctx = await tenantContext(t);
  const [prods, noCost, noBarcode, noSupplier, pending, imports, skuWithSales, stateRows, noPrice] = await Promise.all([
    Product.countDocuments({ tenantId: t, active: { $ne: false } }), Product.countDocuments({ tenantId: t, $or: [{ costPaise: { $exists: false } }, { costPaise: 0 }] }),
    Product.countDocuments({ tenantId: t, $or: [{ barcode: { $exists: false } }, { barcode: '' }] }), Product.countDocuments({ tenantId: t, $or: [{ supplierKey: { $exists: false } }, { supplierKey: null }] }),
    Batch.countDocuments({ tenantId: t, status: 'pending_expiry' }), ImportJob.find({ tenantId: t }).sort({ createdAt: -1 }).limit(10).select('type filename status report.rowsTotal report.rowsOk report.rowsRejected createdAt').lean(),
    Sale.distinct('sku', { tenantId: t }), InventoryState.countDocuments({ tenantId: t }), Product.countDocuments({ tenantId: t, $or: [{ mrpPaise: { $exists: false } }, { mrpPaise: 0 }] }),
  ]);
  const issues = [
    { id: 'no_cost', severity: noCost ? 'warn' : 'ok', count: noCost, text: `${noCost} item(s) have no cost price, so profit cannot be calculated for them.`, fix: 'Add cost prices on the Products page or upload an item list with costs.' },
    { id: 'no_price', severity: noPrice ? 'warn' : 'ok', count: noPrice, text: `${noPrice} item(s) have no selling price.`, fix: 'Add selling prices.' },
    { id: 'no_barcode', severity: noBarcode > prods * 0.3 ? 'info' : 'ok', count: noBarcode, text: `${noBarcode} item(s) have no barcode. Matching uploads by name is less reliable.`, fix: 'Add barcodes when you can.' },
    { id: 'no_supplier', severity: noSupplier ? 'warn' : 'ok', count: noSupplier, text: `${noSupplier} item(s) have no supplier, so delivery time is assumed.`, fix: 'Assign suppliers to items.' },
    { id: 'pending_expiry', severity: pending ? 'warn' : 'ok', count: pending, text: `${pending} delivered batch(es) are waiting for an expiry date.`, fix: 'Open "Pending expiry" and enter the dates.' },
    { id: 'no_stock', severity: stateRows ? 'ok' : 'warn', count: stateRows ? 0 : 1, text: stateRows ? 'Stock levels are available.' : 'No stock levels yet, so reorder quantities cannot be suggested.', fix: 'Upload a stock report or do a stock count.' },
    { id: 'stale', severity: ctx.staleDays > 3 ? 'warn' : 'ok', count: ctx.staleDays, text: ctx.staleDays > 3 ? `Sales data is ${ctx.staleDays} days old.` : 'Sales data is recent.', fix: 'Upload the latest sales report.' },
  ];
  res.json({ summary: { products: prods, skusWithSales: skuWithSales.length, stockRows: stateRows }, issues, recentImports: imports });
}));

r.get('/audit', requireRole('manager'), wrap(async (req, res) => {
  const { page, limit } = pageParams(req.query); const m = { tenantId: req.tenantId, ...(req.query.action && { action: req.query.action }) };
  const [items, total] = await Promise.all([AuditLog.find(m).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).lean(), AuditLog.countDocuments(m)]);
  res.json({ page, limit, total, items });
}));

r.get('/settings', wrap(async (req, res) => res.json((await Tenant.findById(req.tenantId).select('name kind plan settings simulated asOfDate').lean()))));
r.patch('/settings', requireRole('owner'), validate(z.object({ name: z.string().min(2).max(80).optional(),
  expiryAlertDays: z.object({ strict: z.number().int().min(1).max(60), estimate: z.number().int().min(1).max(180) }).optional(), lowStockBuffer: z.number().min(0).max(10).optional() })), wrap(async (req, res) => {
  const set = {}; if (req.body.name) set.name = req.body.name;
  if (req.body.expiryAlertDays) set['settings.expiryAlertDays'] = req.body.expiryAlertDays; if (req.body.lowStockBuffer !== undefined) set['settings.lowStockBuffer'] = req.body.lowStockBuffer;
  const t = await Tenant.findByIdAndUpdate(req.tenantId, { $set: set }, { new: true }); audit(req, 'update_settings', 'tenant', req.tenantId, req.body); res.json(t);
}));
r.get('/stores', wrap(async (req, res) => res.json(await Store.find({ tenantId: req.tenantId }).lean())));
r.post('/stores', requireRole('owner'), validate(z.object({ name: z.string().min(2).max(80), city: z.string().max(60).optional() })), wrap(async (req, res) => {
  const n = await Store.countDocuments({ tenantId: req.tenantId }); const id = `${req.tenantId}-S${n + 1}`;
  const s = await Store.create({ _id: id, storeId: id, tenantId: req.tenantId, ...req.body }); audit(req, 'create', 'store', id); res.status(201).json(s);
}));

// ---- automatic learning: jobs are queued in MongoDB and picked up by the Python worker
r.post('/pipeline/run', requireRole('manager'), wrap(async (req, res) => {
  const open = await Job.findOne({ tenantId: req.tenantId, type: 'pipeline', status: { $in: ['queued', 'running'] } }).lean();
  if (open) return res.status(202).json({ jobId: open._id, status: open.status, message: 'Learning is already in progress.' });
  const j = await Job.create({ tenantId: req.tenantId, type: 'pipeline', status: 'queued', createdAt: new Date(), requestedBy: req.user.id, attempts: 0 });
  audit(req, 'queue_pipeline', 'job', j._id); res.status(202).json({ jobId: j._id, status: 'queued' });
}));
r.get('/jobs', wrap(async (req, res) => res.json(await Job.find({ tenantId: req.tenantId }).sort({ createdAt: -1 }).limit(20).lean())));
r.get('/runs', wrap(async (req, res) => res.json(await ForecastRun.find({ tenantId: req.tenantId }).sort({ createdAt: -1 }).limit(10).lean())));

// ---- data rights (DPDP): export everything / delete everything
r.get('/export', requireRole('owner'), wrap(async (req, res) => {
  const want = String(req.query.collections || 'tenants,stores,users,products,suppliers,purchase_orders,stock_adjustments,import_jobs').split(',');
  const allowed = new Set(['tenants', 'stores', 'users', 'products', 'suppliers', 'purchase_orders', 'stock_adjustments', 'import_jobs', 'batches', 'inventory_state', 'sales', 'recommendations', 'forecasts', 'audit_log']);
  res.setHeader('Content-Type', 'application/x-ndjson'); res.setHeader('Content-Disposition', `attachment; filename="retailpulse-export-${req.tenantId}.ndjson"`);
  for (const name of want.filter((n) => allowed.has(n))) {
    const q = name === 'tenants' ? { _id: req.tenantId } : { tenantId: req.tenantId };
    const proj = name === 'users' ? { passwordHash: 0 } : {};
    for await (const doc of mongoose.connection.collection(name).find(q, { projection: proj })) res.write(JSON.stringify({ collection: name, doc }) + '\n');
  }
  audit(req, 'export_data', 'tenant', req.tenantId, { collections: want }); res.end();
}));
r.delete('/tenant', requireRole('owner'), validate(z.object({ confirm: z.string() })), wrap(async (req, res) => {
  const t = await Tenant.findById(req.tenantId).lean();
  if (t?.simulated) throw new HttpError(403, 'demo_protected', 'Demo shops cannot be deleted.');
  if (req.body.confirm !== `DELETE ${t.name}`) throw new HttpError(400, 'confirm_mismatch', `Type exactly: DELETE ${t.name}`);
  const cols = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.') && !n.startsWith('mr_') && !n.startsWith('amazon_') && !n.endsWith('.files') && !n.endsWith('.chunks'));
  const out = {};
  for (const c of cols) { const d = await mongoose.connection.collection(c).deleteMany(c === 'tenants' ? { _id: req.tenantId } : { tenantId: req.tenantId }); if (d.deletedCount) out[c] = d.deletedCount; }
  res.json({ deleted: true, removed: out });
}));
export default r;
