import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { z, wrap, validate, HttpError, audit, pageParams } from '../middleware/common.js';
import { requireRole } from '../middleware/auth.js';
import { ImportJob, ImportError, ColumnMapping } from '../models/index.js';
import { resolveStore } from '../services/helpers.js';
import { analyze, validate as validateJob, commit, undo } from '../services/ingest.js';
import { TYPES } from '../services/mapping.js';
import { config } from '../config.js';

fs.mkdirSync(config.uploadDir, { recursive: true });
const upload = multer({ dest: config.uploadDir, limits: { fileSize: config.maxUploadBytes } });
const r = Router();
const bg = (job, fn) => setImmediate(() => fn().catch(async (e) => { try { job.status = 'failed'; job.error = e.message; await job.save(); } catch { /* ignore */ } }));
const owned = async (req) => { const j = await ImportJob.findOne({ _id: req.params.id, tenantId: req.tenantId }); if (!j) throw new HttpError(404, 'not_found', 'Import not found.'); return j; };
const view = (j) => { const o = j.toObject(); delete o.filePath; return o; };

r.get('/', wrap(async (req, res) => { const { page, limit } = pageParams(req.query);
  const items = await ImportJob.find({ tenantId: req.tenantId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select('-filePath -analysis.columns -report.unmatched').lean(); res.json({ page, limit, items }); }));

r.get('/templates/:type', wrap(async (req, res) => {
  const type = req.params.type; if (!TYPES[type]) throw new HttpError(404, 'not_found', 'Unknown template.');
  const sample = { sales: 'Date,Item Name,Item Code,Category,Quantity,Sale Amount\n01/09/2026,Amul Taaza Milk 500 ml,SKU-0001,DAIRY,24,720\n01/09/2026,Parle-G Biscuits 200 g,SKU-0002,GROCERY,12,240\n',
    products: 'Item Name,Item Code,Barcode,Category,Brand,MRP,Cost Price,Pack Size\nAmul Taaza Milk 500 ml,SKU-0001,8901262010016,DAIRY,Amul,30,27,12\n',
    stock: 'Item Name,Item Code,Closing Stock\nAmul Taaza Milk 500 ml,SKU-0001,36\n',
    purchases: 'Date,Supplier,Invoice No,Item Name,Item Code,Batch No,Expiry,Qty,Rate\n01/09/2026,Daily Fresh Dairy,INV-101,Amul Taaza Milk 500 ml,SKU-0001,B123,15/09/2026,48,27\n' }[type];
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="retailpulse-${type}-template.csv"`); res.send(sample);
}));

r.post('/', requireRole('manager'), upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'no_file', 'Please choose a file to upload.');
  const body = z.object({ type: z.enum(['sales', 'products', 'stock', 'purchases']), storeId: z.string().optional(), source: z.string().max(30).default('generic') }).safeParse(req.body);
  if (!body.success) { fs.rmSync(req.file.path, { force: true }); throw new HttpError(400, 'validation_failed', 'Choose what you are uploading (sales, items, stock or purchases).'); }
  const { type, source } = body.data; let storeId;
  try { storeId = await resolveStore(req, body.data.storeId); } catch (e) { fs.rmSync(req.file.path, { force: true }); throw e; }
  if (type !== 'products' && !storeId) { fs.rmSync(req.file.path, { force: true }); throw new HttpError(400, 'store_required', 'Choose which store this file is for.'); }
  const hash = crypto.createHash('sha256'); await new Promise((ok, no) => fs.createReadStream(req.file.path).on('data', (d) => hash.update(d)).on('end', ok).on('error', no));
  const filePath = req.file.path + path.extname(req.file.originalname).toLowerCase(); fs.renameSync(req.file.path, filePath);
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'raw_uploads' });
  const gridfsId = await new Promise((ok, no) => { const up = bucket.openUploadStream(req.file.originalname, { metadata: { tenantId: req.tenantId } }); fs.createReadStream(filePath).pipe(up).on('finish', () => ok(up.id)).on('error', no); });
  const job = await ImportJob.create({ tenantId: req.tenantId, userId: req.user.id, type, storeId, source, filename: req.file.originalname, sizeBytes: req.file.size, sha256: hash.digest('hex'), filePath, gridfsId, status: 'analyzing' });
  try { await analyze(job); } catch (e) { job.status = 'failed'; job.error = e.message; await job.save(); if (e instanceof HttpError) throw e; }
  const saved = await ColumnMapping.findOne({ tenantId: req.tenantId, type, source }).lean();
  if (saved && job.analysis?.columns) {   // reuse the owner's previous mapping if the same header names are present
    const names = job.analysis.columns.map((c) => c.name.toLowerCase()); const reuse = {};
    for (const [field, idx] of Object.entries(saved.mapping)) { const old = saved.mapping[field]; if (job.analysis.columns[old]) reuse[field] = { column: old, name: job.analysis.columns[old].name, confidence: 1, fromSaved: true }; }
    if (Object.keys(reuse).length && names.length) { job.analysis = { ...job.analysis, suggested: { ...job.analysis.suggested, ...reuse }, usedSavedMapping: true }; job.markModified('analysis'); await job.save(); }
  }
  audit(req, 'upload', 'import', job._id, { type, filename: job.filename, size: job.sizeBytes }); res.status(201).json(view(job));
}));

r.get('/:id', wrap(async (req, res) => res.json(view(await owned(req)))));

r.post('/:id/mapping', requireRole('manager'), validate(z.object({ fields: z.record(z.number().int().min(0)), dateFormat: z.enum(['dmy', 'mdy', 'ymd', 'dmon', 'excel-serial']).default('dmy'),
  options: z.object({ autoCreateUnmatched: z.boolean().optional(), applyToStock: z.boolean().optional() }).default({}) })), wrap(async (req, res) => {
  const job = await owned(req); if (!['mapping_needed', 'mapping_suggested', 'preview_ready', 'failed'].includes(job.status)) throw new HttpError(409, 'wrong_state', 'This import can no longer be changed.');
  const need = Object.entries(TYPES[job.type].fields).filter(([, d]) => d.req).map(([k]) => k);
  const missing = need.filter((k) => req.body.fields[k] === undefined); if (missing.length) throw new HttpError(400, 'missing_columns', `Please choose a column for: ${missing.join(', ')}.`);
  job.mapping = req.body; job.markModified('mapping'); await job.save(); bg(job, () => validateJob(job)); res.status(202).json({ status: 'validating' });
}));

r.post('/:id/resolve', requireRole('manager'), validate(z.object({ resolutions: z.array(z.object({ key: z.string(), action: z.enum(['link', 'create', 'skip']), sku: z.string().optional() })).max(2000) })), wrap(async (req, res) => {
  const job = await owned(req); if (job.status !== 'preview_ready') throw new HttpError(409, 'wrong_state', 'Preview is not ready.');
  const cur = job.report.resolutions || {}; for (const x of req.body.resolutions) cur[x.key] = { action: x.action, sku: x.sku };
  job.report = { ...job.report, resolutions: cur }; job.markModified('report'); await job.save(); res.json({ saved: Object.keys(cur).length });
}));

r.post('/:id/commit', requireRole('manager'), wrap(async (req, res) => {
  const job = await owned(req); if (job.status !== 'preview_ready') throw new HttpError(409, 'wrong_state', 'Please review the preview first.');
  if (job.report.rowsOk === 0) throw new HttpError(400, 'nothing_to_import', 'There are no valid rows to import.');
  bg(job, () => commit(job, req)); audit(req, 'commit_import', 'import', job._id, { type: job.type }); res.status(202).json({ status: 'committing' });
}));
r.post('/:id/undo', requireRole('manager'), wrap(async (req, res) => {
  const job = await owned(req); if (job.status !== 'committed') throw new HttpError(409, 'wrong_state', 'Only a finished import can be undone.');
  await undo(job); audit(req, 'undo_import', 'import', job._id); res.json(view(job));
}));
r.get('/:id/errors.csv', wrap(async (req, res) => {
  const job = await owned(req); const rows = await ImportError.find({ importId: String(job._id) }).sort({ rowNumber: 1 }).lean();
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="import-${job._id}-rows-to-fix.csv"`);
  res.send(['Row,Problem,Row content', ...rows.map((e) => [e.rowNumber, e.reason, (e.raw || []).join(' | ')].map(esc).join(','))].join('\n'));
}));
export default r;
