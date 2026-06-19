import React, { useEffect, useState } from 'react'
import { useLedger } from './store/useLedger'
import QuickEntry from './components/QuickEntry'
import Transactions from './components/Transactions'
import Reports from './components/Reports'
import Settings from './components/Settings'
import Settlement from './components/Settlement'
import ImportData from './components/ImportData'

type Tab = 'entry' | 'settle' | 'list' | 'reports' | 'import' | 'settings'
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'entry', label: '記一筆', icon: '✏️' },
  { key: 'settle', label: '沖銷', icon: '🔁' },
  { key: 'list', label: '明細', icon: '📒' },
  { key: 'reports', label: '報表', icon: '📊' },
  { key: 'import', label: '匯入', icon: '📥' },
  { key: 'settings', label: '設定', icon: '⚙️' },
]

export default function App() {
  const { init, ready, usingSupabase } = useLedger()
  const [tab, setTab] = useState<Tab>('entry')

  useEffect(() => { init() }, [init])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">記</div>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-tight">輕記帳</h1>
              <p className="text-[10px] text-gray-400">簡易帳務 · 自動建議科目</p>
            </div>
          </div>
          {!usingSupabase && <span className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">示範模式（存本機）</span>}
        </div>
        <nav className="max-w-3xl mx-auto px-4 flex gap-1">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1">
        {!ready ? (
          <div className="flex items-center justify-center h-64 text-gray-400 text-sm">載入中…</div>
        ) : (
          <>
            {tab === 'entry' && <QuickEntry />}
            {tab === 'settle' && <Settlement />}
            {tab === 'list' && <Transactions />}
            {tab === 'reports' && <Reports />}
            {tab === 'import' && <ImportData />}
            {tab === 'settings' && <Settings />}
          </>
        )}
      </main>
    </div>
  )
}
