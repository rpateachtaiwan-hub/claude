import React, { useState, useEffect, useCallback } from 'react'
import { v4 as uuid } from 'uuid'
import { useOrderStore } from '../../store/orderStore'
import { useStaffStore } from '../../store/staffStore'
import { useScheduleStore } from '../../store/scheduleStore'
import { Order, Passenger, PLATFORMS, LANGUAGES, PRODUCTS } from '../../types'
import { autoAssign } from '../../utils/autoAssign'

const EMPTY_PASSENGER = (): Omit<Passenger, 'id' | 'orderRef'> => ({
  sequenceNo: 1,
  passportName: '',
  dateOfBirth: '',
  passportNo: '',
  nationality: '',
  isRepresentative: false,
})

const EMPTY_ORDER = (): Omit<Order, 'id' | 'passengers'> => ({
  bookingRef: '',
  orderDate: new Date().toISOString().slice(0, 10),
  tourDate: '',
  productCode: PRODUCTS[0],
  totalPax: 1,
  adults: 1,
  infants: 0,
  platform: 'KLOOK',
  platformRevenue: 0,
  cashRevenue: 0,
  language: '英語',
  status: 'active',
  statusNote: '',
  meetingTime: '',
  representativeName: '',
  phone: '',
  email: '',
  dropOffLocation: '',
})

export default function OrderModal() {
  const { modalState, selectedOrder, prefillData, closeModal, addOrder, updateOrder } = useOrderStore()
  const { guides, drivers } = useStaffStore()
  const { slots } = useScheduleStore()
  const isOpen = modalState === 'add' || modalState === 'edit'
  const isEdit = modalState === 'edit'

  const [form, setForm] = useState<Omit<Order, 'id' | 'passengers'>>(EMPTY_ORDER())
  const [passengers, setPassengers] = useState<Array<Omit<Passenger, 'id' | 'orderRef'>>>([
    { ...EMPTY_PASSENGER(), isRepresentative: true }
  ])
  const [activeTab, setActiveTab] = useState<'order' | 'passengers'>('order')
  const [suggestion, setSuggestion] = useState<{ guideId: string; driverId: string; reason: string } | null>(null)

  // Run auto-assign when tourDate or language changes
  const runAutoAssign = useCallback((tourDate: string, language: string, currentGuideId?: string) => {
    if (!tourDate || currentGuideId) return // don't overwrite manual selection
    const result = autoAssign(tourDate, language, guides, drivers, slots)
    setSuggestion({
      guideId: result.guide?.id || '',
      driverId: result.driver?.id || '',
      reason: result.reason,
    })
  }, [guides, drivers, slots])

  useEffect(() => {
    if (!isOpen) return
    if (isEdit && selectedOrder) {
      const { id: _id, passengers: pax, ...rest } = selectedOrder
      setForm(rest)
      setPassengers(pax.map(({ id: __id, orderRef: _ref, ...p }) => p))
    } else if (prefillData) {
      const { id: _id, passengers: pax, ...rest } = prefillData
      setForm({ ...EMPTY_ORDER(), ...rest })
      if (pax && pax.length > 0)
        setPassengers(pax.map(({ id: __id, orderRef: _ref, ...p }) => p))
      else
        setPassengers([{ ...EMPTY_PASSENGER(), isRepresentative: true }])
    } else {
      setForm(EMPTY_ORDER())
      setPassengers([{ ...EMPTY_PASSENGER(), isRepresentative: true }])
    }
    setActiveTab('order')
  }, [isOpen, isEdit, selectedOrder])

  function set(field: string, val: unknown) {
    setForm((f) => ({ ...f, [field]: val }))
  }

  function addPax() {
    if (passengers.length >= 50) return
    setPassengers((p) => [...p, { ...EMPTY_PASSENGER(), sequenceNo: p.length + 1 }])
  }

  function removePax(i: number) {
    setPassengers((p) => {
      const next = p.filter((_, idx) => idx !== i).map((x, idx) => ({ ...x, sequenceNo: idx + 1 }))
      if (!next.some((x) => x.isRepresentative) && next.length) next[0].isRepresentative = true
      return next
    })
  }

  function setPax(i: number, field: string, val: unknown) {
    setPassengers((prev) =>
      prev.map((p, idx) => {
        if (idx !== i) return field === 'isRepresentative' ? { ...p, isRepresentative: false } : p
        return { ...p, [field]: val }
      })
    )
  }

  function setRepresentative(i: number) {
    setPassengers((prev) => prev.map((p, idx) => ({ ...p, isRepresentative: idx === i })))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const total = passengers.length
    const builtPax: Passenger[] = passengers.map((p, idx) => ({
      ...p,
      id: isEdit && selectedOrder ? (selectedOrder.passengers[idx]?.id || uuid()) : uuid(),
      orderRef: `${form.bookingRef}=${String(p.sequenceNo).padStart(2, '0')}/${total}`,
    }))
    const order: Order = {
      ...form,
      id: isEdit && selectedOrder ? selectedOrder.id : uuid(),
      totalPax: builtPax.length,
      adults: builtPax.filter((p) => {
        const age = calcAge(p.dateOfBirth, form.tourDate)
        return age === null || age >= 3
      }).length,
      infants: builtPax.filter((p) => {
        const age = calcAge(p.dateOfBirth, form.tourDate)
        return age !== null && age < 3
      }).length,
      passengers: builtPax,
    }
    isEdit ? updateOrder(order) : addOrder(order)
    closeModal()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? '編輯訂單' : '新增訂單'}
          </h2>
          <button onClick={closeModal} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6">
          {(['order', 'passengers'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2.5 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'order' ? 'A — 訂單基本資料' : `B — 旅客名單 (${passengers.length})`}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto scrollbar-thin">
          {/* Section A */}
          {activeTab === 'order' && (
            <div className="p-6 grid grid-cols-2 gap-4">
              {/* ── 導遊 / 司機指派 ── */}
              <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">導遊 / 司機指派</p>
                  {form.tourDate && (
                    <button type="button"
                      onClick={() => {
                        set('guideId', '')
                        set('driverId', '')
                        runAutoAssign(form.tourDate, form.language, '')
                      }}
                      className="text-xs text-blue-600 hover:underline"
                    >↺ 重新自動建議</button>
                  )}
                </div>

                {suggestion && !form.guideId && (
                  <div className="mb-3 flex items-center justify-between bg-white border border-blue-300 rounded-lg px-3 py-2 text-xs">
                    <span className="text-blue-700">
                      💡 {suggestion.reason}：
                      <strong>{guides.find(g => g.id === suggestion.guideId)?.name || '—'}</strong>（導遊）
                      {suggestion.driverId && <>、<strong>{drivers.find(d => d.id === suggestion.driverId)?.name}</strong>（司機）</>}
                    </span>
                    <button type="button"
                      onClick={() => { set('guideId', suggestion.guideId); set('driverId', suggestion.driverId); setSuggestion(null) }}
                      className="ml-3 px-2.5 py-1 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 shrink-0"
                    >採用</button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <Field label="指派導遊">
                    <select value={form.guideId || ''} onChange={(e) => set('guideId', e.target.value)} className={inp}>
                      <option value="">— 未指派 —</option>
                      {guides.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}{g.englishName ? ` (${g.englishName})` : ''}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="指派司機">
                    <select value={form.driverId || ''} onChange={(e) => set('driverId', e.target.value)} className={inp}>
                      <option value="">— 未指派 —</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>{d.name} · {d.vehicleType}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>

              <Field label="訂單編號 *">
                <input required value={form.bookingRef} onChange={(e) => set('bookingRef', e.target.value)}
                  className={inp} placeholder="AWB862233" />
              </Field>
              <Field label="進單日期">
                <input type="date" value={form.orderDate} onChange={(e) => set('orderDate', e.target.value)} className={inp} />
              </Field>
              <Field label="行程日期 *">
                <input required type="date" value={form.tourDate} onChange={(e) => {
                  set('tourDate', e.target.value)
                  runAutoAssign(e.target.value, form.language, form.guideId)
                }} className={inp} />
              </Field>
              <Field label="商品屬性">
                <select value={form.productCode} onChange={(e) => set('productCode', e.target.value)} className={inp}>
                  {PRODUCTS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="銷售平台">
                <select value={form.platform} onChange={(e) => set('platform', e.target.value)} className={inp}>
                  {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="語種">
                <select value={form.language} onChange={(e) => {
                  set('language', e.target.value)
                  runAutoAssign(form.tourDate, e.target.value, form.guideId)
                }} className={inp}>
                  {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
                </select>
              </Field>
              <Field label="平台收入 (NT$)">
                <input type="number" min={0} value={form.platformRevenue} onChange={(e) => set('platformRevenue', +e.target.value)} className={inp} />
              </Field>
              <Field label="現金收入 (NT$)">
                <input type="number" min={0} value={form.cashRevenue} onChange={(e) => set('cashRevenue', +e.target.value)} className={inp} />
              </Field>
              <Field label="狀態">
                <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inp}>
                  <option value="active">有效</option>
                  <option value="cancelled">取消</option>
                  <option value="pending">待確認</option>
                  <option value="completed">已完成</option>
                </select>
              </Field>
              <Field label="集合時間">
                <input type="time" value={form.meetingTime || ''} onChange={(e) => set('meetingTime', e.target.value)} className={inp} />
              </Field>
              <Field label="代表者姓名">
                <input value={form.representativeName || ''} onChange={(e) => set('representativeName', e.target.value)} className={inp} />
              </Field>
              <Field label="聯絡電話">
                <input value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} className={inp} />
              </Field>
              <Field label="聯絡信箱" wide>
                <input type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} className={inp} />
              </Field>
              <Field label="下車地點" wide>
                <input value={form.dropOffLocation || ''} onChange={(e) => set('dropOffLocation', e.target.value)} className={inp} />
              </Field>
              <Field label="備註 / 狀態變更" wide>
                <textarea value={form.statusNote || ''} onChange={(e) => set('statusNote', e.target.value)}
                  className={`${inp} resize-none`} rows={2} />
              </Field>
            </div>
          )}

          {/* Section B */}
          {activeTab === 'passengers' && (
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <th className="px-2 py-2 text-left w-8">#</th>
                      <th className="px-2 py-2 text-left">護照姓名 *</th>
                      <th className="px-2 py-2 text-left">出生日期</th>
                      <th className="px-2 py-2 text-left">護照號碼</th>
                      <th className="px-2 py-2 text-left">國籍</th>
                      <th className="px-2 py-2 text-center">代表人</th>
                      <th className="px-2 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {passengers.map((p, i) => (
                      <tr key={i} className={`border-b border-gray-100 ${p.isRepresentative ? 'bg-green-50' : ''}`}>
                        <td className="px-2 py-1.5 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-2 py-1.5">
                          <input
                            required
                            value={p.passportName}
                            onChange={(e) => setPax(i, 'passportName', e.target.value.toUpperCase())}
                            className={`${inpSm} uppercase`}
                            placeholder="FIRST LAST"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="date" value={p.dateOfBirth} onChange={(e) => setPax(i, 'dateOfBirth', e.target.value)} className={inpSm} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={p.passportNo}
                            onChange={(e) => setPax(i, 'passportNo', e.target.value.toUpperCase())}
                            className={`${inpSm} font-mono uppercase`}
                            placeholder="P0000000"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input value={p.nationality || ''} onChange={(e) => setPax(i, 'nationality', e.target.value)} className={inpSm} placeholder="Philippines" />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="radio"
                            name="representative"
                            checked={p.isRepresentative}
                            onChange={() => setRepresentative(i)}
                            className="accent-green-600"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => removePax(i)}
                            disabled={passengers.length === 1}
                            className="text-red-400 hover:text-red-600 disabled:opacity-30"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={addPax}
                disabled={passengers.length >= 50}
                className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 disabled:opacity-40"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                新增旅客 ({passengers.length}/50)
              </button>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
          <div className="flex gap-2">
            <button type="button" onClick={() => setActiveTab('order')}
              className={`px-3 py-1.5 text-xs rounded ${activeTab === 'order' ? 'text-gray-400' : 'text-blue-600 hover:underline'}`}>
              ← 訂單資料
            </button>
            <button type="button" onClick={() => setActiveTab('passengers')}
              className={`px-3 py-1.5 text-xs rounded ${activeTab === 'passengers' ? 'text-gray-400' : 'text-blue-600 hover:underline'}`}>
              旅客名單 →
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={closeModal}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">
              取消
            </button>
            <button
              onClick={handleSubmit as unknown as React.MouseEventHandler}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 font-medium"
            >
              {isEdit ? '儲存變更' : '新增訂單'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inp = 'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
const inpSm = 'w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400'

function calcAge(dob: string, tourDate: string) {
  if (!dob || !tourDate) return null
  try {
    const d = new Date(dob), t = new Date(tourDate)
    let age = t.getFullYear() - d.getFullYear()
    const m = t.getMonth() - d.getMonth()
    if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--
    return age
  } catch { return null }
}
