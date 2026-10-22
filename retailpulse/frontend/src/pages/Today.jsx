import React from 'react';
import { Link } from 'react-router-dom';
import { Row, Col } from 'react-bootstrap';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Kpi, Banner, Empty, Pill, Async, SimBadge } from '../components/UI.jsx';
import { Trend } from '../components/Charts.jsx';
import BatchPrompt from '../components/BatchPrompt.jsx';
import { rupees, rupeesShort, num, pct, dshort, dlong } from '../util.js';

export default function Today() {
  const { sp, storeId, can, user } = useAuth(); const toast = useToast();
  const t = useApi('/api/today', sp, [storeId]); const pr = useApi('/api/inventory/prompts', { ...sp, limit: 4 }, [storeId]);
  return (
    <>
      <Async state={t} rows={8}>{(d) => <Body d={d} pr={pr} can={can} user={user} toast={toast} />}</Async>
    </>
  );
}

function Body({ d, pr, can, user, toast }) {
  const k = d.kpis; const showCost = user.role !== 'staff';
  const last7 = d.series.slice(-7).reduce((a, x) => a + x.units, 0); const prev7 = d.series.slice(-14, -7).reduce((a, x) => a + x.units, 0);
  const change = prev7 ? Math.round(((last7 - prev7) / prev7) * 100) : 0;
  const takeaway = d.series.length > 14 ? `Sales over the last 7 days are ${Math.abs(change)}% ${change >= 0 ? 'higher' : 'lower'} than the 7 days before.` : 'Upload more sales history to see trends.';
  return (
    <>
      <PageHeader title={`Today - ${dlong(d.today)}`} sub="Here is what needs your attention. Everything below tells you why." actions={d.simulated && <SimBadge />} />
      {d.simulated && <Banner kind="sim">You are looking at a <b>demo shop with simulated data</b>. The numbers behave like a real supermarket, but they were generated, not recorded.</Banner>}
      <Banner kind={d.freshness.status === 'fresh' ? 'ok' : 'warn'} action={d.freshness.status !== 'fresh' && <Link to="/import" className="btn btn-sm btn-warning">Upload sales</Link>}>
        {d.freshness.message} <span className="rp-sub">Latest sales: {dshort(d.freshness.lastSalesDate)}</span>
      </Banner>

      <Row className="g-3 mb-3">
        <Col xs={6} lg={3}><Kpi icon="bi-receipt" label="Yesterday's sales" value={showCost ? rupeesShort(k.yesterday.revenuePaise) : num(k.yesterday.units) + ' items'} delta={k.yesterday.vsSameWeekdayPct != null ? pct(k.yesterday.vsSameWeekdayPct) : ''} deltaLabel="vs a normal day like this" hint={`${num(k.yesterday.units)} items sold`} /></Col>
        <Col xs={6} lg={3}><Kpi icon="bi-calendar-week" label="Last 7 days" value={showCost ? rupeesShort(k.last7.revenuePaise) : num(k.last7.units) + ' items'} delta={k.last7.vsPrevPct != null ? pct(k.last7.vsPrevPct) : ''} deltaLabel="vs the week before" /></Col>
        <Col xs={6} lg={3}><Kpi icon="bi-cart-plus" label="To order today" value={`${k.toOrderNow} items`} hint={showCost && d.orders.estCostPaise ? `about ${rupeesShort(d.orders.estCostPaise)}` : ' '} tone={k.toOrderNow ? 'bad' : undefined} /></Col>
        <Col xs={6} lg={3}><Kpi icon="bi-hourglass-split" label="Expiring this week" value={`${k.expiringThisWeek} batches`} hint={k.stockoutRisk ? `${k.stockoutRisk} items may run out` : 'No stock-out risk'} tone={k.expiringThisWeek ? 'bad' : undefined} /></Col>
      </Row>

      <Row className="g-3 mb-3">
        <Col lg={7}>
          <Card title="What to order today" sub="Grouped by supplier. Open the order page to approve or change quantities."
            actions={<Link to="/orders" className="btn btn-primary btn-sm">Review & order <i className="bi bi-arrow-right" /></Link>}>
            {d.orders.count === 0 ? <Empty icon="bi-check2-circle" title="Nothing urgent to order">{d.readiness.features.find((f) => f.name === 'Reorder suggestions')?.ready ? 'Stock levels cover the coming days.' : 'Reorder suggestions need stock levels and at least 8 weeks of sales - see "Get ready" below.'}</Empty> : (
              <>
                <div className="d-flex flex-wrap gap-2 mb-3">{d.orders.bySupplier.map((s) => <Pill key={s.supplierKey} kind="info" icon="bi-truck">{s.supplierName}: {s.items} items{showCost ? ` · ${rupeesShort(s.estCostPaise)}` : ''}</Pill>)}</div>
                {d.orders.top.map((o) => (
                  <div key={o.id} className="d-flex gap-3 py-2 border-top align-items-start">
                    <div className="flex-grow-1"><div className="fw-semibold truncate" title={o.name}>{o.name}</div><div className="rp-sub">{o.reason}</div></div>
                    <div className="text-end"><div className="fw-bold">{num(o.qty)}</div><div className="rp-sub">to order</div></div>
                  </div>
                ))}
                {d.orders.count > d.orders.top.length && <div className="rp-sub mt-2">+ {d.orders.count - d.orders.top.length} more items on the order page</div>}
              </>)}
          </Card>
        </Col>
        <Col lg={5}>
          <Card title="Questions about your batches" sub="One tap each. Your answers keep expiry alerts accurate."
            actions={<Link to="/stock" className="btn btn-outline-primary btn-sm">All</Link>}>
            <Async state={pr} rows={3}>{(p) => p.items.length === 0 ? <Empty icon="bi-emoji-smile" title="No questions right now">We will ask when a new batch arrives or an expiry date is close.</Empty> : (
              <>{p.items.map((x) => <BatchPrompt key={x.batchId + x.type} p={x} onDone={pr.reload} />)}{p.total > p.shown && <div className="rp-sub">+ {p.total - p.shown} more questions</div>}</>)}
            </Async>
          </Card>
        </Col>
      </Row>

      <Row className="g-3 mb-3">
        <Col lg={7}>
          <Card title="Items sold per day" sub="Last 4 weeks"><div className="rp-takeaway">{takeaway}</div><Trend data={d.series} y="units" name="Items sold" h={230} /></Card>
        </Col>
        <Col lg={5}>
          <Card title="May run out soon" sub="Less than 2 days of stock at the current pace">
            {d.stockoutRisk.length === 0 ? <Empty icon="bi-shield-check" title="No stock-out risk">Nothing is close to running out.</Empty> : d.stockoutRisk.map((s) => (
              <div key={s.sku + s.storeId} className="d-flex justify-content-between py-2 border-bottom"><div className="truncate" title={s.name}>{s.name}</div><div className="text-end text-nowrap"><b>{num(s.onHand)}</b> left <span className="rp-sub">· {s.daysOfCover} days</span></div></div>))}
          </Card>
        </Col>
      </Row>

      <Row className="g-3">
        {showCost && <Col lg={6}>
          <Card title="Cash tied up in slow stock" sub={`${num(k.slowItems)} slow or non-moving items`}>
            <div className="rp-takeaway">{rupeesShort(k.cashTiedInSlowPaise)} is sitting in items that sell slowly.</div>
            {d.slowMovers.map((s) => <div key={s.sku + s.storeId} className="d-flex justify-content-between py-2 border-top"><div className="truncate" title={s.name}>{s.name}</div><div className="text-nowrap">{rupees(s.cashTiedPaise)} <span className="rp-sub">· {s.daysOfCover ? Math.round(s.daysOfCover) + ' days of stock' : ''}</span></div></div>)}
          </Card></Col>}
        <Col lg={showCost ? 6 : 12}>
          <Card title="Get ready" sub="Each feature switches on when it has the data it needs">
            {d.readiness.features.map((f) => <div key={f.name} className="d-flex align-items-center gap-2 py-2 border-bottom"><i className={`bi ${f.ready ? 'bi-check-circle-fill text-success' : 'bi-circle text-secondary'}`} /><div className="flex-grow-1">{f.name}</div>{!f.ready && <span className="rp-sub">needs: {f.needs}</span>}</div>)}
            {d.readiness.pendingExpiry > 0 && <div className="mt-3"><Link to="/stock?tab=pending" className="btn btn-sm btn-outline-warning">{d.readiness.pendingExpiry} deliveries need an expiry date</Link></div>}
            {can('manager') && <button className="btn btn-sm btn-outline-primary mt-3" onClick={async () => { await api.post('/api/admin/pipeline/run'); toast.success('Learning started. Suggestions refresh in a few minutes.'); }}><i className="bi bi-arrow-repeat me-1" />Refresh suggestions</button>}
          </Card>
        </Col>
      </Row>
    </>
  );
}
