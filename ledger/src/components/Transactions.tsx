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
  const { entries, accounts, deleteEntry, updateEntry, deleteEntriesBulk, updateEntriesBulk, aiConfig, companies } = useLedger()
  const accName = (code: string) => accounts.find((a) => a.code === code)?.name ?? code
  const categoryAccounts = accounts.filter((a) => !a.isCash)
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [asc, setAsc] = useState(false)
  const [onlyReview, setOnlyReview] = useState(false)
  const [companyFilter, setCompanyFilter] = useState('')
  const [editing, setEditing] = useState<JournalEntry | null>(null)
  const [aiBusy, setAiBusy] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [page, setPage] = useState(0)
  const pageSize = 100

  function toggleOne(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function clearSel() { setSelected(new Set()) }

  const sortedAccounts = useMemo(() => [...accounts].sort((a, b) => a.code.localeCompare(b.code)), [accounts])

  // 直接設定某一腳科目（明細內嵌編輯用）
  const setLeg = React.useCallback(async (e: JournalEntry, side: 'debit' | 'credit', code: string) => {
    const dr = e.lines.find((l) => l.debit > 0)!
    const cr = e.lines.find((l) => l.credit > 0)!
    const amount = dr.debit
    const debitCode = side === 'debit' ? code : dr.accountCode
    const creditCode = side === 'credit' ? code : cr.accountCode
    const byCode = new Map(accounts.map((a) => [a.code, a]))
    const isCash = (c: string) => byCode.get(c)?.isCash
    const isOpen = (c: string) => byCode.get(c)?.isOpenItem
    let source: JournalEntry['source'] = 'manual'
    if (isCash(debitCode) || isCash(creditCode)) source = 'cash'
    else if (isOpen(debitCode) || isOpen(creditCode)) source = 'accrual'
    await updateEntry(buildEntry({
      date: e.date, description: e.description, counterparty: e.counterparty, company: e.company,
      counterpartyAccount: e.counterpartyAccount, branch: e.branch, voucherNo: e.voucherNo,
      source, settled: source === 'accrual' ? false : source === 'cash' ? true : undefined,
      id: e.id, needsReview: false,
      lines: [{ accountCode: debitCode, debit: amount, credit: 0 }, { accountCode: creditCode, debit: 0, credit: amount }],
    }))
  }, [accounts, updateEntry])

  const setEntryDate = React.useCallback(async (e: JournalEntry, date: string) => {
    await updateEntry({ ...e, date })
  }, [updateEntry])

  const reviewCount = entries.filter((e) => e.needsReview).length

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const amountOf = (e: JournalEntry) => e.lines.find((l) => l.debit > 0)?.debit ?? 0
    const filtered = entries.filter((e) => {
      if (onlyReview && !e.needsReview) return false
      if (companyFilter && e.company !== companyFilter) return false
      if (!kw) return true
      const dr = e.lines.find((l) => l.debit > 0); const cr = e.lines.find((l) => l.credit > 0)
      const hay = [e.date, e.description, e.counterparty ?? '', e.company ?? '', e.counterpartyAccount ?? '', e.branch ?? '', e.voucherNo ?? '', accName(dr?.accountCode ?? ''), accName(cr?.accountCode ?? ''), String(amountOf(e))].join(' ').toLowerCase()
      return hay.includes(kw)
    })
    return [...filtered].sort((a, b) => {
      let r = 0
      if (sortKey === 'date') r = a.date < b.date ? -1 : a.date > b.date ? 1 : 0
      else if (sortKey === 'description') r = a.description.localeCompare(b.description, 'zh-Hant')
      else r = amountOf(a) - amountOf(b)
      return asc ? r : -r
    })
  }, [entries, q, sortKey, asc, onlyReview, companyFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const pagedRows = rows.slice(safePage * pageSize, safePage * pageSize + pageSize)
  React.useEffect(() => { setPage(0) }, [q, onlyReview, companyFilter])

  function toggleSort(k: SortKey) {
    if (sortKey === k) setAsc(!asc)
    else { setSortKey(k); setAsc(k === 'date' ? false : true) }
  }
  const arrow = (k: SortKey) => (sortKey === k ? (asc ? ' ▲' : ' ▼') : '')

  function exportCsv() {
    const data = rows.map((e) => {
      const dr = e.lines.find((l) => l.debit > 0)!; const cr = e.lines.find((l) => l.credit > 0)!
      return [e.company ?? '', e.date, e.description, e.counterparty ?? '', e.counterpartyAccount ?? '', e.branch ?? '', e.voucherNo ?? '',
        accName(dr.accountCode), accName(cr.accountCode), dr.debit,
        e.source === 'accrual' ? '應計' : e.source === 'settlement' ? '沖銷' : '現金', e.needsReview ? '待分類' : '']
    })
    downloadCSV('交易明細', toCSV(['公司', '日期', '摘要', '對象', '對方帳號', '交易分行', '憑證編號', '借方科目', '貸方科目', '金額', '類型', '狀態'], data))
  }

  const allVisibleSelected = rows.length > 0 && rows.every((e) => selected.has(e.id))
  function toggleAll() { setSelected(allVisibleSelected ? new Set() : new Set(rows.map((e) => e.id))) }

  async function bulkDelete() {
    if (!selected.size) return
    if (!confirm(`刪除選取的 ${selected.size} 筆紀錄？`)) return
    await deleteEntriesBulk([...selected]); clearSel()
  }
  async function bulkSetCompany(co: string) {
    const upd = entries.filter((e) => selected.has(e.id)).map((e) => ({ ...e, company: co || undefined }))
    await updateEntriesBulk(upd); clearSel()
  }
  async function bulkSetCategory(code: string) {
    const upd = entries.filter((e) => selected.has(e.id) && e.source !== 'settlement').map((e) => {
      const input = entryToInput(e, accounts)
      return buildEntry({ ...composeEntry(input, code, accounts), id: e.id, company: e.company, counterpartyAccount: e.counterpartyAccount, branch: e.branch, voucherNo: e.voucherNo, needsReview: false })
    })
    await updateEntriesBulk(upd); clearSel()
  }

  async function classifyWithAi() {
    const todo = entries.filter((e) => e.needsReview)
    if (!todo.length || !aiConfig.enabled) return
    let done = 0, ok = 0
    for (const e of todo) {
      setAiBusy(`Gemini 分類中… ${done}/${todo.length}`)
      const input = entryToInput(e, accounts)
      const r = await classifyWithGemini(input, accounts, aiConfig)
      if (r) {
        const rebuilt = buildEntry({ ...composeEntry(input, r.accountCode, accounts), id: e.id, counterpartyAccount: e.counterpartyAccount, branch: e.branch, voucherNo: e.voucherNo, needsReview: false })
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
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 搜尋摘要 / 對象 / 公司 / 科目 / 金額…"
          className="flex-1 min-w-[180px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
        {companies.length > 0 && (
          <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand">
            <option value="">全部公司</option>
            {companies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {reviewCount > 0 && (
          <button onClick={() => setOnlyReview((v) => !v)}
            className={`px-3 py-2 rounded-lg text-sm whitespace-nowrap ${onlyReview ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
            ⚠ 待分類 {reviewCount}
          </button>
        )}
        {reviewCount > 0 && aiConfig.enabled && (
          <button onClick={classifyWithAi} disabled={!!aiBusy}
            className="px-3 py-2 rounded-lg bg-brand text-white text-sm whitespace-nowrap hover:bg-brand-dark disabled:opacity-60">
            {aiBusy ?? `用 Gemini 分類待分類`}
          </button>
        )}
        <button onClick={exportCsv} className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap">⬇ 匯出 Excel</button>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-brand-soft border border-brand-light/40 rounded-lg p-2 text-sm">
          <span className="text-brand-dark font-medium">已選 {selected.size} 筆</span>
          <button onClick={bulkDelete} className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs hover:bg-red-600">刪除</button>
          <select onChange={(e) => { if (e.target.value) { bulkSetCategory(e.target.value); e.target.value = '' } }} defaultValue="" className="border border-gray-300 rounded px-2 py-1.5 text-xs">
            <option value="">批次改科目…</option>
            {categoryAccounts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
          </select>
          {companies.length > 0 && (
            <select onChange={(e) => { bulkSetCompany(e.target.value); e.target.value = '' }} defaultValue="" className="border border-gray-300 rounded px-2 py-1.5 text-xs">
              <option value="">批次改公司…</option>
              {companies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <button onClick={clearSel} className="text-gray-500 text-xs underline">取消選取</button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="px-3 py-2.5 w-8"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} /></th>
              <th className="px-3 py-2.5 text-left cursor-pointer select-none" onClick={() => toggleSort('date')}>日期{arrow('date')}</th>
              <th className="px-3 py-2.5 text-left cursor-pointer select-none" onClick={() => toggleSort('description')}>摘要{arrow('description')}</th>
              <th className="px-3 py-2.5 text-left">借 / 貸</th>
              <th className="px-3 py-2.5 text-right cursor-pointer select-none" onClick={() => toggleSort('amount')}>金額{arrow('amount')}</th>
              <th className="px-3 py-2.5 text-center w-16">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-gray-400">{q || onlyReview ? '查無符合資料' : '還沒有任何紀錄'}</td></tr>}
            {pagedRows.map((e) => {
              const dr = e.lines.find((l) => l.debit > 0)!
              return (
                <tr key={e.id} className={`border-t border-gray-100 hover:bg-gray-50 align-top ${selected.has(e.id) ? 'bg-brand-soft/40' : e.needsReview ? 'bg-amber-50/40 border-l-4 border-l-amber-400' : ''}`}>
                  <td className="px-3 py-2.5 text-center"><input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleOne(e.id)} /></td>
                  <td className="px-3 py-2.5 text-gray-500"><DateCell e={e} onSet={setEntryDate} /></td>
                  <td className="px-3 py-2.5 text-gray-800">
                    {e.needsReview && <span className="mr-1 text-[10px] text-amber-700 bg-amber-100 rounded px-1 py-0.5 font-medium">⚠ 待分類</span>}
                    {e.company && <span className="mr-1 text-[10px] text-brand bg-brand-soft rounded px-1.5 py-0.5">{e.company}</span>}
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
                  <td className="px-3 py-2.5"><CategoryCell e={e} accounts={sortedAccounts} onSet={setLeg} /></td>
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

      {rows.length > pageSize && (
        <div className="flex items-center justify-center gap-3 text-sm text-gray-600">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}
            className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40">上一頁</button>
          <span>第 {safePage + 1} / {pageCount} 頁（共 {rows.length} 筆）</span>
          <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1}
            className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40">下一頁</button>
        </div>
      )}

      {editing && <EditModal entry={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

// 明細列內嵌：點擊修改日期
const DateCell = React.memo(function DateCell(
  { e, onSet }: { e: JournalEntry; onSet: (e: JournalEntry, date: string) => void },
) {
  const [edit, setEdit] = useState(false)
  if (edit) {
    return (
      <input type="date" autoFocus defaultValue={e.date}
        onBlur={(ev) => { if (ev.target.value && ev.target.value !== e.date) onSet(e, ev.target.value); setEdit(false) }}
        className="border border-brand rounded px-1 py-0.5 text-xs focus:outline-none" />
    )
  }
  return <span className="cursor-pointer hover:bg-brand-soft rounded px-1 whitespace-nowrap" title="點擊修改日期" onClick={() => setEdit(true)}>{e.date} ✎</span>
})

// 明細列內嵌：借/貸科目可改。平常顯示文字，點擊才變下拉（避免一次渲染大量選項拖慢）。
const CategoryCell = React.memo(function CategoryCell(
  { e, accounts, onSet }: { e: JournalEntry; accounts: Account[]; onSet: (e: JournalEntry, side: 'debit' | 'credit', code: string) => void },
) {
  const [edit, setEdit] = useState<'debit' | 'credit' | null>(null)
  const accName = (code: string) => accounts.find((a) => a.code === code)?.name ?? code
  const dr = e.lines.find((l) => l.debit > 0)!
  const cr = e.lines.find((l) => l.credit > 0)!

  if (e.source === 'settlement') {
    return <div className="text-xs text-gray-600">借 {accName(dr.accountCode)}<br />貸 {accName(cr.accountCode)}</div>
  }

  const leg = (side: 'debit' | 'credit', code: string) => {
    const cls = `cursor-pointer rounded px-1 hover:bg-brand-soft ${e.needsReview ? 'text-amber-700 underline decoration-dotted' : 'text-gray-700'}`
    if (edit === side) {
      return (
        <select autoFocus value={code} onBlur={() => setEdit(null)}
          onChange={(ev) => { onSet(e, side, ev.target.value); setEdit(null) }}
          className="border border-brand rounded px-1 py-0.5 text-xs max-w-[170px] focus:outline-none">
          {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
        </select>
      )
    }
    return <span className={cls} title="點擊修改科目" onClick={() => setEdit(side)}>{accName(code)} ✎</span>
  }

  return (
    <div className="space-y-0.5 text-xs text-gray-600">
      <div className="flex items-center gap-1">借 {leg('debit', dr.accountCode)}</div>
      <div className="flex items-center gap-1">貸 {leg('credit', cr.accountCode)}</div>
    </div>
  )
})

function EditModal({ entry, onClose }: { entry: JournalEntry; onClose: () => void }) {
  const { accounts, updateEntry, companies } = useLedger()
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
  const [company, setCompany] = useState(entry.company ?? '')
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
        await updateEntry({ ...entry, date, description, company: company || undefined })
      } else {
        const input: QuickInput = { date, amount, description, counterparty: counterparty || undefined, company: company || undefined, direction, cashAccountCode: cashCode, accrual }
        // 使用者已指定科目 → 解除待分類
        const stillUnclassified = categoryCode === '4999' || categoryCode === '6999'
        const rebuilt = buildEntry({
          ...composeEntry(input, categoryCode, accounts), id: entry.id,
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
          <L t="公司">
            {companies.length ? (
              <select value={company} onChange={(e) => setCompany(e.target.value)} className={inp}>
                <option value="">（未指定）</option>
                {companies.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <input value={company} onChange={(e) => setCompany(e.target.value)} className={inp} />
            )}
          </L>
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
