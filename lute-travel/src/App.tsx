import React, { useMemo } from 'react'
import { useStore } from './store/useStore'
import FilterBar from './components/FilterBar'
import OrderTable from './components/OrderTable'
import OrderModal from './components/OrderModal'
import OrderDetailPanel from './components/OrderDetailPanel'
import ImportModal from './components/ImportModal'

export default function App() {
  const { orders, filters, openModal } = useStore()

  // Apply filters
  const filtered = useMemo(() => {
    const q = filters.search.toLowerCase()
    return orders.filter((o) => {
      if (filters.dateFrom && o.tourDate < filters.dateFrom) return false
      if (filters.dateTo   && o.tourDate > filters.dateTo)   return false
      if (filters.platforms.length && !filters.platforms.includes(o.platform)) return false
      if (filters.languages.length && !filters.languages.includes(o.language)) return false
      if (filters.productCode && o.productCode !== filters.productCode) return false
      if (filters.status && o.status !== filters.status) return false
      if (q) {
        const inRef  = o.bookingRef.toLowerCase().includes(q)
        const inRep  = o.representativeName?.toLowerCase().includes(q)
        const inPax  = o.passengers.some(
          (p) => p.passportName.toLowerCase().includes(q) || p.passportNo.toLowerCase().includes(q)
        )
        if (!inRef && !inRep && !inPax) return false
      }
      return true
    })
  }, [orders, filters])

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="w-52 bg-slate-900 text-slate-300 flex flex-col shrink-0">
        <div className="px-4 pt-5 pb-4 border-b border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0">✈</div>
            <div>
              <p className="text-white text-sm font-bold leading-tight">路特旅行社</p>
              <p className="text-slate-500 text-[10px]">管理系統 v1.0</p>
            </div>
          </div>
        </div>
        <nav className="px-2 py-3 flex-1">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest px-2 mb-2">模組一</div>
          <a className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
            訂單管理
          </a>
        </nav>
        <div className="px-4 py-3 border-t border-slate-700 text-[10px] text-slate-600">
          共 {orders.length} 筆訂單
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-base font-bold text-gray-900">訂單管理中心</h1>
            <p className="text-xs text-gray-400">Klook / Viator / Trip.com / 三普 — 英語一日遊拼團</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openModal('import')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
              匯入訂單
            </button>
            <button
              onClick={() => openModal('add')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
              新增訂單
            </button>
          </div>
        </header>

        {/* Filters */}
        <FilterBar />

        {/* Table */}
        <OrderTable orders={filtered} />
      </div>

      {/* Modals */}
      <OrderModal />
      <OrderDetailPanel />
      <ImportModal />
    </div>
  )
}
