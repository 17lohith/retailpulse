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

r.get('/model-health', wrap(async (req, res) => {
  const run = await col('forecast_runs').findOne({ tenantId: req.tenantId }, { sort: { createdAt: -1 }, projection: { _id: 0 } });
  let favorita = null; try { favorita = JSON.parse(fs.readFileSync(path.join(ROOT, 'evidence/forecast/favorita_metrics.json'), 'utf8')); } catch { /* not generated yet */ }
  const t = await Tenant.findById(req.tenantId).lean();
  res.json({ latestRun: run, favoritaBenchmark: favorita && { window: favorita.window_test, series: favorita.series, ranking: favorita.ranking, metrics: favorita.metrics, summary: favorita.summary },
    explanation: 'Accuracy shown is measured on the last 28 days, using a model chosen on the 28 days before - so the choice never sees the data it is scored on.', simulatedTenant: !!t?.simulated }); }));
export default r;
