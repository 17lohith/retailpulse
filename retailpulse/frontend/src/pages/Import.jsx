import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { api, ApiError } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Steps, Banner, Pill, Busy, Async, Empty } from '../components/UI.jsx';
import { num, rupeesShort, dshort } from '../util.js';

const DOORS = [
  { type: 'sales', icon: 'bi-receipt', title: 'My sales from billing software', text: 'The item-wise sales report. This is how RetailPulse learns your shop.', must: true },
  { type: 'stock', icon: 'bi-boxes', title: 'My current stock', text: 'A closing-stock report, so we can say how much to order.' },
  { type: 'products', icon: 'bi-tags', title: 'My item list', text: 'Names, codes, prices and costs.' },
  { type: 'purchases', icon: 'bi-truck', title: 'My purchases & deliveries', text: 'A purchase register, with batch and expiry if you have them.' },
];
const SOURCES = {
  vyapar: 'In Vyapar: Reports → Sale → "Item wise sale" (or "Sale report by item"), choose the date range, then Export → Excel.',
  marg: 'In Marg: Reports → Sales → "Item-wise sale" register for the period, then Export to Excel / CSV.',
  gofrugal: 'In GoFrugal: Reports → Sales → "Item wise sales" for the period, then Export to Excel.',
  tally: 'In Tally: Gateway → Display → Account Books → Sales Register (item-wise / stock item), then Export → Excel.',
  generic: 'Choose a report that has ONE ROW PER ITEM with a date and a quantity. Reports that only show bill totals will not work.',
};
const FIELD_LABEL = { date: 'Date', item: 'Item name', qty: 'Quantity', amount: 'Amount (₹)', itemCode: 'Item code / barcode', category: 'Category', bill: 'Bill number', name: 'Item name', barcode: 'Barcode', brand: 'Brand', mrp: 'Selling price', cost: 'Cost price', pack: 'Pack size', shelfLife: 'Shelf life (days)', rate: 'Rate / cost', supplier: 'Supplier', invoice: 'Invoice no.', batch: 'Batch no.', expiry: 'Expiry date' };

function usePoll(id, until, onDone) {
  useEffect(() => {
    if (!id) return; let stop = false;
    const tick = async () => { try { const j = await api.get(`/api/imports/${id}`); if (stop) return; if (until.includes(j.status) || j.status === 'failed') onDone(j); else setTimeout(tick, 900); } catch (e) { /* ignore */ } };
    tick(); return () => { stop = true; };
  }, [id]); // eslint-disable-line
}

export default function Import() {
  const { stores, storeId, can } = useAuth(); const toast = useToast();
  const [step, setStep] = useState(0); const [type, setType] = useState('sales'); const [source, setSource] = useState('generic'); const [store, setStore] = useState(storeId !== 'all' ? storeId : stores[0]?._id || '');
  const [job, setJob] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const hist = useApi('/api/imports', { limit: 8 });
  const reset = () => { setStep(0); setJob(null); setErr(null); hist.reload(); };
  if (!can('manager')) return (<><PageHeader title="Bring in data" /><Banner kind="warn" icon="bi-lock">Only managers and owners can upload data. Ask your manager to upload the latest sales report.</Banner></>);
  return (
    <>
      <PageHeader title="Bring in data" sub="Upload what your billing software already knows. RetailPulse checks it, shows you a preview, and only then saves it." />
      <Steps steps={['Choose', 'Upload', 'Match columns', 'Check & confirm', 'Done']} current={step} />
      {step === 0 && <Choose onPick={(t) => { setType(t); setStep(1); }} hist={hist} onUndo={hist.reload} />}
      {step === 1 && <Upload type={type} stores={stores} store={store} setStore={setStore} source={source} setSource={setSource} busy={busy} err={err} onBack={reset}
        onFile={async (file) => {
          setBusy(true); setErr(null);
          try { const f = new FormData(); f.append('type', type); f.append('source', source); if (type !== 'products') f.append('storeId', store); f.append('file', file); const j = await api.upload('/api/imports', f); setJob(j); setStep(j.status === 'failed' ? 1 : 2); if (j.status === 'failed') setErr({ message: j.error }); }
          catch (e) { setErr(e); } finally { setBusy(false); }
        }} />}
      {step === 2 && job && <Mapping job={job} type={type} onBack={() => setStep(1)} onChecked={(j) => { setJob(j); setStep(3); }} />}
      {step === 3 && job && <Preview job={job} setJob={setJob} onBack={() => setStep(2)} onDone={(j) => { setJob(j); setStep(4); }} />}
      {step === 4 && job && <Done job={job} onAgain={reset} />}
    </>
  );
}

function Choose({ onPick, hist, onUndo }) {
  const toast = useToast();
  const undo = async (id) => { if (!window.confirm('Undo this import? Rows it added will be removed and values it replaced will be restored.')) return; try { await api.post(`/api/imports/${id}/undo`); toast.success('Import undone.'); hist.reload(); } catch (e) { toast.error(e.message); } };
  return (
    <>
      <div className="row g-3 mb-4">{DOORS.map((d) => (
        <div key={d.type} className="col-md-6 col-xl-3"><div className="rp-card door p-3" role="button" onClick={() => onPick(d.type)}><div className="ic"><i className={`bi ${d.icon}`} /></div><div className="fw-semibold">{d.title}</div><div className="rp-sub mt-1">{d.text}</div>{d.must && <Pill kind="info">start here</Pill>}</div></div>))}</div>
      <Row2 />
      <Card title="Recent uploads" body={false} className="mt-3"><Async state={hist} rows={3}>{(h) => h.items.length === 0 ? <Empty icon="bi-cloud-arrow-up" title="Nothing uploaded yet">Start with your sales report.</Empty> : (
        <div className="table-wrap"><table className="rp-table"><thead><tr><th>File</th><th>What</th><th>Status</th><th className="num">Rows saved</th><th>When</th><th /></tr></thead><tbody>
          {h.items.map((j) => <tr key={j._id}><td className="truncate" style={{ maxWidth: 260 }}>{j.filename}</td><td>{j.type}</td><td><Pill kind={j.status === 'committed' ? 'ok' : j.status === 'failed' ? 'now' : j.status === 'undone' ? 'muted' : 'info'}>{j.status.replace('_', ' ')}</Pill></td>
            <td className="num">{num(j.commitResult?.rows)}</td><td>{new Date(j.createdAt).toLocaleString('en-IN')}</td><td className="text-end">{j.status === 'committed' && <button className="btn btn-sm btn-outline-secondary" onClick={() => undo(j._id)}>Undo</button>}</td></tr>)}</tbody></table></div>)}</Async></Card>
    </>
  );
}
const Row2 = () => (
  <div className="row g-3"><div className="col-md-6"><Card title="No billing software?"><div className="rp-sub mb-2">You can still use RetailPulse.</div><Link to="/sales" className="btn btn-outline-primary btn-sm me-2">Enter sales by hand</Link><Link to="/products" className="btn btn-outline-primary btn-sm">Add items</Link></Card></div>
    <div className="col-md-6"><Card title="Just exploring?"><div className="rp-sub">Sign out and choose a demo shop on the sign-in page - it comes with a year of simulated sales.</div></Card></div></div>
);

function Upload({ type, stores, store, setStore, source, setSource, busy, err, onFile, onBack }) {
  const ref = useRef(); const [over, setOver] = useState(false); const door = DOORS.find((d) => d.type === type);
  return (
    <div className="row g-3"><div className="col-lg-7">
      <Card title={door.title} sub={door.text}>
        {err && <Banner kind="bad">{err.message}</Banner>}
        <div className="row g-2 mb-3">
          {type !== 'products' && <div className="col-md-6"><label className="form-label fw-semibold" htmlFor="up-store">Which store is this for?</label><select id="up-store" className="form-select" value={store} onChange={(e) => setStore(e.target.value)}>{stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></div>}
          <div className="col-md-6"><label className="form-label fw-semibold" htmlFor="up-src">Billing software</label><select id="up-src" className="form-select" value={source} onChange={(e) => setSource(e.target.value)}><option value="generic">Other / not sure</option><option value="vyapar">Vyapar</option><option value="marg">Marg ERP</option><option value="gofrugal">GoFrugal</option><option value="tally">Tally</option></select></div>
        </div>
        <div className="p-3 rounded-3 bg-light mb-3 small"><i className="bi bi-lightbulb me-1" /><b>How to get this file:</b> {SOURCES[source]} <span className="text-muted">(Menu names are a guide and may differ in your version.)</span></div>
        <div className={`rp-drop ${over ? 'over' : ''}`} onClick={() => ref.current.click()} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); e.dataTransfer.files[0] && onFile(e.dataTransfer.files[0]); }}>
          {busy ? <Busy /> : <><i className="bi bi-cloud-arrow-up fs-1 text-secondary" /><div className="fw-semibold">Drop your Excel or CSV file here</div><div className="rp-sub">or click to choose a file · .xlsx or .csv · PDF is not supported</div></>}
          <input ref={ref} type="file" accept=".csv,.xlsx,.xlsm,.txt" hidden onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
        </div>
        <div className="d-flex justify-content-between mt-3"><button className="btn btn-light" onClick={onBack}>← Back</button><a className="btn btn-link" href={`/api/imports/templates/${type}`} onClick={async (e) => { e.preventDefault(); const r = await api.raw(`/api/imports/templates/${type}`); const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `retailpulse-${type}-template.csv`; a.click(); }}>Download a sample file</a></div>
      </Card></div>
      <div className="col-lg-5"><Card title="What happens to your file" sub="Nothing is saved until you confirm">
        <ol className="ps-3 mb-0"><li className="mb-2">We read the file and guess which column is which.</li><li className="mb-2">You check the guess and see a preview.</li><li className="mb-2">We list any rows we cannot use - none are silently thrown away.</li><li className="mb-2">Items we don't recognise are shown to you; we never merge items on our own.</li><li>You confirm - and you can <b>undo</b> the upload later.</li></ol></Card></div></div>
  );
}

function Mapping({ job, type, onBack, onChecked }) {
  const a = job.analysis; const toast = useToast(); const init = Object.fromEntries(Object.entries(a.suggested).map(([k, v]) => [k, v.column]));
  const [map, setMap] = useState(init); const [dfmt, setDfmt] = useState(a.dateFormat?.format || 'dmy'); const [auto, setAuto] = useState(false); const [apply, setApply] = useState(false); const [wait, setWait] = useState(false);
  const fields = Object.entries(a.fields); usePoll(wait ? job._id : null, ['preview_ready'], onChecked);
  const go = async () => {
    try { setWait(true); await api.post(`/api/imports/${job._id}/mapping`, { fields: Object.fromEntries(Object.entries(map).filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => [k, +v])), dateFormat: dfmt, options: { autoCreateUnmatched: auto, applyToStock: apply } }); }
    catch (e) { setWait(false); toast.error(e.message); }
  };
  const missing = fields.filter(([k, f]) => f.required && (map[k] === undefined || map[k] === '')).map(([k]) => FIELD_LABEL[k]);
  return (
    <>
      {a.warnings.map((w, i) => <Banner key={i} kind="warn">{w}</Banner>)}
      {a.skippedTopRows > 0 && <Banner kind="ok" icon="bi-info-circle">We skipped {a.skippedTopRows} title line(s) at the top and found your column names on the next line.</Banner>}
      <div className="row g-3"><div className="col-lg-5"><Card title="Which column is which?" sub="We guessed - please check.">
        {fields.map(([k, f]) => { const s = a.suggested[k]; return (
          <div key={k} className="mb-3"><label className="form-label fw-semibold mb-1" htmlFor={`map-${k}`}>{FIELD_LABEL[k] || k} {f.required ? <span className="text-danger">*</span> : <span className="rp-sub fw-normal">(optional)</span>}
            {s && <Pill kind={s.confidence >= 1 ? 'ok' : 'soon'}>{s.fromSaved ? 'remembered' : s.confidence >= 1 ? 'sure' : 'guess'}</Pill>}</label>
            <select id={`map-${k}`} className="form-select" value={map[k] ?? ''} onChange={(e) => setMap({ ...map, [k]: e.target.value })}><option value="">- not in my file -</option>{a.columns.map((c) => <option key={c.index} value={c.index}>{c.name || `Column ${c.index + 1}`}</option>)}</select></div>); })}
        {map.date !== undefined && map.date !== '' && <div className="mb-3"><label className="form-label fw-semibold" htmlFor="map-datefmt">How are dates written?</label><select id="map-datefmt" className="form-select" value={dfmt} onChange={(e) => setDfmt(e.target.value)}><option value="dmy">Day / Month / Year (31/12/2026)</option><option value="mdy">Month / Day / Year (12/31/2026)</option><option value="ymd">Year-Month-Day (2026-12-31)</option><option value="dmon">31-Dec-2026</option><option value="excel-serial">Excel date numbers</option></select></div>}
        {type !== 'products' && <div className="form-check mb-2"><input className="form-check-input" id="auto" type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /><label htmlFor="auto" className="form-check-label">Add items I don't have yet automatically</label></div>}
        {type === 'purchases' && <div className="form-check"><input className="form-check-input" id="apply" type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} /><label htmlFor="apply" className="form-check-label">Add recent deliveries (last 30 days) to my stock</label></div>}
      </Card></div>
        <div className="col-lg-7"><Card title="Your file (first rows)" body={false}><div className="table-wrap"><table className="rp-table"><thead><tr>{a.columns.map((c) => <th key={c.index}>{c.name || `Column ${c.index + 1}`}</th>)}</tr></thead><tbody>
          {a.preview.map((r, i) => <tr key={i}>{a.columns.map((c) => <td key={c.index} className="text-nowrap">{String(r[c.index] ?? '')}</td>)}</tr>)}</tbody></table></div></Card></div></div>
      <div className="d-flex justify-content-between mt-3"><button className="btn btn-light" onClick={onBack}>← Back</button>{wait ? <Busy /> : <button className="btn btn-primary btn-lg" disabled={missing.length > 0} onClick={go}>{missing.length ? `Choose: ${missing.join(', ')}` : 'Check my file →'}</button>}</div>
    </>
  );
}

function Preview({ job, setJob, onBack, onDone }) {
  const toast = useToast(); const r = job.report; const [res, setRes] = useState({}); const [wait, setWait] = useState(false);
  usePoll(wait ? job._id : null, ['committed'], onDone);
  const commit = async () => {
    try {
      const resolutions = Object.entries(res).map(([key, v]) => ({ key, action: v.startsWith('link:') ? 'link' : v, sku: v.startsWith('link:') ? v.slice(5) : undefined }));
      if (resolutions.length) await api.post(`/api/imports/${job._id}/resolve`, { resolutions });
      setWait(true); await api.post(`/api/imports/${job._id}/commit`);
    } catch (e) { setWait(false); toast.error(e.message); }
  };
  const csv = async () => { const x = await api.raw(`/api/imports/${job._id}/errors.csv`); const b = await x.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'rows-to-fix.csv'; a.click(); };
  const REASON = { invalid_date: 'Date could not be read', future_date: 'Date is in the future', missing_item_name: 'Item name is blank', invalid_quantity: 'Quantity is not a number', invalid_price: 'Price is not valid', invalid_cost: 'Cost is not valid', negative_stock: 'Stock is negative', duplicate_item_in_file: 'Item appears twice', invalid_expiry: 'Expiry date could not be read', file_too_many_rows: 'File is too large' };
  return (
    <>
      <Banner kind={r.rowsRejected ? 'warn' : 'ok'}><b>{num(r.rowsOk)}</b> of {num(r.rowsTotal)} rows are ready to import{r.dates?.min ? <> · {dshort(r.dates.min)} to {dshort(r.dates.max)}</> : null}. {r.reconciles && <span className="rp-sub">Every row is accounted for (ready + rejected + skipped = total).</span>}</Banner>
      <div className="row g-3 mb-3">
        <div className="col-md-4"><Card title="Ready"><div className="display-6 fw-bold up">{num(r.rowsOk)}</div>{job.type === 'sales' && <div className="rp-sub">{num(r.units)} items{r.revenuePaise ? ` · ${rupeesShort(r.revenuePaise)}` : ''}</div>}{job.type === 'products' && <div className="rp-sub">{r.create} new · {r.update} updated</div>}{r.returns > 0 && <div className="rp-sub">{r.returns} return rows (negative quantities)</div>}</Card></div>
        <div className="col-md-4"><Card title="Cannot use"><div className={`display-6 fw-bold ${r.rowsRejected ? 'down' : ''}`}>{num(r.rowsRejected)}</div>
          {Object.entries(r.rejectedByReason).map(([k, v]) => <div key={k} className="rp-sub">{v} × {REASON[k] || k}</div>)}{r.rowsRejected > 0 && <button className="btn btn-sm btn-outline-secondary mt-2" onClick={csv}><i className="bi bi-download me-1" />Rows to fix (CSV)</button>}</Card></div>
        <div className="col-md-4"><Card title="Skipped on purpose"><div className="display-6 fw-bold">{num(r.rowsSkipped)}</div>{Object.entries(r.skippedByReason).map(([k, v]) => <div key={k} className="rp-sub">{v} × {k === 'total_or_footer_row' ? 'total / footer lines' : k === 'non_product_line' ? 'service lines (postage, charges…)' : k === 'zero_quantity' ? 'zero quantity' : k}</div>)}</Card></div>
      </div>
      {r.unmatchedItems > 0 && <Card className="mb-3" title={`${num(r.unmatchedItems)} item(s) we don't recognise`} sub="We never merge items on our own. Choose what to do with each (default: create it as a new item if you ticked 'add automatically', otherwise skip).">
        <div className="table-wrap"><table className="rp-table"><thead><tr><th>Name in your file</th><th className="num">Rows</th><th>Looks like…</th><th>What should we do?</th></tr></thead><tbody>
          {r.unmatched.slice(0, 40).map((u) => <tr key={u.key}><td className="truncate" style={{ maxWidth: 260 }}>{u.name}</td><td className="num">{u.rows}</td><td className="rp-sub">{u.proposals.length ? u.proposals.map((p) => `${p.sku} (${Math.round(p.score * 100)}% similar)`).join(', ') : 'no close match'}</td>
            <td><select className="form-select form-select-sm" value={res[u.key] || ''} onChange={(e) => setRes({ ...res, [u.key]: e.target.value })}><option value="">Use default</option><option value="create">Create as new item</option>{u.proposals.map((p) => <option key={p.sku} value={`link:${p.sku}`}>Same as {p.sku}</option>)}<option value="skip">Skip these rows</option></select></td></tr>)}</tbody></table></div>
        {r.unmatchedItems > 40 && <div className="rp-sub mt-2">Showing the 40 biggest. The rest follow the default.</div>}</Card>}
      {r.outlierCount > 0 && <Banner kind="warn">{r.outlierCount} item(s) have a single row far bigger than usual (possible typing mistake). They are included - check them after importing.</Banner>}
      <div className="d-flex justify-content-between"><button className="btn btn-light" onClick={onBack}>← Change columns</button>{wait ? <Busy /> : <button className="btn btn-primary btn-lg" disabled={r.rowsOk === 0} onClick={commit}>Import {num(r.rowsOk)} rows</button>}</div>
    </>
  );
}

function Done({ job, onAgain }) {
  const toast = useToast(); const c = job.commitResult || {}; const [undone, setUndone] = useState(false);
  const undo = async () => { try { await api.post(`/api/imports/${job._id}/undo`); setUndone(true); toast.success('Import undone.'); } catch (e) { toast.error(e.message); } };
  return (
    <Card><Empty icon={undone ? 'bi-arrow-counterclockwise' : 'bi-check-circle'} title={undone ? 'Import undone' : 'Import complete'}>
      {undone ? 'Everything this upload added was removed, and replaced values were restored.' : <>Saved <b>{num(c.rows)}</b> rows{c.productsCreated ? ` and created ${c.productsCreated} new item(s)` : ''}. {job.type === 'sales' || job.type === 'stock' ? 'RetailPulse is now learning from your data - suggestions refresh in a few minutes.' : ''}{c.skippedUnmatched ? ` ${c.skippedUnmatched} rows were skipped because the item was not recognised.` : ''}</>}
      <div className="mt-3 d-flex gap-2 justify-content-center flex-wrap"><Link to="/" className="btn btn-primary">Go to Today</Link><button className="btn btn-outline-primary" onClick={onAgain}>Upload another file</button>{!undone && <button className="btn btn-outline-secondary" onClick={undo}>Undo this upload</button>}</div></Empty></Card>
  );
}
