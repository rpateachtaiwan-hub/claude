import React, { useMemo, useState } from 'react'
import { useLedger } from '../store/useLedger'
import { composeEntry } from '../core/suggest'
import { buildEntry } from '../core/engine'
import { classifyWithGemini } from '../core/ai'
import { formatTWD } from '../core/money'
import { downloadCSV, toCSV } from '../lib/csv'
import type { Account, JournalEntry, QuickInput } from '../core/types'

type SortKey = 'date' | 'description' | 'amount'

function entryToInput(e: JournalEntry, accounts: Account[]): QuickInput {
  const byCode = new Map(accounts.map((a) => [a.code, a]))
  const settleLeg = e.lines.find((l) => byCode.get(l.accountCode)?.isCash || byCode.get(l.accountCode)?.isOpenItem) ?? e.lines[0]
  const accrual = !!byCode.get(settleLeg.accountCode)?.isOpenItem
  const direction: 'in' | 'out' = settleLeg.debit > 0 ? 'in' : 'out'
  return {
    date: e.date, amount: settleLeg.debit || settleLeg.credit, description: e.description,
    counterparty: e.counterparty, direction, accrual,
    cashAccountCode: accrual ? undefined : settleLeg.accountCode,
  }
}

export default function Transactions() {
  const { entries, accounts, deleteEntry, updateEntry, aiConfig } = useLedger()
  const accName = (code: string) => accounts.find((a) => a.code === code)?.name ?? code
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [asc, setAsc] = useState(false)
  const [onlyReview, setOnlyReview] = useState(false)
  const [editing, setEditing] = useState<JournalEntry | null>(null)
  const [aiBusy, setAiBusy] = useState<string | null>(null)

  const reviewCount = entries.filter((e) => e.needsReview).length

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const amountOf = (e: JournalEntry) => e.lines.find((l) => l.debit > 0)?.debit ?? 0
    const filtered = entries.filter((e) => {
      if (onlyReview && !e.needsReview) return false
      if (!kw) return true
      const dr = e.lines.find((l) => l.debit > 0); const cr = e.lines.find((l) => l.credit > 0)
      const hay = [e.date, e.description, e.counterparty ?? '', e.counterpartyAccount ?? '', e.branch ?? '', e.voucherNo ?? '', accName(dr?.accountCode ?? ''), accName(cr?.accountCode ?? ''), String(amountOf(e))].join(' ').toLowerCase()
      return hay.includes(kw)
    })
    return [...filtered].sort((a, b) => {
      let r = 0
      if (sortKey === 'date') r = a.date < b.date ? -1 : a.date > b.date ? 1 : 0
      else if (sortKey === 'description') r = a.description.localeCompare(b.description, 'zh-Hant')
      else r = amountOf(a) - amountOf(b)
      return asc ? r : -r
    })
  }, [entries, q, sortKey, asc, onlyReview]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSort(k: SortKey) {
    if (sortKey === k) setAsc(!asc)
    else { setSortKey(k); setAsc(k === 'date' ? false : true) }
  }
  const arrow = (k: SortKey) => (sortKey === k ? (asc ? ' ▲' : ' ▼') : '')

  function exportCsv() {
    const data = rows.map((e) => {
      const dr = e.lines.find((l) => l.debit > 0)!; const cr = e.lines.find((l) => l.credit > 0)!
      return [e.date, e.description, e.counterparty ?? '', e.counterpartyAccount ?? '', e.branch ?? '', e.voucherNo ?? '',
        accName(dr.accountCode), accName(cr.accountCode), dr.debit,
        e.source === 'accrual' ? '應計' : e.source === 'settlement' ? '沖銷' : '現金', e.needsReview ? '待分類' : '']
    })
    downloadCSV('交易明細', toCSV(['日期', '摘要', '對象', '對方帳號', '交易分行', '憑證編號', '借方科目', '貸方科目', '金額', '類型', '狀態'], data))
  }

  async function classifyWithAi() {
    const todo = entries.filter((e) => e.needsReview)
    if (!todo.length || !aiConfig.apiKey) return
    let done = 0, ok = 0
    for (const e of todo) {
      setAiBusy(`Gemini 分類中… ${done}/${todo.length}`)
      const input = entryToInput(e, accounts)
      const r = await classifyWithGemini(input, accounts, aiConfig)
      if (r) {
        const rebuilt = buildEntry({ ...composeEntry(input, r.accountCode), id: e.id, counterpartyAccount: e.counterpartyAccount, branch: e.branch, voucherNo: e.voucherNo, needsReview: false })
        await updateEntry(rebuilt)
        ok++
      }
      done++
    }
    setAiBusy(null)
    alert(`Gemini 已分類 ${ok}/${todo.length} 筆${ok < todo.length ? '，其餘仍為待分類（可手動補上）' : ''}`)
  }

  return (
    <div className="w-full p-4 sm:p-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 搜尋摘要 / 對象 / 對方帳號 / 分行 / 科目 / 金額…"
          className="flex-1 min-w-[180px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
        {reviewCount > 0 && (
          <button onClick={() => setOnlyReview((v) => !v)}
            className={`px-3 py-2 rounded-lg text-sm whitespace-nowrap ${onlyReview ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
            ⚠ 待分類 {reviewCount}
          </button>
        )}
        {reviewCount > 0 && aiConfig.apiKey && (
          <button onClick={classifyWithAi} disabled={!!aiBusy}
            className="px-3 py-2 rounded-lg bg-brand text-white text-sm whitespace-nowrap hover:bg-brand-dark disabled:opacity-60">
            {aiBusy ?? `用 Gemini 分類待分類`}
          </button>
        )}
        <button onClick={exportCsv} className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap">⬇ 匯出 Excel</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="px-3 py-2.5 text-left cursor-pointer select-none" onClick={() => toggleSort('date')}>日期{arrow('date')}</th>
              <th className="px-3 py-2.5 text-left cursor-pointer select-none" onClick={() => toggleSort('description')}>摘要{arrow('description')}</th>
              <th className="px-3 py-2.5 text-left">借 / 貸</th>
              <th className="px-3 py-2.5 text-right cursor-pointer select-none" onClick={() => toggleSort('amount')}>金額{arrow('amount')}</th>
              <th className="px-3 py-2.5 text-center w-16">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-gray-400">{q || onlyReview ? '查無符合資料' : '還沒有任何紀錄'}</td></tr>}
            {rows.map((e) => {
              const dr = e.lines.find((l) => l.debit > 0)!; const cr = e.lines.find((l) => l.credit > 0)!
              return (
                <tr key={e.id} className={`border-t border-gray-100 hover:bg-gray-50 align-top ${e.needsReview ? 'bg-amber-50/40 border-l-4 border-l-amber-400' : ''}`}>
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{e.date}</td>
                  <td className="px-3 py-2.5 text-gray-800">
                    {e.needsReview && <span className="mr-1 text-[10px] text-amber-700 bg-amber-100 rounded px-1 py-0.5 font-medium">⚠ 待分類</span>}
                    {e.description}
                    {e.counterparty && <span className="text-gray-400 text-xs"> · {e.counterparty}</span>}
                    {e.source === 'accrual' && <span className="ml-1 text-[10px] text-amber-600 bg-amber-50 rounded px-1">應計</span>}
                    {e.source === 'settlement' && <span className="ml-1 text-[10px] text-brand bg-brand-soft rounded px-1">沖銷</span>}
                    {(e.counterpartyAccount || e.branch || e.voucherNo) && (
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {e.counterpartyAccount && <span>對方帳號 {e.counterpartyAccount}　</span>}
                        {e.branch && <span>分行 {e.branch}　</span>}
                        {e.voucherNo && <span>憑證 {e.voucherNo}</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-600">借 {accName(dr.accountCode)}<br />貸 {accName(cr.accountCode)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium">{formatTWD(dr.debit)}</td>
                  <td className="px-3 py-2.5 text-center whitespace-nowrap">
                    <button onClick={() => setEditing(e)} className="text-gray-400 hover:text-brand mr-2" title="編輯">✎</button>
                    <button onClick={() => { if (confirm('刪除這筆紀錄？')) deleteEntry(e.id) }} className="text-gray-300 hover:text-red-500" title="刪除">✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editing && <EditModal entry={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function EditModal({ entry, onClose }: { entry: JournalEntry; onClose: () => void }) {
  const { accounts, updateEntry } = useLedger()
  const accByCode = new Map(accounts.map((a) => [a.code, a]))
  const cashAccounts = accounts.filter((a) => a.isCash)
  const categoryAccounts = accounts.filter((a) => !a.isCash && !a.isOpenItem)
  const isSettlement = entry.source === 'settlement'

  const settleLeg = entry.lines.find((l) => accByCode.get(l.accountCode)?.isCash || accByCode.get(l.accountCode)?.isOpenItem) ?? entry.lines[0]
  const categoryLeg = entry.lines.find((l) => l !== settleLeg) ?? entry.lines[1]
  const accrual0 = !!accByCode.get(settleLeg.accountCode)?.isOpenItem
  const dir0: 'in' | 'out' = settleLeg.debit > 0 ? 'in' : 'out'
  const amount0 = settleLeg.debit || settleLeg.credit

  const [date, setDate] = useState(entry.date)
  const [direction, setDirection] = useState<'in' | 'out'>(dir0)
  const [amount, setAmount] = useState(amount0)
  const [description, setDescription] = useState(entry.description)
  const [counterparty, setCounterparty] = useState(entry.counterparty ?? '')
  const [counterpartyAccount, setCounterpartyAccount] = useState(entry.counterpartyAccount ?? '')
  const [branch, setBranch] = useState(entry.branch ?? '')
  const [voucherNo, setVoucherNo] = useState(entry.voucherNo ?? '')
  const [categoryCode, setCategoryCode] = useState(categoryLeg.accountCode)
  const [cashCode, setCashCode] = useState(accrual0 ? (cashAccounts[0]?.code ?? '1102') : settleLeg.accountCode)
  const [accrual, setAccrual] = useState(accrual0)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setErr(null)
    try {
      if (isSettlement) {
        await updateEntry({ ...entry, date, description })
      } else {
        const input: QuickInput = { date, amount, description, counterparty: counterparty || undefined, direction, cashAccountCode: cashCode, accrual }
        // 使用者已指定科目 → 解除待分類
        const stillUnclassified = categoryCode === '4999' || categoryCode === '6999'
        const rebuilt = buildEntry({
          ...composeEntry(input, categoryCode), id: entry.id,
          counterpartyAccount: counterpartyAccount || undefined, branch: branch || undefined, voucherNo: voucherNo || undefined,
          needsReview: stillUnclassified ? entry.needsReview : false,
        })
        await updateEntry(rebuilt)
      }
      onClose()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b sticky top-0 bg-white">
          <h3 className="font-bold text-sm">編輯紀錄{isSettlement && '（沖銷：僅可改日期/摘要）'}</h3>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>
        <div className="p-5 space-y-3">
          {entry.needsReview && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">此筆為「待分類」，請選擇正確的分類科目後儲存即可解除提醒。</div>}
          {!isSettlement && (
            <div className="flex gap-2">
              <button onClick={() => setDirection('out')} className={`flex-1 py-2 rounded-lg text-sm ${direction === 'out' ? 'bg-accent text-white' : 'border border-gray-300 text-gray-600'}`}>支出</button>
              <button onClick={() => setDirection('in')} className={`flex-1 py-2 rounded-lg text-sm ${direction === 'in' ? 'bg-brand text-white' : 'border border-gray-300 text-gray-600'}`}>收入</button>
            </div>
          )}
          <L t="日期"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} /></L>
          <L t="摘要"><input value={description} onChange={(e) => setDescription(e.target.value)} className={inp} /></L>
          {!isSettlement && <>
            <L t="金額"><input type="number" value={amount || ''} min={1} onChange={(e) => setAmount(Math.floor(Number(e.target.value) || 0))} className={`${inp} text-right`} /></L>
            <L t="對象"><input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} className={inp} /></L>
            <div className="grid grid-cols-2 gap-3">
              <L t="對方帳號"><input value={counterpartyAccount} onChange={(e) => setCounterpartyAccount(e.target.value)} className={inp} /></L>
              <L t="交易分行"><input value={branch} onChange={(e) => setBranch(e.target.value)} className={inp} /></L>
            </div>
            <L t="憑證編號"><input value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)} className={inp} /></L>
            <L t="分類科目">
              <select value={categoryCode} onChange={(e) => setCategoryCode(e.target.value)} className={inp}>
                {categoryAccounts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
              </select>
            </L>
            <L t={accrual ? '（應計）' : '收/付款帳戶'}>
              <select value={cashCode} onChange={(e) => setCashCode(e.target.value)} className={inp} disabled={accrual}>
                {cashAccounts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
              </select>
            </L>
            <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={accrual} onChange={(e) => setAccrual(e.target.checked)} />應收/應付（應計）</label>
          </>}
          {err && <div className="text-sm text-red-600 bg-red-50 rounded p-2">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm">取消</button>
          <button onClick={save} className="px-3 py-1.5 rounded-lg bg-brand text-white text-sm hover:bg-brand-dark">儲存</button>
        </div>
      </div>
    </div>
  )
}

function L({ t, children }: { t: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-gray-500 mb-1">{t}</label>{children}</div>
}
const inp = 'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand'
