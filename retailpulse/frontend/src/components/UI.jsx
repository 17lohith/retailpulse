import React from 'react';
import { Spinner } from 'react-bootstrap';

export const PageHeader = ({ title, sub, actions }) => (
  <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
    <div><h1 className="h4 fw-bold mb-1">{title}</h1>{sub && <div className="rp-sub">{sub}</div>}</div>
    {actions && <div className="d-flex gap-2 flex-wrap">{actions}</div>}
  </div>
);
export const Card = ({ title, sub, actions, children, className = '', body = true }) => (
  <div className={`rp-card ${className}`}>
    {(title || actions) && <div className="rp-card-h"><div>{title && <h3>{title}</h3>}{sub && <div className="rp-sub mt-1">{sub}</div>}</div>{actions}</div>}
    {body ? <div className="rp-card-b">{children}</div> : children}
  </div>
);
export const Kpi = ({ label, value, delta, deltaLabel, icon, hint, tone }) => (
  <div className="rp-card rp-kpi">
    <div className="d-flex justify-content-between"><div className="label">{label}</div>{icon && <i className={`bi ${icon}`} style={{ color: tone === 'bad' ? '#dc2626' : '#0f766e', fontSize: '1.2rem' }} />}</div>
    <div className="value">{value}</div>
    {delta !== undefined && delta !== null && delta !== '' && <div className={`delta ${String(delta).startsWith('-') ? 'down' : String(delta).startsWith('+') ? 'up' : 'flat'}`}>{delta} <span className="rp-sub fw-normal">{deltaLabel}</span></div>}
    {hint && <div className="rp-sub mt-1">{hint}</div>}
  </div>
);
export const Pill = ({ kind = 'muted', children, icon }) => <span className={`rp-pill pill-${kind}`}>{icon && <i className={`bi ${icon}`} />}{children}</span>;
export const SimBadge = () => <Pill kind="sim" icon="bi-flask">SIMULATED</Pill>;
export const Empty = ({ icon = 'bi-inbox', title, children, action }) => (
  <div className="rp-empty"><i className={`bi ${icon}`} /><div className="fw-semibold text-body mb-1">{title}</div><div className="mb-3">{children}</div>{action}</div>
);
export const Banner = ({ kind = 'ok', icon, children, action }) => (
  <div className={`rp-banner banner-${kind}`}><i className={`bi ${icon || (kind === 'ok' ? 'bi-check-circle-fill' : kind === 'sim' ? 'bi-flask' : 'bi-exclamation-triangle-fill')}`} /><div className="flex-grow-1">{children}</div>{action}</div>
);
export const Loading = ({ rows = 3, h = 18 }) => (<div>{Array.from({ length: rows }).map((_, i) => <div key={i} className="rp-skel mb-2" style={{ height: h, width: `${100 - (i % 3) * 12}%` }} />)}</div>);
export const Busy = () => <div className="text-center py-4"><Spinner animation="border" size="sm" variant="primary" /> <span className="rp-sub ms-2">Working...</span></div>;
export function Async({ state, children, rows = 4, empty }) {
  if (state.loading && !state.data) return <Loading rows={rows} />;
  if (state.error) return <Banner kind="bad">{state.error.message} <button className="btn btn-sm btn-outline-danger ms-2" onClick={state.reload}>Try again</button></Banner>;
  if (empty && empty(state.data)) return empty.node || null;
  return children(state.data);
}
export const Urgency = ({ u }) => (u === 'now' ? <Pill kind="now">Order today</Pill> : u === 'soon' ? <Pill kind="soon">Soon</Pill> : <Pill kind="ok">Later</Pill>);
export const Confidence = ({ c }) => <Pill kind={c === 'high' ? 'ok' : c === 'medium' ? 'info' : 'muted'}>{c === 'learning' ? 'Learning' : `${c} confidence`}</Pill>;
export const Steps = ({ steps, current }) => (
  <div className="d-flex flex-wrap gap-3 mb-3">{steps.map((s, i) => <div key={s} className={`rp-step ${i === current ? 'on' : i < current ? 'done' : ''}`}><span className="dot">{i < current ? <i className="bi bi-check" /> : i + 1}</span><span className={i === current ? 'fw-semibold' : 'rp-sub'}>{s}</span></div>)}</div>
);
