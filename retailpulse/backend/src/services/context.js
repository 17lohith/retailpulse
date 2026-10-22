import { Tenant, Sale } from '../models/index.js';

const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export { addDays };

/** Demo tenants run on a fixed "as of" date; real tenants use the latest sales date they uploaded. */
export async function tenantContext(tenantId) {
  const t = await Tenant.findById(tenantId).lean();
  let asOf = t?.asOfDate;
  if (!asOf) {
    const last = await Sale.findOne({ tenantId }).sort({ date: -1 }).select('date').lean();
    asOf = last?.date || new Date().toISOString().slice(0, 10);
  }
  const realToday = new Date().toISOString().slice(0, 10);
  const today = t?.simulated ? addDays(asOf, 1) : realToday;
  const staleDays = Math.round((new Date(today) - new Date(asOf)) / 864e5) - 1;
  return { tenant: t, asOf, today, staleDays: t?.simulated ? 0 : Math.max(staleDays, 0), simulated: !!t?.simulated };
}
