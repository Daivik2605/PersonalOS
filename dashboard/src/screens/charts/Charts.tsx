// The Recharts charts. Loaded lazily (see ChartCard) so Home never pays for the library. Every chart is paired with a table in
// ChartCard, which is also what tests and screen readers use.
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatDuration } from '../../lib/time'
import { GREY } from './palette'

export type Unit = 'minutes' | 'count' | 'dollars'
export interface SeriesDef { key: string; label: string; color: string }
type Datum = Record<string, string | number | null | boolean | undefined>

const fmtValue = (unit: Unit, v: number) => (unit === 'minutes' ? formatDuration(v) : unit === 'dollars' ? `$${Math.round(v).toLocaleString('en-CA')}` : String(Math.round(v * 10) / 10))
const fmtTick = (unit: Unit) => (v: number) => (unit === 'minutes' ? `${Math.round((v / 60) * 10) / 10}h` : unit === 'dollars' ? `$${Math.round(v / 100) / 10}k` : String(v))
const tooltipStyle = { background: 'var(--tt-bg)', color: 'var(--tt-fg)', border: '1px solid var(--tt-border)', borderRadius: 8, fontSize: 12 }

function Frame({ children }: { children: React.ReactElement }) {
  return <div className="h-64 w-full text-slate-500 dark:text-slate-400"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
}
const axisProps = { tick: { fill: 'currentColor', fontSize: 11 }, stroke: 'currentColor', tickLine: false } as const
const grid = <CartesianGrid stroke="currentColor" strokeOpacity={0.15} vertical={false} />
const tooltip = (unit: Unit) => <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'currentColor', fillOpacity: 0.08 }} formatter={(v) => fmtValue(unit, Number(v))} />

/** Stacked bars; the rows named in `greyKeys` (days off) are drawn grey instead of in their series colour. */
export function StackedBars({ data, series, unit, greyKeys = [] }: { data: Datum[]; series: SeriesDef[]; unit: Unit; greyKeys?: string[] }) {
  return (
    <Frame>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        {grid}
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={14} />
        <YAxis {...axisProps} tickFormatter={fmtTick(unit)} width={42} />
        {tooltip(unit)}
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} isAnimationActive={false}>
            {data.map((d, i) => <Cell key={i} fill={greyKeys.includes(String(d.key)) ? GREY : s.color} />)}
          </Bar>
        ))}
      </BarChart>
    </Frame>
  )
}

/** Bars with an optional trailing-average line over them (counters per day). */
export function BarsLine({ data, bar, line, unit, color }: { data: Datum[]; bar: SeriesDef; line?: SeriesDef; unit: Unit; color: string }) {
  return (
    <Frame>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        {grid}
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={14} />
        <YAxis {...axisProps} tickFormatter={fmtTick(unit)} width={42} allowDecimals={false} />
        {tooltip(unit)}
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey={bar.key} name={bar.label} fill={color} isAnimationActive={false} />
        {line && <Line dataKey={line.key} name={line.label} stroke={line.color} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />}
      </ComposedChart>
    </Frame>
  )
}

/** Grouped bars (money in / out) with an optional line (net). */
export function GroupedBars({ data, bars, line, unit }: { data: Datum[]; bars: SeriesDef[]; line?: SeriesDef; unit: Unit }) {
  return (
    <Frame>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        {grid}
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={fmtTick(unit)} width={46} />
        {tooltip(unit)}
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {bars.map((b) => <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color} isAnimationActive={false} />)}
        {line && <Line dataKey={line.key} name={line.label} stroke={line.color} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />}
      </ComposedChart>
    </Frame>
  )
}

/** Several lines on one axis (balance: wellness, break, sleep, nap + reset). Gaps stay gaps. */
export function MultiLines({ data, series, unit }: { data: Datum[]; series: SeriesDef[]; unit: Unit }) {
  return (
    <Frame>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        {grid}
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={14} />
        <YAxis {...axisProps} tickFormatter={fmtTick(unit)} width={42} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtValue(unit, Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s) => <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} isAnimationActive={false} />)}
      </LineChart>
    </Frame>
  )
}
