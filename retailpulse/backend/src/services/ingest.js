// Import pipeline: ANALYSE -> (owner confirms mapping) -> VALIDATE/PREVIEW -> (owner resolves unmatched items) -> COMMIT (idempotent) -> UNDO
import crypto from 'node:crypto';
import { ImportJob, ImportError, ImportOverwrite, Product, Sale, InventoryState, Batch, ColumnMapping, Job } from '../models/index.js';
import { readRows, detectKind, parseNumber, parseDate, parseExpiry, inferDateFormat } from './parse.js';
import { TYPES, findHeaderRow, suggestMapping } from './mapping.js';
import { buildMatcher, normName, unmatchedKey } from './matching.js';
import { tenantContext, addDays } from './context.js';
import fs from 'node:fs';
import { config } from '../config.js';

const MAX_ERRORS_STORED = 5000;
/** service / charge lines that billing software mixes into item reports: postage, delivery, bank charges, manual adjustments, discounts ... */
const NON_PRODUCT = /^(post|postage|dot|m|manual|d|discount|s|samples?|b|adjust\w*|amazonfee|bank charges|crUk|cruk\w*|c2|carriage|delivery( charges?)?|service charge|round ?off|test\d*)$/i;
const nonProduct = (name, code) => NON_PRODUCT.test(String(name || '').trim()) || (code && NON_PRODUCT.test(String(code).trim()));
const TOTAL_ROW = /^(grand\s*)?(sub\s*)?total\b|^report\b|^printed\b/i;
const touch = (job, patch) => { Object.assign(job, patch); job.updatedAt = new Date(); return job.save(); };

export async function analyze(job) {
  const buf = Buffer.alloc(8); const fd = fs.openSync(job.filePath, 'r'); fs.readSync(fd, buf, 0, 8, 0); fs.closeSync(fd);
  const kind = detectKind(job.filename, buf);
  const rows = []; for await (const r of readRows(job.filePath, kind, { limit: 2000 })) rows.push(r);
  if (rows.length < 2) return touch(job, { status: 'failed', error: 'The file has no data rows. Please check that you exported the right report.' });
  const hIdx = findHeaderRow(rows, job.type); const header = rows[hIdx]; const data = rows.slice(hIdx + 1).filter((r) => r.some((c) => c !== null && c !== undefined && c !== ''));
  const suggested = suggestMapping(header, data, job.type); const def = TYPES[job.type].fields;
  const missing = Object.entries(def).filter(([k, d]) => d.req && !suggested[k]).map(([k]) => k);
  const dateCol = suggested.date?.column; const dateFmt = dateCol !== undefined ? inferDateFormat(data.map((r) => r[dateCol])) : null;
  const dup = await ImportJob.findOne({ tenantId: job.tenantId, sha256: job.sha256, status: 'committed', _id: { $ne: job._id } }).select('createdAt filename').lean();
  const hasItemCol = !!(suggested.item || suggested.name);
  const warnings = [];
  if (!hasItemCol && job.type === 'sales') warnings.push('We could not find an item/product column. This looks like a bill-total report. Please export an ITEM-WISE sales report (one row per item per day or per bill).');
  if (dateFmt?.ambiguous) warnings.push('Dates like 03/04/2026 could be 3 April or 4 March. We assumed day/month/year - please confirm below.');
  if (dup) warnings.push(`This exact file was already imported on ${dup.createdAt.toISOString().slice(0, 10)}. Importing again will not create duplicates.`);
  const columns = header.map((h, i) => ({ index: i, name: String(h ?? '').trim(), sample: data.slice(0, 4).map((r) => r[i] ?? '') }));
  return touch(job, { status: missing.length ? 'mapping_needed' : 'mapping_suggested', analysis: { kind, headerRow: hIdx, skippedTopRows: hIdx, columns, suggested, missingRequired: missing, dateFormat: dateFmt, warnings, preview: data.slice(0, 5), duplicateOf: dup || null,
    fields: Object.fromEntries(Object.entries(def).map(([k, d]) => [k, { required: !!d.req }])) } });
}

/** iterate data rows with the confirmed mapping */
async function* dataRows(job) {
  const a = job.analysis; const skip = a.headerRow + 1; let i = 0;
  for await (const row of readRows(job.filePath, a.kind)) { i++; if (i <= skip) continue; if (!row.some((c) => c !== null && c !== undefined && String(c).trim() !== '')) continue; yield { rowNumber: i, row }; }
}
const cell = (row, idx) => (idx === undefined || idx === null ? undefined : row[idx]);
const paise = (v) => { const n = parseNumber(v); return n === null ? null : Math.round(n * 100); };
/** line value in paise: the Amount column when the file has one, else unit price x quantity (many billing exports only give a rate) */
const lineAmount = (row, f, qty) => {
  if (f.amount !== undefined) return paise(cell(row, f.amount));
  if (f.price !== undefined) { const p = parseNumber(cell(row, f.price)); return p === null ? null : Math.round(p * qty * 100); }
  return null;
};

export async function validate(job) {
  await touch(job, { status: 'validating', report: { progress: 0 } });
  await ImportError.deleteMany({ importId: String(job._id) });
  const ctx = await tenantContext(job.tenantId); const matcher = await buildMatcher(job.tenantId); const m = job.mapping; const f = m.fields; const type = job.type;
  const rep = { rowsTotal: 0, rowsOk: 0, rowsRejected: 0, rowsSkipped: 0, rejectedByReason: {}, skippedByReason: {}, returns: 0, matched: { code: 0, barcode: 0, name: 0 }, units: 0, revenuePaise: 0, dates: { min: null, max: null }, create: 0, update: 0 };
  const errs = []; let errStored = 0; const unmatched = new Map(); const itemQty = new Map();
  const reject = (rowNumber, reason, raw) => { rep.rowsRejected++; rep.rejectedByReason[reason] = (rep.rejectedByReason[reason] || 0) + 1; if (errStored < MAX_ERRORS_STORED) { errStored++; errs.push({ importId: String(job._id), tenantId: job.tenantId, rowNumber, reason, raw: raw.slice(0, 12) }); } };
  const skip = (reason) => { rep.rowsSkipped++; rep.skippedByReason[reason] = (rep.skippedByReason[reason] || 0) + 1; };
  const seenProducts = new Set();
  for await (const { rowNumber, row } of dataRows(job)) {
    rep.rowsTotal++; if (rep.rowsTotal > config.maxRowsPerFile) { reject(rowNumber, 'file_too_many_rows', row); break; }
    if (rep.rowsTotal % 50000 === 0) { job.report = { ...rep, progress: rep.rowsTotal }; await job.save(); }
    const itemName = String(cell(row, f.item ?? f.name) ?? '').trim(); const code = cell(row, f.itemCode) != null ? String(cell(row, f.itemCode)).trim() : undefined;
    if (TOTAL_ROW.test(itemName) || TOTAL_ROW.test(String(row[0] ?? ''))) { skip('total_or_footer_row'); continue; }
    if (!itemName) { reject(rowNumber, 'missing_item_name', row); continue; }
    if (type === 'sales' && nonProduct(itemName, code)) { skip('non_product_line'); continue; }
    if (type === 'products') {
      const mrp = f.mrp !== undefined ? paise(cell(row, f.mrp)) : undefined; const cost = f.cost !== undefined ? paise(cell(row, f.cost)) : undefined;
      if ((f.mrp !== undefined && cell(row, f.mrp) != null && cell(row, f.mrp) !== '' && (mrp === null || mrp < 0))) { reject(rowNumber, 'invalid_price', row); continue; }
      if (cost === null && cell(row, f.cost) != null && cell(row, f.cost) !== '') { reject(rowNumber, 'invalid_cost', row); continue; }
      const k = normName(itemName); if (seenProducts.has(k)) { reject(rowNumber, 'duplicate_item_in_file', row); continue; } seenProducts.add(k);
      const hit = matcher.match(itemName, code); if (hit?.sku) rep.update++; else rep.create++; rep.rowsOk++; continue;
    }
    const date = f.date !== undefined ? parseDate(cell(row, f.date), m.dateFormat) : null;
    if (f.date !== undefined && !date) { reject(rowNumber, 'invalid_date', row); continue; }
    if (date && date > addDays(ctx.today, 1)) { reject(rowNumber, 'future_date', row); continue; }
    const qty = parseNumber(cell(row, f.qty));
    if (qty === null) { reject(rowNumber, 'invalid_quantity', row); continue; }
    if (type === 'sales' && qty === 0) { skip('zero_quantity'); continue; }
    if (type === 'stock' && qty < 0) { reject(rowNumber, 'negative_stock', row); continue; }
    if (type === 'sales' && qty < 0) rep.returns++;
    if (type === 'purchases' && qty <= 0) { reject(rowNumber, 'invalid_quantity', row); continue; }
    if (type === 'purchases' && f.expiry !== undefined && cell(row, f.expiry) && !parseExpiry(cell(row, f.expiry), m.dateFormat)) { reject(rowNumber, 'invalid_expiry', row); continue; }
    const hit = matcher.match(itemName, code);
    if (hit?.sku) rep.matched[hit.how]++;
    else { const key = unmatchedKey(itemName, code); const u = unmatched.get(key) || { key, name: itemName, rows: 0, qty: 0, proposals: hit?.proposals || [] }; u.rows++; u.qty += Math.abs(qty); unmatched.set(key, u); }
    if (date) { if (!rep.dates.min || date < rep.dates.min) rep.dates.min = date; if (!rep.dates.max || date > rep.dates.max) rep.dates.max = date; }
    rep.units += qty; const amt = lineAmount(row, f, qty); if (amt) rep.revenuePaise += amt;
    const ik = hit?.sku || unmatchedKey(itemName, code); const arr = itemQty.get(ik) || []; if (arr.length < 400) arr.push(Math.abs(qty)); itemQty.set(ik, arr);
    rep.rowsOk++;
  }
  if (errs.length) await ImportError.insertMany(errs, { ordered: false });
  // outliers: a single row far above the item's typical quantity
  const outliers = []; for (const [k, arr] of itemQty) { if (arr.length < 8) continue; const s = [...arr].sort((a, b) => a - b); const med = s[Math.floor(s.length / 2)]; const mx = s[s.length - 1]; if (mx > Math.max(50, 20 * med)) outliers.push({ item: k, median: med, max: mx }); }
  rep.outliers = outliers.slice(0, 20); rep.outlierCount = outliers.length;
  const list = [...unmatched.values()].sort((a, b) => b.qty - a.qty);
  rep.unmatchedItems = list.length; rep.unmatched = list.slice(0, 300); rep.errorsStored = errStored; rep.reconciles = rep.rowsTotal === rep.rowsOk + rep.rowsRejected + rep.rowsSkipped;
  rep.summary = type === 'sales' ? `${rep.rowsOk.toLocaleString('en-IN')} sales rows from ${rep.dates.min} to ${rep.dates.max}` : `${rep.rowsOk.toLocaleString('en-IN')} rows are valid`;
  return touch(job, { status: 'preview_ready', report: rep });
}

export async function commit(job, req) {
  await touch(job, { status: 'committing' });
  const ctx = await tenantContext(job.tenantId); const matcher = await buildMatcher(job.tenantId); const m = job.mapping; const f = m.fields; const t = job.tenantId; const importId = String(job._id);
  const resolutions = job.report?.resolutions || {}; const auto = !!m.options?.autoCreateUnmatched; const res = { inserted: 0, updated: 0, productsCreated: 0, skippedUnmatched: 0, rows: 0 };
  const created = new Map(); const mk = () => 'IMP-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const prodByName = new Map();
  async function resolveSku(name, code, category, amountPaise, qty) {
    const hit = matcher.match(name, code); if (hit?.sku) return hit.sku;
    const key = unmatchedKey(name, code); const r = resolutions[key];
    if (r?.action === 'skip') return null; if (r?.action === 'link' && r.sku) return r.sku;
    if (r?.action === 'create' || auto) {
      if (created.has(key)) return created.get(key);
      const sku = (code && !(await Product.exists({ tenantId: t, sku: String(code) })) ? String(code) : mk());
      await Product.create({ tenantId: t, sku, name, family: category || 'Uncategorised', mrpPaise: qty ? Math.max(0, Math.round((amountPaise || 0) / Math.abs(qty))) : 0, packSize: 1, trackingPolicy: 'off', importId, source: 'import' });
      created.set(key, sku); res.productsCreated++; return sku;
    }
    res.skippedUnmatched++; return null;
  }
  if (job.type === 'sales') {
    const agg = new Map(); const storeId = job.storeId;
    for await (const { rowNumber, row } of dataRows(job)) {
      const itemName = String(cell(row, f.item) ?? '').trim(); if (!itemName || TOTAL_ROW.test(itemName)) continue;
      if (nonProduct(itemName, cell(row, f.itemCode))) continue;
      const date = parseDate(cell(row, f.date), m.dateFormat); const qty = parseNumber(cell(row, f.qty)); if (!date || qty === null || qty === 0 || date > addDays(ctx.today, 1)) continue;
      const amt = lineAmount(row, f, qty);
      const sku = await resolveSku(itemName, cell(row, f.itemCode) != null ? String(cell(row, f.itemCode)).trim() : undefined, String(cell(row, f.category) ?? '').trim() || undefined, amt, qty); if (!sku) continue;
      const k = `${date}|${sku}`; const a = agg.get(k) || { date, sku, qty: 0, rev: 0, hasAmt: false }; a.qty += qty; if (amt !== null) { a.rev += amt; a.hasAmt = true; } agg.set(k, a); res.rows++;
    }
    const prods = Object.fromEntries((await Product.find({ tenantId: t }).select('sku mrpPaise').lean()).map((p) => [p.sku, p.mrpPaise || 0]));
    const items = [...agg.values()].filter((a) => a.qty !== 0 || true).map((a) => ({ ...a, qty: Math.max(a.qty, 0), rev: a.hasAmt ? Math.max(a.rev, 0) : Math.max(a.qty, 0) * (prods[a.sku] || 0) }));
    for (let i = 0; i < items.length; i += 2000) {
      const chunk = items.slice(i, i + 2000);
      const prior = await Sale.find({ tenantId: t, storeId, sku: { $in: chunk.map((c) => c.sku) }, date: { $in: chunk.map((c) => c.date) } }).lean(); const pk = new Map(prior.map((p) => [`${p.date}|${p.sku}`, p]));
      const keep = chunk.filter((c) => pk.has(`${c.date}|${c.sku}`)).map((c) => ({ tenantId: t, importId, collection: 'sales', prior: pk.get(`${c.date}|${c.sku}`) }));
      if (keep.length) await ImportOverwrite.insertMany(keep, { ordered: false });
      const r = await Sale.bulkWrite(chunk.map((c) => ({ updateOne: { filter: { tenantId: t, storeId, date: c.date, sku: c.sku }, update: { $set: { qty: c.qty, revenuePaise: c.rev, importId, source: 'import', simulated: false } }, upsert: true } })), { ordered: false });
      res.inserted += r.upsertedCount; res.updated += r.modifiedCount + (r.matchedCount - r.modifiedCount);
      if ((i / 2000) % 25 === 0) { job.commitResult = { ...res, progress: i }; await job.save(); }
    }
    res.updated = Math.max(0, items.length - res.inserted);
  } else if (job.type === 'products') {
    for await (const { row } of dataRows(job)) {
      const name = String(cell(row, f.name) ?? '').trim(); if (!name || TOTAL_ROW.test(name)) continue; const code = cell(row, f.itemCode) != null ? String(cell(row, f.itemCode)).trim() : undefined;
      const set = {}; const put = (k, v) => { if (v !== undefined && v !== null && v !== '') set[k] = v; };
      put('barcode', cell(row, f.barcode) != null ? String(cell(row, f.barcode)).trim() : undefined); put('family', String(cell(row, f.category) ?? '').trim() || undefined); put('brand', String(cell(row, f.brand) ?? '').trim() || undefined);
      put('mrpPaise', f.mrp !== undefined ? paise(cell(row, f.mrp)) : undefined); put('costPaise', f.cost !== undefined ? paise(cell(row, f.cost)) : undefined);
      put('packSize', f.pack !== undefined ? parseNumber(cell(row, f.pack)) : undefined); put('shelfLifeDays', f.shelfLife !== undefined ? parseNumber(cell(row, f.shelfLife)) : undefined);
      const hit = matcher.match(name, code);
      if (hit?.sku) { const old = await Product.findOne({ tenantId: t, sku: hit.sku }).lean(); await ImportOverwrite.create({ tenantId: t, importId, collection: 'products', prior: old }); await Product.updateOne({ tenantId: t, sku: hit.sku }, { $set: set }); res.updated++; }
      else { const sku = code && !(await Product.exists({ tenantId: t, sku: code })) ? code : mk(); await Product.create({ tenantId: t, sku, name, mrpPaise: 0, trackingPolicy: 'off', ...set, importId, source: 'import' }); res.productsCreated++; res.inserted++; }
      res.rows++;
    }
  } else if (job.type === 'stock') {
    for await (const { row } of dataRows(job)) {
      const name = String(cell(row, f.item) ?? '').trim(); const qty = parseNumber(cell(row, f.qty)); if (!name || qty === null || qty < 0 || TOTAL_ROW.test(name)) continue;
      const sku = await resolveSku(name, cell(row, f.itemCode) != null ? String(cell(row, f.itemCode)).trim() : undefined, undefined, 0, 0); if (!sku) continue;
      const old = await InventoryState.findOne({ tenantId: t, storeId: job.storeId, sku }).lean();
      await ImportOverwrite.create({ tenantId: t, importId, collection: 'inventory_state', prior: old, key: { tenantId: t, storeId: job.storeId, sku } });
      await InventoryState.updateOne({ tenantId: t, storeId: job.storeId, sku }, { $set: { onHand: Math.round(qty), asOf: ctx.today, importId, simulated: false }, $setOnInsert: { onOrder: 0 } }, { upsert: true });
      const p = await Product.findOne({ tenantId: t, sku }).select('trackingPolicy').lean();
      if (p?.trackingPolicy === 'strict' && qty > 0 && !(await Batch.exists({ tenantId: t, storeId: job.storeId, sku, remaining: { $gt: 0 } }))) await Batch.create({ tenantId: t, storeId: job.storeId, sku, batchId: `OPEN-${importId.slice(-5)}-${sku}`, qty: Math.round(qty), remaining: Math.round(qty), receivedDate: ctx.today, status: 'pending_expiry', importId, kind: 'OPENING' });
      res.updated++; res.rows++;
    }
  } else if (job.type === 'purchases') {
    const apply = !!m.options?.applyToStock;
    for await (const { row } of dataRows(job)) {
      const name = String(cell(row, f.item) ?? '').trim(); const date = parseDate(cell(row, f.date), m.dateFormat); const qty = parseNumber(cell(row, f.qty)); if (!name || !date || !qty || qty <= 0) continue;
      const sku = await resolveSku(name, cell(row, f.itemCode) != null ? String(cell(row, f.itemCode)).trim() : undefined, undefined, 0, 0); if (!sku) continue;
      const expiry = f.expiry !== undefined ? parseExpiry(cell(row, f.expiry), m.dateFormat) : null; const live = apply && date >= addDays(ctx.today, -30);
      const p = await Product.findOne({ tenantId: t, sku }).select('trackingPolicy').lean();
      await Batch.create({ tenantId: t, storeId: job.storeId, sku, batchId: String(cell(row, f.batch) || `IMP-${importId.slice(-5)}-${res.rows}`), qty, remaining: live ? qty : 0, costPaise: f.rate !== undefined ? paise(cell(row, f.rate)) : undefined,
        receivedDate: date, expiryDate: expiry, expirySource: expiry ? 'entered' : null, status: !expiry && p?.trackingPolicy === 'strict' && live ? 'pending_expiry' : 'active', importId, invoiceNo: cell(row, f.invoice) ? String(cell(row, f.invoice)) : undefined });
      if (live) await InventoryState.updateOne({ tenantId: t, storeId: job.storeId, sku }, { $inc: { onHand: qty }, $setOnInsert: { onOrder: 0 } }, { upsert: true });
      res.inserted++; res.rows++;
    }
  }
  await ColumnMapping.updateOne({ tenantId: t, type: job.type, source: job.source || 'generic' }, { $set: { mapping: m.fields, dateFormat: m.dateFormat, updatedAt: new Date() } }, { upsert: true });
  if (job.type === 'sales' || job.type === 'stock') await Job.create({ tenantId: t, type: 'pipeline', status: 'queued', createdAt: new Date(), requestedBy: 'import:' + importId, attempts: 0 });
  return touch(job, { status: 'committed', commitResult: { ...res, committedAt: new Date() } });
}

export async function undo(job) {
  const t = job.tenantId; const importId = String(job._id); const out = {};
  if (job.type === 'sales') {
    out.salesRemoved = (await Sale.deleteMany({ tenantId: t, importId })).deletedCount;
    for (const o of await ImportOverwrite.find({ tenantId: t, importId, collection: 'sales' }).lean()) { await Sale.replaceOne({ _id: o.prior._id }, o.prior, { upsert: true }); out.salesRestored = (out.salesRestored || 0) + 1; }
  }
  if (job.type === 'products') for (const o of await ImportOverwrite.find({ tenantId: t, importId, collection: 'products' }).lean()) { await Product.replaceOne({ _id: o.prior._id }, o.prior, { upsert: true }); out.productsRestored = (out.productsRestored || 0) + 1; }
  if (job.type === 'stock') for (const o of await ImportOverwrite.find({ tenantId: t, importId, collection: 'inventory_state' }).lean()) {
    if (o.prior) await InventoryState.replaceOne({ _id: o.prior._id }, o.prior, { upsert: true }); else await InventoryState.deleteOne(o.key); out.stockRestored = (out.stockRestored || 0) + 1; }
  out.batchesRemoved = (await Batch.deleteMany({ tenantId: t, importId })).deletedCount;
  const usedAny = async (sku) => (await Sale.exists({ tenantId: t, sku })) || (await Batch.exists({ tenantId: t, sku }));
  let pc = 0; for (const p of await Product.find({ tenantId: t, importId }).select('sku').lean()) if (!(await usedAny(p.sku))) { await Product.deleteOne({ _id: p._id }); pc++; }
  out.productsRemoved = pc; await ImportOverwrite.deleteMany({ tenantId: t, importId });
  return touch(job, { status: 'undone', commitResult: { ...(job.commitResult || {}), undone: out } });
}
