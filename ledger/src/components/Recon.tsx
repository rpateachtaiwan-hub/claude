import React, { useEffect, useMemo, useState } from 'react'
import { useLedger } from '../store/useLedger'
import { bankBalanceAsOf, monthlyBankBalances } from '../core/recon'
import { formatTWD } from '../core/money'

/**
 * 銀行對帳：帳上銀行科目餘額 vs 銀行對帳單真實餘額。
 * 本系統記的是銀行流水且應計不碰銀行科目，故兩者應「分毫不差」。
 * 對帳點只儲存「銀行真實餘額」；帳上餘額永遠即時重算，之後資料若有增修，狀態會自動更新。
 */
export default function Recon() {
  const { entries, accounts, companies, reconPoints, addReconPoint, deleteReconPoint } = useLedger()
  const cashAccounts = accounts.filter((a) => a.isCash)
  const accName = (code: string) => accounts.find((a) => a.code === code)?.name ?? code
  const today = new Date().toISOString().slice(0, 10)

  const [accountCode, setAccountCode] = useState('')
  const [company, setCompany] = useState('')
  const [date, setDate] = useState(today)
  const [realStr, setRealStr] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!accountCode && cashAccounts.length) setAccountCode(cashAccounts[0].code)
  }, [cashAccounts]) // eslint-disable-line react-hooks/exhaustive-deps

  const real = realStr.trim() === '' ? null : Math.round(Number(realStr.replace(/[,\s]/g, '')) || 0)
  const book = useMemo(
    () => (accountCode ? bankBalanceAsOf(entries, accountCode, date, company || undefined) : 0),
    [entries, accountCode, date, company],
  )
  const diff = real === null ? null : book - real
  const monthly = useMemo(
    () => (accountCode ? monthlyBankBalances(entries, accountCode, date, company || undefined) : []),
    [entries, accountCode, date, company],
  )

  async function save() {
    if (real === null || !accountCode) return
    await addReconPoint({ date, accountCode, company: company || undefined, realBalance: real })
    setSaved(true); setTimeout(() => setSaved(false), 3000)
  }

  const points = useMemo(
    () => [...reconPoints].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [reconPoints],
  )

  return (
    <div className="space-y-4">
      <div className="bg-brand-soft border border-brand-light/40 rounded-lg p-3 text-xs text-gray-600 leading-relaxed">
        本系統記的是<b>銀行流水</b>（應計分錄不動銀行科目），所以任一天的帳上餘額
        <b>必須分毫不差等於銀行對帳單餘額</b>——差 1 元即代表有漏記、重複或錯置。
        建議每月月底對一次並儲存對帳點；之後資料若有增修，下方清單的 ✓/✗ 會自動重新驗證。
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <L t="銀行 / 現金科目">
            <select value={accountCode} onChange={(e) => setAccountCode(e.target.value)} className={inp}>
              {cashAccounts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
            </select>
          </L>
          <L t="公司（選填）">
            <select value={company} onChange={(e) => setCompany(e.target.value)} className={inp}>
              <option value="">不限公司</option>
              {companies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </L>
          <L t="截止日（含當日）">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} />
          </L>
          <L t="銀行對帳單餘額（實際）">
            <input value={realStr} onChange={(e) => setRealStr(e.target.value)} inputMode="numeric" placeholder="輸入銀行 App 顯示的餘額" className={`${inp} text-right`} />
          </L>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-1">
          <div>
            <div className="text-xs text-gray-500">帳上餘額（系統計算）</div>
            <div className="text-xl font-bold tabular-nums text-ink">{formatTWD(book)}</div>
          </div>
          {diff !== null && (
            <div className={`px-3 py-2 rounded-lg text-sm font-medium ${diff === 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {diff === 0 ? '✓ 對帳相符' : `✗ 差額（帳上 − 銀行）：${formatTWD(diff)}`}
            </div>
          )}
          <button onClick={save} disabled={real === null || !accountCode}
            className="ml-auto px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark disabled:opacity-50">
            儲存對帳點
          </button>
        </div>
        {saved && <div className="text-sm text-green-700">已儲存對帳點。</div>}
      </div>

      {diff !== null && diff !== 0 && monthly.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm font-medium text-gray-700 mb-2">逐月帳上餘額（拿銀行 App 各月底餘額比對，第一個對不上的月份就是問題所在）</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead><tr className="bg-gray-50 text-gray-500 text-xs">
                <th className="px-3 py-2 text-left">月份</th><th className="px-3 py-2 text-right">當月淨變動</th><th className="px-3 py-2 text-right">月底帳上餘額</th>
              </tr></thead>
              <tbody>
                {monthly.map((m, i) => (
                  <tr key={m.month} className={`border-t border-gray-100 ${i % 2 ? 'bg-gray-50/50' : ''}`}>
                    <td className="px-3 py-1.5 text-gray-600">{m.month}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatTWD(m.net)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatTWD(m.ending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="px-4 pt-3 text-sm font-medium text-gray-700">對帳紀錄</div>
        <table className="w-full min-w-[680px] text-sm">
          <thead><tr className="text-gray-500 text-xs">
            <th className="px-3 py-2 text-left">截止日</th><th className="px-3 py-2 text-left">科目</th><th className="px-3 py-2 text-left">公司</th>
            <th className="px-3 py-2 text-right">銀行餘額</th><th className="px-3 py-2 text-right">帳上餘額（即時）</th>
            <th className="px-3 py-2 text-right">差額</th><th className="px-3 py-2 text-center">狀態</th><th className="px-3 py-2 w-10"></th>
          </tr></thead>
          <tbody>
            {points.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">尚無對帳紀錄。</td></tr>}
            {points.map((p) => {
              const b = bankBalanceAsOf(entries, p.accountCode, p.date, p.company)
              const d = b - p.realBalance
              return (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.date}</td>
                  <td className="px-3 py-2 text-gray-700">{accName(p.accountCode)}</td>
                  <td className="px-3 py-2 text-gray-600">{p.company ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatTWD(p.realBalance)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatTWD(b)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${d === 0 ? 'text-gray-400' : 'text-red-600 font-medium'}`}>{d === 0 ? '—' : formatTWD(d)}</td>
                  <td className="px-3 py-2 text-center">{d === 0 ? <span className="text-green-600">✓</span> : <span className="text-red-600">✗</span>}</td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => { if (confirm('刪除這筆對帳紀錄？')) deleteReconPoint(p.id) }} className="text-gray-300 hover:text-red-500">✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function L({ t, children }: { t: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-gray-500 mb-1">{t}</label>{children}</div>
}
const inp = 'w-full border border-gray-300 rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand'
