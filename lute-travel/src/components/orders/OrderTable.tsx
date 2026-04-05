import React, { useState } from 'react'
import { useOrderStore } from '../../store/orderStore'
import { useStaffStore } from '../../store/staffStore'
import { Order, STATUS_LABELS, STATUS_COLORS } from '../../types'
import { format, parseISO } from 'date-fns'

function fmtDate(d: string) {
  if (!d) return '-'
  try { return format(parseISO(d), 'yyyy/MM/dd') } catch { return d }
}

function calcAge(dob: string, tourDate: string) {
  if (!dob || !tourDate) return null
  try {
    const d = parseISO(dob), t = parseISO(tourDate)
    let age = t.getFullYear() - d.getFullYear()
    const m = t.getMonth() - d.getMonth()
    if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--
    return age
  } catch { return null }
}

export default function OrderTable({ orders }: { orders: Order[] }) {
  const { openModal, cancelOrder } = useOrderStore()
  const { guides, drivers } = useStaffStore()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [cancelTarget, setCancelTarget] = useState<{ id: string; ref: string } | null>(null)
  const [cancelNote, setCancelNote] = useState('')

  function toggleRow(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleCancel() {
    if (!cancelTarget) return
    cancelOrder(cancelTarget.id, cancelNote)
    setCancelTarget(null)
    setCancelNote('')
  }

  const totalPax = orders.reduce((s, o) => s + o.totalPax, 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="overflow-auto flex-1 scrollbar-thin">
        <table className="w-full text-sm border-collapse min-w-[1300px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wide">
              <th className="px-3 py-2.5 text-left w-8"></th>
              <th className="px-3 py-2.5 text-left">行程日期</th>
              <th className="px-3 py-2.5 text-left">訂單編號</th>
              <th className="px-3 py-2.5 text-left">商品</th>
              <th className="px-3 py-2.5 text-center">人數</th>
              <th className="px-3 py-2.5 text-left">平台</th>
              <th className="px-3 py-2.5 text-left">語種</th>
              <th className="px-3 py-2.5 text-left">狀態</th>
              <th className="px-3 py-2.5 text-left">導遊</th>
              <th className="px-3 py-2.5 text-left">司機</th>
              <th className="px-3 py-2.5 text-left">代表人</th>
              <th className="px-3 py-2.5 text-left">集合時間</th>
              <th className="px-3 py-2.5 text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr><td colSpan={13} className="py-16 text-center text-gray-400">暫無訂單資料</td></tr>
            )}
            {orders.map((o) => (
              <React.Fragment key={o.id}>
                <tr
                  className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors ${
                    o.status === 'cancelled' ? 'opacity-60' : ''
                  }`}
                >
                  {/* Expand toggle */}
                  <td className="px-3 py-2.5 text-center">
                    <button
                      onClick={() => toggleRow(o.id)}
                      className="w-5 h-5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 flex items-center justify-center transition-colors"
                      title={expanded.has(o.id) ? '收合' : '展開旅客'}
                    >
                      <svg className={`w-3 h-3 transition-transform ${expanded.has(o.id) ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-gray-800 whitespace-nowrap">{fmtDate(o.tourDate)}</td>
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                      {o.bookingRef}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-700 max-w-[180px] truncate" title={o.productCode}>{o.productCode}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="font-semibold">{o.totalPax}</span>
                    <span className="text-gray-400 text-xs ml-1">({o.adults}+{o.infants})</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <PlatformBadge platform={o.platform} />
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{o.language}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[o.status]}`}>
                      {STATUS_LABELS[o.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap text-xs">
                    {o.guideId ? (guides.find(g => g.id === o.guideId)?.name || '-') : <span className="text-gray-300">未指派</span>}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap text-xs">
                    {o.driverId ? (drivers.find(d => d.id === o.driverId)?.name || '-') : <span className="text-gray-300">未指派</span>}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{o.representativeName || '-'}</td>
                  <td className="px-3 py-2.5 text-gray-600 font-mono">{o.meetingTime || '-'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 justify-center">
                      <button
                        onClick={() => openModal('detail', o)}
                        className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                        title="查看詳情"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                      </button>
                      <button
                        onClick={() => openModal('edit', o)}
                        className="p-1 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50"
                        title="編輯"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                      {o.status !== 'cancelled' && (
                        <button
                          onClick={() => setCancelTarget({ id: o.id, ref: o.bookingRef })}
                          className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                          title="取消訂單"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Expanded passenger rows */}
                {expanded.has(o.id) && (
                  <tr className="bg-blue-50/40">
                    <td colSpan={13} className="px-6 py-3">
                      <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                        旅客名單 — {o.bookingRef} ({o.passengers.length} 人)
                      </div>
                      <table className="w-full text-xs bg-white rounded border border-gray-200 overflow-hidden">
                        <thead>
                          <tr className="bg-gray-50 text-gray-500">
                            <th className="px-3 py-1.5 text-left w-8">#</th>
                            <th className="px-3 py-1.5 text-left">護照姓名</th>
                            <th className="px-3 py-1.5 text-left">出生日期</th>
                            <th className="px-3 py-1.5 text-left">出遊年齡</th>
                            <th className="px-3 py-1.5 text-left">護照號碼</th>
                            <th className="px-3 py-1.5 text-left">國籍</th>
                            <th className="px-3 py-1.5 text-center">代表人</th>
                          </tr>
                        </thead>
                        <tbody>
                          {o.passengers.map((p) => {
                            const age = calcAge(p.dateOfBirth, o.tourDate)
                            return (
                              <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                                <td className="px-3 py-1.5 text-gray-400">{p.sequenceNo}</td>
                                <td className="px-3 py-1.5 font-medium font-mono">{p.passportName}</td>
                                <td className="px-3 py-1.5">{p.dateOfBirth || '-'}</td>
                                <td className="px-3 py-1.5">
                                  {age !== null ? (
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                                      age < 3 ? 'bg-pink-100 text-pink-700' :
                                      age < 12 ? 'bg-amber-100 text-amber-700' :
                                      'bg-blue-100 text-blue-700'
                                    }`}>
                                      {age}歲{age < 3 ? ' 嬰兒' : age < 12 ? ' 兒童' : ''}
                                    </span>
                                  ) : '-'}
                                </td>
                                <td className="px-3 py-1.5 font-mono tracking-wider">{p.passportNo || '-'}</td>
                                <td className="px-3 py-1.5">{p.nationality || '-'}</td>
                                <td className="px-3 py-1.5 text-center">
                                  {p.isRepresentative && (
                                    <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-xs font-semibold">代表</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer summary */}
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 flex items-center gap-4 text-sm text-gray-500">
        <span>共 <strong className="text-gray-800">{orders.length}</strong> 筆訂單</span>
        <span>總人數 <strong className="text-gray-800">{totalPax}</strong> 人</span>
        <span className="text-green-600">有效 {orders.filter(o => o.status === 'active').length}</span>
        <span className="text-amber-600">待確認 {orders.filter(o => o.status === 'pending').length}</span>
        <span className="text-blue-600">已完成 {orders.filter(o => o.status === 'completed').length}</span>
        <span className="text-red-500">取消 {orders.filter(o => o.status === 'cancelled').length}</span>
      </div>

      {/* Cancel confirm dialog */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-red-600 mb-1">確認取消訂單</h3>
            <p className="text-sm text-gray-600 mb-4">
              即將取消訂單 <span className="font-mono font-bold">{cancelTarget.ref}</span>，此操作可記錄備註。
            </p>
            <textarea
              value={cancelNote}
              onChange={(e) => setCancelNote(e.target.value)}
              placeholder="取消原因（選填）..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400 resize-none"
              rows={3}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setCancelTarget(null); setCancelNote('') }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700"
              >
                確認取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PlatformBadge({ platform }: { platform: string }) {
  const colors: Record<string, string> = {
    KLOOK:   'bg-orange-100 text-orange-700',
    VIATOR:  'bg-teal-100 text-teal-700',
    TRIP:    'bg-blue-100 text-blue-700',
    SANPU:   'bg-purple-100 text-purple-700',
    'JAMES巫': 'bg-pink-100 text-pink-700',
    ROUTOR:  'bg-indigo-100 text-indigo-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${colors[platform] || 'bg-gray-100 text-gray-600'}`}>
      {platform}
    </span>
  )
}
