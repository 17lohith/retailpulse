import { Store } from '../models/index.js';
import { HttpError } from '../middleware/common.js';

/** Returns a validated storeId or undefined (all stores). Prevents cross-tenant store ids. */
export async function resolveStore(req, value = req.query.storeId ?? req.body?.storeId) {
  if (!value || value === 'all') return undefined;
  const s = await Store.findOne({ _id: String(value), tenantId: req.tenantId }).select('_id').lean();
  if (!s) throw new HttpError(404, 'store_not_found', 'That store does not belong to your account.');
  return s._id;
}
export const money = (paise) => Math.round(paise) / 100;
export const dateRange = (q, ctx, defDays = 28) => {
  const to = q.to || ctx.asOf;
  const d = new Date(to + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (parseInt(q.days) || defDays) + 1);
  return { from: q.from || d.toISOString().slice(0, 10), to };
};
