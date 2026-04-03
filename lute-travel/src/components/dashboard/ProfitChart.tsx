import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { DailyTourSlot } from '../../types'
import { format, getDaysInMonth } from 'date-fns'

interface Props { slots: DailyTourSlot[]; year: number; month: number }

export default function ProfitChart({ slots, year, month }: Props) {
  const days = getDaysInMonth(new Date(year, month - 1))
  const data = Array.from({ length: days }, (_, i) => {
    const day = i + 1
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const daySlots = slots.filter((s) => s.date === dateStr)
    const revenue = daySlots.reduce((s, x) => s + x.platformRevenue + x.cashRevenue, 0)
    const cost    = daySlots.reduce((s, x) => s + x.guideFee + x.driverFee + x.insuranceCost + x.miscExpense, 0)
    return {
      date: `${month}/${day}`,
      損益: revenue - cost,
      收入: revenue,
      成本: cost,
    }
  })

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={3} />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1000 ? `${v/1000}k` : v} />
        <Tooltip formatter={(v: unknown) => `NT$ ${Number(v).toLocaleString()}`} />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 2" />
        <Line type="monotone" dataKey="損益" stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        <Line type="monotone" dataKey="收入" stroke="#10b981" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
        <Line type="monotone" dataKey="成本" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
      </LineChart>
    </ResponsiveContainer>
  )
}
