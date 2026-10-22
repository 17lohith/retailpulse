import React, { useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { Pill } from './UI.jsx';
import { dshort, num } from '../util.js';

const LABEL = { finished: 'All sold', remaining: 'Still have some', acknowledged: 'OK, will sell first', damaged: 'Some damaged', sold: 'Sold', discarded: 'Thrown away', returned: 'Returned to supplier' };
const ICON = { finished: 'bi-check2-all', remaining: 'bi-123', acknowledged: 'bi-hand-thumbs-up', damaged: 'bi-exclamation-diamond', sold: 'bi-check2-all', discarded: 'bi-trash3', returned: 'bi-arrow-return-left' };

/** One question about a batch, answered with one tap (design decision D-018: the owner's answer is the ground truth). */
export default function BatchPrompt({ p, onDone, compact }) {
  const toast = useToast(); const [busy, setBusy] = useState(false); const [ask, setAsk] = useState(null); const [val, setVal] = useState('');
  const send = async (answer, extra = {}) => {
    setBusy(true);
    try { await api.post(`/api/inventory/batches/${encodeURIComponent(p.batchId)}/confirm`, { answer, trigger: p.type, ...extra }); toast.success('Thanks - noted.'); onDone?.(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const tone = p.type === 'expired_unresolved' ? 'now' : p.days <= 3 ? 'soon' : 'info';
  return (
    <div className="border rounded-3 p-3 mb-2 bg-white">
      <div className="d-flex justify-content-between gap-2 align-items-start">
        <div className="fw-semibold truncate" title={p.name}>{p.name || p.sku}</div>
        <Pill kind={tone}>{p.type === 'expired_unresolved' ? `Expired ${-p.days}d ago` : `Expires ${dshort(p.expiryDate)}`}{p.estimated ? ' (est.)' : ''}</Pill>
      </div>
      <div className="rp-sub my-1">{p.question}</div>
      {ask ? (
        <div className="d-flex gap-2 mt-2">
          <input type="number" min="0" max={p.remaining} className="form-control btn-touch" style={{ maxWidth: 140 }} placeholder={`0 - ${p.remaining}`} value={val} onChange={(e) => setVal(e.target.value)} autoFocus />
          <button className="btn btn-primary btn-touch" disabled={busy || val === ''} onClick={() => send('remaining', { remaining: parseInt(val) })}>Save</button>
          <button className="btn btn-link" onClick={() => setAsk(null)}>Cancel</button>
        </div>
      ) : (
        <div className="d-flex flex-wrap gap-2 mt-2">
          {p.answers.map((a) => (
            <button key={a} disabled={busy} className={`btn btn-sm btn-touch ${a === 'finished' || a === 'acknowledged' || a === 'sold' ? 'btn-outline-primary' : 'btn-outline-secondary'}`}
              onClick={() => (a === 'remaining' ? setAsk(a) : a === 'damaged' ? send('damaged', { qty: Math.min(p.remaining, 1) }) : send(a))}><i className={`bi ${ICON[a]} me-1`} />{LABEL[a]}</button>
          ))}
          <span className="rp-sub align-self-center ms-auto">{num(p.remaining)} on record</span>
        </div>
      )}
    </div>
  );
}
