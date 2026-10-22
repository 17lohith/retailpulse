import React, { useState } from 'react';
import { Modal, Tabs, Tab, Form } from 'react-bootstrap';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Pill, Empty, Async, Urgency, Confidence, Banner } from '../components/UI.jsx';
import BatchPrompt from '../components/BatchPrompt.jsx';
import { rupees, rupeesShort, num, dshort } from '../util.js';

const SKIP = { overstocked: 'I have enough', supplier_issue: 'Supplier problem', not_selling: 'Not selling well', budget: 'Over budget', other: 'Other reason' };

export default function Orders() {
  const { sp, storeId, can, user } = useAuth(); const toast = useToast(); const [later, setLater] = useState(false); const [tab, setTab] = useState('suggest');
  const recs = useApi('/api/purchasing/recommendations', { ...sp, status: 'open', urgency: later ? 'now,soon,later' : 'now,soon' }, [storeId, later]);
  const orders = useApi('/api/purchasing/orders', { ...sp, limit: 30 }, [storeId, tab]);
  const [share, setShare] = useState(null); const [recv, setRecv] = useState(null);
  const showCost = user.role !== 'staff';
  return (
    <>
      <PageHeader title="Orders" sub="Approve what to buy, share the order with your supplier, and record the delivery when it arrives." />
      <Tabs activeKey={tab} onSelect={setTab} className="mb-3">
        <Tab eventKey="suggest" title="Suggested orders">
          <div className="form-check form-switch mb-3"><input className="form-check-input" type="checkbox" id="later" checked={later} onChange={(e) => setLater(e.target.checked)} /><label className="form-check-label" htmlFor="later">Also show items that can wait</label></div>
          {!can('manager') && <Banner kind="warn" icon="bi-lock">Only managers and owners can approve orders. You can still record deliveries.</Banner>}
          <Async state={recs} rows={5}>{(d) => d.groups.length === 0 ? (
            <Card><Empty icon="bi-check2-circle" title="No suggestions right now">RetailPulse suggests an order when an item is likely to run out before your supplier can deliver.</Empty></Card>
          ) : d.groups.map((g) => <Group key={g.storeId + g.supplierKey} g={g} reload={() => { recs.reload(); orders.reload(); }} can={can} showCost={showCost} onShare={setShare} toast={toast} />)}</Async>
        </Tab>
        <Tab eventKey="orders" title="Placed orders">
          <Card body={false}><Async state={orders} rows={4}>{(d) => d.items.length === 0 ? <Empty icon="bi-truck" title="No orders yet">Approve a suggestion to create your first order.</Empty> : (
            <div className="table-wrap"><table className="rp-table"><thead><tr><th>Order</th><th>Supplier</th><th>Date</th><th>Expected</th><th>Items</th><th>Status</th><th /></tr></thead><tbody>
              {d.items.map((o) => <tr key={o.poId}><td className="fw-semibold">{o.poId}</td><td>{o.supplierName}</td><td>{dshort(o.orderDate)}</td><td>{dshort(o.expectedDate)}</td><td>{o.lineCount}</td>
                <td><Pill kind={o.status === 'RECEIVED' ? 'ok' : o.status === 'CANCELLED' ? 'muted' : o.status === 'PARTIAL' ? 'soon' : 'info'}>{o.status === 'SHARED' || o.status === 'OPEN' ? 'Waiting for delivery' : o.status.toLowerCase()}</Pill></td>
                <td className="text-end">{['SHARED', 'OPEN', 'PARTIAL', 'DRAFT'].includes(o.status) && <button className="btn btn-sm btn-primary" onClick={() => setRecv(o.poId)}>Record delivery</button>}</td></tr>)}
            </tbody></table></div>)}</Async></Card>
        </Tab>
      </Tabs>
      <Modal show={!!share} onHide={() => setShare(null)} centered>
        <Modal.Header closeButton><Modal.Title className="h5">Order ready to send</Modal.Title></Modal.Header>
        <Modal.Body><p className="rp-sub">Copy this message and send it to your supplier (WhatsApp, SMS or email). RetailPulse never places orders for you.</p>
          <pre className="p-3 bg-light rounded-3" style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{share?.shareText}</pre></Modal.Body>
        <Modal.Footer>
          <a className="btn btn-success" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(share?.shareText || '')}`}><i className="bi bi-whatsapp me-1" />WhatsApp</a>
          <button className="btn btn-primary" onClick={() => { navigator.clipboard?.writeText(share.shareText); toast.success('Copied.'); }}><i className="bi bi-clipboard me-1" />Copy</button>
        </Modal.Footer>
      </Modal>
      {recv && <Receive poId={recv} onClose={() => setRecv(null)} onDone={() => { orders.reload(); recs.reload(); }} />}
    </>
  );
}

function Group({ g, reload, can, showCost, onShare, toast }) {
  const [busy, setBusy] = useState(false); const [edit, setEdit] = useState({});
  const act = async (id, kind, body) => { setBusy(true); try { await api.post(`/api/purchasing/recommendations/${id}/${kind}`, body); reload(); } catch (e) { toast.error(e.message); } finally { setBusy(false); } };
  const approved = g.lines.filter((l) => l.status === 'approved' || l.status === 'edited');
  const approveAll = async () => { setBusy(true); try { for (const l of g.lines.filter((x) => x.status === 'suggested')) await api.post(`/api/purchasing/recommendations/${l._id}/approve`, {}); reload(); } catch (e) { toast.error(e.message); } finally { setBusy(false); } };
  const create = async () => {
    setBusy(true);
    try { const r = await api.post('/api/purchasing/orders/from-recommendations', { storeId: g.storeId, supplierKey: g.supplierKey, recIds: approved.map((l) => l._id) }); onShare(r); reload(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Card className="mb-3" title={<><i className="bi bi-truck me-2" />{g.supplierName}</>} sub={`Delivers in ${g.leadTimeDays ?? '?'} day(s)${showCost ? ` · about ${rupeesShort(g.totalEstCostPaise)}` : ''}`}
      actions={can('manager') && <div className="d-flex gap-2 flex-wrap"><button className="btn btn-outline-primary btn-sm" disabled={busy || !g.lines.some((l) => l.status === 'suggested')} onClick={approveAll}>Approve all</button>
        <button className="btn btn-primary btn-sm" disabled={busy || !approved.length} onClick={create}>Create order ({approved.length})</button></div>} body={false}>
      <div className="table-wrap"><table className="rp-table"><thead><tr><th>Item</th><th>Why</th><th className="num">Order</th><th /></tr></thead><tbody>
        {g.lines.map((l) => (
          <React.Fragment key={l._id}>
            <tr>
              <td style={{ minWidth: 190 }}><div className="fw-semibold">{l.name}</div><div className="d-flex gap-1 mt-1 flex-wrap"><Urgency u={l.urgency} /><Confidence c={l.confidence} />{l.status !== 'suggested' && <Pill kind="ok" icon="bi-check2">{l.status}</Pill>}</div></td>
              <td className="rp-sub" style={{ minWidth: 240 }}>{l.reason?.text}</td>
              <td className="num" style={{ minWidth: 110 }}>{can('manager') ? <input type="number" min="1" className="form-control form-control-sm text-end" style={{ width: 90, marginLeft: 'auto' }} value={edit[l._id] ?? l.finalQty}
                onChange={(e) => setEdit({ ...edit, [l._id]: e.target.value })} onBlur={() => { const v = parseInt(edit[l._id]); if (v && v !== l.finalQty) act(l._id, 'edit', { finalQty: v }); }} /> : <b>{num(l.finalQty)}</b>}
                <div className="rp-sub">pack of {l.packSize}</div></td>
              <td className="text-end text-nowrap">{can('manager') && l.status === 'suggested' && <><button className="btn btn-sm btn-primary me-1" disabled={busy} onClick={() => act(l._id, 'approve')}>Approve</button>
                <select className="form-select form-select-sm d-inline-block" style={{ width: 110 }} value="" onChange={(e) => e.target.value && act(l._id, 'skip', { reason: e.target.value })}><option value="">Skip...</option>{Object.entries(SKIP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></>}</td>
            </tr>
            {l.oldBatchPrompt && l.status === 'suggested' && <tr><td colSpan={4} className="bg-light"><BatchPrompt compact onDone={reload} p={{ type: 'older_batch', batchId: l.oldBatchPrompt.batchId, name: `Older batch of ${l.name}`, remaining: l.oldBatchPrompt.remaining, expiryDate: l.oldBatchPrompt.expiryDate, days: Math.round((new Date(l.oldBatchPrompt.expiryDate) - new Date()) / 864e5), question: l.oldBatchPrompt.question, answers: ['remaining', 'finished'] }} /></td></tr>}
          </React.Fragment>))}
      </tbody></table></div>
    </Card>
  );
}

function Receive({ poId, onClose, onDone }) {
  const toast = useToast(); const d = useApi(`/api/purchasing/orders/${poId}`); const [lines, setLines] = useState({}); const [inv, setInv] = useState(''); const [busy, setBusy] = useState(false); const [result, setResult] = useState(null);
  const get = (l, k, def) => lines[l.sku]?.[k] ?? def; const set = (l, k, v) => setLines({ ...lines, [l.sku]: { ...lines[l.sku], [k]: v } });
  const submit = async () => {
    setBusy(true);
    try {
      const body = { invoiceNo: inv || undefined, lines: d.data.lines.filter((l) => l.receivedQty == null).map((l) => ({ sku: l.sku, receivedQty: parseInt(get(l, 'recv', l.orderedQty)) || 0, damagedQty: parseInt(get(l, 'dmg', 0)) || 0, expiryDate: get(l, 'exp', '') || undefined })) };
      const r = await api.post(`/api/purchasing/orders/${poId}/receive`, body); setResult(r); onDone();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal show onHide={onClose} size="lg" centered>
      <Modal.Header closeButton><Modal.Title className="h5">Record delivery - {poId}</Modal.Title></Modal.Header>
      <Modal.Body>
        {result ? <>
          <Banner kind={result.pendingExpiry ? 'warn' : 'ok'}>{result.message}</Banner>
          <div className="table-wrap"><table className="rp-table"><thead><tr><th>Item</th><th className="num">Ordered</th><th className="num">Received</th><th className="num">Short</th><th className="num">Damaged</th></tr></thead><tbody>
            {result.variance.map((v) => <tr key={v.sku}><td>{v.sku}</td><td className="num">{v.ordered}</td><td className="num">{v.received}</td><td className={`num ${v.short ? 'down' : ''}`}>{v.short}</td><td className="num">{v.damaged}</td></tr>)}</tbody></table></div>
        </> : <Async state={d} rows={4}>{(po) => (
          <>
            <p className="rp-sub">Check what actually arrived. Enter the expiry date printed on the pack for fresh items - or skip it and add it later.</p>
            <Form.Control className="mb-3" placeholder="Supplier invoice number (optional)" value={inv} onChange={(e) => setInv(e.target.value)} />
            <div className="table-wrap"><table className="rp-table"><thead><tr><th>Item</th><th className="num">Ordered</th><th>Received</th><th>Damaged</th><th>Expiry date</th></tr></thead><tbody>
              {po.lines.filter((l) => l.receivedQty == null).map((l) => <tr key={l.sku}><td style={{ minWidth: 160 }}>{l.name}</td><td className="num">{l.orderedQty}</td>
                <td><input type="number" min="0" className="form-control form-control-sm" style={{ width: 80 }} value={get(l, 'recv', l.orderedQty)} onChange={(e) => set(l, 'recv', e.target.value)} /></td>
                <td><input type="number" min="0" className="form-control form-control-sm" style={{ width: 70 }} value={get(l, 'dmg', 0)} onChange={(e) => set(l, 'dmg', e.target.value)} /></td>
                <td><input type="date" className="form-control form-control-sm" value={get(l, 'exp', '')} onChange={(e) => set(l, 'exp', e.target.value)} /></td></tr>)}
            </tbody></table></div></>)}</Async>}
      </Modal.Body>
      <Modal.Footer>{result ? <button className="btn btn-primary" onClick={onClose}>Done</button> : <><button className="btn btn-light" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !d.data} onClick={submit}>Save delivery</button></>}</Modal.Footer>
    </Modal>
  );
}
