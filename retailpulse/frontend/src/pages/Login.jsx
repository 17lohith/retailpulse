import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Login({ register }) {
  const { login, register: doRegister } = useAuth(); const nav = useNavigate(); const toast = useToast();
  const [f, setF] = useState({ shopName: '', name: '', email: '', password: '', kind: 'supermarket', stores: 1 }); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'number' ? parseInt(e.target.value) || 1 : e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { register ? await doRegister({ ...f }) : await login(f.email, f.password); nav('/'); }
    catch (x) { setErr(x); toast.error(x.message); } finally { setBusy(false); }
  };
  const demo = async (who) => { setBusy(true); try { await login(`owner@${who}.retailpulse.test`, 'Demo@1234'); nav('/'); } catch (x) { toast.error('Demo shop is not available: ' + x.message); } finally { setBusy(false); } };
  const fe = (k) => err?.fields?.find((x) => x.field === k)?.message;
  return (
    <div className="login-wrap">
      <div className="login-hero">
        <div className="d-flex align-items-center gap-2 mb-4 fs-4 fw-bold"><i className="bi bi-activity" /> RetailPulse</div>
        <h1>Know what to order, before you run out.</h1>
        <ul className="list-unstyled mt-3">
          <li><i className="bi bi-check-circle-fill me-2" />Upload the sales report from your billing software</li>
          <li><i className="bi bi-check-circle-fill me-2" />It learns your shop by itself - no settings to tune</li>
          <li><i className="bi bi-check-circle-fill me-2" />Get a simple daily list: what to order, and what to sell first</li>
          <li><i className="bi bi-check-circle-fill me-2" />Every suggestion tells you why</li>
        </ul>
      </div>
      <div className="d-flex align-items-center justify-content-center p-4 bg-white">
        <form onSubmit={submit} style={{ width: '100%', maxWidth: 400 }}>
          <h2 className="h4 fw-bold mb-1">{register ? 'Create your shop account' : 'Welcome back'}</h2>
          <p className="rp-sub mb-4">{register ? 'It takes about a minute.' : 'Sign in to see today\'s list.'}</p>
          {register && <>
            <label className="form-label fw-semibold" htmlFor="f-shop">Shop name</label><input id="f-shop" className={`form-control mb-1 ${fe('shopName') ? 'is-invalid' : ''}`} value={f.shopName} onChange={set('shopName')} required />
            <div className="invalid-feedback d-block mb-2">{fe('shopName')}</div>
            <label className="form-label fw-semibold" htmlFor="f-name">Your name</label><input id="f-name" className="form-control mb-3" value={f.name} onChange={set('name')} required />
            <div className="row g-2 mb-3"><div className="col-7"><label className="form-label fw-semibold" htmlFor="f-kind">Type of shop</label>
              <select id="f-kind" className="form-select" value={f.kind} onChange={set('kind')}><option value="kirana">Kirana / provision store</option><option value="supermarket">Supermarket</option><option value="small-chain">Small chain</option></select></div>
              <div className="col-5"><label className="form-label fw-semibold" htmlFor="f-stores">Stores</label><input id="f-stores" type="number" min="1" max="50" className="form-control" value={f.stores} onChange={set('stores')} /></div></div></>}
          <label className="form-label fw-semibold" htmlFor="f-email">Email</label><input id="f-email" type="email" className={`form-control mb-3 ${fe('email') ? 'is-invalid' : ''}`} value={f.email} onChange={set('email')} required autoComplete="username" />
          <label className="form-label fw-semibold" htmlFor="f-pw">Password</label><input id="f-pw" type="password" className={`form-control mb-1 ${fe('password') ? 'is-invalid' : ''}`} value={f.password} onChange={set('password')} required autoComplete={register ? 'new-password' : 'current-password'} />
          <div className="invalid-feedback d-block mb-2">{fe('password')}</div>
          {err && !err.fields && <div className="alert alert-danger py-2 mt-2">{err.message}</div>}
          <button className="btn btn-primary btn-lg w-100 mt-2" disabled={busy}>{busy ? 'Please wait...' : register ? 'Create account' : 'Sign in'}</button>
          <div className="text-center mt-3">{register ? <>Already have an account? <Link to="/login">Sign in</Link></> : <>New here? <Link to="/register">Create a shop account</Link></>}</div>
          {!register && <div className="mt-4 pt-3 border-top">
            <div className="rp-sub mb-2 text-center">Just want to look around? Try a demo shop (simulated data)</div>
            <div className="d-grid gap-2"><button type="button" className="btn btn-outline-primary" disabled={busy} onClick={() => demo('demo-a')}><i className="bi bi-shop me-2" />Single store - Sri Lakshmi Provision</button>
              <button type="button" className="btn btn-outline-primary" disabled={busy} onClick={() => demo('demo-b')}><i className="bi bi-buildings me-2" />3-store chain - GreenMart</button></div></div>}
        </form>
      </div>
    </div>
  );
}
