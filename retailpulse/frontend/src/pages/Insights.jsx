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
        <Tab eventKey="research" title="Retail research"><Research /></Tab>
        <Tab eventKey="waste" title="Waste (demo)"><Waste /></Tab>
        <Tab eventKey="sources" title="Data sources"><Sources /></Tab>
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
          <Col lg={5}><Card title="Do pricier products get better ratings?" sub="Average rating by price band (US$) - axis starts at 3.5">
            <Columns data={x.priceBands.filter((b) => b.band !== 'no_price').map((b) => ({ band: b.band === '<5' ? 'under $5' : b.band, rating: b.meanRating }))} x="band" bars={[{ key: 'rating', name: 'Average rating', color: COLORS.primary }]} h={220} fmt={(v) => v.toFixed(2)} domain={[3.5, 4.5]} />
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
          <Col lg={6}><Card title="Best-rated brands" sub="Brands with at least 1,000 reviews - axis starts at 4.0"><RankBars data={x.bestRatedBrands.map((b) => ({ label: b.brand.slice(0, 22), value: Math.round(b.meanRating * 100) / 100 }))} color={COLORS.accent} fmt={(v) => v.toFixed(2)} domain={[4, 5]} /></Card></Col>
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


const fmtM = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + ' M' : n >= 1e3 ? (n / 1e3).toFixed(0) + ' k' : String(n));

function Heat({ grid }) {
  const max = Math.max(...grid.flat()); const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '38px repeat(24, minmax(22px, 1fr))', gap: 2, minWidth: 640, fontSize: 11 }}>
        <div />{Array.from({ length: 24 }, (_, h) => <div key={h} className="text-center rp-sub">{h % 3 === 0 ? h : ''}</div>)}
        {grid.map((row, d) => (<React.Fragment key={d}><div className="rp-sub align-self-center">{days[d]}</div>{row.map((v, h) => <div key={h} title={`${days[d]} ${h}:00 - ${num(v)} orders`} style={{ height: 24, borderRadius: 4, background: `rgba(15,118,110,${0.08 + 0.92 * (v / max)})` }} />)}</React.Fragment>))}
      </div>
      <div className="rp-sub mt-2">Darker = more orders. Hours are 0-23 (24-hour clock).</div>
    </div>
  );
}

function Research() {
  const d = useApi('/api/insights/external');
  return (
    <Async state={d} rows={6}>{(x) => {
      const food = x.demandClasses.find((c) => c.dept === 'FOODS'); const timeTop = x.timing.heat.flat().indexOf(Math.max(...x.timing.heat.flat()));
      return (
        <>
          <Banner kind="sim" icon="bi-database">Findings from <b>six real retail datasets</b> processed with Hadoop MapReduce (Instacart 32.4 M basket lines, Dunnhumby 2.6 M transactions, Online Retail II 1.07 M bill lines, M5 Walmart 46.8 M daily sales points, Real Canadian Superstore price scrapes) plus one synthetic waste reference. See the <b>Data sources</b> tab for licences. These show how grocery shoppers and demand behave in general - they are not your shop's numbers.</Banner>

          <Row className="g-3 mb-3">
            <Col lg={7}><Card title="Products bought together" sub={`Out of ${fmtM(x.priorOrders)} Instacart orders. Lift = how many times more often than chance (1× = no link).`}>
              <div className="rp-takeaway">Bananas and avocados are the most common pair; the strongest links are between product variants.</div>
              <div className="table-wrap"><table className="rp-table"><thead><tr><th>Pair</th><th className="num">Orders</th><th className="num">Lift</th><th className="num">If A, then B</th></tr></thead><tbody>
                {x.baskets.byCount.slice(0, 7).map((p, i) => <tr key={i}><td className="truncate" style={{ maxWidth: 380 }}>{p.a} <b>+</b> {p.b}</td><td className="num">{num(p.count)}</td><td className="num">{p.lift}×</td><td className="num">{p.confidenceAtoB}%</td></tr>)}</tbody></table></div>
              <div className="fw-semibold mt-3 mb-1">Strongest links (at least 800 orders)</div>
              <div className="table-wrap"><table className="rp-table"><tbody>{x.baskets.byLift.slice(0, 6).map((p, i) => <tr key={i}><td className="truncate" style={{ maxWidth: 380 }}>{p.a} <b>+</b> {p.b}</td><td className="num">{num(p.count)}</td><td className="num">{p.lift}×</td></tr>)}</tbody></table></div>
              <div className="rp-sub mt-2">Use: place linked items near each other and avoid stocking one without the other. Computed by a 3-job Hadoop chain (item support → baskets of frequent items → pair counts).</div></Card></Col>
            <Col lg={5}><Card title="How often do customers re-buy?" sub="Share of purchased items that were bought before (reorder rate)">
              <RankBars data={x.reorder.departments.slice(0, 10).map((r) => ({ label: title(r.department), value: r.reorderRate }))} fmt={(v) => v + '%'} domain={[0, 100]} h={300} />
              <div className="rp-sub">Dairy, beverages and produce are re-bought most - the best candidates for automatic reorder suggestions.</div></Card></Col>
          </Row>

          <Row className="g-3 mb-3">
            <Col lg={7}><Card title="When do people shop?" sub="3.4 M Instacart orders by weekday and hour"><Heat grid={x.timing.heat} /></Card></Col>
            <Col lg={5}><Card title="How long between shopping trips?" sub="Days since the previous order"><Columns data={x.timing.recency} x="days" bars={[{ key: 'orders', name: 'Orders', color: COLORS.accent }]} h={230} fmt={fmtM} />
              <div className="rp-sub">Peaks at 7 and 30+ days: weekly and monthly shoppers.</div></Card></Col>
          </Row>

          <Row className="g-3 mb-3">
            <Col lg={6}><Card title="How deep are loyalty discounts?" sub="Dunnhumby, 2,500 households over 2 years: loyalty-card discount as a share of pre-discount value">
              <RankBars data={x.discounts.departments.slice(0, 8).map((r) => ({ label: title(r.department), value: r.loyaltyDiscountPct }))} fmt={(v) => v + '%'} color={COLORS.purple} />
              <div className="rp-sub">Store brands: {x.discounts.brandType.find((b) => b.brandType === 'Private')?.loyaltyDiscountPct}% vs national brands: {x.discounts.brandType.find((b) => b.brandType === 'National')?.loyaltyDiscountPct}%. Discounts shown are as recorded in the data; sales values may already be net of discount.</div></Card></Col>
            <Col lg={6}><Card title="How big is a shopping basket?" sub="Number of baskets and average spend by basket size (items)"><Columns data={x.discounts.basketSizes} x="size" bars={[{ key: 'baskets', name: 'Baskets', color: COLORS.primary }]} h={230} fmt={fmtM} />
              <div className="rp-sub">Average spend rises from ${x.discounts.basketSizes[0]?.avgSpend} (1 item) to ${x.discounts.basketSizes.at(-1)?.avgSpend} (41+ items).</div></Card></Col>
          </Row>

          <Row className="g-3 mb-3">
            <Col lg={7}><Card title="Returns and cancellations" sub="Online Retail II (UK wholesaler, 53,628 invoices): units returned as % of units sold, by month">
              <Lines data={x.returns.monthly} x="month" lines={[{ key: 'returnRatePct', name: 'Returned %', color: COLORS.danger }]} h={230} fmt={(v) => v + '%'} xfmt={(v) => v.slice(2)} />
              <div className="rp-sub">Returns are the "waste" of a billing system: negative quantities that must be netted, never ignored.</div></Card></Col>
            <Col lg={5}><Card title="Most-returned products"><div className="table-wrap"><table className="rp-table"><tbody>{x.returns.topReturned.slice(0, 6).map((p) => <tr key={p.code}><td className="truncate" style={{ maxWidth: 220 }} title={p.description}>{p.description}</td><td className="num">{p.ratePct}%</td></tr>)}</tbody></table></div>
              <div className="rp-sub mt-2">100% rows are real "order then cancel" events in the data - exactly the kind of anomaly RetailPulse's import flags instead of hiding.</div></Card></Col>
          </Row>

          <Row className="g-3 mb-3">
            <Col lg={6}><Card title="How predictable is item demand?" sub="M5 (Walmart): 30,490 item-store series × 1,913 days, classified by Hadoop">
              <div className="rp-takeaway">Only {Math.round((food.smooth / food.series) * 100)}% of food series sell steadily; {Math.round((food.intermittent / food.series) * 100)}% are intermittent (many zero days).</div>
              <Columns data={x.demandClasses} x="dept" bars={[{ key: 'smooth', name: 'Smooth', color: COLORS.ok }, { key: 'erratic', name: 'Erratic', color: COLORS.accent }, { key: 'intermittent', name: 'Intermittent', color: COLORS.slate }, { key: 'lumpy', name: 'Lumpy', color: COLORS.danger }]} stacked h={230} fmt={fmtM} />
              <div className="rp-sub">{x.demandClasses.map((c) => `${title(c.dept)}: ${c.zeroDaysPct}% of days had zero sales`).join(' · ')}. This is why RetailPulse tests several methods per item instead of one formula.</div></Card></Col>
            <Col lg={6}><Card title="Price and promotion drift" sub="Real Canadian Superstore, 12 monthly scrapes of ~10,000 products">
              <Lines data={x.priceDrift.months} x="month" lines={[{ key: 'dealSharePct', name: 'Products on deal %', color: COLORS.accent }]} h={170} fmt={(v) => v + '%'} xfmt={(v) => v.slice(5)} />
              <div className="table-wrap"><table className="rp-table"><tbody>{x.priceDrift.biggestSwings.slice(0, 4).map((p) => <tr key={p.id}><td className="truncate" style={{ maxWidth: 230 }} title={p.title}>{p.title}</td><td className="num">${p.min} → ${p.max}</td></tr>)}</tbody></table></div>
              <div className="rp-sub mt-1">Some swings reflect a change of selling unit (per kg vs each), not only price.</div></Card></Col>
          </Row>

          <Card title="Waste in a synthetic supermarket dataset (reference only)" actions={<SimBadge />} sub="100 products × 4 stores, batch-level expiry. Waste = units thrown away as % of units sold.">
            <RankBars data={x.waste.slice(0, 8).map((w) => ({ label: title(w.category), value: w.wastePctOfSold }))} fmt={(v) => v + '%'} color={COLORS.danger} />
            <div className="rp-sub">This dataset's waste rates (under 1.5% in every category) are much lower than the 4-5% in RetailPulse's demo shops. Real waste depends on the shop, so the demo waste rate is an adjustable assumption - not a finding.</div></Card>
        </>);
    }}</Async>
  );
}

function Sources() {
  const d = useApi('/api/insights/datasets');
  return (
    <Card title="Where the data comes from" sub="Every dataset used or reviewed, with licence and how it is used. Synthetic sources are marked." body={false}>
      <Async state={d} rows={5}>{(list) => (
        <div className="table-wrap"><table className="rp-table"><thead><tr><th>Dataset</th><th className="num">Rows</th><th>Role</th><th>Licence</th><th>Used in</th></tr></thead><tbody>
          {list.map((s) => <tr key={s.key}><td style={{ minWidth: 220 }}><div className="fw-semibold">{s.name}</div><div className="rp-sub">{s.size} · {s.format}</div>{s.synthetic && <SimBadge />}</td><td className="num">{num(s.rows)}</td><td className="rp-sub" style={{ minWidth: 260 }}>{s.role}</td><td className="rp-sub" style={{ minWidth: 180 }}>{s.license}</td>
            <td>{(s.used_in || []).map((u) => <Pill key={u} kind="info">{u}</Pill>)}{!(s.used_in || []).length && <Pill kind="muted">not used</Pill>}</td></tr>)}</tbody></table></div>)}</Async>
    </Card>
  );
}
