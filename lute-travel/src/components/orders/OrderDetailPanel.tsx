import React, { useState } from 'react'
import { useOrderStore } from '../../store/orderStore'
import { useStaffStore } from '../../store/staffStore'
import { STATUS_LABELS, STATUS_COLORS } from '../../types'
import { format, parseISO } from 'date-fns'
import DispatchModal from '../dispatch/DispatchModal'
import CustomerMessageModal from './CustomerMessageModal'

function fmtDate(d?: string) {
  if (!d) return '-'
  try { return format(parseISO(d), 'yyyy/MM/dd') } catch { return d }
}

function calcAge(dob: string, tourDate: string) {
  if (!dob || !tourDate) return null
  const d = new Date(dob), t = new Date(tourDate + 'T00:00:00')
  let age = t.getFullYear() - d.getFullYear()
  const m = t.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--
  return age
}

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-gray-400 min-w-[100px] shrink-0">{label}</span>
      <span className="font-medium text-gray-800 break-all">{value}</span>
    </div>
  )
}

export default function OrderDetailPanel() {
  const { modalState, selectedOrder, closeModal, openModal } = useOrderStore()
  const { guides, drivers } = useStaffStore()
  const [showDispatch, setShowDispatch] = useState(false)
  const [showMessage, setShowMessage] = useState(false)
  if (modalState !== 'detail' || !selectedOrder) return null
  const o = selectedOrder as import('../../types').Order
  const guide = guides.find(g => g.id === o.guideId)
  const driver = drivers.find(d => d.id === o.driverId)

  function copyRef() {
    navigator.clipboard.writeText(o.bookingRef)
  }

  function exportCSV() {
    const rows = [
      ['訂單編號', o.bookingRef],
      ['行程日期', o.tourDate],
      ['商品', o.productCode],
      ['平台', o.platform],
      ['語種', o.language],
      ['狀態', STATUS_LABELS[o.status]],
      ['代表人', o.representativeName || ''],
      ['電話', o.phone || ''],
      ['Email', o.email || ''],
      ['集合時間', o.meetingTime || ''],
      ['下車地點', o.dropOffLocation || ''],
      [],
      ['#', '護照姓名', '出生日期', '年齡', '護照號碼', '國籍', '代表人'],
      ...o.passengers.map((p) => {
        const age = calcAge(p.dateOfBirth, o.tourDate)
        return [p.sequenceNo, p.passportName, p.dateOfBirth, age ?? '', p.passportNo, p.nationality || '', p.isRepresentative ? '✓' : '']
      }),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${o.bookingRef}_旅客名單.csv`
    a.click()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-end z-40">
      <div className="bg-white h-full w-full max-w-2xl shadow-2xl flex flex-col animate-[slideIn_0.2s_ease]">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold text-gray-900 font-mono">{o.bookingRef}</h2>
              <button onClick={copyRef} className="text-gray-400 hover:text-blue-500" title="複製訂單號">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
            </div>
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[o.status]}`}>
              {STATUS_LABELS[o.status]}
            </span>
          </div>
          <button onClick={closeModal} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 space-y-6">
          {/* Tour info */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">行程資訊</h3>
            <div className="space-y-2">
              <Row label="行程日期" value={fmtDate(o.tourDate)} />
              <Row label="商品" value={o.productCode} />
              <Row label="集合時間" value={o.meetingTime} />
              <Row label="語種" value={o.language} />
              <Row label="平台" value={o.platform} />
              <Row label="下車地點" value={o.dropOffLocation} />
              <Row label="平台收入" value={o.platformRevenue ? `NT$ ${o.platformRevenue.toLocaleString()}` : undefined} />
              <Row label="現金收入" value={o.cashRevenue ? `NT$ ${o.cashRevenue.toLocaleString()}` : undefined} />
            </div>
          </section>

          {/* Contact */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">聯絡資訊</h3>
            <div className="space-y-2">
              <Row label="代表人" value={o.representativeName} />
              <Row label="電話" value={o.phone} />
              <Row label="Email" value={o.email ? <a href={`mailto:${o.email}`} className="text-blue-600 hover:underline">{o.email}</a> : undefined} />
            </div>
          </section>

          {/* Guide / Driver */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">導遊 / 司機</h3>
            <div className="space-y-2">
              <Row label="導遊" value={guide ? `${guide.name}${guide.englishName ? ` (${guide.englishName})` : ''}` : '未指派'} />
              <Row label="司機" value={driver ? `${driver.name} · ${driver.vehicleType}` : '未指派'} />
            </div>
            <div className="mt-3 flex gap-2 flex-wrap">
              {(guide || driver) && (
                <button
                  onClick={() => setShowDispatch(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
                >
                  📨 發送排班通知
                </button>
              )}
              <button
                onClick={() => setShowMessage(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-sm font-medium transition-colors"
              >
                💬 客服訊息
              </button>
            </div>
          </section>

          {o.statusNote && (
            <section>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">備註</h3>
              <p className="text-sm text-gray-700 bg-amber-50 border border-amber-200 rounded p-3">{o.statusNote}</p>
            </section>
          )}

          {/* Passengers */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
              旅客名單 ({o.passengers.length} 人 — 成人 {o.adults} + 嬰兒 {o.infants})
            </h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500">
                    <th className="px-3 py-2 text-left w-8">#</th>
                    <th className="px-3 py-2 text-left">護照姓名</th>
                    <th className="px-3 py-2 text-left">出生日期</th>
                    <th className="px-3 py-2 text-left">年齡</th>
                    <th className="px-3 py-2 text-left">護照號碼</th>
                    <th className="px-3 py-2 text-left">國籍</th>
                  </tr>
                </thead>
                <tbody>
                  {o.passengers.map((p) => {
                    const age = calcAge(p.dateOfBirth, o.tourDate)
                    return (
                      <tr key={p.id} className={`border-t border-gray-100 ${p.isRepresentative ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                        <td className="px-3 py-2 text-gray-400">{p.sequenceNo}</td>
                        <td className="px-3 py-2 font-medium font-mono">
                          {p.passportName}
                          {p.isRepresentative && <span className="ml-1 text-green-600 text-[10px] font-sans font-bold">代表</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{p.dateOfBirth || '-'}</td>
                        <td className="px-3 py-2">
                          {age !== null ? (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              age < 3 ? 'bg-pink-100 text-pink-700' :
                              age < 12 ? 'bg-amber-100 text-amber-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>{age}歲</span>
                          ) : '-'}
                        </td>
                        <td className="px-3 py-2 font-mono tracking-wider text-gray-700">{p.passportNo || '-'}</td>
                        <td className="px-3 py-2 text-gray-600">{p.nationality || '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex gap-2 justify-between">
          <button onClick={exportCSV} className="px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            匯出 CSV
          </button>
          <div className="flex gap-2">
            <button onClick={() => openModal('edit', o)}
              className="px-4 py-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-sm hover:bg-amber-100">
              編輯訂單
            </button>
            <button onClick={closeModal} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">
              關閉
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      {showDispatch && <DispatchModal order={o} onClose={() => setShowDispatch(false)} />}
      {showMessage && <CustomerMessageModal order={o} onClose={() => setShowMessage(false)} />}
    </div>
  )
}
