import React from 'react';
import { Row, Col } from 'react-bootstrap';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Kpi, Async, Banner, Pill, Empty } from '../components/UI.jsx';
import { RankBars } from '../components/Charts.jsx';
import { num, dlong } from '../util.js';

const NAMES = { naive: 'Same as yesterday', snaive7: 'Same as last week', seasonal_avg4: 'Weekday average (4 weeks)', ma7: '7-day average', ma28: '28-day average', ets: 'Smoothing model (ETS)', gbm: 'Learning model (GBM)', selector: 'Best-per-item picker', croston_sba: 'Sparse-demand model' };

export default function Forecasts() {
  const { can } = useAuth(); const toast = useToast(); const d = useApi('/api/insights/model-health'); const runs = useApi('/api/admin/runs'); const jobs = useApi('/api/admin/jobs');
  const run = async () => { try { await api.post('/api/admin/pipeline/run'); toast.success('Learning started.'); jobs.reload(); } catch (e) { toast.error(e.message); } };
  return (
    <>
      <PageHeader title="Forecasts & accuracy" sub="How well RetailPulse predicts your sales - measured honestly, never just claimed." actions={can('manager') && <button className="btn btn-primary" onClick={run}><i className="bi bi-arrow-repeat me-1" />Learn from latest data</button>} />
      <Async state={d} rows={5}>{(x) => {
        const r = x.latestRun; const h = r?.honestScore; const f = x.favoritaBenchmark;
        return (
          <>
            {x.simulatedTenant && <Banner kind="sim">This is a <b>demo shop</b>: the scores below describe how the system behaves on simulated data. The real-data benchmark further down uses actual grocery sales.</Banner>}
            {!r ? <Banner kind="warn">RetailPulse has not learned from this shop's data yet. Upload sales and stock, then press "Learn from latest data".</Banner> : (
              <Row className="g-3 mb-3">
                <Col xs={6} lg={3}><Kpi label="Items forecast" value={num(r.series)} icon="bi-lightning-charge" hint={`as of ${dlong(r.asOf)}`} /></Col>
                <Col xs={6} lg={3}><Kpi label="Typical error" value={h?.wapeSelected != null ? `${Math.round(h.wapeSelected * 100)}%` : '-'} icon="bi-bullseye" hint="lower is better (WAPE)" /></Col>
                <Col xs={6} lg={3}><Kpi label="Simple method's error" value={h?.wapeBaselineSeasonalAvg4 != null ? `${Math.round(h.wapeBaselineSeasonalAvg4 * 100)}%` : '-'} icon="bi-calculator" hint="weekday average, for comparison" /></Col>
                <Col xs={6} lg={3}><Kpi label="Range hit rate" value={h?.coverage80 != null ? `${Math.round(h.coverage80 * 100)}%` : '-'} icon="bi-arrows-collapse" hint="target 80% - how often reality fell in our range" /></Col>
              </Row>)}
            <Row className="g-3 mb-3">
              <Col lg={7}><Card title="How the score is measured" sub="Why you can trust it">
                <ol className="mb-0 ps-3"><li className="mb-2">We hide the <b>last 4 weeks</b> of your sales and try to predict them.</li><li className="mb-2">The method for each item is chosen using the 4 weeks <i>before</i> that, so the choice never sees the answers.</li><li className="mb-2">The error is compared with a very simple method. If the clever model does not beat the simple one for an item, we use the simple one and say so.</li><li>Forecast ranges are shown on each item's page; the "range hit rate" tells you whether those ranges are honest.</li></ol>
                {r && <div className="mt-3 d-flex flex-wrap gap-2">{Object.entries(r.modelCounts || {}).map(([k, v]) => <Pill key={k} kind="info">{NAMES[k] || k}: {num(v)} items</Pill>)}</div>}</Card></Col>
              <Col lg={5}><Card title="Learning activity">
                <Async state={jobs} rows={2}>{(j) => j.length === 0 ? <div className="rp-sub">No learning runs queued yet.</div> : j.slice(0, 5).map((x) => <div key={x._id} className="d-flex justify-content-between py-2 border-bottom"><div className="rp-sub">{new Date(x.createdAt).toLocaleString('en-IN')}</div><Pill kind={x.status === 'done' ? 'ok' : x.status === 'failed' ? 'now' : 'info'}>{x.status}</Pill></div>)}</Async>
                <div className="rp-sub mt-2">Learning runs automatically after every sales or stock import.</div></Card></Col>
            </Row>
            {f && <Card title="Benchmark on real grocery data" sub={`Store Sales (Corporación Favorita, Ecuador): ${num(f.series)} store × category series, hold-out ${f.window[0]} to ${f.window[1]}`}>
              <div className="rp-takeaway">{f.summary.best_model === 'selector' || f.summary.improvement_pct_vs_best_baseline > 0 ? `The best method (${NAMES[f.summary.best_model] || f.summary.best_model}) has ${Math.abs(f.summary.improvement_pct_vs_best_baseline).toFixed(1)}% lower error than the best simple method.` : `A simple method (${NAMES[f.summary.best_baseline]}) was as good as or better than the models - and we report that.`}</div>
              <RankBars data={f.ranking.map((k) => ({ label: NAMES[k] || k, value: Math.round(f.metrics[k].WAPE * 1000) / 10 }))} fmt={(v) => v + '%'} colorBy={(d) => (d.label === NAMES[f.summary.best_model] ? '#0f766e' : '#94a3b8')} />
              <div className="rp-sub mt-2">Error = total absolute error ÷ total actual units (WAPE). Lower is better. Measured on days the models never saw.</div></Card>}
          </>);
      }}</Async>
    </>
  );
}
