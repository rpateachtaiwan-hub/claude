import React, { useEffect, useState } from 'react'
import { useLedger } from './store/useLedger'
import { useAuth } from './auth/useAuth'
import { hasSupabase } from './lib/supabase'
import QuickEntry from './components/QuickEntry'
import Transactions from './components/Transactions'
import Reports from './components/Reports'
import Settings from './components/Settings'
import Settlement from './components/Settlement'
import ImportData from './components/ImportData'
import Logo from './components/Logo'
import LoginPage from './components/LoginPage'

type Tab = 'entry' | 'settle' | 'list' | 'reports' | 'import' | 'settings'
const TABS: { key: Tab; label: string }[] = [
  { key: 'entry', label: '日記帳' },
  { key: 'settle', label: '沖銷' },
  { key: 'list', label: '明細' },
  { key: 'reports', label: '報表' },
  { key: 'import', label: '匯入' },
  { key: 'settings', label: '設定' },
]

export default function App() {
  const { init, ready, usingSupabase } = useLedger()
  const auth = useAuth()
  const [tab, setTab] = useState<Tab>('entry')

  useEffect(() => { auth.init() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 登入後（或示範模式）才載入資料
  useEffect(() => {
    if (auth.authed) init()
  }, [auth.authed, init])

  if (!auth.ready) {
    return <div className="min-h-screen bg-brand-soft flex items-center justify-center text-gray-400 text-sm">載入中…</div>
  }
  if (hasSupabase && !auth.authed) {
    return <LoginPage />
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="w-full px-4 py-2.5 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            {!usingSupabase && <span className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">示範模式（存本機）</span>}
            {hasSupabase && auth.authed && (
              <>
                {auth.email && <span className="text-[11px] text-gray-400 hidden sm:inline">{auth.email}</span>}
                <button onClick={() => auth.logout()} className="text-[11px] text-gray-500 border border-gray-300 rounded-full px-2.5 py-1 hover:bg-gray-50">登出</button>
              </>
            )}
          </div>
        </div>
        <nav className="w-full px-4 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t.key ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              {t.label}
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
