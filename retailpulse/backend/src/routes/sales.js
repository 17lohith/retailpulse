import { Router } from 'express';
import { z, wrap, validate, HttpError, audit } from '../middleware/common.js';
import { requireRole } from '../middleware/auth.js';
import { Sale, Product } from '../models/index.js';
import { resolveStore, dateRange } from '../services/helpers.js';
import { tenantContext, addDays } from '../services/context.js';

const r = Router();

r.get('/summary', wrap(async (req, res) => {
  const ctx = await tenantContext(req.tenantId); const storeId = await resolveStore(req);
  const { from, to } = dateRange(req.query, ctx);
  const groupBy = req.query.groupBy || 'day';
  const match = { tenantId: req.tenantId, date: { $gte: from, $lte: to }, ...(storeId && { storeId }) };
  let pipeline;
  if (groupBy === 'family') {
    pipeline = [{ $match: match }, { $lookup: { from: 'products', let: { s: '$sku' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$sku', '$$s'] }, { $eq: ['$tenantId', req.tenantId] }] } } }, { $project: { family: 1, costPaise: 1 } }], as: 'p' } },
      { $unwind: '$p' }, { $group: { _id: '$p.family', units: { $sum: '$qty' }, revenuePaise: { $sum: '$revenuePaise' }, cogsPaise: { $sum: { $multiply: ['$qty', '$p.costPaise'] } } } }, { $sort: { revenuePaise: -1 } }];
  } else {
    const key = groupBy === 'month' ? { $substrBytes: ['$date', 0, 7] } : groupBy === 'week' ? { $dateToString: { format: '%G-W%V', date: { $dateFromString: { dateString: '$date' } } } } : '$date';
    pipeline = [{ $match: match }, { $group: { _id: key, units: { $sum: '$qty' }, revenuePaise: { $sum: '$revenuePaise' } } }, { $sort: { _id: 1 } }];
  }
  const rows = await Sale.aggregate(pipeline);
  const totals = rows.reduce((a, x) => ({ units: a.units + x.units, revenuePaise: a.revenuePaise + x.revenuePaise }), { units: 0, revenuePaise: 0 });
  const canSeeCost = req.user.role !== 'staff';
  res.json({ from, to, groupBy, totals, rows: rows.map((x) => ({ key: x._id, units: x.units, revenuePaise: x.revenuePaise, ...(canSeeCost && x.cogsPaise !== undefined && { grossProfitPaise: x.revenuePaise - x.cogsPaise }) })) });
}));

r.get('/top', wrap(async (req, res) => {
  const ctx = await tenantContext(req.tenantId); const storeId = await resolveStore(req); const { from, to } = dateRange(req.query, ctx);
  const by = ['units', 'revenue', 'profit'].includes(req.query.by) ? req.query.by : 'units';
  if (by === 'profit' && req.user.role === 'staff') throw new HttpError(403, 'forbidden', 'Profit is visible to managers and owners.');
  const limit = Math.min(50, parseInt(req.query.limit) || 10);
  const rows = await Sale.aggregate([{ $match: { tenantId: req.tenantId, date: { $gte: from, $lte: to }, ...(storeId && { storeId }) } },
    { $group: { _id: '$sku', units: { $sum: '$qty' }, revenuePaise: { $sum: '$revenuePaise' } } }, { $sort: { [by === 'units' ? 'units' : 'revenuePaise']: -1 } }, { $limit: by === 'profit' ? 400 : limit },
    { $lookup: { from: 'products', let: { s: '$_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$sku', '$$s'] }, { $eq: ['$tenantId', req.tenantId] }] } } }], as: 'p' } }, { $unwind: '$p' },
    { $project: { sku: '$_id', _id: 0, name: '$p.name', family: '$p.family', units: 1, revenuePaise: 1, grossProfitPaise: { $subtract: ['$revenuePaise', { $multiply: ['$units', '$p.costPaise'] }] } } }]);
  if (by === 'profit') rows.sort((a, b) => b.grossProfitPaise - a.grossProfitPaise);
  res.json({ from, to, by, rows: rows.slice(0, limit).map((x) => (req.user.role === 'staff' ? { ...x, grossProfitPaise: undefined } : x)) });
}));

r.get('/weekday', wrap(async (req, res) => {
  const ctx = await tenantContext(req.tenantId); const storeId = await resolveStore(req); const { from, to } = dateRange(req.query, ctx, 91);
  const rows = await Sale.aggregate([{ $match: { tenantId: req.tenantId, date: { $gte: from, $lte: to }, ...(storeId && { storeId }) } },
    { $group: { _id: '$date', units: { $sum: '$qty' } } }, { $addFields: { dow: { $isoDayOfWeek: { $dateFromString: { dateString: '$_id' } } } } },
    { $group: { _id: '$dow', avgUnits: { $avg: '$units' }, days: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  res.json({ from, to, rows: rows.map((x) => ({ day: names[x._id - 1], avgUnits: Math.round(x.avgUnits), days: x.days })) });
}));

// Quick sale entry (lite) for shops without billing software: adds to the day's total for each item.
r.post('/quick-entry', requireRole('staff'), validate(z.object({ storeId: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z.array(z.object({ sku: z.string(), qty: z.number().int().min(1).max(100000) })).min(1).max(500) })), wrap(async (req, res) => {
  const storeId = await resolveStore(req); const { date, lines } = req.body;
  if (new Date(date) > new Date(Date.now() + 864e5)) throw new HttpError(400, 'future_date', 'Sales date cannot be in the future.');
  const prods = await Product.find({ tenantId: req.tenantId, sku: { $in: lines.map((l) => l.sku) } }).lean(); const pm = Object.fromEntries(prods.map((p) => [p.sku, p]));
  const unknown = lines.filter((l) => !pm[l.sku]).map((l) => l.sku); if (unknown.length) throw new HttpError(400, 'unknown_items', `Unknown items: ${unknown.join(', ')}`);
  await Sale.bulkWrite(lines.map((l) => ({ updateOne: { filter: { tenantId: req.tenantId, storeId, date, sku: l.sku },
    update: { $inc: { qty: l.qty, revenuePaise: l.qty * pm[l.sku].mrpPaise }, $setOnInsert: { tenantId: req.tenantId, storeId, date, sku: l.sku, source: 'quick-entry' } }, upsert: true } })));
  audit(req, 'quick_sale_entry', 'sales', date, { lines: lines.length }); res.status(201).json({ saved: lines.length });
}));
export default r;
