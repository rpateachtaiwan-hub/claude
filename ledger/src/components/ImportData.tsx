import React, { useState } from 'react'
import { useLedger } from '../store/useLedger'
import { PLACEHOLDER_ACCOUNTS } from '../core/accounts'
import { rowToEntries, planRow, type RowInput, type RowPlan } from '../core/importMap'
import { formatTWD } from '../core/money'
import { parseAmount, normalizeDate } from '../lib/csv'
import { fileToRows } from '../lib/xlsx'
import type { Account, Category, JournalEntry } from '../core/types'

type Mode = 'tx' | 'accounts'

export default function ImportData() {
  const [mode, setMode] = useState<Mode>('tx')
  return (
    <div className="w-full p-4 sm:p-6 space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setMode('tx')} className={tab(mode === 'tx')}>匯入歷史交易</button>
        <button onClick={() => setMode('accounts')} className={tab(mode === 'accounts')}>匯入會計科目</button>
      </div>
      {mode === 'tx' ? <ImportTx /> : <ImportAccounts />}
    </div>
  )
}

const tab = (active: boolean) =>
  `px-4 py-2 rounded-lg text-sm font-medium ${active ? 'bg-brand text-white' : 'bg-white border border-gray-300 text-gray-600'}`

function FileBox({ onRows }: { onRows: (rows: string[][], name: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setBusy(true); setErr(null)
    try {
      const rows = await fileToRows(f)
      onRows(rows, f.name)
    } catch (er) {
      setErr(er instanceof Error ? er.message : '檔案讀取失敗')
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }
  return (
    <div>
      <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-brand-light/60 bg-brand-soft text-sm text-brand-dark cursor-pointer hover:bg-brand-soft/70">
        📄 選擇 Excel / CSV 檔
        <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="hidden" />
      </label>
      {busy && <span className="ml-2 text-xs text-gray-500">讀取中…</span>}
      {err && <p className="text-sm text-red-600 mt-1">{err}</p>}
    </div>
  )
}

// ── 匯入歷史交易 ──────────────────────────────────────────────────────────────
function ImportTx() {
  const { accounts, companies, addEntriesBulk, addAccountsBulk } = useLedger()
  const [rawRows, setRawRows] = useState<string[][] | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [company, setCompany] = useState('')
  const [cashCode, setCashCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [catOverride, setCatOverride] = useState<Record<string, string>>({})
  const [accrualOn, setAccrualOn] = useState(true)
  const accName = (code: string) => accounts.find((a) => a.code === code)?.name ?? code
  const categoryAccounts = accounts.filter((a) => !a.isCash)

  // 收/付款帳戶選項：優先現金科目，無則列資產類
  const cashOptions = accounts.filter((a) => a.isCash).length ? accounts.filter((a) => a.isCash) : accounts.filter((a) => a.category === 'asset')

  React.useEffect(() => { if (!company && companies.length) setCompany(companies[0]) }, [companies]) // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (cashOptions.length && !cashOptions.some((a) => a.code === cashCode)) {
      const prefer = cashOptions.find((a) => /銀行|現金/.test(a.name)) ?? cashOptions[0]
      setCashCode(prefer.code)
    }
  }, [accounts]) // eslint-disable-line react-hooks/exhaustive-deps

  function handle(rows: string[][]) { setDone(null); setCatOverride({}); setRawRows(rows) }

  // 檔案中出現的不重複「類別」值
  const cats = React.useMemo(() => {
    if (!rawRows || rawRows.length < 2) return []
    const cCat = findCol(rawRows[0], '類別')
    if (cCat < 0) return []
    const set = new Set<string>()
    for (const r of rawRows.slice(1)) { const t = (r[cCat] ?? '').trim(); if (t) set.add(t) }
    return [...set]
  }, [rawRows])

  const parsed = React.useMemo(
    () => (rawRows && cashCode ? mapTxRows(rawRows, accounts, cashCode, catOverride, accrualOn) : null),
    [rawRows, accounts, cashCode, catOverride, accrualOn],
  )
  const needCompany = companies.length > 0 && !company

  async function doImport() {
    if (!parsed?.entries.length || needCompany || !cashCode) return
    setBusy(true)
    try {
      await addAccountsBulk(PLACEHOLDER_ACCOUNTS) // 確保「收入(未分類)/其他成本」存在
      const entries = parsed.entries.map((e) => ({ ...e, company: company || undefined }))
      await addEntriesBulk(entries)
      const review = entries.filter((e) => e.needsReview).length
      const accr = parsed.accrualCount > 0 ? `，含 ${parsed.accrualCount} 筆跨期自動拆應計` : ''
      setDone(`已匯入 ${parsed.importableRows} 筆交易（共 ${entries.length} 張分錄${accr}）${company ? `／公司：${company}` : ''}${review ? `；其中 ${review} 筆未對到科目（已暫列未分類，請到「明細」補上）` : '；已全部對到科目'}`)
      setRawRows(null)
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <div className="bg-brand-soft border border-brand-light/40 rounded-lg p-3 text-xs text-gray-600 leading-relaxed">
        上傳 Excel/CSV（<b>第一列需為標題</b>）。辨識欄位：<b>日期、內容/備註、收入、支出、類別、對方帳號、交易分行、發票/請款單號</b>。
        借貸以<b>所選銀行帳戶</b>為基準：有「收入」金額＝借銀行、有「支出」＝貸銀行。
        科目優先用<b>「內容」關鍵字</b>智慧配對（其次「類別」欄），對不到的暫列<b>待確認</b>，於明細再調整。
      </div>

      <label className="flex items-start gap-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg p-3">
        <input type="checkbox" checked={accrualOn} onChange={(e) => setAccrualOn(e.target.checked)} className="mt-0.5 w-4 h-4 accent-brand" />
        <span>
          <b>自動拆分跨期應計（依內容期別代碼 YYMM）</b>
          <span className="block text-xs text-gray-500 mt-0.5">例：6/1 付的「2604健保費」→ 在 4/30 認列應計、6/1 自動沖銷，使 4 月損益正確。同月份者維持現金入帳。可在下方預覽檢查「應計」標記。</span>
        </span>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">這份檔案屬於哪間公司？</label>
          {companies.length ? (
            <select value={company} onChange={(e) => setCompany(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand">
              {companies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <p className="text-xs text-amber-600">尚未建立公司，請先到「設定 → 公司」新增。</p>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">這份檔案的銀行 / 現金帳戶</label>
          {cashOptions.length ? (
            <select value={cashCode} onChange={(e) => setCashCode(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand">
              {cashOptions.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
            </select>
          ) : (
            <p className="text-xs text-amber-600">尚無資產/現金科目，請先到「設定 → 科目表」新增一個（並勾「現金/銀行帳戶」）。</p>
          )}
        </div>
      </div>

      <FileBox onRows={handle} />

      {parsed?.error && <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">{parsed.error}</div>}

      {cats.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="text-sm font-medium text-gray-700 mb-2">「類別」對應科目（可調整，套用到該類別所有交易）</div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {cats.map((cat) => {
              const auto = matchCategory(cat, accounts)
              const cur = catOverride[cat] ?? auto ?? ''
              return (
                <div key={cat} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate text-gray-700" title={cat}>{cat}</span>
                  <span className="text-gray-300">→</span>
                  <select value={cur} onChange={(e) => setCatOverride((p) => ({ ...p, [cat]: e.target.value }))}
                    className={`w-56 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand ${cur ? 'border-gray-300' : 'border-amber-300 bg-amber-50'}`}>
                    <option value="">（待確認）</option>
                    {categoryAccounts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
                  </select>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {parsed && (parsed.totalRows > 0 || parsed.entries.length > 0) && (
        <div className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3">
          讀到 <b>{parsed.totalRows}</b> 列 · 可匯入 <b className="text-brand">{parsed.importableRows}</b> 筆交易（共 {parsed.entries.length} 張分錄）
          {parsed.accrualCount > 0 && <span className="text-brand-dark"> · 跨期應計 {parsed.accrualCount} 筆</span>}
          {parsed.needsReviewCount > 0 && <span className="text-amber-600"> · 未對到科目 {parsed.needsReviewCount} 筆</span>}
          {parsed.skippedNoAmount > 0 && <span> · 略過無金額 {parsed.skippedNoAmount} 列</span>}
          {parsed.skippedNoDate > 0 && <span className="text-amber-600"> · 略過日期無法辨識 {parsed.skippedNoDate} 列</span>}
        </div>
      )}

      {parsed && parsed.rowResults.length > 0 && (
        <>
          <div className="text-sm text-gray-600">預覽（顯示前 {Math.min(20, parsed.rowResults.length)} 筆；標「應計」者會回到期別月份認列並自動沖銷）：</div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="bg-gray-50 text-gray-500 text-xs">
                <th className="px-2 py-2 text-left">日期</th><th className="px-2 py-2 text-left">內容</th>
                <th className="px-2 py-2 text-left">借方</th><th className="px-2 py-2 text-left">貸方</th>
                <th className="px-2 py-2 text-right">金額</th><th className="px-2 py-2 text-left">處理</th>
              </tr></thead>
              <tbody>
                {parsed.rowResults.slice(0, 20).map((r, i) => (
                  <tr key={i} className={`border-t border-gray-100 ${r.plan.review ? 'bg-amber-50/50' : ''}`}>
                    <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">{r.date}</td>
                    <td className="px-2 py-1.5 text-gray-700">{r.desc}</td>
                    <td className="px-2 py-1.5 text-xs text-gray-600">{accName(r.plan.debitCode)}</td>
                    <td className="px-2 py-1.5 text-xs text-gray-600">{accName(r.plan.creditCode)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatTWD(r.amount)}</td>
                    <td className="px-2 py-1.5 text-xs whitespace-nowrap">
                      {r.plan.accrual
                        ? <span className="text-brand-dark bg-brand-soft rounded px-1.5 py-0.5">應計 → {r.plan.accrualDate}</span>
                        : r.plan.review
                          ? <span className="text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">待確認</span>
                          : <span className="text-gray-400">現金</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={doImport} disabled={needCompany || !cashCode || busy} className="px-5 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark disabled:opacity-50">
            {busy ? '匯入中…' : `確認匯入 ${parsed.importableRows} 筆交易${company ? `到「${company}」` : ''}`}
          </button>
        </>
      )}
      {parsed && parsed.entries.length === 0 && !parsed.error && <div className="text-sm text-gray-500">這個檔案沒有可匯入的資料列。</div>}
      {done && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">{done}</div>}
    </div>
  )
}

function findCol(headers: string[], ...keys: string[]): number {
  return headers.findIndex((h) => keys.some((k) => h.includes(k)))
}

// 由「類別」欄文字對應到科目表中的科目：先精確比對，再取「科目名稱為類別文字子字串」中最長者。
function matchCategory(catText: string, accounts: Account[]): string | null {
  const t = catText.trim()
  if (!t) return null
  const exact = accounts.find((a) => !a.isCash && (a.name === t || a.code === t))
  if (exact) return exact.code
  const sub = accounts
    .filter((a) => !a.isCash && a.name.length >= 2 && t.includes(a.name))
    .sort((a, b) => b.name.length - a.name.length)[0]
  return sub?.code ?? null
}

interface RowResult { date: string; desc: string; amount: number; direction: 'in' | 'out'; plan: RowPlan }

function cleanVoucher(s: string): string | undefined {
  const t = (s ?? '').trim()
  if (!t || t === '待補' || t === '無') return undefined
  return t
}

function mapTxRows(rows: string[][], accounts: Account[], cashCode: string, catOverride: Record<string, string> = {}, accrualOn = true) {
  const result = {
    entries: [] as JournalEntry[],
    rowResults: [] as RowResult[],
    error: null as string | null, totalRows: 0, importableRows: 0, skippedNoAmount: 0, skippedNoDate: 0, needsReviewCount: 0, accrualCount: 0,
  }
  if (rows.length < 2) { result.error = '檔案需含標題列與至少一列資料。'; return result }
  const headers = rows[0]
  const cDate = findCol(headers, '帳務日期', '付款日期', '日期')
  const cDesc = findCol(headers, '備註', '內容', '摘要', '說明')
  const cCat = findCol(headers, '類別')
  const cCpAcct = findCol(headers, '對方帳號')
  const cBranch = findCol(headers, '交易分行', '分行')
  const cInvNo = findCol(headers, '收入發票號碼', '發票號碼', '發票')
  const cVoucher = findCol(headers, '支出請款單號', '請款單號', '請款單', '支出憑證類別', '憑證類別', '憑證編號', '憑證')
  const cIn = headers.findIndex((h) => ['存入金額', '收入'].includes(h.trim()) || h.includes('存入') || (h.includes('收入') && !h.includes('發票')))
  const cOut = headers.findIndex((h) => ['提出金額', '支出'].includes(h.trim()) || h.includes('提出') || (h.includes('支出') && !h.includes('憑證') && !h.includes('請款')))
  if (cDate < 0 || (cIn < 0 && cOut < 0)) {
    result.error = '找不到日期或收入/支出欄位，請確認標題列名稱。'
    return result
  }

  const opts = { catOverride, matchCategory, accrualOn }
  let lastDate = '' // 日期常只在每日第一列出現，空白時沿用上一筆

  for (const row of rows.slice(1)) {
    if (row.every((c) => !c || !c.trim())) continue
    result.totalRows++

    const income = cIn >= 0 ? parseAmount(row[cIn] ?? '') : 0
    const expense = cOut >= 0 ? parseAmount(row[cOut] ?? '') : 0
    const amount = income > 0 ? income : expense
    if (amount <= 0) { result.skippedNoAmount++; continue }

    let date = normalizeDate(row[cDate] ?? '')
    if (date) lastDate = date
    else date = lastDate
    if (!date) { result.skippedNoDate++; continue }

    const direction: 'in' | 'out' = income > 0 ? 'in' : 'out'
    const desc = (cDesc >= 0 ? row[cDesc] : '') || '（無備註）'
    const catText = cCat >= 0 ? (row[cCat] ?? '').trim() : ''
    const counterpartyAccount = cCpAcct >= 0 ? row[cCpAcct] || undefined : undefined
    const branch = cBranch >= 0 ? row[cBranch] || undefined : undefined
    const invNo = cInvNo >= 0 ? cleanVoucher(row[cInvNo]) : undefined
    const voucher = cVoucher >= 0 ? cleanVoucher(row[cVoucher]) : undefined
    const voucherNo = direction === 'in' ? invNo || voucher : voucher || invNo

    const rowInput: RowInput = { date, amount, direction, description: desc, catText: catText || undefined, counterpartyAccount, branch, voucherNo }
    try {
      const plan = planRow(rowInput, cashCode, accounts, opts)
      const entries = rowToEntries(rowInput, cashCode, accounts, opts)
      result.entries.push(...entries)
      result.rowResults.push({ date, desc, amount, direction, plan })
      result.importableRows++
      if (plan.accrual) result.accrualCount++
      if (plan.review) result.needsReviewCount++
    } catch { /* skip 無法建立的列 */ }
  }
  return result
}

// ── 匯入會計科目（編號 / 科目）────────────────────────────────────────────────
function ImportAccounts() {
  const { addAccountsBulk } = useLedger()
  const [parsed, setParsed] = useState<Account[] | null>(null)
  const [done, setDone] = useState<string | null>(null)

  function handle(rows: string[][]) { setDone(null); setParsed(mapAccountRows(rows)) }

  async function doImport() {
    if (!parsed?.length) return
    await addAccountsBulk(parsed)
    setDone(`已匯入/更新 ${parsed.length} 個科目`)
    setParsed(null)
  }

  return (
    <div className="space-y-3">
      <div className="bg-brand-soft border border-brand-light/40 rounded-lg p-3 text-xs text-gray-600 leading-relaxed">
        上傳含「編號」「科目」兩欄的 Excel/CSV。系統依<b>編號開頭數字</b>自動判類別：
        1=資產、2=負債、3=權益、4=收入、5/6/7=費用；名稱含「現金/銀行/存款」標記為現金、「應收/應付」標記為需沖銷。匯入後可在「設定」微調。
      </div>
      <FileBox onRows={handle} />
      {parsed && parsed.length > 0 && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="bg-gray-50 text-gray-500 text-xs"><th className="px-3 py-2 text-left">編號</th><th className="px-3 py-2 text-left">科目</th><th className="px-3 py-2 text-left">判定類別</th></tr></thead>
              <tbody>
                {parsed.map((a) => (
                  <tr key={a.code} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 font-mono text-xs">{a.code}</td>
                    <td className="px-3 py-1.5 text-gray-700">{a.name}{a.isCash ? ' 💵' : ''}{a.isOpenItem ? ' 🔁' : ''}</td>
                    <td className="px-3 py-1.5 text-gray-500">{catZh[a.category]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={doImport} className="px-5 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark">確認匯入 {parsed.length} 個科目</button>
        </>
      )}
      {parsed && parsed.length === 0 && <div className="text-sm text-gray-500">沒有解析到科目，請確認檔案有「編號、科目」兩欄。</div>}
      {done && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">{done}</div>}
    </div>
  )
}

const catZh: Record<Category, string> = { asset: '資產', liability: '負債', equity: '權益', revenue: '收入', expense: '費用' }

function categoryFromCode(code: string): Category {
  switch (code.trim()[0]) {
    case '1': return 'asset'
    case '2': return 'liability'
    case '3': return 'equity'
    case '4': return 'revenue'
    default: return 'expense'
  }
}

function mapAccountRows(rows: string[][]): Account[] {
  if (!rows.length) return []
  const data = /編號|科目|代號|名稱/.test(rows[0].join('')) ? rows.slice(1) : rows
  const out: Account[] = []
  const seen = new Set<string>()
  for (const row of data) {
    if (row.length < 2) continue
    let code = row[0]; let name = row[1]
    if (!/^\d/.test(code) && /^\d/.test(name)) { code = row[1]; name = row[0] }
    code = code.trim(); name = name.trim()
    if (!code || !name || seen.has(code)) continue
    seen.add(code)
    const category = categoryFromCode(code)
    const isCash = /現金|銀行|存款|零用金/.test(name)
    const isOpenItem = /應收|應付/.test(name)
    const normalBalance = category === 'asset' || category === 'expense' ? 'debit' : 'credit'
    out.push({ code, name, category, normalBalance, isCash, isOpenItem, active: true })
  }
  return out
}
