// New-owner journey through the REAL API: register -> items -> sales (229k rows) -> stock -> learning -> Today.
import fs from 'node:fs';
const API = process.env.API || 'http://localhost:4000/api'; const DIR = new URL('../data/clean/sim/demo-a/exports/', import.meta.url).pathname;
const t0 = Date.now(); const lap = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const call = async (m, p, body, token, isForm) => { const r = await fetch(API + p, { method: m, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !isForm ? { 'content-type': 'application/json' } : {}) }, body: body ? (isForm ? body : JSON.stringify(body)) : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${m} ${p} -> ${r.status} ${JSON.stringify(j).slice(0, 300)}`); return j; };
const email = `e2e-${Date.now()}@test.local`;
const reg = await call('POST', '/auth/register', { shopName: 'E2E Upload Mart', name: 'Owner', email, password: 'Passw0rd!x', stores: 1 }); const tok = reg.token;
const me = await call('GET', '/auth/me', null, tok); const store = me.stores[0]._id; lap(`registered tenant ${reg.user.tenantId}`);
async function importFile(type, file, opts = {}) {
  const buf = fs.readFileSync(DIR + file); const f = new FormData(); f.append('type', type); if (type !== 'products') f.append('storeId', store); f.append('file', new Blob([buf]), file);
  let job = await call('POST', '/imports', f, tok, true); lap(`${type}: uploaded ${(buf.length / 1e6).toFixed(1)} MB, status=${job.status}, detected=${Object.entries(job.analysis.suggested).map(([k, v]) => `${k}:${v.name}`).join(', ')}`);
  const fields = Object.fromEntries(Object.entries(job.analysis.suggested).map(([k, v]) => [k, v.column]));
  await call('POST', `/imports/${job._id}/mapping`, { fields, dateFormat: job.analysis.dateFormat?.format || 'dmy', options: opts }, tok);
  for (;;) { job = await call('GET', `/imports/${job._id}`, null, tok); if (['preview_ready', 'failed'].includes(job.status)) break; await new Promise((r) => setTimeout(r, 700)); }
  if (job.status === 'failed') throw new Error(job.error); const r = job.report;
  lap(`${type}: preview rows=${r.rowsTotal} ok=${r.rowsOk} rejected=${r.rowsRejected} skipped=${r.rowsSkipped} unmatched=${r.unmatchedItems} reconciles=${r.reconciles} matched(code=${r.matched?.code},name=${r.matched?.name})`);
  await call('POST', `/imports/${job._id}/commit`, {}, tok);
  for (;;) { job = await call('GET', `/imports/${job._id}`, null, tok); if (['committed', 'failed'].includes(job.status)) break; await new Promise((r2) => setTimeout(r2, 700)); }
  if (job.status === 'failed') throw new Error(job.error); lap(`${type}: committed ${JSON.stringify(job.commitResult)}`); return job;
}
await importFile('products', 'vyapar_style_item_list.csv');
const sales = await importFile('sales', 'vyapar_style_item_sales_demo-a-S1.csv');
await importFile('stock', 'stock_style_closing_stock_demo-a-S1.csv');
const jobs = await call('GET', '/admin/jobs', null, tok); lap(`learning jobs queued: ${jobs.length} (${jobs.map((j) => j.status).join(',')})`);
console.log(JSON.stringify({ email, token: tok.slice(0, 12) + '...', salesImport: { rowsTotal: sales.report.rowsTotal, rowsOk: sales.report.rowsOk, reconciles: sales.report.reconciles, inserted: sales.commitResult.inserted } }));
fs.writeFileSync('/tmp/claude-1000/e2e_tenant.json', JSON.stringify({ email, tenant: reg.user.tenantId, token: tok }));
