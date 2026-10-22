import React, { useState } from 'react';
import { Row, Col } from 'react-bootstrap';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Card, Kpi, Async, Pill, Empty } from '../components/UI.jsx';
import { Trend, RankBars, Columns } from '../components/Charts.jsx';
import { rupees, rupeesShort, num, dshort, title } from '../util.js';

export default function Sales() {
  const { sp, storeId, user, can } = useAuth(); const [days, setDays] = useState(90); const [group, setGroup] = useState('day'); const [by, setBy] = useState('revenue'); const showCost = user.role !== 'staff';
  const sum = useApi('/api/sales/summary', { ...sp, days, groupBy: group === 'family' ? 'day' : group }, [storeId, days, group]);
  const fam = useApi('/api/sales/summary', { ...sp, days, groupBy: 'family' }, [storeId, days]);
  const top = useApi('/api/sales/top', { ...sp, days, by, limit: 10 }, [storeId, days, by]); const wd = useApi('/api/sales/weekday', sp, [storeId]);
  const xf = (k) => (group === 'day' ? dshort(k) : k);
  return (
    <>
      <PageHeader title="Sales" sub="What sold, when, and what makes you money." actions={<select className="form-select" value={days} onChange={(e) => setDays(+e.target.value)}><option value={28}>Last 4 weeks</option><option value={90}>Last 3 months</option><option value={180}>Last 6 months</option><option value={365}>Last year</option></select>} />
      <Async state={sum} rows={3}>{(s) => (
        <Row className="g-3 mb-3">
          <Col xs={6} md={3}><Kpi label="Items sold" value={num(s.totals.units)} icon="bi-bag" /></Col>
          <Col xs={6} md={3}><Kpi label="Sales value" value={rupeesShort(s.totals.revenuePaise)} icon="bi-cash-stack" /></Col>
          <Col xs={6} md={3}><Kpi label="Average per day" value={num(s.totals.units / days)} icon="bi-speedometer2" hint="items" /></Col>
          <Col xs={6} md={3}><Kpi label="Period" value={`${dshort(s.from)} - ${dshort(s.to)}`} icon="bi-calendar3" /></Col>
        </Row>)}</Async>
      <Row className="g-3 mb-3">
        <Col lg={8}><Card title="Sales over time" actions={<div className="btn-group btn-group-sm">{[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']].map(([k, l]) => <button key={k} className={`btn ${group === k ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setGroup(k)}>{l}</button>)}</div>}>
          <Async state={sum} rows={4}>{(s) => { const r = s.rows.map((x) => ({ key: x.key, units: x.units })); const half = Math.floor(r.length / 2); const a = r.slice(0, half).reduce((t, x) => t + x.units, 0), b = r.slice(half).reduce((t, x) => t + x.units, 0);
            return <><div className="rp-takeaway">{r.length > 3 ? `The second half of this period sold ${Math.abs(Math.round(((b - a) / Math.max(a, 1)) * 100))}% ${b >= a ? 'more' : 'less'} than the first half.` : 'Not enough data for a trend.'}</div><Trend data={r} x="key" y="units" name="Items sold" xfmt={xf} /></>; }}</Async></Card></Col>
        <Col lg={4}><Card title="Busiest days of the week" sub="Average items sold per day"><Async state={wd} rows={4}>{(w) => { const m = [...w.rows].sort((a, b) => b.avgUnits - a.avgUnits)[0]; return <><div className="rp-takeaway">{m ? `${m.day} is your busiest day.` : ''}</div><Columns data={w.rows} x="day" bars={[{ key: 'avgUnits', name: 'Avg items' }]} h={210} /></>; }}</Async></Card></Col>
      </Row>
      <Row className="g-3 mb-3">
        <Col lg={6}><Card title="Best sellers" actions={<div className="btn-group btn-group-sm">{[['units', 'Items'], ['revenue', 'Sales'], ...(showCost ? [['profit', 'Profit']] : [])].map(([k, l]) => <button key={k} className={`btn ${by === k ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setBy(k)}>{l}</button>)}</div>}>
          <Async state={top} rows={5}>{(t) => <RankBars data={t.rows.map((r) => ({ label: r.name.length > 22 ? r.name.slice(0, 21) + '…' : r.name, value: by === 'units' ? r.units : by === 'revenue' ? r.revenuePaise / 100 : r.grossProfitPaise / 100 }))} fmt={by === 'units' ? num : (v) => '₹' + num(v)} />}</Async></Card></Col>
        <Col lg={6}><Card title="By category" sub={showCost ? 'Sales value and profit' : 'Sales value'} body={false}><Async state={fam} rows={5}>{(f) => (
          <div className="table-wrap"><table className="rp-table"><thead><tr><th>Category</th><th className="num">Items</th><th className="num">Sales</th>{showCost && <th className="num">Profit</th>}</tr></thead><tbody>
            {f.rows.slice(0, 12).map((r) => <tr key={r.key}><td>{title(r.key)}</td><td className="num">{num(r.units)}</td><td className="num">{rupeesShort(r.revenuePaise)}</td>{showCost && <td className="num">{rupeesShort(r.grossProfitPaise)} <span className="rp-sub">({Math.round((r.grossProfitPaise / r.revenuePaise) * 100)}%)</span></td>}</tr>)}</tbody></table></div>)}</Async></Card></Col>
      </Row>
      <QuickEntry />
    </>
  );
}

function QuickEntry() {
  const { stores, storeId, can } = useAuth(); const toast = useToast(); const store = storeId !== 'all' ? storeId : stores[0]?._id; const [q, setQ] = useState(''); const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [lines, setLines] = useState({});
  const p = useApi(q.length >= 2 ? '/api/catalog/products' : null, { q, limit: 6 }, [q]);
  const save = async () => { try { const r = await api.post('/api/sales/quick-entry', { storeId: store, date, lines: Object.entries(lines).filter(([, v]) => +v > 0).map(([sku, v]) => ({ sku, qty: parseInt(v) })) }); toast.success(`Added ${r.saved} items to ${date}.`); setLines({}); } catch (e) { toast.error(e.message); } };
  return (
    <Card title="Quick sale entry" sub="No billing software? Add what you sold. Items are added to the day's total.">
      <div className="row g-2 mb-2"><div className="col-md-4"><input className="form-control" placeholder="Search item..." value={q} onChange={(e) => setQ(e.target.value)} /></div><div className="col-md-3"><input type="date" className="form-control" value={date} onChange={(e) => setDate(e.target.value)} /></div></div>
      {(p.data?.items || []).map((x) => <div key={x.sku} className="d-flex align-items-center gap-2 py-1"><div className="flex-grow-1 truncate">{x.name}</div><input type="number" min="0" placeholder="qty" className="form-control form-control-sm" style={{ width: 90 }} value={lines[x.sku] || ''} onChange={(e) => setLines({ ...lines, [x.sku]: e.target.value })} /></div>)}
      <button className="btn btn-primary mt-2" disabled={!Object.values(lines).some((v) => +v > 0)} onClick={save}>Save sales</button>
    </Card>
  );
}
