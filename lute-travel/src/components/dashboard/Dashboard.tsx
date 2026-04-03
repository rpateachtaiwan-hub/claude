import React, { useState } from 'react'
import { useScheduleStore } from '../../store/scheduleStore'
import { useStaffStore } from '../../store/staffStore'
import ProfitChart from './ProfitChart'
import ProductChart from './ProductChart'

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className={`rounded-xl p-4 border ${color}`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const { slots } = useScheduleStore()
  const { guides } = useStaffStore()

  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)

  const monthSlots = slots.filter((s) => {
    const d = new Date(s.date + 'T00:00:00')
    return d.getFullYear() === year && d.getMonth() + 1 === month
  })

  const totalRevenue  = monthSlots.reduce((s, x) => s + x.platformRevenue + x.cashRevenue, 0)
  const platformRev   = monthSlots.reduce((s, x) => s + x.platformRevenue, 0)
  const cashRev       = monthSlots.reduce((s, x) => s + x.cashRevenue, 0)
  const totalCost     = monthSlots.reduce((s, x) => s + x.guideFee + x.driverFee + x.insuranceCost + x.miscExpense, 0)
  const netPL         = totalRevenue - totalCost
  const totalPax      = monthSlots.reduce((s, x) => s + x.pax, 0)

  // Guide stats
  const guideStats = guides.map((g) => {
    const gs = monthSlots.filter((s) => s.guideId === g.id)
    return {
      name: g.name,
      englishName: g.englishName || '',
      trips: gs.length,
      pax: gs.reduce((s, x) => s + x.pax, 0),
      totalFee: gs.reduce((s, x) => s + x.guideFee, 0),
    }
  }).filter((x) => x.trips > 0).sort((a, b) => b.trips - a.trips)

  function changeMonth(delta: number) {
    let m = month + delta, y = year
    if (m > 12) { m = 1; y++ }
    if (m < 1)  { m = 12; y-- }
    setMonth(m); setYear(y)
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {/* Month selector */}
      <div className="flex items-center gap-3">
        <button onClick={() => changeMonth(-1)} className="p-1.5 rounded hover:bg-gray-100">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
        </button>
        <h2 className="text-base font-bold text-gray-900">{year} 年 {month} 月 — 損益統計</h2>
        <button onClick={() => changeMonth(1)} className="p-1.5 rounded hover:bg-gray-100">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
        </button>
        <span className="text-xs text-gray-400 ml-2">{monthSlots.length} 班次 · {totalPax} 人次</span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="平台收入"    value={`NT$ ${platformRev.toLocaleString()}`}  color="border-green-200 bg-green-50" />
        <StatCard label="現場收入"    value={`NT$ ${cashRev.toLocaleString()}`}       color="border-teal-200 bg-teal-50" />
        <StatCard label="總成本"      value={`NT$ ${totalCost.toLocaleString()}`}     color="border-amber-200 bg-amber-50" />
        <StatCard
          label="淨損益"
          value={`NT$ ${netPL.toLocaleString()}`}
          color={netPL >= 0 ? 'border-blue-200 bg-blue-50' : 'border-red-200 bg-red-50'}
          sub={netPL >= 0 ? '▲ 盈利' : '▼ 虧損'}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">每日損益折線圖</h3>
          <ProfitChart slots={monthSlots} year={year} month={month} />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">各商品當月人數</h3>
          <ProductChart slots={monthSlots} />
        </div>
      </div>

      {/* Guide stats */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">導遊出班統計</h3>
        </div>
        {guideStats.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">本月尚無出班記錄</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="px-4 py-2.5 text-left">導遊</th>
                <th className="px-4 py-2.5 text-center">出班次數</th>
                <th className="px-4 py-2.5 text-center">帶團人次</th>
                <th className="px-4 py-2.5 text-right">導費合計</th>
              </tr>
            </thead>
            <tbody>
              {guideStats.map((g) => (
                <tr key={g.name} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <span className="font-semibold">{g.name}</span>
                    {g.englishName && <span className="text-gray-400 ml-1.5 text-xs">{g.englishName}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center font-semibold text-blue-600">{g.trips}</td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{g.pax}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">NT$ {g.totalFee.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
