import React, { useState } from 'react';
import { Tabs, Tab } from 'react-bootstrap';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Async, Pill, Banner } from '../components/UI.jsx';

export default function Settings() {
  const { can } = useAuth();
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs defaultActiveKey="shop" className="mb-3">
        <Tab eventKey="shop" title="Shop"><Shop /></Tab>
        {can('owner') && <Tab eventKey="team" title="Team"><Team /></Tab>}
        {can('manager') && <Tab eventKey="activity" title="Activity log"><Activity /></Tab>}
        {can('owner') && <Tab eventKey="privacy" title="Your data"><Privacy /></Tab>}
      </Tabs>
    </>
  );
}

function Shop() {
  const { can, reload, stores } = useAuth(); const toast = useToast(); const s = useApi('/api/admin/settings'); const [f, setF] = useState(null); const [store, setStoreName] = useState('');
  const cur = f || (s.data && { name: s.data.name, strict: s.data.settings?.expiryAlertDays?.strict ?? 5, estimate: s.data.settings?.expiryAlertDays?.estimate ?? 30 });
  const save = async () => { try { await api.patch('/api/admin/settings', { name: cur.name, expiryAlertDays: { strict: +cur.strict, estimate: +cur.estimate } }); toast.success('Saved.'); reload(); } catch (e) { toast.error(e.message); } };
  const add = async () => { try { await api.post('/api/admin/stores', { name: store }); toast.success('Store added.'); setStoreName(''); reload(); } catch (e) { toast.error(e.message); } };
  return (
    <div className="row g-3"><div className="col-lg-6"><Card title="Shop details"><Async state={s} rows={3}>{() => cur && (
      <>
        <label className="form-label fw-semibold">Shop name</label><input className="form-control mb-3" disabled={!can('owner')} value={cur.name} onChange={(e) => setF({ ...cur, name: e.target.value })} />
        <label className="form-label fw-semibold">Warn me before fresh items expire (days)</label><input type="number" min="1" className="form-control mb-3" disabled={!can('owner')} value={cur.strict} onChange={(e) => setF({ ...cur, strict: e.target.value })} />
        <label className="form-label fw-semibold">Warn me before packaged items expire (days)</label><input type="number" min="1" className="form-control mb-3" disabled={!can('owner')} value={cur.estimate} onChange={(e) => setF({ ...cur, estimate: e.target.value })} />
        {can('owner') && <button className="btn btn-primary" onClick={save}>Save</button>}</>)}</Async></Card></div>
      <div className="col-lg-6"><Card title="Stores">{stores.map((x) => <div key={x._id} className="py-2 border-bottom">{x.name} <span className="rp-sub">{x._id}</span></div>)}
        {can('owner') && <div className="d-flex gap-2 mt-3"><input className="form-control" placeholder="New store name" value={store} onChange={(e) => setStoreName(e.target.value)} /><button className="btn btn-outline-primary" disabled={store.length < 2} onClick={add}>Add</button></div>}</Card></div></div>
  );
}

function Team() {
  const toast = useToast(); const u = useApi('/api/auth/users'); const [f, setF] = useState({ name: '', email: '', password: '', role: 'staff' });
  const add = async () => { try { await api.post('/api/auth/users', f); toast.success('User added.'); setF({ name: '', email: '', password: '', role: 'staff' }); u.reload(); } catch (e) { toast.error(e.fields ? e.fields.map((x) => x.message).join(', ') : e.message); } };
  const toggle = async (x) => { try { await api.patch(`/api/auth/users/${x._id}`, { active: !x.active }); u.reload(); } catch (e) { toast.error(e.message); } };
  return (
    <div className="row g-3"><div className="col-lg-7"><Card title="People who can sign in" body={false}><Async state={u} rows={3}>{(list) => (
      <div className="table-wrap"><table className="rp-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th /></tr></thead><tbody>{list.map((x) => <tr key={x._id} className={x.active ? '' : 'opacity-50'}><td>{x.name}</td><td>{x.email}</td><td><Pill kind={x.role === 'owner' ? 'ok' : x.role === 'manager' ? 'info' : 'muted'}>{x.role}</Pill></td><td className="text-end">{x.role !== 'owner' && <button className="btn btn-sm btn-outline-secondary" onClick={() => toggle(x)}>{x.active ? 'Disable' : 'Enable'}</button>}</td></tr>)}</tbody></table></div>)}</Async></Card></div>
      <div className="col-lg-5"><Card title="Add a person" sub="Managers can upload data and approve orders. Staff can record deliveries and answer batch questions; they cannot see costs.">
        <input className="form-control mb-2" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /><input className="form-control mb-2" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <input type="password" className="form-control mb-2" placeholder="Password (8+ characters)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <select className="form-select mb-3" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="staff">Staff</option><option value="manager">Manager</option></select><button className="btn btn-primary" onClick={add}>Add person</button></Card></div></div>
  );
}

function Activity() {
  const [page, setPage] = useState(1); const d = useApi('/api/admin/audit', { page, limit: 20 }, [page]);
  return (
    <Card title="Who did what" sub="Every approval, upload, change and answer is recorded." body={false}><Async state={d} rows={5}>{(r) => (
      <div className="table-wrap"><table className="rp-table"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Item</th></tr></thead><tbody>{r.items.map((a) => <tr key={a._id}><td className="text-nowrap">{new Date(a.at).toLocaleString('en-IN')}</td><td>{a.userEmail}</td><td>{a.action.replaceAll('_', ' ')}</td><td className="truncate" style={{ maxWidth: 260 }}>{a.entity} {a.entityId}</td></tr>)}</tbody></table>
        <div className="d-flex justify-content-between p-3"><span className="rp-sub">{r.total} entries</span><div className="btn-group"><button className="btn btn-sm btn-outline-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Newer</button><button className="btn btn-sm btn-outline-secondary" disabled={page * 20 >= r.total} onClick={() => setPage(page + 1)}>Older</button></div></div></div>)}</Async></Card>
  );
}

function Privacy() {
  const { tenant, logout } = useAuth(); const toast = useToast(); const [c, setC] = useState('');
  const exp = async () => { const r = await api.raw('/api/admin/export?collections=products,suppliers,purchase_orders,stock_adjustments,import_jobs,users,stores,tenants'); const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'my-retailpulse-data.ndjson'; a.click(); };
  const del = async () => { try { await api.del('/api/admin/tenant', { confirm: c }); toast.success('All your data has been deleted.'); logout(); } catch (e) { toast.error(e.message); } };
  return (
    <div className="row g-3"><div className="col-lg-6"><Card title="Your data belongs to you"><p className="rp-sub">RetailPulse stores the files and records you upload so it can give you suggestions. It does not collect your customers' personal details. You can take a copy or erase everything at any time.</p><button className="btn btn-outline-primary" onClick={exp}><i className="bi bi-download me-1" />Download my data</button></Card></div>
      <div className="col-lg-6"><Card title="Delete everything"><Banner kind="bad">This permanently removes your shop, sales, stock and uploads. It cannot be undone.</Banner>
        {tenant?.simulated ? <div className="rp-sub">Demo shops cannot be deleted.</div> : <><label className="form-label">Type <b>DELETE {tenant?.name}</b> to confirm</label><input className="form-control mb-2" value={c} onChange={(e) => setC(e.target.value)} /><button className="btn btn-danger" disabled={c !== `DELETE ${tenant?.name}`} onClick={del}>Delete my shop and all data</button></>}</Card></div></div>
  );
}
