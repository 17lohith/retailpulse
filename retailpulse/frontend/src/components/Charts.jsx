import React from 'react';
import { ResponsiveContainer, ComposedChart, AreaChart, Area, Line, LineChart, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, ReferenceLine } from 'recharts';
import { COLORS, SERIES, dshort, num } from '../util.js';

const axis = { fontSize: 12, fill: '#64748b' };
export const Tip = ({ active, payload, label, fmt = num, labelFmt }) => active && payload?.length ? (
  <div className="rp-tip"><b>{labelFmt ? labelFmt(label) : label}</b>{payload.filter((p) => p.value !== undefined && p.value !== null).map((p) => <div key={p.name} style={{ color: p.color || p.stroke }}>{p.name}: {Array.isArray(p.value) ? `${fmt(p.value[0])} - ${fmt(p.value[1])}` : fmt(p.value)}</div>)}</div>
) : null;

export const Trend = ({ data, x = 'date', y, name = 'Value', color = COLORS.primary, h = 240, fmt = num, xfmt = dshort, ticks }) => (
  <ResponsiveContainer width="100%" height={h}>
    <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <defs><linearGradient id={`g${y}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={color} stopOpacity={0.28} /><stop offset="95%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
      <CartesianGrid stroke={COLORS.grid} vertical={false} />
      <XAxis dataKey={x} tickFormatter={xfmt} tick={axis} tickLine={false} axisLine={false} minTickGap={28} />
      <YAxis tick={axis} tickLine={false} axisLine={false} width={62} tickFormatter={fmt} />
      <Tooltip content={<Tip fmt={fmt} labelFmt={xfmt} />} />
      <Area isAnimationActive={false} type="monotone" dataKey={y} name={name} stroke={color} strokeWidth={2.2} fill={`url(#g${y})`} dot={false} />
    </AreaChart>
  </ResponsiveContainer>
);

export const Lines = ({ data, x, lines, h = 280, fmt = num, xfmt = (v) => v }) => (
  <ResponsiveContainer width="100%" height={h}>
    <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid stroke={COLORS.grid} vertical={false} />
      <XAxis dataKey={x} tickFormatter={xfmt} tick={axis} tickLine={false} axisLine={false} minTickGap={32} />
      <YAxis tick={axis} tickLine={false} axisLine={false} width={64} tickFormatter={fmt} />
      <Tooltip content={<Tip fmt={fmt} labelFmt={xfmt} />} /><Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
      {lines.map((l, i) => <Line isAnimationActive={false} key={l.key} type="monotone" dataKey={l.key} name={l.name || l.key} stroke={l.color || SERIES[i % SERIES.length]} strokeWidth={2} dot={false} />)}
    </LineChart>
  </ResponsiveContainer>
);

/** Horizontal ranked bars: [{label, value}] */
export const RankBars = ({ data, value = 'value', label = 'label', color = COLORS.primary, fmt = num, h, colorBy, domain }) => (
  <ResponsiveContainer width="100%" height={h || Math.max(160, data.length * 30 + 20)}>
    <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
      <CartesianGrid stroke={COLORS.grid} horizontal={false} />
      <XAxis type="number" tick={axis} tickLine={false} axisLine={false} tickFormatter={fmt} domain={domain || [0, 'auto']} allowDataOverflow />
      <YAxis type="category" dataKey={label} width={130} tick={{ ...axis, fill: '#334155' }} tickLine={false} axisLine={false} interval={0} />
      <Tooltip content={<Tip fmt={fmt} />} cursor={{ fill: '#f1f5f9' }} />
      <Bar isAnimationActive={false} dataKey={value} name="Value" radius={[0, 6, 6, 0]} barSize={18}>{data.map((d, i) => <Cell key={i} fill={colorBy ? colorBy(d) : color} />)}</Bar>
    </BarChart>
  </ResponsiveContainer>
);
export const Columns = ({ data, x, bars, h = 240, fmt = num, stacked, domain }) => (
  <ResponsiveContainer width="100%" height={h}>
    <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid stroke={COLORS.grid} vertical={false} />
      <XAxis dataKey={x} tick={axis} tickLine={false} axisLine={false} interval={0} />
      <YAxis tick={axis} tickLine={false} axisLine={false} width={56} tickFormatter={fmt} domain={domain || [0, 'auto']} allowDataOverflow />
      <Tooltip content={<Tip fmt={fmt} />} cursor={{ fill: '#f1f5f9' }} />{bars.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
      {bars.map((b, i) => <Bar isAnimationActive={false} key={b.key} dataKey={b.key} name={b.name || b.key} fill={b.color || SERIES[i]} radius={[6, 6, 0, 0]} stackId={stacked ? 's' : undefined} />)}
    </BarChart>
  </ResponsiveContainer>
);

/** History + forecast with 80% range band */
export const ForecastChart = ({ history, forecast, h = 280 }) => {
  const data = [...history.map((d) => ({ date: d.date, actual: d.qty })), ...forecast.map((d) => ({ date: d.date, forecast: d.p50, range: [d.lo, d.hi] }))];
  const split = forecast[0]?.date;
  return (
    <ResponsiveContainer width="100%" height={h}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={COLORS.grid} vertical={false} />
        <XAxis dataKey="date" tickFormatter={dshort} tick={axis} tickLine={false} axisLine={false} minTickGap={30} />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={40} />
        <Tooltip content={<Tip labelFmt={dshort} />} /><Legend wrapperStyle={{ fontSize: 12 }} />
        <Area isAnimationActive={false} dataKey="range" name="Likely range (80%)" stroke="none" fill={COLORS.accent} fillOpacity={0.22} />
        <Line isAnimationActive={false} type="monotone" dataKey="actual" name="Sold" stroke={COLORS.primary} strokeWidth={2} dot={false} connectNulls />
        <Line isAnimationActive={false} type="monotone" dataKey="forecast" name="Expected" stroke={COLORS.accent} strokeWidth={2.4} strokeDasharray="5 4" dot={false} />
        {split && <ReferenceLine x={split} stroke="#94a3b8" strokeDasharray="3 3" label={{ value: 'Today', fontSize: 11, fill: '#64748b', position: 'insideTopRight' }} />}
      </ComposedChart>
    </ResponsiveContainer>
  );
};
