import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { DailyTourSlot, PRODUCTS } from '../../types'

const COLORS = ['#2563eb','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1','#14b8a6']

interface Props { slots: DailyTourSlot[] }

export default function ProductChart({ slots }: Props) {
  const data = PRODUCTS
    .map((p, i) => ({
      name: p.length > 10 ? p.slice(0, 10) + '…' : p,
      fullName: p,
      人數: slots.filter((s) => s.productCode === p).reduce((s, x) => s + x.pax, 0),
      color: COLORS[i % COLORS.length],
    }))
    .filter((d) => d.人數 > 0)
    .sort((a, b) => b.人數 - a.人數)

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 16, bottom: 40, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip
          formatter={(v: unknown) => [`${v} 人`, '人數']}
          labelFormatter={(label: unknown, payload: readonly any[]) => (payload as any)?.[0]?.payload?.fullName || String(label)}
        />
        <Bar dataKey="人數" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
