import { Product } from '../models/index.js';
import { norm } from './mapping.js';
/** Key for an item we could not match: the item code when the file has one (same code, different descriptions = one item), else the normalised name. */
export const unmatchedKey = (name, code) => (code ? 'code:' + norm(code) : 'raw:' + normName(name));

const STOPWORDS = new Set(['the', 'of', 'and', 'with', 'pack', 'pcs', 'pc', 'nos']);
export const normName = (s) => String(s ?? '').toLowerCase().replace(/([0-9])([a-z])/g, '$1 $2').replace(/([a-z])([0-9])/g, '$1 $2').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');   // '500ml' == '500 ml'
const tokens = (s) => normName(s).split(' ').filter((t) => t && !STOPWORDS.has(t));

export async function buildMatcher(tenantId) {
  const prods = await Product.find({ tenantId }).select('sku name barcode aliases').lean();
  const bySku = new Map(), byBarcode = new Map(), byName = new Map(), post = new Map(), tok = [];
  prods.forEach((p, i) => {
    bySku.set(norm(p.sku), p.sku); if (p.barcode) byBarcode.set(String(p.barcode).replace(/\D/g, ''), p.sku);
    for (const n of [p.name, ...(p.aliases || [])]) byName.set(normName(n), p.sku);
    const t = new Set(tokens(p.name)); tok[i] = { sku: p.sku, set: t };
    for (const w of t) { if (!post.has(w)) post.set(w, []); post.get(w).push(i); }
  });
  const cache = new Map();
  function score(a, b) { let inter = 0; for (const x of a) if (b.has(x)) inter++; return inter ? 0.5 * (inter / (a.size + b.size - inter)) + 0.5 * (inter / Math.min(a.size, b.size)) : 0; }
  /** exact by code/barcode/name -> {sku, how}; otherwise a *proposal* (never auto-applied) or null */
  return {
    size: prods.length,
    match(name, code) {
      const key = `${code ?? ''}|${normName(name)}`; if (cache.has(key)) return cache.get(key);
      let res = null;
      if (code) { const c = norm(code); if (bySku.has(c)) res = { sku: bySku.get(c), how: 'code' }; else if (byBarcode.has(String(code).replace(/\D/g, ''))) res = { sku: byBarcode.get(String(code).replace(/\D/g, '')), how: 'barcode' }; }
      if (!res && byName.has(normName(name))) res = { sku: byName.get(normName(name)), how: 'name' };
      if (!res) {
        const t = new Set(tokens(name)); const cand = new Map();
        for (const w of t) { const l = post.get(w); if (l && l.length <= 300) for (const i of l) cand.set(i, (cand.get(i) || 0) + 1); }
        const top = [...cand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([i]) => ({ sku: tok[i].sku, score: score(t, tok[i].set) })).filter((x) => x.score >= 0.6).sort((a, b) => b.score - a.score).slice(0, 3);
        res = top.length ? { proposals: top.map((x) => ({ sku: x.sku, score: Math.round(x.score * 100) / 100 })) } : null;
      }
      cache.set(key, res); return res;
    },
  };
}
