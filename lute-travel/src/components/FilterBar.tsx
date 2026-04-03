import React from 'react'
import { useStore } from '../store/useStore'
import { PLATFORMS, LANGUAGES, PRODUCTS } from '../types'

export default function FilterBar() {
  const { filters, setFilters, resetFilters } = useStore()

  function togglePill(key: 'platforms' | 'languages', val: string) {
    const cur = filters[key]
    setFilters({ [key]: cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val] })
  }

  const hasActive =
    filters.dateFrom || filters.dateTo || filters.platforms.length ||
    filters.languages.length || filters.productCode || filters.status || filters.search

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3 space-y-3">
      {/* Row 1: dates + search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 whitespace-nowrap">行程日期</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters({ dateFrom: e.target.value })}
            className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span className="text-gray-400 text-sm">–</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters({ dateTo: e.target.value })}
            className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <select
          value={filters.productCode}
          onChange={(e) => setFilters({ productCode: e.target.value })}
          className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">全部商品</option>
          {PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        <select
          value={filters.status}
          onChange={(e) => setFilters({ status: e.target.value })}
          className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">全部狀態</option>
          <option value="active">有效</option>
          <option value="cancelled">取消</option>
          <option value="pending">待確認</option>
        </select>

        <input
          type="text"
          placeholder="搜尋訂單號 / 旅客姓名 / 護照號碼..."
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
          className="flex-1 min-w-[220px] border border-gray-300 rounded px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        {hasActive && (
          <button
            onClick={resetFilters}
            className="text-xs text-red-500 hover:text-red-700 underline whitespace-nowrap"
          >
            清除篩選
          </button>
        )}
      </div>

      {/* Row 2: platform pills + language pills */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">平台</span>
          {PLATFORMS.map((p) => (
            <button
              key={p}
              onClick={() => togglePill('platforms', p)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                filters.platforms.includes(p)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">語種</span>
          {LANGUAGES.map((l) => (
            <button
              key={l}
              onClick={() => togglePill('languages', l)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                filters.languages.includes(l)
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
