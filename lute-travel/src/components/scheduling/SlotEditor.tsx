import React, { useState, useEffect } from 'react'
import { DailyTourSlot, PRODUCTS, LANGUAGES } from '../../types'
import { useStaffStore } from '../../store/staffStore'
import { calcPL } from '../../store/scheduleStore'
import ProfitBadge from './ProfitBadge'

interface Props {
  slot: DailyTourSlot
  onSave: (s: DailyTourSlot) => void
  onDelete: (id: string) => void
  onCancel: () => void
}

export default function SlotEditor({ slot, onSave, onDelete, onCancel }: Props) {
  const { guides, drivers } = useStaffStore()
  const [form, setForm] = useState<DailyTourSlot>({ ...slot })

  useEffect(() => { setForm({ ...slot }) }, [slot])

  function set(field: keyof DailyTourSlot, val: unknown) {
    setForm((f) => {
      const next = { ...f, [field]: val }
      // Auto-calc insurance if pax changes
      if (field === 'adults' || field === 'infants' || field === 'pax') {
        if (field === 'adults' || field === 'infants') {
          const adults = field === 'adults' ? (val as number) : f.adults
          const infants = field === 'infants' ? (val as number) : f.infants
          next.pax = adults + infants
          next.insuranceCost = adults * 21
        }
      }
      next.profitLoss = calcPL(next)
      return next
    })
  }

  // Incompatibility check
  const guide = guides.find((g) => g.id === form.guideId)
  const incompatible = guide && form.driverId && guide.incompatibleDrivers?.includes(form.driverId)
  const largeGroup = form.pax >= 30

  return (
    <div className="bg-white border border-blue-200 rounded-xl shadow-sm p-5">
      {/* Warnings */}
      {incompatible && (
        <div className="mb-3 px-3 py-2 bg-yellow-50 border border-yellow-300 rounded text-sm text-yellow-800 flex items-center gap-2">
          ⚠️ 導遊 <strong>{guide?.name}</strong> 與此司機不相容，請重新確認配對
        </div>
      )}
      {largeGroup && (
        <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700 flex items-center gap-2">
          ℹ️ 人數 ≥ 30，建議考慮安排兩台車
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {/* Date + Product */}
        <F label="出發日期">
          <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={inp} />
        </F>
        <F label="商品">
          <select value={form.productCode} onChange={(e) => set('productCode', e.target.value)} className={inp}>
            {PRODUCTS.map((p) => <option key={p}>{p}</option>)}
          </select>
        </F>
        <F label="語種">
          <select value={form.language} onChange={(e) => set('language', e.target.value)} className={inp}>
            {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
          </select>
        </F>

        {/* Pax */}
        <F label="成人">
          <input type="number" min={0} value={form.adults} onChange={(e) => set('adults', +e.target.value)} className={inp} />
        </F>
        <F label="嬰兒 (0-3)">
          <input type="number" min={0} value={form.infants} onChange={(e) => set('infants', +e.target.value)} className={inp} />
        </F>
        <F label="總人數（自動）">
          <input disabled value={form.pax} className={`${inp} bg-gray-50 text-gray-500`} />
        </F>

        {/* Staff */}
        <F label="導遊">
          <select value={form.guideId || ''} onChange={(e) => set('guideId', e.target.value || undefined)} className={`${inp} ${incompatible ? 'border-yellow-400' : ''}`}>
            <option value="">— 未指派 —</option>
            {guides.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.englishName})</option>)}
          </select>
        </F>
        <F label="司機">
          <select value={form.driverId || ''} onChange={(e) => set('driverId', e.target.value || undefined)} className={`${inp} ${incompatible ? 'border-yellow-400' : ''}`}>
            <option value="">— 未指派 —</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name} {d.licensePlate}</option>)}
          </select>
        </F>
        <F label="車輛備注">
          <input value={form.vehicleNote || ''} onChange={(e) => set('vehicleNote', e.target.value)} className={inp} placeholder="如：包車自備" />
        </F>

        {/* Fees */}
        <F label="平台收入">
          <input type="number" min={0} value={form.platformRevenue} onChange={(e) => set('platformRevenue', +e.target.value)} className={inp} />
        </F>
        <F label="現場收入">
          <input type="number" min={0} value={form.cashRevenue} onChange={(e) => set('cashRevenue', +e.target.value)} className={inp} />
        </F>
        <F label={`導費`}>
          <input type="number" min={0} value={form.guideFee} onChange={(e) => set('guideFee', +e.target.value)} className={inp} />
        </F>
        <F label="司機費">
          <input type="number" min={0} value={form.driverFee} onChange={(e) => set('driverFee', +e.target.value)} className={inp} />
        </F>
        <F label={`保險費 (成人×21)`}>
          <input type="number" min={0} value={form.insuranceCost} onChange={(e) => set('insuranceCost', +e.target.value)} className={inp} />
        </F>
        <F label="雜費">
          <input type="number" min={0} value={form.miscExpense} onChange={(e) => set('miscExpense', +e.target.value)} className={inp} />
        </F>

        {/* P&L */}
        <F label="損益（自動）">
          <div className={`${inp} bg-gray-50 flex items-center`}>
            <ProfitBadge value={form.profitLoss} />
          </div>
        </F>
      </div>

      <div className="flex justify-between items-center mt-4">
        <button
          onClick={() => { if (confirm('確定刪除此班次？')) onDelete(form.id) }}
          className="text-sm text-red-500 hover:text-red-700"
        >
          🗑 刪除班次
        </button>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">
            取消
          </button>
          <button onClick={() => onSave(form)} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 font-medium">
            儲存
          </button>
        </div>
      </div>
    </div>
  )
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inp = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
