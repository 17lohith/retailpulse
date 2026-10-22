import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, Tab } from 'react-bootstrap';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Pill, Empty, Async, Banner } from '../components/UI.jsx';
import BatchPrompt from '../components/BatchPrompt.jsx';
import { num, dshort, rupeesShort } from '../util.js';

export default function Stock() {
  const [sp, setSp] = useSearchParams(); const tab = sp.get('tab') || 'levels';
  return (
    <>
      <PageHeader title="Stock & expiry" sub="See what you have, answer a few quick questions about batches, and count stock." />
      <Tabs activeKey={tab} onSelect={(k) => setSp({ tab: k })} className="mb-3">
        <Tab eventKey="levels" title="Stock levels"><Levels /></Tab>
        <Tab eventKey="expiry" title="Expiry & batches"><Expiry /></Tab>
        <Tab eventKey="pending" title="Needs expiry date"><Pending /></Tab>
        <Tab eventKey="count" title="Count stock"><Count /></Tab>
      </Tabs>
    </>
  );
}

function Levels() {
  const { sp, storeId, user } = useAuth(); const [vel, setVel] = useState(''); const [low, setLow] = useState(false); const [page, setPage] = useState(1);
  const d = useApi('/api/inventory/state', { ...sp, velocity: vel, cover: low ? 'low' : '', page, limit: 25 }, [storeId, vel, low, page]);
  const vk = { fast: 'ok', stable: 'info', slow: 'soon', 'non-moving': 'now' };
  return (
    <Card body={false}>
      <div className="p-3 d-flex gap-2 flex-wrap align-items-center border-bottom">
        <select className="form-select" style={{ maxWidth: 220 }} value={vel} onChange={(e) => { setVel(e.target.value); setPage(1); }}><option value="">All items</option><option value="fast">Fast moving</option><option value="stable">Steady</option><option value="slow">Slow moving</option><option value="non-moving">Not selling</option></select>
        <div className="form-check form-switch"><input className="form-check-input" id="low" type="checkbox" checked={low} onChange={(e) => { setLow(e.target.checked); setPage(1); }} /><label htmlFor="low" className="form-check-label">Running low (under 3 days)</label></div>
      </div>
      <Async state={d} rows={6}>{(r) => r.items.length === 0 ? <Empty icon="bi-boxes" title="No stock information yet">Upload a stock report or count your shelves to see stock levels here.</Empty> : (
        <div className="table-wrap"><table className="rp-table"><thead><tr><th>Item</th><th>Speed</th><th className="num">In stock</th><th className="num">Sells / day</th><th className="num">Days left</th>{user.role !== 'staff' && <th className="num">Cash in stock</th>}</tr></thead><tbody>
          {r.items.map((i) => <tr key={i.sku + i.storeId}><td className="truncate" style={{ maxWidth: 330 }} title={i.name}>{i.name}</td><td><Pill kind={vk[i.velocity]}>{i.velocity}</Pill></td><td className="num">{num(i.onHand)}</td><td className="num">{num(i.dailyDemand, 1)}</td>
            <td className={`num ${i.daysOfCover != null && i.daysOfCover < 3 ? 'down fw-bold' : ''}`}>{i.daysOfCover == null ? '-' : num(i.daysOfCover, 1)}</td>{user.role !== 'staff' && <td className="num">{rupeesShort(i.cashTiedPaise)}</td>}</tr>)}
        </tbody></table>
          <div className="d-flex justify-content-between p-3"><span className="rp-sub">{num(r.total)} items</span><div className="btn-group"><button className="btn btn-sm btn-outline-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><button className="btn btn-sm btn-outline-secondary" disabled={page * 25 >= r.total} onClick={() => setPage(page + 1)}>Next</button></div></div></div>)}</Async>
    </Card>
  );
}

function Expiry() {
  const { sp, storeId } = useAuth(); const [status, setStatus] = useState('expiring'); const pr = useApi('/api/inventory/prompts', { ...sp, limit: 12 }, [storeId]); const b = useApi('/api/inventory/batches', { ...sp, status, withinDays: 14, limit: 30 }, [storeId, status]);
  return (
    <div className="row g-3">
      <div className="col-lg-6"><Card title="Questions for you" sub="Your answer replaces our estimate and keeps alerts accurate.">
        <Async state={pr} rows={3}>{(p) => p.items.length === 0 ? <Empty icon="bi-emoji-smile" title="All clear">No batch needs your attention.</Empty> : <>{p.items.map((x) => <BatchPrompt key={x.batchId + x.type} p={x} onDone={() => { pr.reload(); b.reload(); }} />)}{p.total > p.shown && <div className="rp-sub">+ {p.total - p.shown} more</div>}</>}</Async></Card></div>
      <div className="col-lg-6"><Card title="Batches" actions={<select className="form-select form-select-sm" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="expiring">Expiring in 14 days</option><option value="expired">Past expiry</option><option value="">All with stock</option></select>} body={false}>
        <Async state={b} rows={4}>{(r) => r.items.length === 0 ? <Empty icon="bi-calendar-check" title="Nothing here">No batches match.</Empty> : (
          <div className="table-wrap"><table className="rp-table"><thead><tr><th>Item</th><th>Expires</th><th className="num">About left</th></tr></thead><tbody>
            {r.items.map((x) => <tr key={x.batchId}><td className="truncate" style={{ maxWidth: 220 }} title={x.name}>{x.name}</td><td>{x.expiryDate ? <Pill kind={x.daysToExpiry < 0 ? 'now' : x.daysToExpiry <= 3 ? 'soon' : 'ok'}>{dshort(x.expiryDate)}{x.expirySource === 'estimated' ? ' (est.)' : ''}</Pill> : <Pill kind="muted">no date</Pill>}</td><td className="num">{num(x.remaining)}</td></tr>)}</tbody></table></div>)}</Async></Card></div>
    </div>
  );
}

function Pending() {
  const { sp, storeId } = useAuth(); const toast = useToast(); const d = useApi('/api/inventory/pending-expiry', sp, [storeId]); const [vals, setVals] = useState({});
  const save = async (id) => { try { await api.patch(`/api/inventory/batches/${encodeURIComponent(id)}/expiry`, { expiryDate: vals[id] }); toast.success('Saved.'); d.reload(); } catch (e) { toast.error(e.message); } };
  return (
    <Card title="Deliveries waiting for an expiry date" sub="Fresh items need an expiry date so we can warn you in time. Enter the date printed on the pack." body={false}>
      <Async state={d} rows={3}>{(r) => r.items.length === 0 ? <Empty icon="bi-check2-circle" title="Nothing waiting">Every delivery has an expiry date.</Empty> : (
        <div className="table-wrap"><table className="rp-table"><thead><tr><th>Item</th><th>Received</th><th className="num">Qty</th><th>Expiry date</th><th /></tr></thead><tbody>
          {r.items.map((x) => <tr key={x.batchId}><td className="truncate" style={{ maxWidth: 280 }}>{x.name || x.sku}</td><td>{dshort(x.receivedDate)}</td><td className="num">{x.remaining}</td>
            <td><input type="date" className="form-control form-control-sm" style={{ width: 170 }} value={vals[x.batchId] || ''} onChange={(e) => setVals({ ...vals, [x.batchId]: e.target.value })} /></td>
            <td><button className="btn btn-sm btn-primary" disabled={!vals[x.batchId]} onClick={() => save(x.batchId)}>Save</button></td></tr>)}</tbody></table></div>)}</Async>
    </Card>
  );
}

function Count() {
  const { sp, storeId, stores } = useAuth(); const toast = useToast(); const [q, setQ] = useState(''); const [counted, setCounted] = useState({}); const [res, setRes] = useState(null);
  const store = storeId !== 'all' ? storeId : stores[0]?._id;
  const p = useApi('/api/catalog/products', { q, limit: 15, storeId: store }, [q, store]);
  const submit = async () => {
    try { const lines = Object.entries(counted).filter(([, v]) => v !== '').map(([sku, v]) => ({ sku, counted: parseInt(v) })); const r = await api.post('/api/inventory/stock-counts', { storeId: store, lines }); setRes(r); setCounted({}); toast.success('Stock count saved.'); p.reload(); }
    catch (e) { toast.error(e.message); }
  };
  return (
    <Card title="Count stock" sub="Search an item, type what you really have on the shelf, and save. We fix our records and note the difference.">
      {res && <Banner kind={res.shrinkUnits ? 'warn' : 'ok'}>Saved {res.lines.length} items. {res.lines.filter((l) => l.variance).length} had a difference{res.shrinkUnits ? `; ${res.shrinkUnits} units were missing compared with our records` : ''}.</Banner>}
      <input className="form-control mb-3" placeholder="Search item name or barcode..." value={q} onChange={(e) => setQ(e.target.value)} />
      <Async state={p} rows={4}>{(r) => (
        <div className="table-wrap"><table className="rp-table"><thead><tr><th>Item</th><th className="num">We think</th><th>You counted</th></tr></thead><tbody>
          {r.items.map((x) => <tr key={x.sku}><td className="truncate" style={{ maxWidth: 340 }} title={x.name}>{x.name}</td><td className="num">{x.stock ? num(x.stock.onHand) : '-'}</td>
            <td><input type="number" min="0" className="form-control form-control-sm" style={{ width: 110 }} value={counted[x.sku] ?? ''} onChange={(e) => setCounted({ ...counted, [x.sku]: e.target.value })} /></td></tr>)}</tbody></table></div>)}</Async>
      <button className="btn btn-primary mt-3" disabled={!Object.values(counted).some((v) => v !== '')} onClick={submit}>Save count</button>
    </Card>
  );
}
