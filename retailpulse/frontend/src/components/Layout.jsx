import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Offcanvas, Dropdown } from 'react-bootstrap';
import { useAuth } from '../auth.jsx';
import { Pill } from './UI.jsx';

const NAV = [
  ['Daily', null],
  ['/', 'bi-sun', 'Today'], ['/orders', 'bi-cart-check', 'Orders'], ['/stock', 'bi-boxes', 'Stock & expiry'],
  ['Understand', null],
  ['/sales', 'bi-graph-up-arrow', 'Sales'], ['/forecasts', 'bi-lightning-charge', 'Forecasts'], ['/insights', 'bi-bar-chart-line', 'Insights'], ['/products', 'bi-tags', 'Products'],
  ['Set up', null],
  ['/import', 'bi-cloud-arrow-up', 'Bring in data'], ['/quality', 'bi-clipboard2-check', 'Data quality'], ['/settings', 'bi-gear', 'Settings'],
];
const Nav = ({ onGo }) => (
  <nav className="rp-nav">
    {NAV.map((n, i) => n[1] === null ? <div key={i} className="group">{n[0]}</div> : (
      <NavLink key={n[0]} to={n[0]} end={n[0] === '/'} onClick={onGo} className={({ isActive }) => (isActive ? 'active' : '')}><i className={`bi ${n[1]}`} />{n[2]}</NavLink>
    ))}
  </nav>
);
const Brand = () => <div className="rp-brand"><span className="logo"><i className="bi bi-activity" /></span>RetailPulse</div>;

export default function Layout() {
  const { user, tenant, stores, storeId, setStoreId, logout } = useAuth(); const [open, setOpen] = useState(false); const nav = useNavigate();
  return (
    <div className="rp-shell">
      <aside className="rp-side"><Brand /><Nav /><div className="mt-auto px-2 small" style={{ color: '#5eead4', opacity: .8 }}>Your shop's decision assistant</div></aside>
      <Offcanvas show={open} onHide={() => setOpen(false)} className="rp-off" style={{ color: '#d1fae5' }}>
        <Offcanvas.Header closeButton closeVariant="white"><Brand /></Offcanvas.Header><Offcanvas.Body><Nav onGo={() => setOpen(false)} /></Offcanvas.Body>
      </Offcanvas>
      <div className="rp-main">
        <header className="rp-top">
          <button className="btn btn-light d-lg-none" onClick={() => setOpen(true)} aria-label="Menu"><i className="bi bi-list fs-5" /></button>
          <div className="fw-semibold truncate">{tenant?.name}</div>
          {tenant?.simulated && <Pill kind="sim" icon="bi-flask">Demo shop - simulated data</Pill>}
          <div className="ms-auto d-flex align-items-center gap-2">
            {stores?.length > 1 && (
              <select className="form-select form-select-sm" style={{ width: 'auto', maxWidth: 190 }} value={storeId} onChange={(e) => setStoreId(e.target.value)} aria-label="Choose store">
                <option value="all">All stores</option>{stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            )}
            <Dropdown align="end">
              <Dropdown.Toggle variant="light" className="d-flex align-items-center gap-2"><i className="bi bi-person-circle" /><span className="d-none d-sm-inline">{user?.name}</span></Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.ItemText className="small text-muted">{user?.email}<br />Role: {user?.role}</Dropdown.ItemText><Dropdown.Divider />
                <Dropdown.Item onClick={() => nav('/settings')}>Settings</Dropdown.Item><Dropdown.Item onClick={() => { logout(); nav('/login'); }}>Sign out</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </div>
        </header>
        <main className="rp-content"><Outlet /></main>
      </div>
    </div>
  );
}
