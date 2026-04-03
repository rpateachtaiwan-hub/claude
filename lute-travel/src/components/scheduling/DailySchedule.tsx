import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { v4 as uuid } from 'uuid'
import { format, parseISO } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { useScheduleStore } from '../../store/scheduleStore'
import { useStaffStore } from '../../store/staffStore'
import { DailyTourSlot, PRODUCTS, Guide, Driver } from '../../types'
import SlotEditor from './SlotEditor'
import ProfitBadge from './ProfitBadge'

function newSlot(date: string): DailyTourSlot {
  return {
    id: uuid(), date, productCode: PRODUCTS[6], language: '英語',
    pax: 1, adults: 1, infants: 0, guideFee: 0, driverFee: 0,
    insuranceCost: 21, platformRevenue: 0, cashRevenue: 0, miscExpense: 0,
  }
}

export default function DailySchedule() {
  const { date } = useParams<{ date: string }>()
  const nav = useNavigate()
  const { getSlotsForDate, addSlot, updateSlot, deleteSlot } = useScheduleStore()
  const { guides, drivers } = useStaffStore()
  const [editingId, setEditingId] = useState<string | null>(null)

  if (!date) return null

  const slots = getSlotsForDate(date)
  const dateLabel = (() => {
    try { return format(parseISO(date), 'yyyy年M月d日 (EEEE)', { locale: zhTW }) } catch { return date }
  })()

  const totalRevenue = slots.reduce((s, x) => s + x.platformRevenue + x.cashRevenue, 0)
  const totalCost    = slots.reduce((s, x) => s + x.guideFee + x.driverFee + x.insuranceCost + x.miscExpense, 0)
  const totalPL      = totalRevenue - totalCost

  function handleAdd() {
    const s = newSlot(date!)
    addSlot(s)
    setEditingId(s.id)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3">
        <button onClick={() => nav('/schedule')} className="text-gray-400 hover:text-gray-700">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div>
          <h2 className="text-base font-bold text-gray-900">{dateLabel}</h2>
          <p className="text-xs text-gray-400">{slots.length} 班次 · 總人數 {slots.reduce((s, x) => s + x.pax, 0)} 人</p>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="text-sm">
            <span className="text-gray-400">收入 </span>
            <span className="font-semibold">{totalRevenue.toLocaleString()}</span>
            <span className="text-gray-400 mx-2">成本 </span>
            <span className="font-semibold">{totalCost.toLocaleString()}</span>
            <span className="text-gray-400 mx-2">損益 </span>
            <ProfitBadge value={totalPL} />
          </div>
          <button
            onClick={handleAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
            新增班次
          </button>
        </div>
      </div>

      {/* Slots */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {slots.length === 0 && editingId === null && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">📅</p>
            <p>當日尚無班次，點擊「新增班次」建立</p>
          </div>
        )}
        {slots.map((slot) =>
          editingId === slot.id ? (
            <SlotEditor
              key={slot.id}
              slot={slot}
              onSave={(s) => { updateSlot(s); setEditingId(null) }}
              onDelete={(id) => { deleteSlot(id); setEditingId(null) }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <SlotRow
              key={slot.id}
              slot={slot}
              guides={guides}
              drivers={drivers}
              onEdit={() => setEditingId(slot.id)}
            />
          )
        )}
      </div>
    </div>
  )
}

function SlotRow({
  slot, guides, drivers, onEdit,
}: {
  slot: DailyTourSlot
  guides: Guide[]
  drivers: Driver[]
  onEdit: () => void
}) {
  const guide  = guides.find((g) => g.id === slot.guideId)
  const driver = drivers.find((d) => d.id === slot.driverId)
  const noGuide = !slot.guideId

  return (
    <div
      className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-4 hover:border-blue-300 cursor-pointer transition-colors"
      onClick={onEdit}
    >
      <div className="min-w-[140px]">
        <p className="text-sm font-bold text-gray-900">{slot.productCode}</p>
        <p className="text-xs text-gray-500 mt-0.5">{slot.language}</p>
      </div>
      <div className="text-sm text-gray-700 min-w-[60px] text-center">
        <span className="text-lg font-bold">{slot.pax}</span>
        <span className="text-xs text-gray-400 ml-1">人</span>
      </div>
      <div className="flex-1 flex items-center gap-3 text-sm">
        <span className={`flex items-center gap-1 ${noGuide ? 'text-amber-600 font-medium' : 'text-gray-700'}`}>
          {noGuide ? '⚠️' : '🧑‍🏫'} {guide ? `${guide.name}` : '未指派導遊'}
        </span>
        <span className="text-gray-400">|</span>
        <span className="text-gray-600 flex items-center gap-1">
          🚌 {driver ? `${driver.name} ${driver.licensePlate}` : '未指派司機'}
        </span>
      </div>
      <div className="text-sm text-right min-w-[100px]">
        <ProfitBadge value={slot.profitLoss} />
        <p className="text-xs text-gray-400 mt-0.5">NT$</p>
      </div>
      <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
    </div>
  )
}
