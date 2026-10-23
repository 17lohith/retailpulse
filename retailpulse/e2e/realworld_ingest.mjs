// Upload a REAL-WORLD billing export (Online Retail II sample) through the importer and print the data-quality report.
import fs from 'node:fs';
const API = process.env.API || 'http://localhost:4000/api'; const FILE = process.argv[2]; const t0 = Date.now(); const lap = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const call = async (m, p, body, token, form) => { const r = await fetch(API + p, { method: m, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !form ? { 'content-type': 'application/json' } : {}) }, body: body ? (form ? body : JSON.stringify(body)) : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${m} ${p} -> ${r.status} ${JSON.stringify(j).slice(0, 300)}`); return j; };
const reg = await call('POST', '/auth/register', { shopName: 'RealWorld Import Test', name: 'Owner', email: `rw-${Date.now()}@test.local`, password: 'Passw0rd!x', stores: 1 }); const tok = reg.token; const store = (await call('GET', '/auth/me', null, tok)).stores[0]._id;
const buf = fs.readFileSync(FILE); const f = new FormData(); f.append('type', 'sales'); f.append('storeId', store); f.append('file', new Blob([buf]), 'online_retail_sample.csv');
let job = await call('POST', '/imports', f, tok, true); lap(`uploaded ${(buf.length / 1e6).toFixed(1)} MB; detected ${Object.entries(job.analysis.suggested).map(([k, v]) => `${k}:${v.name}`).join(', ')}; dateFormat=${JSON.stringify(job.analysis.dateFormat)}`);
const fields = Object.fromEntries(Object.entries(job.analysis.suggested).map(([k, v]) => [k, v.column]));
await call('POST', `/imports/${job._id}/mapping`, { fields, dateFormat: job.analysis.dateFormat?.format || 'dmy', options: { autoCreateUnmatched: true } }, tok);
for (;;) { job = await call('GET', `/imports/${job._id}`, null, tok); if (['preview_ready', 'failed'].includes(job.status)) break; await new Promise((r) => setTimeout(r, 800)); }
if (job.status === 'failed') throw new Error(job.error); const r = job.report;
lap(`PREVIEW rows=${r.rowsTotal} ok=${r.rowsOk} rejected=${r.rowsRejected} skipped=${r.rowsSkipped} reconciles=${r.reconciles} returns=${r.returns} unmatchedItems=${r.unmatchedItems} dates=${r.dates.min}..${r.dates.max}`);
console.log('rejectedByReason', JSON.stringify(r.rejectedByReason), 'skippedByReason', JSON.stringify(r.skippedByReason), 'outliers', r.outlierCount);
await call('POST', `/imports/${job._id}/commit`, {}, tok);
for (;;) { job = await call('GET', `/imports/${job._id}`, null, tok); if (['committed', 'failed'].includes(job.status)) break; await new Promise((r2) => setTimeout(r2, 800)); }
if (job.status === 'failed') throw new Error(job.error); lap(`COMMITTED ${JSON.stringify(job.commitResult)}`);
fs.writeFileSync('/tmp/claude-1000/rw_tenant.json', JSON.stringify({ tenant: reg.user.tenantId }));
