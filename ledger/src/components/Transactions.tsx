import React, { useMemo, useState } from 'react'
import { useLedger } from '../store/useLedger'
import { composeEntry, sourceFromLegs } from '../core/suggest'
import { buildEntry } from '../core/engine'
import { classifyWithGemini } from '../core/ai'
import { formatTWD } from '../core/money'
import { downloadCSV, toCSV } from '../lib/csv'
import AccountCombo from './AccountCombo'
import type { Account, JournalEntry, QuickInput } from '../core/types'

type SortKey = 'seq' | 'date' | 'description' | 'legs'

/** 流水號顯示：補零至 7 位（可達千萬筆仍對齊；超過自動加長） */
function fmtSeq(n?: number): string {
  return typeof n === 'number' ? '#' + String(n).padStart(7, '0') : '—'
}

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
  const { entries, accounts, deleteEntry, updateEntry, deleteEntriesBulk, updateEntriesBulk, aiConfig, companies, backfillSeq } = useLedger()
  const accName = (code: string) => accounts.find((a) => a.code === code)?.name ?? code
  const categoryAccounts = accounts.filter((a) => !a.isCash)
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [asc, setAsc] = useState(false)
  const [onlyReview, setOnlyReview] = useState(false)
  const [reviewedFilter, setReviewedFilter] = useState<'all' | 'un' | 'done'>('all')
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
    const { source, settled } = sourceFromLegs(debitCode, creditCode, accounts)
    await updateEntry(buildEntry({
      date: e.date, description: e.description, counterparty: e.counterparty, company: e.company,
      counterpartyAccount: e.counterpartyAccount, branch: e.branch, voucherNo: e.voucherNo, note: e.note,
      source, settled, id: e.id, seq: e.seq, needsReview: false,
      reviewedAt: e.reviewedAt ?? new Date().toISOString(), // 人工改科目視同已核對
      lines: [{ accountCode: debitCode, debit: amount, credit: 0 }, { accountCode: creditCode, debit: 0, credit: amount }],
    }))
  }, [accounts, updateEntry])

  const setEntryDate = React.useCallback(async (e: JournalEntry, date: string) => {
    await updateEntry({ ...e, date })
  }, [updateEntry])

  // 核對勾記：點一下標「已核對」、再點取消（存入資料庫，跨裝置/中斷後保留進度）
  const toggleReviewed = React.useCallback(async (e: JournalEntry) => {
    await updateEntry({ ...e, reviewedAt: e.reviewedAt ? undefined : new Date().toISOString() })
  }, [updateEntry])

  const reviewCount = entries.filter((e) => e.needsReview).length
  const noSeqCount = entries.filter((e) => typeof e.seq !== 'number').length

  async function onBackfill() {
    const n = await backfillSeq()
    alert(n ? `已為 ${n} 筆舊資料補上流水號。` : '所有交易都已經有流水號了。')
  }

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const amountOf = (e: JournalEntry) => e.lines.find((l) => l.debit > 0)?.debit ?? 0
    const debitCodeOf = (e: JournalEntry) => e.lines.find((l) => l.debit > 0)?.accountCode ?? ''
    const creditCodeOf = (e: JournalEntry) => e.lines.find((l) => l.credit > 0)?.accountCode ?? ''
    const filtered = entries.filter((e) => {
      if (onlyReview && !e.needsReview) return false
      if (reviewedFilter === 'un' && e.reviewedAt) return false
      if (reviewedFilter === 'done' && !e.reviewedAt) return false
      if (companyFilter && e.company !== companyFilter) return false
      if (!kw) return true
      const hay = [e.date, e.description, e.counterparty ?? '', e.company ?? '', e.counterpartyAccount ?? '', e.branch ?? '', e.voucherNo ?? '', e.note ?? '', accName(debitCodeOf(e)), accName(creditCodeOf(e)), String(amountOf(e))].join(' ').toLowerCase()
      return hay.includes(kw)
    })
    return [...filtered].sort((a, b) => {
      let r = 0
      if (sortKey === 'seq') r = (a.seq ?? 0) - (b.seq ?? 0)
      else if (sortKey === 'date') r = a.date < b.date ? -1 : a.date > b.date ? 1 : 0
      else if (sortKey === 'description') r = a.description.localeCompare(b.description, 'zh-Hant')
      else { // legs：借方科目 → 貸方科目 視為一組排序
        r = debitCodeOf(a).localeCompare(debitCodeOf(b))
        if (r === 0) r = creditCodeOf(a).localeCompare(creditCodeOf(b))
      }
      return asc ? r : -r
    })
  }, [entries, q, sortKey, asc, onlyReview, reviewedFilter, companyFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const pagedRows = rows.slice(safePage * pageSize, safePage * pageSize + pageSize)
  React.useEffect(() => { setPage(0) }, [q, onlyReview, reviewedFilter, companyFilter])

  // 核對進度（依目前公司篩選範圍計算）
  const progress = useMemo(() => {
    const scope = companyFilter ? entries.filter((e) => e.company === companyFilter) : entries
    return { done: scope.filter((e) => e.reviewedAt).length, total: scope.length }
  }, [entries, companyFilter])

  function toggleSort(k: SortKey) {
    if (sortKey === k) setAsc(!asc)
    else { setSortKey(k); setAsc(k === 'date' ? false : true) }
  }
  const arrow = (k: SortKey) => (sortKey === k ? (asc ? ' ▲' : ' ▼') : '')

  function exportCsv() {
    const data = rows.map((e) => {
      const dr = e.lines.find((l) => l.debit > 0)!; const cr = e.lines.find((l) => l.credit > 0)!
      return [e.seq ?? '', e.date, e.company ?? '', e.description, accName(dr.accountCode), accName(cr.accountCode), dr.debit,
        e.voucherNo ?? '', e.note ?? '',
        e.source === 'accrual' ? '應計' : e.source === 'settlement' ? '沖銷' : '現金', e.needsReview ? '待分類' : '',
        e.reviewedAt ? `✓ ${e.reviewedAt.slice(0, 10)}` : '']
    })
    downloadCSV('交易明細', toCSV(['流水號', '日期', '公司', '摘要', '借方科目', '貸方科目', '金額', '憑證編號', '備註', '類型', '狀態', '核對'], data))
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
  async function bulkSetReviewed(done: boolean) {
    const now = new Date().toISOString()
    const upd = entries.filter((e) => selected.has(e.id)).map((e) => ({ ...e, reviewedAt: done ? (e.reviewedAt ?? now) : undefined }))
    await updateEntriesBulk(upd); clearSel()
  }
  async function bulkSetCategory(code: string) {
    const upd = entries.filter((e) => selected.has(e.id) && e.source !== 'settlement').map((e) => {
      const input = entryToInput(e, accounts)
      return buildEntry({ ...composeEntry(input, code, accounts), id: e.id, seq: e.seq, company: e.company, counterpartyAccount: e.counterpartyAccount, branch: e.branch, voucherNo: e.voucherNo, note: e.note, needsReview: false, reviewedAt: e.reviewedAt ?? new Date().toISOString() })
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
        // Gemini 分類非人工核對：保留原核對狀態，讓使用者仍可用「未核對」篩出來驗證
        const rebuilt = buildEntry({ ...composeEntry(input, r.accountCode, accounts), id: e.id, seq: e.seq, counterpartyAccount: e.counterpartyAccount, branch: e.branch, voucherNo: e.voucherNo, note: e.note, needsReview: false, reviewedAt: e.reviewedAt })
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
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 搜尋摘要 / 公司 / 科目 / 憑證 / 備註 / 金額…"
          className="flex-1 min-w-[180px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
        {companies.length > 0 && (
          <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand">
            <option value="">全部公司</option>
            {companies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <select value={reviewedFilter} onChange={(e) => setReviewedFilter(e.target.value as 'all' | 'un' | 'done')}
          className={`border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand ${reviewedFilter === 'un' ? 'border-brand text-brand-dark bg-brand-soft' : 'border-gray-300'}`}
          title="核對進度篩選：中斷後回來選「未核對」即可接著做">
          <option value="all">核對：全部</option>
          <option value="un">☐ 未核對（{progress.total - progress.done}）</option>
          <option value="done">✓ 已核對（{progress.done}）</option>
        </select>
        <span className="text-xs text-gray-500 whitespace-nowrap tabular-nums" title="依目前公司範圍統計">
          進度 {progress.done}/{progress.total}{progress.total > 0 && `（${Math.round((progress.done / progress.total) * 100)}%）`}
        </span>
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
        {noSeqCount > 0 && (
          <button onClick={onBackfill} className="px-3 py-2 rounded-lg bg-brand-soft text-brand-dark border border-brand-light/40 text-sm whitespace-nowrap hover:bg-brand-light/20" title="為匯入的舊資料補上流水號">
            # 補編流水號 {noSeqCount}
          </button>
        )}
        <button onClick={exportCsv} className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap">⬇ 匯出 Excel</button>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-brand-soft border border-brand-light/40 rounded-lg p-2 text-sm">
          <span className="text-brand-dark font-medium">已選 {selected.size} 筆</span>
          <button onClick={() => bulkSetReviewed(true)} className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs hover:bg-green-700">✓ 標已核對</button>
          <button onClick={() => bulkSetReviewed(false)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs hover:bg-gray-50">取消核對</button>
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
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="px-3 py-2.5 w-10 text-center"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} className="w-5 h-5 align-middle accent-brand cursor-pointer" /></th>
              <th className="px-3 py-2.5 text-left cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('seq')}>流水號{arrow('seq')}</th>
              <th className="px-3 py-2.5 text-left cursor-pointer select-none" onClick={() => toggleSort('date')}>日期{arrow('date')}</th>
              <th className="px-3 py-2.5 text-left">公司</th>
              <th className="px-3 py-2.5 text-left cursor-pointer select-none" onClick={() => toggleSort('description')}>摘要{arrow('description')}</th>
              <th className="px-3 py-2.5 text-left cursor-pointer select-none" onClick={() => toggleSort('legs')}>借方{arrow('legs')}</th>
              <th className="px-3 py-2.5 text-left cursor-pointer select-none" onClick={() => toggleSort('legs')}>貸方{arrow('legs')}</th>
              <th className="px-3 py-2.5 text-left">憑證編號</th>
              <th className="px-3 py-2.5 text-left">備註</th>
              <th className="px-3 py-2.5 text-center w-12" title="人工核對進度">核對</th>
              <th className="px-3 py-2.5 text-center w-16">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={11} className="px-3 py-10 text-center text-gray-400">{q || onlyReview || reviewedFilter !== 'all' ? '查無符合資料' : '還沒有任何紀錄'}</td></tr>}
            {pagedRows.map((e) => (
              <tr key={e.id} className={`border-t border-gray-100 hover:bg-gray-50 align-top ${selected.has(e.id) ? 'bg-brand-soft/40' : e.needsReview ? 'bg-amber-50/40 border-l-4 border-l-amber-400' : ''}`}>
                <td className="px-1 py-1 text-center cursor-pointer" onClick={() => toggleOne(e.id)}>
                  <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleOne(e.id)} onClick={(ev) => ev.stopPropagation()} className="w-5 h-5 align-middle accent-brand cursor-pointer" />
                </td>
                <td className="px-3 py-2.5 text-gray-400 tabular-nums whitespace-nowrap text-xs">{fmtSeq(e.seq)}</td>
                <td className="px-3 py-2.5 text-gray-500"><DateCell e={e} onSet={setEntryDate} /></td>
                <td className="px-3 py-2.5">{e.company && <span className="text-[11px] text-brand bg-brand-soft rounded px-1.5 py-0.5 whitespace-nowrap">{e.company}</span>}</td>
                <td className="px-3 py-2.5 text-gray-800">
                  {e.needsReview && <span className="mr-1 text-[10px] text-amber-700 bg-amber-100 rounded px-1 py-0.5 font-medium">⚠ 待分類</span>}
                  {e.description}
                  {e.counterparty && <span className="text-gray-400 text-xs"> · {e.counterparty}</span>}
                  {e.source === 'accrual' && <span className="ml-1 text-[10px] text-amber-600 bg-amber-50 rounded px-1">應計</span>}
                  {e.source === 'settlement' && <span className="ml-1 text-[10px] text-brand bg-brand-soft rounded px-1">沖銷</span>}
                  {(e.counterpartyAccount || e.branch) && (
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {e.counterpartyAccount && <span>對方帳號 {e.counterpartyAccount}　</span>}
                      {e.branch && <span>分行 {e.branch}</span>}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5"><LegCell e={e} side="debit" accounts={sortedAccounts} onSet={setLeg} /></td>
                <td className="px-3 py-2.5"><LegCell e={e} side="credit" accounts={sortedAccounts} onSet={setLeg} /></td>
                <td className="px-3 py-2.5 text-gray-600 text-xs whitespace-nowrap">{e.voucherNo}</td>
                <td className="px-3 py-2.5 text-gray-600 text-xs">{e.note}</td>
                <td className="px-1 py-2.5 text-center">
                  <button onClick={() => toggleReviewed(e)}
                    title={e.reviewedAt ? `已核對 ${e.reviewedAt.slice(0, 10)}（點擊取消）` : '點擊標記為已核對'}
                    className={`w-7 h-7 rounded-full text-sm ${e.reviewedAt ? 'bg-green-100 text-green-700' : 'border border-gray-300 text-gray-300 hover:border-green-400 hover:text-green-500'}`}>
                    ✓
                  </button>
                </td>
                <td className="px-3 py-2.5 text-center whitespace-nowrap">
                  <button onClick={() => setEditing(e)} className="text-gray-400 hover:text-brand mr-2" title="編輯">✎</button>
                  <button onClick={() => { if (confirm('刪除這筆紀錄？')) deleteEntry(e.id) }} className="text-gray-300 hover:text-red-500" title="刪除">✕</button>
                </td>
              </tr>
            ))}
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

// 明細列內嵌：借（或貸）科目 + 金額。平常顯示文字，點擊才變成可搜尋下拉。
const LegCell = React.memo(function LegCell(
  { e, side, accounts, onSet }: { e: JournalEntry; side: 'debit' | 'credit'; accounts: Account[]; onSet: (e: JournalEntry, side: 'debit' | 'credit', code: string) => void },
) {
  const [edit, setEdit] = useState(false)
  const accName = (code: string) => accounts.find((a) => a.code === code)?.name ?? code
  const line = side === 'debit' ? e.lines.find((l) => l.debit > 0)! : e.lines.find((l) => l.credit > 0)!
  const amount = side === 'debit' ? line.debit : line.credit

  if (e.source === 'settlement') {
    return (
      <div className="text-sm text-gray-600">
        {accName(line.accountCode)}
        <div className="tabular-nums text-gray-400">{formatTWD(amount)}</div>
      </div>
    )
  }

  if (edit) {
    return (
      <div className="min-w-[170px]">
        <AccountCombo accounts={accounts} value={line.accountCode} autoFocus
          onChange={(code) => { onSet(e, side, code); setEdit(false) }} onClose={() => setEdit(false)} />
      </div>
    )
  }

  return (
    <div className={`cursor-pointer rounded px-1 hover:bg-brand-soft ${e.needsReview ? 'text-amber-700' : 'text-gray-700'}`}
      title="點擊修改科目" onClick={() => setEdit(true)}>
      <div className="flex items-center gap-1 text-sm">{accName(line.accountCode)} <span className="text-gray-300">✎</span></div>
      <div className="tabular-nums text-gray-500 text-sm">{formatTWD(amount)}</div>
    </div>
  )
})

function EditModal({ entry, onClose }: { entry: JournalEntry; onClose: () => void }) {
  const { accounts, updateEntry, companies } = useLedger()
  const sortedAccounts = useMemo(() => [...accounts].sort((a, b) => a.code.localeCompare(b.code)), [accounts])
  const isSettlement = entry.source === 'settlement'
  const dr0 = entry.lines.find((l) => l.debit > 0)!
  const cr0 = entry.lines.find((l) => l.credit > 0)!

  const [date, setDate] = useState(entry.date)
  const [description, setDescription] = useState(entry.description)
  const [company, setCompany] = useState(entry.company ?? '')
  const [debitCode, setDebitCode] = useState(dr0.accountCode)
  const [creditCode, setCreditCode] = useState(cr0.accountCode)
  const [amount, setAmount] = useState(dr0.debit)
  const [voucherNo, setVoucherNo] = useState(entry.voucherNo ?? '')
  const [note, setNote] = useState(entry.note ?? '')
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setErr(null)
    try {
      if (isSettlement) {
        await updateEntry({ ...entry, date, description, company: company || undefined, note: note || undefined })
      } else {
        if (amount <= 0 || !debitCode || !creditCode) throw new Error('請填寫借方、貸方與金額')
        if (debitCode === creditCode) throw new Error('借方與貸方不可為同一科目')
        const { source, settled } = sourceFromLegs(debitCode, creditCode, accounts)
        await updateEntry(buildEntry({
          id: entry.id, seq: entry.seq, date, description, company: company || undefined,
          counterparty: entry.counterparty, counterpartyAccount: entry.counterpartyAccount, branch: entry.branch,
          voucherNo: voucherNo || undefined, note: note || undefined,
          source, settled, needsReview: false,
          reviewedAt: entry.reviewedAt ?? new Date().toISOString(), // 人工編輯視同已核對
          lines: [{ accountCode: debitCode, debit: amount, credit: 0 }, { accountCode: creditCode, debit: 0, credit: amount }],
        }))
      }
      onClose()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b sticky top-0 bg-white">
          <h3 className="font-bold text-sm">編輯紀錄{isSettlement && '（沖銷：僅可改日期/摘要/備註）'}</h3>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>
        <div className="p-5 space-y-3">
          {entry.needsReview && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">此筆為「待分類」，選好借/貸科目儲存即可解除提醒。</div>}
          <L t="日期"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} /></L>
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
          <L t="摘要"><input value={description} onChange={(e) => setDescription(e.target.value)} className={inp} /></L>
          {!isSettlement && <>
            <L t="借方科目"><AccountCombo accounts={sortedAccounts} value={debitCode} onChange={setDebitCode} /></L>
            <L t="貸方科目"><AccountCombo accounts={sortedAccounts} value={creditCode} onChange={setCreditCode} /></L>
            <L t="金額"><input type="number" value={amount || ''} min={1} onChange={(e) => setAmount(Math.floor(Number(e.target.value) || 0))} className={`${inp} text-right`} /></L>
            <L t="憑證編號"><input value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)} className={inp} /></L>
          </>}
          <L t="備註"><input value={note} onChange={(e) => setNote(e.target.value)} className={inp} /></L>
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
