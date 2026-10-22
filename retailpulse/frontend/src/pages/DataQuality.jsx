import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { PageHeader, Card, Async, Pill, Banner } from '../components/UI.jsx';
import { num } from '../util.js';

export default function DataQuality() {
  const d = useApi('/api/admin/data-quality');
  const fixLink = { no_stock: '/import', stale: '/import', pending_expiry: '/stock?tab=pending', no_cost: '/products', no_price: '/products', no_supplier: '/products', no_barcode: '/products' };
  return (
    <>
      <PageHeader title="Data quality" sub="Good suggestions need good data. Here is what to fix, in plain words." />
      <Async state={d} rows={5}>{(x) => {
        const open = x.issues.filter((i) => i.severity !== 'ok');
        return (
          <>
            <Banner kind={open.length ? 'warn' : 'ok'}>{open.length ? `${open.length} thing${open.length > 1 ? 's' : ''} could be improved.` : 'Your data looks healthy.'}  {num(x.summary.products)} items · {num(x.summary.skusWithSales)} have sales · {num(x.summary.stockRows)} have stock records.</Banner>
            <Card title="Checks" body={false}>{x.issues.map((i) => (
              <div key={i.id} className="d-flex align-items-start gap-3 p-3 border-bottom"><i className={`bi fs-5 ${i.severity === 'ok' ? 'bi-check-circle-fill text-success' : i.severity === 'warn' ? 'bi-exclamation-triangle-fill text-warning' : 'bi-info-circle-fill text-info'}`} />
                <div className="flex-grow-1"><div className="fw-semibold">{i.text}</div>{i.severity !== 'ok' && <div className="rp-sub">{i.fix}</div>}</div>{i.severity !== 'ok' && fixLink[i.id] && <Link className="btn btn-sm btn-outline-primary" to={fixLink[i.id]}>Fix</Link>}</div>))}</Card>
            <Card className="mt-3" title="Recent uploads" body={false}>{x.recentImports.length === 0 ? <div className="p-3 rp-sub">No uploads yet.</div> : (
              <div className="table-wrap"><table className="rp-table"><thead><tr><th>File</th><th>Type</th><th>Status</th><th className="num">Rows</th><th className="num">Rejected</th><th>When</th></tr></thead><tbody>
                {x.recentImports.map((r) => <tr key={r._id}><td className="truncate">{r.filename}</td><td>{r.type}</td><td><Pill kind={r.status === 'committed' ? 'ok' : r.status === 'failed' ? 'now' : 'info'}>{r.status}</Pill></td><td className="num">{num(r.report?.rowsTotal)}</td><td className="num">{num(r.report?.rowsRejected)}</td><td>{new Date(r.createdAt).toLocaleDateString('en-IN')}</td></tr>)}</tbody></table></div>)}</Card>
          </>);
      }}</Async>
    </>
  );
}
