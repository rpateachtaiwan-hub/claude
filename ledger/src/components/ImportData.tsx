import React, { useState } from 'react'
import { useLedger } from '../store/useLedger'
import { PLACEHOLDER_ACCOUNTS } from '../core/accounts'
import { rowToEntries, planRow, existingDupKeys, consumeDup, isOpeningBalanceRow, type RowInput, type RowPlan } from '../core/importMap'
import { supabase, hasSupabase } from '../lib/supabase'
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

// ── 銀行帳號 → 公司／科目 自動建議 ────────────────────────────────────────────
/** 銀行端公司全名（路特租車有限公司）→ 記帳端簡稱（路特租車） */
const COMPANY_SUFFIX = /(股份有限公司|有限公司|股份公司|企業社|商行|公司)$/

export function suggestCompany(bankCompanyName: string | null | undefined, companies: string[]): string | null {
  const raw = (bankCompanyName ?? '').trim()
  if (!raw || !companies.length) return null
  const n = raw.replace(COMPANY_SUFFIX, '')
  if (!n) return null
  return (
    companies.find((c) => c === n) ??
    companies.find((c) => n.startsWith(c) || c.startsWith(n)) ??
    companies.find((c) => n.includes(c) || c.includes(n)) ??
    null
  )
}

/** 銀行帳號 → 對應的銀行/現金科目。科目名稱帶帳號（或末四碼）者優先，否則取名稱含「銀行」者。 */
export function suggestCashCode(bankAccountNo: string, options: Account[]): string | null {
  if (!options.length) return null
  const acct = (bankAccountNo ?? '').trim()
  const tail = acct.slice(-4)
  return (
    (acct ? options.find((a) => a.name.includes(acct))?.code : undefined) ??
    (tail.length === 4 ? options.find((a) => a.name.includes(tail))?.code : undefined) ??
    options.find((a) => /銀行/.test(a.name))?.code ??
    options[0]?.code ??
    null
  )
}

/** 一批機器人銀行明細的來源資訊 */
interface BankBatch {
  ids: number[]
  label: string
  acct: string
  bankCompany: string
}
/** 依帳號自動推得的匯入目標，待使用者確認 */
interface BankSuggestion {
  acct: string
  bankCompany: string
  company: string | null
  cashCode: string | null
}

// ── 匯入歷史交易 ──────────────────────────────────────────────────────────────
function ImportTx() {
  const { accounts, companies, entries, addEntriesBulk, addAccountsBulk } = useLedger()
  const [rawRows, setRawRows] = useState<string[][] | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [company, setCompany] = useState('')
  const [cashCode, setCashCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [catOverride, setCatOverride] = useState<Record<string, string>>({})
  const [accrualOn, setAccrualOn] = useState(true)
  const [dedupOn, setDedupOn] = useState(true)
  /** 若本批資料來自機器人銀行明細暫存區，記錄其 id 清單；匯入成功後標記已入帳 */
  const [bankBatch, setBankBatch] = useState<BankBatch | null>(null)
  /** 依銀行帳號自動帶入的公司／科目，顯示給使用者確認 */
  const [bankSuggest, setBankSuggest] = useState<BankSuggestion | null>(null)
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

  function handle(rows: string[][]) { setDone(null); setCatOverride({}); setBankBatch(null); setBankSuggest(null); setRawRows(rows) }

  function handleBank(rows: string[][], batch: BankBatch) {
    setDone(null); setCatOverride({}); setBankBatch(batch); setRawRows(rows)
    // 依帳號自動帶入公司與銀行科目；帶不出來就維持現值，由使用者自己選
    const co = suggestCompany(batch.bankCompany, companies)
    const cc = suggestCashCode(batch.acct, cashOptions)
    if (co) setCompany(co)
    if (cc) setCashCode(cc)
    setBankSuggest({ acct: batch.acct, bankCompany: batch.bankCompany, company: co, cashCode: cc })
  }

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
    () => (rawRows && cashCode
      ? mapTxRows(rawRows, accounts, cashCode, {
          catOverride, accrualOn,
          existingKeys: dedupOn ? existingDupKeys(entries) : undefined,
          company: company || undefined,
        })
      : null),
    [rawRows, accounts, cashCode, catOverride, accrualOn, dedupOn, entries, company],
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
      const dup = parsed.duplicateCount > 0 ? `；略過已存在 ${parsed.duplicateCount} 筆` : ''
      let bankNote = ''
      if (bankBatch) {
        const { error } = await supabase.from('bank_transactions').update({ status: 'matched' }).in('id', bankBatch.ids)
        bankNote = error ? `；⚠ 銀行明細標記失敗（${error.message}），下次載入可能重複出現` : '；銀行明細已標記入帳'
        setBankBatch(null)
        setBankSuggest(null)
      }
      setDone(`已匯入 ${parsed.importableRows} 筆交易（共 ${entries.length} 張分錄${accr}）${company ? `／公司：${company}` : ''}${dup}${review ? `；其中 ${review} 筆待確認（請到「明細」補上）` : ''}${bankNote}`)
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="flex items-start gap-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg p-3">
          <input type="checkbox" checked={accrualOn} onChange={(e) => setAccrualOn(e.target.checked)} className="mt-0.5 w-4 h-4 accent-brand" />
          <span>
            <b>自動拆分跨期應計</b>
            <span className="block text-xs text-gray-500 mt-0.5">支援「2604健保費」「月結-12月車資」「2512薪資」等；月份早於付款月 → 在該月月底認列、付款日自動沖銷。「1-4月」等區間標待確認不自動拆。</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg p-3">
          <input type="checkbox" checked={dedupOn} onChange={(e) => setDedupOn(e.target.checked)} className="mt-0.5 w-4 h-4 accent-brand" />
          <span>
            <b>略過系統已有的相同交易（防重複匯入）</b>
            <span className="block text-xs text-gray-500 mt-0.5">依 公司＋日期＋金額＋摘要 按「筆數」比對：檔案 4 筆、系統已有 1 筆 → 只補 3 筆。同日同額的合法重複不會被誤刪。</span>
          </span>
        </label>
      </div>

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

      {hasSupabase && <BankFetch onLoad={handleBank} />}
      {bankBatch && bankSuggest && (
        <div className={`rounded-lg border px-3 py-2.5 space-y-1 ${bankSuggest.company ? 'text-brand bg-brand-soft border-brand-light/40' : 'text-amber-800 bg-amber-50 border-amber-300'}`}>
          <div className="text-xs">
            目前預覽的是機器人抓回的銀行明細：<b>{bankBatch.label}</b>（{bankBatch.ids.length} 筆）。確認匯入後會自動標記為已入帳。
          </div>
          {bankSuggest.company ? (
            <div className="text-sm">
              已依帳號 <b>{bankSuggest.acct}</b>（{bankSuggest.bankCompany}）自動帶入 →
              公司：<b>{bankSuggest.company}</b>
              {bankSuggest.cashCode && <> · 銀行科目：<b>{bankSuggest.cashCode} {accName(bankSuggest.cashCode)}</b></>}
              。<span className="font-medium">請先確認上方兩個欄位無誤再匯入。</span>
            </div>
          ) : (
            <div className="text-sm">
              ⚠ 帳號 <b>{bankSuggest.acct}</b> 的公司名稱「{bankSuggest.bankCompany}」對不到記帳系統裡的任何公司，
              <span className="font-medium">請自行在上方選擇正確的公司與銀行科目後再匯入</span>（或到「設定 → 公司」先補上這家公司）。
            </div>
          )}
        </div>
      )}

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
          {parsed.needsReviewCount > 0 && <span className="text-amber-600"> · 待確認 {parsed.needsReviewCount} 筆</span>}
          {parsed.duplicateCount > 0 && <span className="text-gray-500"> · 已存在略過 {parsed.duplicateCount} 筆</span>}
          {parsed.openingCount > 0 && <span className="text-gray-500"> · 期初餘額不入帳 {parsed.openingCount} 列</span>}
          {parsed.skippedNoAmount > 0 && <span> · 略過無金額 {parsed.skippedNoAmount} 列</span>}
          {parsed.skippedNoDate > 0 && <span className="text-amber-600"> · 略過日期無法辨識 {parsed.skippedNoDate} 列</span>}
        </div>
      )}

      {parsed?.balance && (
        <div className={`text-sm rounded-lg p-3 border ${parsed.balance.ok ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200'}`}>
          {parsed.balance.ok
            ? <>✓ 餘額勾稽相符：累計收支 ＝ 檔內最後餘額 {formatTWD(parsed.balance.expected)}，解析無漏列（餘額欄中途停填者，其後列不列入勾稽）。</>
            : <>⚠ 餘額勾稽不符：計算值 {formatTWD(parsed.balance.computed)} ≠ 檔內最後餘額 {formatTWD(parsed.balance.expected)}（差 {formatTWD(parsed.balance.computed - parsed.balance.expected)}）。可能有列解析錯誤，建議先檢查再匯入。</>}
        </div>
      )}

      {parsed && parsed.rowResults.length > 0 && (
        <>
          <PreviewSection title={`跨期應計（全部 ${parsed.accrualCount} 筆，請逐筆檢查）`} rows={parsed.rowResults.filter((r) => r.status === 'accrual')} accName={accName} max={999} />
          <PreviewSection title={`待確認（全部 ${parsed.needsReviewCount} 筆，匯入後可於明細批次修正）`} rows={parsed.rowResults.filter((r) => r.status === 'review')} accName={accName} max={999} />
          <PreviewSection title={`期初餘額（依設定不入帳，略過 ${parsed.openingCount} 列）`} rows={parsed.rowResults.filter((r) => r.status === 'opening')} accName={accName} max={5} />
          <PreviewSection title={`已存在（將略過 ${parsed.duplicateCount} 筆）`} rows={parsed.rowResults.filter((r) => r.status === 'dup')} accName={accName} max={5} />
          <PreviewSection title="一般現金分錄" rows={parsed.rowResults.filter((r) => r.status === 'cash')} accName={accName} max={10} />
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

function PreviewSection({ title, rows, accName, max }: { title: string; rows: RowResult[]; accName: (c: string) => string; max: number }) {
  if (!rows.length) return null
  const shown = rows.slice(0, max)
  return (
    <div className="space-y-1">
      <div className="text-sm text-gray-600 font-medium">{title}</div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto max-h-72 overflow-y-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="bg-gray-50 text-gray-500 text-xs sticky top-0">
            <th className="px-2 py-2 text-left">日期</th><th className="px-2 py-2 text-left">內容</th>
            <th className="px-2 py-2 text-left">借方</th><th className="px-2 py-2 text-left">貸方</th>
            <th className="px-2 py-2 text-right">金額</th><th className="px-2 py-2 text-left">處理</th>
          </tr></thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className={`border-t border-gray-100 ${r.status === 'review' ? 'bg-amber-50/50' : r.status === 'dup' ? 'opacity-50' : ''}`}>
                <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">{r.date}</td>
                <td className="px-2 py-1.5 text-gray-700">{r.desc}</td>
                <td className="px-2 py-1.5 text-xs text-gray-600">{accName(r.plan.debitCode)}</td>
                <td className="px-2 py-1.5 text-xs text-gray-600">{accName(r.plan.creditCode)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatTWD(r.amount)}</td>
                <td className="px-2 py-1.5 text-xs whitespace-nowrap">
                  {r.status === 'accrual' && <span className="text-brand-dark bg-brand-soft rounded px-1.5 py-0.5">應計 → {r.plan.accrualDate}</span>}
                  {r.status === 'review' && <span className="text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">待確認</span>}
                  {r.status === 'dup' && <span className="text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">已存在</span>}
                  {r.status === 'opening' && <span className="text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">期初-不入帳</span>}
                  {r.status === 'cash' && <span className="text-gray-400">現金</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > max && <div className="text-xs text-gray-400">…其餘 {rows.length - max} 筆未顯示</div>}
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

type RowStatus = 'cash' | 'accrual' | 'review' | 'dup' | 'opening'
interface RowResult { date: string; desc: string; amount: number; direction: 'in' | 'out'; plan: RowPlan; status: RowStatus }

interface MapOpts {
  catOverride?: Record<string, string>
  accrualOn?: boolean
  /** 系統既有交易鍵值（次數式重複偵測用）；undefined = 不偵測 */
  existingKeys?: Map<string, number>
  company?: string
}

function cleanVoucher(s: string): string | undefined {
  const t = (s ?? '').trim()
  if (!t || t === '待補' || t === '無') return undefined
  return t
}

function mapTxRows(rows: string[][], accounts: Account[], cashCode: string, mapOpts: MapOpts = {}) {
  const result = {
    entries: [] as JournalEntry[],
    rowResults: [] as RowResult[],
    error: null as string | null, totalRows: 0, importableRows: 0,
    skippedNoAmount: 0, skippedNoDate: 0, needsReviewCount: 0, accrualCount: 0, duplicateCount: 0, openingCount: 0,
    /** 餘額勾稽：檔尾餘額 vs 期初+Σ收入−Σ支出（含被略過的重複列，驗證解析正確性） */
    balance: null as null | { expected: number; computed: number; ok: boolean },
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
  const cBal = findCol(headers, '餘額')
  const cIn = headers.findIndex((h) => ['存入金額', '收入'].includes(h.trim()) || h.includes('存入') || (h.includes('收入') && !h.includes('發票')))
  const cOut = headers.findIndex((h) => ['提出金額', '支出'].includes(h.trim()) || h.includes('提出') || (h.includes('支出') && !h.includes('憑證') && !h.includes('請款')))
  if (cDate < 0 || (cIn < 0 && cOut < 0)) {
    result.error = '找不到日期或收入/支出欄位，請確認標題列名稱。'
    return result
  }

  const opts = { catOverride: mapOpts.catOverride, matchCategory, accrualOn: mapOpts.accrualOn }
  const remaining = mapOpts.existingKeys ? new Map(mapOpts.existingKeys) : null
  let lastDate = '' // 日期常只在每日第一列出現，空白時沿用上一筆
  let runningNet = 0
  let lastBalance: number | null = null
  let netAtBalance = 0 // 最後一個「有餘額」列當下的累計淨額（檔案常中途停填餘額欄，其後不列入勾稽）

  for (const row of rows.slice(1)) {
    // 只看核心欄位判斷空列（忽略帳戶/餘額欄，檔尾常整片只剩餘額）
    const core = [cDate, cDesc, cCat, cIn, cOut].filter((i) => i >= 0)
    if (core.every((i) => !(row[i] ?? '').trim())) {
      if (cBal >= 0 && (row[cBal] ?? '').trim()) { lastBalance = parseAmount(row[cBal]); netAtBalance = runningNet }
      continue
    }
    result.totalRows++

    const income = cIn >= 0 ? parseAmount(row[cIn] ?? '') : 0
    const expense = cOut >= 0 ? parseAmount(row[cOut] ?? '') : 0
    const amount = income > 0 ? income : expense
    if (amount > 0) runningNet += income - expense
    if (cBal >= 0 && (row[cBal] ?? '').trim()) { lastBalance = parseAmount(row[cBal]); netAtBalance = runningNet }
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

    // 期初餘額列不入帳（仍計入上方 runningNet，檔內勾稽才會相符）
    if (isOpeningBalanceRow(desc)) {
      result.openingCount++
      result.rowResults.push({ date, desc, amount, direction, plan: { debitCode: '', creditCode: '', account: '', review: false, accrual: false }, status: 'opening' })
      continue
    }

    const rowInput: RowInput = { date, amount, direction, description: desc, catText: catText || undefined, counterpartyAccount, branch, voucherNo }
    try {
      const plan = planRow(rowInput, cashCode, accounts, opts)
      // 重複偵測：系統已有同（公司+日期+金額+摘要）者，按剩餘次數略過
      if (remaining && consumeDup(remaining, date, amount, desc, mapOpts.company)) {
        result.duplicateCount++
        result.rowResults.push({ date, desc, amount, direction, plan, status: 'dup' })
        continue
      }
      const entries = rowToEntries(rowInput, cashCode, accounts, opts)
      result.entries.push(...entries)
      const status: RowStatus = plan.accrual ? 'accrual' : plan.review ? 'review' : 'cash'
      result.rowResults.push({ date, desc, amount, direction, plan, status })
      result.importableRows++
      if (plan.accrual) result.accrualCount++
      if (plan.review) result.needsReviewCount++
    } catch { /* skip 無法建立的列 */ }
  }

  if (lastBalance !== null) {
    result.balance = { expected: lastBalance, computed: netAtBalance, ok: lastBalance === netAtBalance }
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

// ── 從機器人銀行明細暫存區載入（bank_transactions，UiPath 每日匯入）──────────
interface BankTxRow {
  id: number
  company_no: string
  company_name: string | null
  bank_account_no: string
  tx_date: string
  withdrawal: number
  deposit: number
  summary: string | null
  counterparty_account: string | null
  memo: string | null
  branch: string | null
}

interface BankGroup { acct: string; company: string; rows: BankTxRow[] }

function BankFetch({ onLoad }: { onLoad: (rows: string[][], batch: BankBatch) => void }) {
  const [groups, setGroups] = useState<BankGroup[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function fetchGroups() {
    setBusy(true); setErr(null)
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('id, company_no, company_name, bank_account_no, tx_date, withdrawal, deposit, summary, counterparty_account, memo, branch')
      .eq('status', 'unmatched')
      .order('tx_date').order('tx_time')
      .limit(2000)
    if (error) { setErr(`讀取失敗：${error.message}`); setBusy(false); return }
    const by = new Map<string, BankTxRow[]>()
    for (const r of (data ?? []) as BankTxRow[]) {
      const k = r.bank_account_no
      if (!by.has(k)) by.set(k, [])
      by.get(k)!.push(r)
    }
    setGroups([...by.entries()].map(([acct, rows]) => ({ acct, company: rows[0].company_name ?? rows[0].company_no, rows })))
    setBusy(false)
  }

  function load(g: BankGroup) {
    const header = ['日期', '備註', '存入金額', '提出金額', '對方帳號', '交易分行']
    const rows = g.rows.map((r) => [
      r.tx_date,
      [r.summary, r.memo].filter(Boolean).join(' ') || '銀行交易',
      r.deposit > 0 ? String(r.deposit) : '',
      r.withdrawal > 0 ? String(r.withdrawal) : '',
      r.counterparty_account ?? '',
      r.branch ?? '',
    ])
    onLoad([header, ...rows], {
      ids: g.rows.map((r) => r.id),
      label: `${g.company} ${g.acct}`,
      acct: g.acct,
      bankCompany: g.rows[0].company_name ?? g.company,
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-700">或：載入機器人抓回的銀行明細</div>
        <button onClick={fetchGroups} disabled={busy} className="text-sm text-brand hover:underline disabled:opacity-50">
          {busy ? '讀取中…' : groups === null ? '檢查待入帳明細' : '重新整理'}
        </button>
      </div>
      {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{err}</div>}
      {groups !== null && groups.length === 0 && <div className="text-xs text-gray-400">目前沒有待入帳的銀行明細。機器人匯入後會出現在這裡。</div>}
      {groups !== null && groups.length > 0 && (
        <div className="space-y-1.5">
          {groups.map((g) => (
            <div key={g.acct} className="flex items-center justify-between gap-2 text-sm border border-gray-100 rounded-lg px-3 py-2">
              <span className="text-gray-700 truncate">{g.company} · 帳號 {g.acct} · <b className="text-brand">{g.rows.length}</b> 筆（{g.rows[0].tx_date} ~ {g.rows[g.rows.length - 1].tx_date}）</span>
              <button onClick={() => load(g)} className="px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-medium hover:bg-brand-dark whitespace-nowrap">載入預覽</button>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-gray-400">載入後會依銀行帳號自動帶入建議的「公司」與「銀行帳戶科目」，請確認無誤再匯入；匯入成功會自動把這批明細標記為已入帳，之後不會重複出現。</p>
    </div>
  )
}
