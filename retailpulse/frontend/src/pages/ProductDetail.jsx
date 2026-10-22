import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Row, Col } from 'react-bootstrap';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { PageHeader, Card, Kpi, Pill, Async, Empty, Confidence } from '../components/UI.jsx';
import { Trend, ForecastChart } from '../components/Charts.jsx';
import { rupees, num, dshort } from '../util.js';

export default function ProductDetail() {
  const { sku } = useParams(); const { sp, storeId, user } = useAuth();
  const d = useApi(`/api/catalog/products/${encodeURIComponent(sku)}`, sp, [sku, storeId]); const f = useApi(`/api/today/forecast/${encodeURIComponent(sku)}`, sp, [sku, storeId]);
  return (
    <Async state={d} rows={8}>{(x) => {
      const p = x.product; const onHand = x.inventory.reduce((a, i) => a + i.onHand, 0); const units = x.salesSeries.reduce((a, s) => a + s.qty, 0); const fc = f.data?.forecast;
      return (
        <>
          <PageHeader title={p.name} sub={<>{p.sku} · {p.family} · <Link to="/products">back to products</Link></>} />
          <Row className="g-3 mb-3">
            <Col xs={6} lg={3}><Kpi label="In stock" value={num(onHand)} icon="bi-box-seam" hint={x.inventory.length ? `${x.inventory.reduce((a, i) => a + i.onOrder, 0)} on order` : 'no stock record'} /></Col>
            <Col xs={6} lg={3}><Kpi label="Sold (90 days)" value={num(units)} icon="bi-bag-check" hint={`about ${num(units / 90, 1)} a day`} /></Col>
            <Col xs={6} lg={3}><Kpi label="Selling price" value={rupees(p.mrpPaise)} icon="bi-tag" hint={user.role !== 'staff' && p.costPaise ? `margin ${Math.round((1 - p.costPaise / p.mrpPaise) * 100)}%` : ''} /></Col>
            <Col xs={6} lg={3}><Kpi label="Next 4 weeks" value={fc?.model ? num(fc.dailyMean * 28) : '-'} icon="bi-lightning-charge" hint={fc?.model ? <Confidence c={fc.confidence} /> : 'not enough history yet'} /></Col>
          </Row>
          <Row className="g-3">
            <Col lg={8}><Card title="Sales and expected demand" sub="Solid line = sold. Dashed = what we expect, with the likely range.">
              <Async state={f} rows={3}>{(r) => r.forecast?.horizon?.length ? <ForecastChart history={r.history} forecast={r.forecast.horizon} /> : r.history.length ? <Trend data={r.history} x="date" y="qty" name="Sold" /> : <Empty title="No sales yet" />}</Async></Card></Col>
            <Col lg={4}><Card title="Batches in stock">
              {x.batches.length === 0 ? <div className="rp-sub">No batch records.</div> : x.batches.map((b) => <div key={b.batchId} className="d-flex justify-content-between py-2 border-bottom"><div>{b.expiryDate ? <Pill kind="info">exp {dshort(b.expiryDate)}</Pill> : <Pill kind="muted">no date</Pill>}</div><div>about <b>{b.remaining}</b></div></div>)}
              {x.recommendations[0] && <div className="mt-3 p-3 rounded-3 bg-light"><div className="fw-semibold">Suggested order: {x.recommendations[0].finalQty}</div><div className="rp-sub">{x.recommendations[0].reason.text}</div></div>}
            </Card></Col>
          </Row>
        </>);
    }}</Async>
  );
}
