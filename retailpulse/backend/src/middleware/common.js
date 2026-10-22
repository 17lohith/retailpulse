import { z } from 'zod';
import { AuditLog } from '../models/index.js';

export class HttpError extends Error {
  constructor(status, code, message, detail) { super(message); this.status = status; this.code = code; this.detail = detail; }
}
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const validate = (schema, where = 'body') => (req, res, next) => {
  const r = schema.safeParse(req[where]);
  if (!r.success) {
    return res.status(400).json({ error: 'validation_failed', message: 'Some fields are not valid.',
      fields: r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) });
  }
  req[where] = r.data; next();
};

export const audit = (req, action, entity, entityId, detail) =>
  AuditLog.create({ tenantId: req.tenantId, userId: req.user?.id, userEmail: req.user?.email, action, entity, entityId: String(entityId ?? ''), detail }).catch(() => {});

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message, detail: err.detail });
  if (err?.code === 11000) return res.status(409).json({ error: 'duplicate', message: 'That record already exists.', detail: err.keyValue });
  if (err?.name === 'ValidationError') return res.status(400).json({ error: 'validation_failed', message: err.message });
  if (err?.name === 'CastError') return res.status(400).json({ error: 'bad_id', message: 'Invalid identifier.' });
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'file_too_large', message: 'That file is too large. Split it by month and upload again.' });
  req.log?.error({ err }, 'unhandled');
  res.status(500).json({ error: 'server_error', message: 'Something went wrong on our side. Please try again.' });
}
export { z };

export const pageParams = (q) => ({ page: Math.max(1, parseInt(q.page) || 1), limit: Math.min(200, Math.max(1, parseInt(q.limit) || 25)) });
