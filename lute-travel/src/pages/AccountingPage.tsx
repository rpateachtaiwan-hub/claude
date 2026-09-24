import React, { useEffect, useState } from 'react'
import { useAccountingStore } from '../store/accountingStore'
import SettlementWorkbench from '../components/accounting/SettlementWorkbench'
import JournalEntryForm from '../components/accounting/JournalEntryForm'
import OpenItemsAging from '../components/accounting/OpenItemsAging'
import Reports from '../components/accounting/Reports'
import AccountsMaintenance from '../components/accounting/AccountsMaintenance'

type Tab = 'workbench' | 'journal' | 'openitems' | 'reports' | 'accounts'

const TABS: { key: Tab; label: string }[] = [
  { key: 'workbench', label: '沖銷工作台' },
  { key: 'journal', label: '傳票輸入' },
  { key: 'openitems', label: '未沖明細 / 帳齡' },
  { key: 'reports', label: '報表' },
  { key: 'accounts', label: '科目主檔' },
]

export default function AccountingPage() {
  const { init, loaded, usingSupabase } = useAccountingStore()
  const [tab, setTab] = useState<Tab>('workbench')

  useEffect(() => { if (!loaded) init() }, [loaded, init])

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-4 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">會計沖銷</h1>
            <p className="text-sm text-gray-500 mt-0.5">應收／應付未沖項管理 · 一次沖多筆 · 部分沖銷</p>
          </div>
          {!usingSupabase && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
              示範模式（未接資料庫，資料存於本機）
            </span>
          )}
        </div>
        <nav className="flex gap-1 mt-3">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50">
        {!loaded ? (
          <div className="flex items-center justify-center h-64 text-gray-400 text-sm">載入中…</div>
        ) : (
          <>
            {tab === 'workbench' && <SettlementWorkbench />}
            {tab === 'journal' && <JournalEntryForm />}
            {tab === 'openitems' && <OpenItemsAging />}
            {tab === 'reports' && <Reports />}
            {tab === 'accounts' && <AccountsMaintenance />}
          </>
        )}
      </div>
    </div>
  )
}
