import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { wrap, HttpError } from '../middleware/common.js';
import { Tenant } from '../models/index.js';

const r = Router();
const col = (n) => mongoose.connection.collection(n);
const ROOT = path.resolve(process.cwd(), '..');
const cache = new Map();
const memo = async (key, fn, ttl = 300_000) => { const c = cache.get(key); if (c && Date.now() - c.t < ttl) return c.v; const v = await fn(); cache.set(key, { t: Date.now(), v }); return v; };
const J = (job) => col('mr_results').find({ job }).toArray();

r.get('/reviews/overview', wrap(async (req, res) => res.json(await memo('rev', async () => {
  const [monthly, terms, ver, brands, bands, jobs] = await Promise.all([J('J3_monthly_volume'), J('J1_token_frequency'), J('J6_verified_helpful'), J('J5_brand_ranking'), J('J4b_priceband_category'), col('mr_jobs').find({}).toArray()]);
  if (!monthly.length) throw new HttpError(404, 'not_loaded', 'Hadoop results have not been loaded yet.');
  const by = { pos: [], neg: [], neu: [] }; const tot = { pos: 0, neg: 0, neu: 0 };
  for (const t of terms) { const [b, w] = t.key.split('|'); by[b].push([w, t.values.count]); tot[b] += t.values.count; }
  const m = Object.fromEntries(Object.entries(by).map(([b, a]) => [b, new Map(a)]));
  const top = (b, n = 20) => by[b].sort((a, c) => c[1] - a[1]).slice(0, n).map(([word, count]) => ({ word, count }));
  const distinctive = []; for (const [w, c] of m.neg) { const p = m.pos.get(w) || 0; if (c + p >= 400 && c >= 150) distinctive.push({ word: w, negCount: c, posCount: p, lift: Math.round(((c / tot.neg) / ((p + 1) / tot.pos)) * 10) / 10 }); }
  distinctive.sort((a, c) => c.lift - a.lift);
  const byBand = {}; for (const b of bands) { const [band] = b.key.split('|'); const x = (byBand[band] ??= { band, products: 0, reviews: 0, ratingSum: 0 }); x.products += b.values.products; x.reviews += b.values.reviews; x.ratingSum += b.values.ratingSum; }
  const order = ['<5', '5-10', '10-20', '20-50', '50+', 'no_price'];
  const brandRows = brands.map((b) => ({ brand: b.key, products: b.values.products, reviews: b.values.reviews, meanRating: b.values.meanRating }));
  return {
    totals: { reviews: monthly.reduce((a, x) => a + x.values.reviews, 0), months: monthly.length, meanRating: monthly.reduce((a, x) => a + x.values.ratingSum, 0) / monthly.reduce((a, x) => a + x.values.reviews, 0) },
    monthly: monthly.filter((x) => x.key >= '2008-01').sort((a, b) => (a.key < b.key ? -1 : 1)).map((x) => ({ month: x.key, reviews: x.values.reviews, meanRating: Math.round(x.values.meanRating * 100) / 100 })),
    topTerms: { positive: top('pos'), negative: top('neg'), neutral: top('neu') }, distinctiveNegative: distinctive.slice(0, 15),
    verified: ver.filter((x) => x.key.startsWith('V:')).map((x) => ({ group: x.key.slice(2), reviews: x.values.n, meanRating: Math.round((x.values.ratingSum / x.values.n) * 100) / 100, helpfulPerReview: Math.round((x.values.helpful / x.values.n) * 100) / 100 })),
    reviewLength: ver.filter((x) => x.key.startsWith('L:')).map((x) => ({ bucket: x.key.slice(2), reviews: x.values.n, helpfulPerReview: Math.round((x.values.helpful / x.values.n) * 100) / 100, meanRating: Math.round((x.values.ratingSum / x.values.n) * 100) / 100 }))
      .sort((a, b) => ['0-50', '50-150', '150-400', '400+'].indexOf(a.bucket) - ['0-50', '50-150', '150-400', '400+'].indexOf(b.bucket)),
    priceBands: order.map((b) => byBand[b]).filter(Boolean).map((x) => ({ band: x.band, products: x.products, reviews: x.reviews, meanRating: Math.round((x.ratingSum / x.reviews) * 100) / 100 })),
    topBrandsByReviews: brandRows.filter((b) => b.brand !== 'Unknown').sort((a, b) => b.reviews - a.reviews).slice(0, 15),
    bestRatedBrands: brandRows.filter((b) => b.reviews >= 1000 && b.brand !== 'Unknown').sort((a, b) => b.meanRating - a.meanRating).slice(0, 12),
    source: 'Amazon Reviews 2023 - Grocery & Gourmet Food (McAuley Lab). Processed with Hadoop MapReduce.', jobs: jobs.map(({ _id, ...x }) => x),
  };
}))));

r.get('/reviews/product/:asin', wrap(async (req, res) => {
  const asin = req.params.asin; const [meta, stats, sample] = await Promise.all([col('amazon_meta').findOne({ parent_asin: asin }, { projection: { _id: 0, details: 0 } }),
    col('mr_product_stats').findOne({ parent_asin: asin }, { projection: { _id: 0 } }), col('amazon_reviews_sample').find({ parent_asin: asin }, { projection: { _id: 0, text: 1, title: 1, rating: 1, date: 1, helpful_vote: 1 } }).sort({ helpful_vote: -1 }).limit(5).toArray()]);
  if (!meta) throw new HttpError(404, 'not_found', 'No such product in the review dataset.');
  res.json({ meta, stats, topReviews: sample });
}));
r.get('/reviews/search', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim(); if (q.length < 3) return res.json([]);
  const rows = await col('amazon_meta').find({ $text: { $search: q } }, { projection: { _id: 0, parent_asin: 1, title: 1, store: 1, price: 1, average_rating: 1, rating_number: 1 } }).limit(15).toArray();
  res.json(rows);
}));

r.get('/demand', wrap(async (req, res) => res.json(await memo('dem', async () => {
  const [fm, promo, wd] = await Promise.all([J('J7_family_month'), J('J8_promo_lift'), J('J9_weekday_profile')]);
  if (!fm.length) throw new HttpError(404, 'not_loaded', 'Hadoop results have not been loaded yet.');
  const famTotals = {}; for (const x of fm) { const [f] = x.key.split('|'); famTotals[f] = (famTotals[f] || 0) + x.values.sales; }
  const topFam = Object.entries(famTotals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([f]) => f);
  const yearly = {}; for (const x of fm) { const [f, m] = x.key.split('|'); if (!topFam.includes(f)) continue; (yearly[f] ??= []).push({ month: m, units: Math.round(x.values.sales) }); }
  for (const f of Object.keys(yearly)) yearly[f].sort((a, b) => (a.month < b.month ? -1 : 1));
  const pf = {}; for (const x of promo) { const [f, k] = x.key.split('|'); (pf[f] ??= {})[k] = x.values.mean; }
  const lift = Object.entries(pf).filter(([, v]) => v.promo && v.nopromo).map(([family, v]) => ({ family, promoMean: Math.round(v.promo * 10) / 10, noPromoMean: Math.round(v.nopromo * 10) / 10, ratio: Math.round((v.promo / Math.max(v.nopromo, 0.01)) * 100) / 100 })).sort((a, b) => b.ratio - a.ratio);
  const dow = {}; for (const x of wd.filter((y) => y.key.startsWith('F:'))) { const [f, d] = x.key.slice(2).split('|'); (dow[f] ??= Array(7).fill(0))[+d] = x.values.mean; }
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const profile = Object.entries(dow).filter(([f]) => topFam.includes(f)).map(([family, v]) => { const avg = v.reduce((a, b) => a + b, 0) / 7 || 1; return { family, days: names.map((d, i) => ({ day: d, index: Math.round((v[i] / avg) * 100) })) }; });
  return { topFamilies: topFam, monthlyByFamily: yearly, promoLift: lift.slice(0, 15), weekdayProfile: profile, source: 'Store Sales (Corporacion Favorita, Kaggle) - 3,000,888 rows processed with Hadoop MapReduce.',
    caution: 'Promotion comparisons are associations (promoted items differ from non-promoted ones), not proven causal lift.' };
}))));

r.get('/waste', wrap(async (req, res) => {
  const rows = await col('mr_results').find({ job: 'J10_waste_by_family', key: new RegExp(`\\|${req.tenantId.replace(/[^a-zA-Z0-9-]/g, '')}-S`) }).toArray();
  const by = {}; for (const x of rows) { const [f, type] = x.key.split('|'); const b = (by[f] ??= { family: f, writtenOffUnits: 0, shrinkUnits: 0 }); if (type === 'EXPIRY_WRITEOFF') b.writtenOffUnits += x.values.units; else b.shrinkUnits += x.values.units; }
  res.json({ simulated: true, note: 'Simulated operations data. Computed with a Hadoop map-side join of adjustments with the product table.', rows: Object.values(by).sort((a, b) => b.writtenOffUnits - a.writtenOffUnits) });
}));

const PRIOR_ORDERS = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'evidence/data_profile/external_instacart.json'), 'utf8')).eval_sets.prior; } catch { return 3214874; } })();
const R2 = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
r.get('/datasets', wrap(async (_req, res) => res.json(await col('ext_datasets').find({}, { projection: { _id: 0 } }).toArray())));

/** Hadoop results on the external research datasets (Instacart, Dunnhumby, Online Retail II, M5, supermarket waste reference, RC Superstore) */
r.get('/external', wrap(async (_req, res) => res.json(await memo('ext', async () => {
  const J2 = (job) => col('mr_results').find({ job }).toArray();
  const [sup, pairs, reo, timing, dh, bsz, ret, m5c, waste, drift, names] = await Promise.all([J2('X1_item_support'), J2('X1c_pair_counts'), J2('X2_reorder_by_department'), J2('X3_order_timing'), J2('X4_discount_depth'), J2('X4c_basket_size_histogram'),
    J2('X5_online_retail'), J2('X6b_class_by_department'), J2('X7_supermarket_waste'), J2('X8_price_drift'), col('ext_names').find({}).toArray()]);
  if (!pairs.length) throw new HttpError(404, 'not_loaded', 'External-dataset results have not been loaded yet.');
  // ---- basket analysis (support, confidence, lift)
  const sMap = Object.fromEntries(sup.map((x) => [x.key, x.values.orders])); const top = pairs.map((x) => { const [a, b] = x.key.split(','); const c = x.values.count; return { a, b, count: c, lift: (c * PRIOR_ORDERS) / (sMap[a] * sMap[b]), confAB: c / sMap[a], confBA: c / sMap[b] }; });
  const ids = [...new Set(top.flatMap((x) => [x.a, x.b]))].map(Number); const nm = Object.fromEntries((await col('ext_instacart_products').find({ product_id: { $in: ids } }).toArray()).map((p) => [String(p.product_id), p.name]));
  const fmtPair = (x) => ({ a: nm[x.a], b: nm[x.b], count: x.count, lift: R2(x.lift, 1), support: R2((x.count / PRIOR_ORDERS) * 100, 2), confidenceAtoB: R2(x.confAB * 100, 1) });
  const byCount = [...top].sort((p, q) => q.count - p.count).slice(0, 12).map(fmtPair); const byLift = top.filter((x) => x.count >= 800).sort((p, q) => q.lift - p.lift).slice(0, 12).map(fmtPair);
  // ---- reorder rates
  const nmOf = (kind, id) => names.find((n) => n.kind === kind && String(n.id) === id)?.name || id;
  const dept = reo.filter((x) => x.key.startsWith('D:')).map((x) => ({ department: nmOf('instacart_department', x.key.slice(2)), lines: x.values.lines, reorderRate: R2(x.values.rate * 100, 1) })).sort((a, b) => b.reorderRate - a.reorderRate);
  const aisle = reo.filter((x) => x.key.startsWith('A:') && x.values.lines >= 20000).map((x) => ({ aisle: nmOf('instacart_aisle', x.key.slice(2)), lines: x.values.lines, reorderRate: R2(x.values.rate * 100, 1) })).sort((a, b) => b.reorderRate - a.reorderRate);
  // ---- order timing heatmap
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0)); for (const x of timing.filter((t) => t.key.startsWith('H:'))) { const [d, h] = x.key.slice(2).split('|'); heat[+d][+h] = x.values.orders; }
  const recency = timing.filter((t) => t.key.startsWith('G:')).map((t) => ({ days: t.key.slice(2), orders: t.values.orders })).sort((a, b) => (a.days === '30+') - (b.days === '30+') || a.days.localeCompare(b.days));
  // ---- Dunnhumby discounts
  const D = {}; for (const x of dh) { const [d, q, b] = x.key.split('|'); const v = x.values; const t = (D[d] ??= { net: 0, rd: 0, cd: 0, lines: 0, byBrand: {}, byQ: {} }); t.net += v.netSales; t.rd += v.retailDisc; t.cd += v.couponDisc; t.lines += v.lines; (t.byBrand[b] ??= { net: 0, rd: 0 }); t.byBrand[b].net += v.netSales; t.byBrand[b].rd += v.retailDisc; (t.byQ[q] ??= { net: 0, rd: 0 }); t.byQ[q].net += v.netSales; t.byQ[q].rd += v.retailDisc; }
  const loyal = (n, rd) => (rd < 0 ? (-rd / (n - rd)) * 100 : 0);
  const depts = Object.entries(D).filter(([k]) => k !== 'UNKNOWN').map(([k, v]) => ({ department: k, netSales: Math.round(v.net), loyaltyDiscountPct: R2(loyal(v.net, v.rd), 1), couponPct: R2((-v.cd / Math.max(v.net - v.rd, 1)) * 100, 2), lines: v.lines })).sort((a, b) => b.netSales - a.netSales).slice(0, 10);
  const allB = {}; for (const v of Object.values(D)) for (const [b, t] of Object.entries(v.byBrand)) { (allB[b] ??= { net: 0, rd: 0 }); allB[b].net += t.net; allB[b].rd += t.rd; }
  const brandType = Object.entries(allB).filter(([b]) => ['Private', 'National'].includes(b)).map(([b, t]) => ({ brandType: b, netSales: Math.round(t.net), loyaltyDiscountPct: R2(loyal(t.net, t.rd), 1) }));
  const basket = bsz.map((b) => ({ size: b.key.slice(5), baskets: b.values.baskets, avgSpend: R2(b.values.sales / b.values.baskets, 2) })).sort((a, b) => a.size.localeCompare(b.size));
  // ---- returns (Online Retail II)
  const M = ret.filter((x) => x.key.startsWith('M:')).map((x) => ({ month: x.key.slice(2), revenue: Math.round(x.values.v[2]), soldUnits: x.values.v[1], returnedUnits: x.values.v[4], returnRatePct: R2((x.values.v[4] / Math.max(x.values.v[1], 1)) * 100, 1) })).sort((a, b) => a.month.localeCompare(b.month));
  const P = ret.filter((x) => x.key.startsWith('P:') && x.values.v[0] >= 1500).map((x) => ({ code: x.key.slice(2), sold: x.values.v[0], returned: x.values.v[1], ratePct: R2((x.values.v[1] / x.values.v[0]) * 100, 1) })).sort((a, b) => b.ratePct - a.ratePct).slice(0, 10);
  const dsc = Object.fromEntries((await col('ext_retail_desc').find({ code: { $in: P.map((p) => p.code) } }).toArray()).map((d) => [d.code, d.description])); P.forEach((p) => { p.description = dsc[p.code] || p.code; });
  const country = ret.filter((x) => x.key.startsWith('C:')).map((x) => ({ country: x.key.slice(2), revenue: Math.round(x.values.v[0]) })).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  // ---- M5 demand classes
  const mix = {}; for (const x of m5c) { const [d, k] = x.key.split('|'); (mix[d] ??= { dept: d, series: 0, zeroShare: 0 }); mix[d][k] = x.values.series; mix[d].series += x.values.series; mix[d].zeroShare += x.values.days - x.values.nonzeroDays; mix[d]._days = (mix[d]._days || 0) + x.values.days; }
  const m5 = Object.values(mix).map((m) => ({ ...m, zeroDaysPct: R2((m.zeroShare / m._days) * 100, 1), zeroShare: undefined, _days: undefined }));
  // ---- waste reference
  const W = {}; for (const x of waste) { const [c] = x.key.split('|'); const v = x.values; const t = (W[c] ??= { sold: 0, wasted: 0, loss: 0, oos: 0, rows: 0 }); t.sold += v.sold; t.wasted += v.wasted; t.loss += v.lossUsd; t.oos += v.oosDays; t.rows += v.rows; }
  const wasteRows = Object.entries(W).map(([c, t]) => ({ category: c, wastePctOfSold: R2((t.wasted / t.sold) * 100, 2), oosDaysPct: R2((t.oos / t.rows) * 100, 1), wastedUnits: t.wasted })).sort((a, b) => b.wastePctOfSold - a.wastePctOfSold);
  // ---- price drift
  const months = drift.filter((x) => x.key.startsWith('M:')).map((x) => ({ month: x.key.slice(2), products: x.values.v[0], avgPrice: R2(x.values.v[1] / x.values.v[0], 2), dealSharePct: R2((x.values.v[2] / x.values.v[0]) * 100, 1) })).sort((a, b) => a.month.localeCompare(b.month));
  const mv = drift.filter((x) => x.key.startsWith('P:') && x.values.v[0] >= 8 && x.values.v[1] > 0.5).map((x) => ({ id: x.key.slice(2), months: x.values.v[0], min: x.values.v[1], max: x.values.v[2], swingPct: R2(((x.values.v[2] - x.values.v[1]) / x.values.v[1]) * 100, 0), dealMonths: x.values.v[4] })).sort((a, b) => b.swingPct - a.swingPct).slice(0, 8);
  const tt = Object.fromEntries((await col('ext_rc_titles').find({ productId: { $in: mv.map((m) => m.id) } }).toArray()).map((t) => [t.productId, t.title])); mv.forEach((m) => { m.title = tt[m.id] || m.id; });
  return { priorOrders: PRIOR_ORDERS, baskets: { byCount, byLift }, reorder: { departments: dept, aisleHigh: aisle.slice(0, 8), aisleLow: aisle.slice(-8).reverse() }, timing: { heat, recency }, discounts: { departments: depts, brandType, basketSizes: basket },
    returns: { monthly: M, topReturned: P, countries: country }, demandClasses: m5, waste: wasteRows, priceDrift: { months, biggestSwings: mv } };
}))));

r.get('/model-health', wrap(async (req, res) => {
  const run = await col('forecast_runs').findOne({ tenantId: req.tenantId }, { sort: { createdAt: -1 }, projection: { _id: 0 } });
  let favorita = null; try { favorita = JSON.parse(fs.readFileSync(path.join(ROOT, 'evidence/forecast/favorita_metrics.json'), 'utf8')); } catch { /* not generated yet */ }
  const t = await Tenant.findById(req.tenantId).lean();
  res.json({ latestRun: run, favoritaBenchmark: favorita && { window: favorita.window_test, series: favorita.series, ranking: favorita.ranking, metrics: favorita.metrics, summary: favorita.summary },
    explanation: 'Accuracy shown is measured on the last 28 days, using a model chosen on the 28 days before - so the choice never sees the data it is scored on.', simulatedTenant: !!t?.simulated }); }));
export default r;
