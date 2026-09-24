import React, { useState } from 'react'
import { useLedger } from '../store/useLedger'
import { formatTWD } from '../core/money'

/** 預設現金科目：優先名稱含「銀行現金」，其次銀行存款(1102)，再退回第一個現金科目 */
function defaultCashCode(cashAccounts: { code: string; name: string }[]): string {
  return (
    cashAccounts.find((a) => a.name.includes('銀行現金'))?.code ??
    cashAccounts.find((a) => a.code === '1102')?.code ??
    cashAccounts[0]?.code ??
    '1102'
  )
}

export default function Settlement() {
  const { openItems, accounts, settle, companies } = useLedger()
  const [companyFilter, setCompanyFilter] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const cashAccounts = accounts.filter((a) => a.isCash)
  const accName = (code: string) => accounts.find((a) => a.code === code)?.name ?? code
  const items = openItems().filter((i) => !companyFilter || i.company === companyFilter)
  const [draft, setDraft] = useState<Record<string, { amount: number; cash: string; date: string }>>({})
  const [err, setErr] = useState<string | null>(null)

  function d(id: string, remaining: number) {
    return draft[id] ?? { amount: remaining, cash: defaultCashCode(cashAccounts), date: today }
  }

  async function doSettle(id: string, remaining: number) {
    const v = d(id, remaining)
    setErr(null)
    try {
      await settle(id, v.amount, v.cash, v.date)
      setDraft((p) => { const n = { ...p }; delete n[id]; return n })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="w-full p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <h2 className="text-sm font-medium text-gray-700">沖銷（收付款）</h2>
        {companies.length > 0 && (
          <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
            className="ml-auto border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand">
            <option value="">全部公司</option>
            {companies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{err}</div>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="px-3 py-2.5 text-left">日期</th>
              <th className="px-3 py-2.5 text-left">類型</th>
              <th className="px-3 py-2.5 text-left">內容 / 對象</th>
              <th className="px-3 py-2.5 text-left">借 / 貸科目</th>
              <th className="px-3 py-2.5 text-right">原始</th>
              <th className="px-3 py-2.5 text-right">未沖</th>
              <th className="px-3 py-2.5 text-left">本次沖款</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-400">沒有未沖的應收/應付項目</td></tr>}
            {items.map((it) => {
              const v = d(it.id, it.remaining)
              return (
                <tr key={it.id} className="border-t border-gray-100 align-middle">
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{it.date}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={`text-[11px] rounded px-1.5 py-0.5 ${it.type === 'AR' ? 'bg-brand-soft text-brand-dark' : 'bg-amber-50 text-amber-700'}`}>
                      {it.type === 'AR' ? '應收' : '應付'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-800">
                    {it.company && <span className="mr-1 text-[10px] text-brand bg-brand-soft rounded px-1.5 py-0.5">{it.company}</span>}
                    {it.description}
                    {it.counterparty && <span className="text-gray-400 text-xs"> · {it.counterparty}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">
                    借 {accName(it.debitCode)}<br />貸 {accName(it.creditCode)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{formatTWD(it.amount)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium">{formatTWD(it.remaining)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <input type="number" value={v.amount} min={1} max={it.remaining}
                        onChange={(e) => setDraft((p) => ({ ...p, [it.id]: { ...v, amount: Math.floor(Number(e.target.value) || 0) } }))}
                        className="w-24 border border-gray-300 rounded px-2 py-1 text-right text-sm" />
                      <select value={v.cash} onChange={(e) => setDraft((p) => ({ ...p, [it.id]: { ...v, cash: e.target.value } }))}
                        className="border border-gray-300 rounded px-1 py-1 text-xs max-w-[120px]">
                        {cashAccounts.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => doSettle(it.id, it.remaining)}
                      className="px-3 py-1 rounded-lg bg-brand text-white text-xs font-medium hover:bg-brand-dark">沖銷</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">應收與應付統一列示。現金科目預設為「銀行現金」，可逐筆調整。可輸入部分金額做部分沖銷，沖完即從清單消失。</p>
    </div>
  )
}
