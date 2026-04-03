import React, { useMemo } from 'react'
import { useOrderStore } from '../store/orderStore'
import FilterBar from '../components/orders/FilterBar'
import OrderTable from '../components/orders/OrderTable'
import OrderModal from '../components/orders/OrderModal'
import OrderDetailPanel from '../components/orders/OrderDetailPanel'
import ImportModal from '../components/orders/ImportModal'

export default function OrdersPage() {
  const { orders, filters, openModal } = useOrderStore()

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
        const inRef = o.bookingRef.toLowerCase().includes(q)
        const inRep = o.representativeName?.toLowerCase().includes(q)
        const inPax = o.passengers.some(
          (p) => p.passportName.toLowerCase().includes(q) || p.passportNo.toLowerCase().includes(q)
        )
        if (!inRef && !inRep && !inPax) return false
      }
      return true
    })
  }, [orders, filters])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-base font-bold text-gray-900">訂單管理中心</h1>
          <p className="text-xs text-gray-400">Klook / Viator / Trip.com / 三普 — 英語一日遊拼團</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openModal('import')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
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
      </div>
      <FilterBar />
      <OrderTable orders={filtered} />
      <OrderModal />
      <OrderDetailPanel />
      <ImportModal />
    </div>
  )
}
