import { Router } from 'express';
import { wrap } from '../middleware/common.js';
import { stripCost } from '../middleware/auth.js';
import { Sale, Recommendation, InventoryInsight, Batch, Product, InventoryState, ForecastRun, Forecast, Supplier } from '../models/index.js';
import { resolveStore } from '../services/helpers.js';
import { tenantContext, addDays } from '../services/context.js';

const r = Router();
const sumSales = async (tenantId, storeId, from, to) => {
  const [a] = await Sale.aggregate([{ $match: { tenantId, date: { $gte: from, $lte: to }, ...(storeId && { storeId }) } }, { $group: { _id: null, units: { $sum: '$qty' }, revenuePaise: { $sum: '$revenuePaise' } } }]);
  return a || { units: 0, revenuePaise: 0 };
};
const pct = (a, b) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);

r.get('/', wrap(async (req, res) => {
  const ctx = await tenantContext(req.tenantId); const storeId = await resolveStore(req); const t = req.tenantId; const sf = storeId ? { storeId } : {};
  const y = ctx.asOf;
  const [yest, w1, w0, series, recs, risk, slow, slowTotal, expiring, pending, run, prodCount, invCount, sampleDow] = await Promise.all([
    sumSales(t, storeId, y, y), sumSales(t, storeId, addDays(y, -6), y), sumSales(t, storeId, addDays(y, -13), addDays(y, -7)),
    Sale.aggregate([{ $match: { tenantId: t, date: { $gte: addDays(y, -27), $lte: y }, ...sf } }, { $group: { _id: '$date', units: { $sum: '$qty' }, revenuePaise: { $sum: '$revenuePaise' } } }, { $sort: { _id: 1 } }]),
    Recommendation.find({ tenantId: t, status: 'suggested', urgency: 'now', ...sf }).sort({ estCostPaise: -1 }).limit(400).lean(),
    InventoryInsight.find({ tenantId: t, ...sf, daysOfCover: { $lt: 2 }, dailyDemand: { $gt: 0.5 } }).sort({ daysOfCover: 1 }).limit(8).lean(),
    InventoryInsight.find({ tenantId: t, ...sf, velocity: { $in: ['slow', 'non-moving'] }, cashTiedPaise: { $gt: 0 } }).sort({ cashTiedPaise: -1 }).limit(8).lean(),
    InventoryInsight.aggregate([{ $match: { tenantId: t, ...sf, velocity: { $in: ['slow', 'non-moving'] } } }, { $group: { _id: null, cash: { $sum: '$cashTiedPaise' }, n: { $sum: 1 } } }]),
    Batch.find({ tenantId: t, ...sf, remaining: { $gt: 0 }, expiryDate: { $gte: ctx.today, $lte: addDays(ctx.today, 7) } }).sort({ expiryDate: 1 }).limit(6).lean(),
    Batch.countDocuments({ tenantId: t, ...sf, status: 'pending_expiry' }),
    ForecastRun.findOne({ tenantId: t }).sort({ createdAt: -1 }).lean(),
    Product.countDocuments({ tenantId: t, active: { $ne: false } }), InventoryState.countDocuments({ tenantId: t, ...sf }),
    Sale.aggregate([{ $match: { tenantId: t, date: { $gte: addDays(y, -27), $lte: y }, ...sf } }, { $group: { _id: '$date', units: { $sum: '$qty' } } }]),
  ]);
  const names = Object.fromEntries((await Product.find({ tenantId: t, sku: { $in: [...recs.slice(0, 8), ...risk, ...slow, ...expiring].map((x) => x.sku) } }).select('sku name').lean()).map((p) => [p.sku, p.name]));
  const sups = Object.fromEntries((await Supplier.find({ tenantId: t }).lean()).map((s) => [s.supplierKey, s]));
  // same-weekday comparison for yesterday
  const dow = new Date(y).getUTCDay(); const sameDow = sampleDow.filter((d) => d._id !== y && new Date(d._id).getUTCDay() === dow);
  const expected = sameDow.length ? Math.round(sameDow.reduce((a, d) => a + d.units, 0) / sameDow.length) : null;
  const bySupplier = {}; for (const x of recs) { const g = (bySupplier[x.supplierKey] ??= { supplierKey: x.supplierKey, supplierName: sups[x.supplierKey]?.name || x.supplierName, items: 0, estCostPaise: 0 }); g.items++; g.estCostPaise += x.estCostPaise || 0; }
  const minStart = await Sale.findOne({ tenantId: t }).sort({ date: 1 }).select('date').lean();
  const historyDays = minStart ? Math.round((new Date(ctx.asOf) - new Date(minStart.date)) / 864e5) + 1 : 0;
  const hasCost = await Product.exists({ tenantId: t, costPaise: { $gt: 0 } }); const hasExpiry = await Batch.exists({ tenantId: t, expiryDate: { $type: 'string' } });
  const body = {
    asOf: ctx.asOf, today: ctx.today, simulated: ctx.simulated,
    freshness: { lastSalesDate: ctx.asOf, staleDays: ctx.staleDays, status: ctx.staleDays <= 1 ? 'fresh' : ctx.staleDays <= 3 ? 'aging' : 'stale',
      message: ctx.staleDays <= 1 ? 'Sales data is up to date.' : `Sales data is ${ctx.staleDays} days old - suggestions are less reliable. Upload the latest sales.` },
    kpis: { yesterday: { ...yest, vsSameWeekdayPct: pct(yest.units, expected), expectedUnits: expected }, last7: { ...w1, vsPrevPct: pct(w1.revenuePaise, w0.revenuePaise) },
      toOrderNow: recs.length, stockoutRisk: risk.length, expiringThisWeek: expiring.length, cashTiedInSlowPaise: slowTotal[0]?.cash || 0, slowItems: slowTotal[0]?.n || 0 },
    orders: { count: recs.length, estCostPaise: recs.reduce((a, x) => a + (x.estCostPaise || 0), 0), bySupplier: Object.values(bySupplier).sort((a, b) => b.estCostPaise - a.estCostPaise).slice(0, 6),
      top: recs.slice(0, 6).map((x) => ({ id: x._id, sku: x.sku, name: names[x.sku], qty: x.finalQty, supplierName: sups[x.supplierKey]?.name, reason: x.reason?.text, estCostPaise: x.estCostPaise })) },
    expiring: expiring.map((b) => ({ batchId: b.batchId, sku: b.sku, name: names[b.sku], remaining: b.remaining, expiryDate: b.expiryDate, storeId: b.storeId, estimated: b.expirySource === 'estimated' })),
    stockoutRisk: risk.map((x) => ({ sku: x.sku, name: names[x.sku], onHand: x.onHand, daysOfCover: x.daysOfCover, dailyDemand: x.dailyDemand, storeId: x.storeId })),
    slowMovers: slow.map((x) => ({ sku: x.sku, name: names[x.sku], onHand: x.onHand, daysOfCover: x.daysOfCover, cashTiedPaise: x.cashTiedPaise, storeId: x.storeId })),
    series: series.map((s) => ({ date: s._id, units: s.units, revenuePaise: s.revenuePaise })),
    readiness: {
      historyDays, products: prodCount,
      features: [
        { name: 'Sales insights', ready: historyDays >= 1, needs: 'Upload sales history' },
        { name: 'Demand forecasts', ready: historyDays >= 56, needs: `${Math.max(0, 56 - historyDays)} more days of sales` },
        { name: 'Reorder suggestions', ready: !!invCount && historyDays >= 56, needs: invCount ? 'More sales history' : 'Current stock levels' },
        { name: 'Profit and margin', ready: !!hasCost, needs: 'Cost prices for your items' },
        { name: 'Expiry alerts', ready: !!hasExpiry, needs: 'Record expiry dates when deliveries arrive' },
      ],
      pendingExpiry: pending, lastRun: run ? { at: run.createdAt, series: run.series, seconds: run.seconds } : null,
    },
  };
  res.json(req.user.role === 'staff' ? stripCost(req, JSON.parse(JSON.stringify({ ...body, kpis: { ...body.kpis, cashTiedInSlowPaise: undefined }, orders: { ...body.orders, estCostPaise: undefined, bySupplier: [], top: body.orders.top.map((x) => ({ ...x, estCostPaise: undefined })) }, slowMovers: body.slowMovers.map((x) => ({ ...x, cashTiedPaise: undefined })) }))) : body);
}));

r.get('/forecast/:sku', wrap(async (req, res) => {
  const storeId = await resolveStore(req); const ctx = await tenantContext(req.tenantId);
  const f = await Forecast.findOne({ tenantId: req.tenantId, sku: req.params.sku, ...(storeId && { storeId }) }).lean();
  const hist = await Sale.find({ tenantId: req.tenantId, sku: req.params.sku, ...(storeId && { storeId }), date: { $gte: addDays(ctx.asOf, -55), $lte: ctx.asOf } }).select('date qty storeId').lean();
  const byDate = {}; for (const h of hist) byDate[h.date] = (byDate[h.date] || 0) + h.qty;
  res.json({ asOf: ctx.asOf, forecast: f || null, history: Object.entries(byDate).sort().map(([date, qty]) => ({ date, qty })) });
}));
export default r;
