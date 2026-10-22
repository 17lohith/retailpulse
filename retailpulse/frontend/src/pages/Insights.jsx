import React, { useState } from 'react';
import { Tabs, Tab, Row, Col } from 'react-bootstrap';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { PageHeader, Card, Kpi, Async, Pill, Banner, Empty, SimBadge } from '../components/UI.jsx';
import { Lines, RankBars, Columns } from '../components/Charts.jsx';
import { num, title, COLORS } from '../util.js';
import { api } from '../api.js';

export default function Insights() {
  const [tab, setTab] = useState('feedback');
  return (
    <>
      <PageHeader title="Insights" sub="Patterns found by Hadoop in millions of real records. These help you understand customers and demand - they are not about your shop's own sales." />
      <Tabs activeKey={tab} onSelect={setTab} className="mb-3">
        <Tab eventKey="feedback" title="What customers say"><Feedback /></Tab>
        <Tab eventKey="demand" title="Demand patterns"><Demand /></Tab>
        <Tab eventKey="waste" title="Waste (demo)"><Waste /></Tab>
        <Tab eventKey="lookup" title="Product lookup"><Lookup /></Tab>
      </Tabs>
    </>
  );
}

const Source = ({ children }) => <div className="rp-sub mt-2"><i className="bi bi-info-circle me-1" />{children}</div>;

function Feedback() {
  const d = useApi('/api/insights/reviews/overview');
  return (
    <Async state={d} rows={6}>{(x) => (
      <>
        <Banner kind="sim" icon="bi-database">Based on <b>{num(x.totals.reviews)} real product reviews</b> from Amazon's grocery category ({x.monthly[0]?.month.slice(0, 4)} - {x.monthly.at(-1)?.month.slice(0, 4)}), processed with Hadoop MapReduce. Average rating {x.totals.meanRating.toFixed(2)} of 5.</Banner>
        <Row className="g-3 mb-3">
          <Col lg={7}><Card title="Reviews per month"><div className="rp-takeaway">Review activity peaked in {x.monthly.reduce((a, b) => (b.reviews > a.reviews ? b : a)).month.slice(0, 4)}.</div>
            <Lines data={x.monthly} x="month" lines={[{ key: 'reviews', name: 'Reviews' }]} h={240} xfmt={(v) => (v.endsWith('-01') ? v.slice(0, 4) : '')} /></Card></Col>
          <Col lg={5}><Card title="Do shoppers pay more for better-rated products?" sub="Average rating by price band (US$)">
            <Columns data={x.priceBands.filter((b) => b.band !== 'no_price').map((b) => ({ band: b.band === '<5' ? 'under $5' : b.band, rating: b.meanRating }))} x="band" bars={[{ key: 'rating', name: 'Average rating', color: COLORS.primary }]} h={220} fmt={(v) => v.toFixed(2)} />
            <Source>Price is known for only some products; others are left out of this chart.</Source></Card></Col>
        </Row>
        <Row className="g-3 mb-3">
          <Col lg={6}><Card title="Words in happy reviews"><RankBars data={x.topTerms.positive.map((t) => ({ label: t.word, value: t.count }))} color={COLORS.ok} /></Card></Col>
          <Col lg={6}><Card title="Words in unhappy reviews (1-2 stars)"><RankBars data={x.topTerms.negative.map((t) => ({ label: t.word, value: t.count }))} color={COLORS.danger} /></Card></Col>
        </Row>
        <Row className="g-3 mb-3">
          <Col lg={6}><Card title="Words that signal trouble" sub="Much more common in unhappy reviews than happy ones"><div className="d-flex flex-wrap">{x.distinctiveNegative.map((t) => <span key={t.word} className="chip" title={`${t.lift}× more common in unhappy reviews`}><b>{t.word}</b> <span className="rp-sub">{t.lift}×</span></span>)}</div>
            <Source>Frequency shows what people mention - not why. Use it as a prompt to look at specific products.</Source></Card></Col>
          <Col lg={6}><Card title="Verified buyers vs others">
            <div className="table-wrap"><table className="rp-table"><thead><tr><th>Group</th><th className="num">Reviews</th><th className="num">Avg rating</th><th className="num">Helpful votes / review</th></tr></thead><tbody>{x.verified.map((v) => <tr key={v.group}><td>{title(v.group)}</td><td className="num">{num(v.reviews)}</td><td className="num">{v.meanRating}</td><td className="num">{v.helpfulPerReview}</td></tr>)}</tbody></table></div>
            <div className="fw-semibold mt-3 mb-1">Longer reviews are found more helpful</div>
            <Columns data={x.reviewLength} x="bucket" bars={[{ key: 'helpfulPerReview', name: 'Helpful votes per review', color: COLORS.accent }]} h={170} fmt={(v) => v.toFixed(2)} /></Card></Col>
        </Row>
        <Row className="g-3">
          <Col lg={6}><Card title="Brands with the most reviews"><RankBars data={x.topBrandsByReviews.map((b) => ({ label: b.brand.slice(0, 22), value: b.reviews }))} /></Card></Col>
          <Col lg={6}><Card title="Best-rated brands" sub="Brands with at least 1,000 reviews"><RankBars data={x.bestRatedBrands.map((b) => ({ label: b.brand.slice(0, 22), value: Math.round(b.meanRating * 100) / 100 }))} color={COLORS.accent} fmt={(v) => v.toFixed(2)} /></Card></Col>
        </Row>
        <Source>{x.source} Pipeline: {x.jobs.length} MapReduce jobs; slowest took {Math.max(...x.jobs.map((j) => j.elapsedSeconds || 0))} s on one laptop.</Source>
      </>)}</Async>
  );
}

function Demand() {
  const d = useApi('/api/insights/demand'); const [fam, setFam] = useState('');
  return (
    <Async state={d} rows={5}>{(x) => {
      const f = fam || x.topFamilies[0]; const series = x.monthlyByFamily[f] || [];
      return (
        <>
          <Banner kind="sim" icon="bi-database">Based on <b>3,000,888 daily sales records</b> from a real grocery chain (Corporación Favorita, Ecuador, 2013-2017) processed with Hadoop. Useful for understanding how grocery demand behaves.</Banner>
          <Row className="g-3 mb-3">
            <Col lg={7}><Card title="Monthly sales by category" actions={<select className="form-select form-select-sm" style={{ width: 'auto' }} value={f} onChange={(e) => setFam(e.target.value)}>{x.topFamilies.map((k) => <option key={k} value={k}>{title(k)}</option>)}</select>}>
              <Lines data={series} x="month" lines={[{ key: 'units', name: title(f) }]} h={250} xfmt={(v) => (v.endsWith('-01') ? v.slice(0, 4) : '')} /></Card></Col>
            <Col lg={5}><Card title="Weekday pattern" sub="100 = an average day">
              <Columns data={(x.weekdayProfile.find((p) => p.family === f) || x.weekdayProfile[0]).days} x="day" bars={[{ key: 'index', name: 'Index', color: COLORS.primary }]} h={220} /></Card></Col>
          </Row>
          <Card title="Items on promotion sell more - but be careful" sub="Average daily units per store, promoted vs not promoted">
            <RankBars data={x.promoLift.slice(0, 10).map((p) => ({ label: title(p.family).slice(0, 22), value: p.ratio }))} fmt={(v) => v + '×'} color={COLORS.accent} />
            <Banner kind="warn" icon="bi-exclamation-triangle">{x.caution}</Banner></Card>
        </>);
    }}</Async>
  );
}

function Waste() {
  const d = useApi('/api/insights/waste');
  return (
    <Async state={d} rows={4}>{(x) => (
      <>
        <Banner kind="sim">Simulated operations data - shows how the waste report works. Computed in Hadoop with a map-side join of stock adjustments and the product table.</Banner>
        <Card title="Units thrown away after expiry, by category" actions={<SimBadge />}>
          {x.rows.length === 0 ? <Empty title="No waste records" /> : <RankBars data={x.rows.slice(0, 12).map((r) => ({ label: title(r.family), value: r.writtenOffUnits }))} color={COLORS.danger} />}</Card>
      </>)}</Async>
  );
}

function Lookup() {
  const [q, setQ] = useState(''); const [res, setRes] = useState([]); const [sel, setSel] = useState(null);
  const go = async (e) => { e.preventDefault(); setSel(null); setRes(await api.get('/api/insights/reviews/search', { q })); };
  const open = async (asin) => setSel(await api.get(`/api/insights/reviews/product/${asin}`));
  return (
    <Card title="Look up a product's reviews" sub="Search the 603,000 products in the review dataset">
      <form onSubmit={go} className="d-flex gap-2 mb-3"><input className="form-control" placeholder="e.g. green tea, basmati rice..." value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn btn-primary">Search</button></form>
      {!sel && res.map((r) => <div key={r.parent_asin} className="d-flex justify-content-between py-2 border-bottom" role="button" onClick={() => open(r.parent_asin)}><div className="truncate">{r.title}<div className="rp-sub">{r.store}</div></div><div className="text-nowrap">★ {r.average_rating} <span className="rp-sub">({num(r.rating_number)})</span></div></div>)}
      {sel && <div><button className="btn btn-link p-0 mb-2" onClick={() => setSel(null)}>← back</button><h5>{sel.meta.title}</h5><div className="rp-sub mb-2">{sel.meta.store} · ★ {sel.meta.average_rating} · {num(sel.stats?.reviews)} reviews in our data</div>
        {sel.stats && <Columns data={sel.stats.hist.map((v, i) => ({ stars: `${i + 1}★`, reviews: v }))} x="stars" bars={[{ key: 'reviews', name: 'Reviews', color: COLORS.primary }]} h={170} />}
        {sel.topReviews.map((r, i) => <div key={i} className="border-top py-2"><b>{r.title}</b> <span className="rp-sub">★ {r.rating}</span><div className="rp-sub">{(r.text || '').slice(0, 240)}</div></div>)}</div>}
    </Card>
  );
}
