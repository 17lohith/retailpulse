import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from 'react-bootstrap';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Pill, Empty, Async } from '../components/UI.jsx';
import { rupees, num } from '../util.js';

const blank = { name: '', sku: '', family: '', brand: '', barcode: '', mrp: '', cost: '', packSize: 1, trackingPolicy: 'off', shelfLifeDays: '' };

export default function Products() {
  const { sp, storeId, can, user } = useAuth(); const toast = useToast(); const [q, setQ] = useState(''); const [fam, setFam] = useState(''); const [page, setPage] = useState(1); const [edit, setEdit] = useState(null);
  const d = useApi('/api/catalog/products', { ...sp, q, family: fam, page, limit: 20 }, [storeId, q, fam, page]); const fams = useApi('/api/catalog/families');
  const showCost = user.role !== 'staff';
  const save = async () => {
    const f = edit; const body = { name: f.name, family: f.family || undefined, brand: f.brand || undefined, barcode: f.barcode || undefined, mrpPaise: Math.round(parseFloat(f.mrp || 0) * 100), costPaise: f.cost !== '' && f.cost != null ? Math.round(parseFloat(f.cost) * 100) : undefined,
      packSize: parseInt(f.packSize) || 1, trackingPolicy: f.trackingPolicy, shelfLifeDays: f.shelfLifeDays ? parseInt(f.shelfLifeDays) : undefined, ...(f._new && f.sku ? { sku: f.sku } : {}) };
    try { f._new ? await api.post('/api/catalog/products', body) : await api.patch(`/api/catalog/products/${encodeURIComponent(f.sku)}`, body); toast.success('Saved.'); setEdit(null); d.reload(); }
    catch (e) { toast.error(e.fields ? e.fields.map((x) => `${x.field}: ${x.message}`).join('; ') : e.message); }
  };
  const del = async (sku) => { if (!window.confirm('Delete this item?')) return; try { await api.del(`/api/catalog/products/${encodeURIComponent(sku)}`); toast.success('Deleted.'); d.reload(); } catch (e) { toast.error(e.message); } };
  const toggle = async (p) => { try { await api.patch(`/api/catalog/products/${encodeURIComponent(p.sku)}`, { active: p.active === false }); d.reload(); } catch (e) { toast.error(e.message); } };
  return (
    <>
      <PageHeader title="Products" sub="Your item list. Click an item to see its sales, forecast and stock." actions={can('manager') && <button className="btn btn-primary" onClick={() => setEdit({ ...blank, _new: true })}><i className="bi bi-plus-lg me-1" />Add item</button>} />
      <Card body={false}>
        <div className="p-3 d-flex gap-2 flex-wrap border-bottom"><input className="form-control" style={{ maxWidth: 320 }} placeholder="Search by name, code or barcode" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <select className="form-select" style={{ maxWidth: 220 }} value={fam} onChange={(e) => { setFam(e.target.value); setPage(1); }}><option value="">All categories</option>{(fams.data || []).map((f) => <option key={f}>{f}</option>)}</select></div>
        <Async state={d} rows={6}>{(r) => r.items.length === 0 ? <Empty icon="bi-tags" title="No items found">{q ? 'Try a different search.' : 'Add items one by one, or upload your item list from "Bring in data".'}</Empty> : (
          <div className="table-wrap"><table className="rp-table"><thead><tr><th>Item</th><th>Category</th><th className="num">Price</th>{showCost && <th className="num">Cost</th>}<th className="num">In stock</th><th>Expiry</th><th /></tr></thead><tbody>
            {r.items.map((p) => <tr key={p.sku} className={p.active === false ? 'opacity-50' : ''}><td className="truncate" style={{ maxWidth: 340 }}><Link to={`/products/${encodeURIComponent(p.sku)}`} className="fw-semibold text-decoration-none" title={p.name}>{p.name}</Link><div className="rp-sub">{p.sku}{p.brand ? ` · ${p.brand}` : ''}</div></td><td>{p.family}</td>
              <td className="num">{rupees(p.mrpPaise)}</td>{showCost && <td className="num">{p.costPaise != null ? rupees(p.costPaise) : <Pill kind="soon">missing</Pill>}</td>}<td className="num">{p.stock ? num(p.stock.onHand) : '-'}</td>
              <td><Pill kind={p.trackingPolicy === 'strict' ? 'soon' : p.trackingPolicy === 'estimate' ? 'info' : 'muted'}>{p.trackingPolicy === 'strict' ? 'exact dates' : p.trackingPolicy === 'estimate' ? 'estimated' : 'not tracked'}</Pill></td>
              <td className="text-end text-nowrap">{can('manager') && <><button className="btn btn-sm btn-light" onClick={() => setEdit({ ...p, mrp: p.mrpPaise / 100, cost: p.costPaise != null ? p.costPaise / 100 : '', shelfLifeDays: p.shelfLifeDays || '' })}><i className="bi bi-pencil" /></button> <button className="btn btn-sm btn-light" title={p.active === false ? 'Activate' : 'Hide'} onClick={() => toggle(p)}><i className={`bi ${p.active === false ? 'bi-eye' : 'bi-eye-slash'}`} /></button> <button className="btn btn-sm btn-light text-danger" onClick={() => del(p.sku)}><i className="bi bi-trash3" /></button></>}</td></tr>)}</tbody></table>
            <div className="d-flex justify-content-between p-3"><span className="rp-sub">{num(r.total)} items</span><div className="btn-group"><button className="btn btn-sm btn-outline-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><button className="btn btn-sm btn-outline-secondary" disabled={page * 20 >= r.total} onClick={() => setPage(page + 1)}>Next</button></div></div></div>)}</Async>
      </Card>
      <Modal show={!!edit} onHide={() => setEdit(null)} centered>
        <Modal.Header closeButton><Modal.Title className="h5">{edit?._new ? 'Add item' : 'Edit item'}</Modal.Title></Modal.Header>
        {edit && <Modal.Body><div className="row g-3">
          <div className="col-12"><label className="form-label fw-semibold">Item name</label><input className="form-control" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
          {edit._new && <div className="col-6"><label className="form-label fw-semibold">Item code (optional)</label><input className="form-control" value={edit.sku} onChange={(e) => setEdit({ ...edit, sku: e.target.value })} /></div>}
          <div className="col-6"><label className="form-label fw-semibold">Category</label><input className="form-control" value={edit.family || ''} onChange={(e) => setEdit({ ...edit, family: e.target.value })} /></div>
          <div className="col-6"><label className="form-label fw-semibold">Selling price (₹)</label><input type="number" min="0" className="form-control" value={edit.mrp} onChange={(e) => setEdit({ ...edit, mrp: e.target.value })} /></div>
          {showCost && <div className="col-6"><label className="form-label fw-semibold">Cost price (₹)</label><input type="number" min="0" className="form-control" value={edit.cost} onChange={(e) => setEdit({ ...edit, cost: e.target.value })} /></div>}
          <div className="col-6"><label className="form-label fw-semibold">Pack size</label><input type="number" min="1" className="form-control" value={edit.packSize} onChange={(e) => setEdit({ ...edit, packSize: e.target.value })} /></div>
          <div className="col-6"><label className="form-label fw-semibold">Barcode</label><input className="form-control" value={edit.barcode || ''} onChange={(e) => setEdit({ ...edit, barcode: e.target.value })} /></div>
          <div className="col-6"><label className="form-label fw-semibold">Expiry tracking</label><select className="form-select" value={edit.trackingPolicy} onChange={(e) => setEdit({ ...edit, trackingPolicy: e.target.value })}><option value="off">Not needed</option><option value="estimate">Estimate from shelf life</option><option value="strict">Exact date on every delivery</option></select></div>
          <div className="col-6"><label className="form-label fw-semibold">Shelf life (days)</label><input type="number" min="1" className="form-control" value={edit.shelfLifeDays} onChange={(e) => setEdit({ ...edit, shelfLifeDays: e.target.value })} /></div>
        </div></Modal.Body>}
        <Modal.Footer><button className="btn btn-light" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></Modal.Footer>
      </Modal>
    </>
  );
}
