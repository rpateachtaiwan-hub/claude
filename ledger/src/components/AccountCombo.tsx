import React, { useMemo, useState } from 'react'
import type { Account } from '../core/types'

/**
 * 可搜尋的科目下拉選單（combobox）。
 * 顯示選定科目的「代號 名稱」；聚焦後可輸入關鍵字（代號或名稱）即時過濾。
 */
export default function AccountCombo({
  accounts,
  value,
  onChange,
  placeholder = '搜尋科目…',
  autoFocus,
  className,
  onClose,
}: {
  accounts: Account[]
  value: string
  onChange: (code: string) => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
  onClose?: () => void
}) {
  const [open, setOpen] = useState(!!autoFocus)
  const [q, setQ] = useState('')
  const sel = accounts.find((a) => a.code === value)

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const base = kw ? accounts.filter((a) => `${a.code} ${a.name}`.toLowerCase().includes(kw)) : accounts
    return base.slice(0, 60)
  }, [q, accounts])

  return (
    <div className="relative">
      <input
        value={open ? q : sel ? `${sel.code} ${sel.name}` : ''}
        autoFocus={autoFocus}
        placeholder={sel && !open ? '' : placeholder}
        onFocus={() => { setOpen(true); setQ('') }}
        onChange={(e) => setQ(e.target.value)}
        onBlur={() => setTimeout(() => { setOpen(false); onClose?.() }, 150)}
        className={className ?? 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand'}
      />
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[180px] max-h-60 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {list.map((a) => (
            <button
              key={a.code}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(a.code); setOpen(false); onClose?.() }}
              className={`block w-full text-left px-2.5 py-1.5 text-xs hover:bg-brand-soft ${a.code === value ? 'bg-brand-soft/60 font-medium' : ''}`}
            >
              <span className="text-gray-400 tabular-nums mr-1.5">{a.code}</span>{a.name}
              <span className="ml-1 text-[10px] text-gray-300">{catZh(a.category)}</span>
            </button>
          ))}
          {list.length === 0 && <div className="px-2.5 py-2 text-xs text-gray-400">查無科目</div>}
        </div>
      )}
    </div>
  )
}

function catZh(c: string) {
  return ({ asset: '資產', liability: '負債', equity: '權益', revenue: '收入', expense: '費用' } as Record<string, string>)[c] ?? c
}
