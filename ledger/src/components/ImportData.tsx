import React, { useState } from 'react'
import { useLedger } from '../store/useLedger'
import { buildEntry } from '../core/engine'
import { composeEntry } from '../core/suggest'
import { PLACEHOLDER_ACCOUNTS, UNCLASSIFIED_IN, UNCLASSIFIED_OUT } from '../core/accounts'
import { formatTWD } from '../core/money'
import { parseAmount, normalizeDate } from '../lib/csv'
import { fileToRows } from '../lib/xlsx'
import type { Account, Category, JournalEntry, QuickInput } from '../core/types'

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
  const { accounts, addEntriesBulk, addAccountsBulk } = useLedger()
  const [parsed, setParsed] = useState<ReturnType<typeof mapTxRows> | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const accName = (code: string) => accounts.find((a) => a.code === code)?.name ?? code
  const cashAccounts = accounts.filter((a) => a.isCash)

  function handle(rows: string[][]) {
    setDone(null)
    setParsed(mapTxRows(rows, accounts))
  }

  async function doImport() {
    if (!parsed?.entries.length) return
    await addAccountsBulk(PLACEHOLDER_ACCOUNTS) // 確保「待分類」科目存在
    await addEntriesBulk(parsed.entries)
    setDone(`已匯入 ${parsed.entries.length} 筆交易${parsed.needsReviewCount ? `，其中 ${parsed.needsReviewCount} 筆待分類（請到「明細」補上科目）` : ''}`)
    setParsed(null)
  }

  return (
    <div className="space-y-3">
      <div className="bg-brand-soft border border-brand-light/40 rounded-lg p-3 text-xs text-gray-600 leading-relaxed">
        直接上傳 Excel/CSV 檔（<b>第一列需為標題</b>）。自動辨識欄位（含銀行下載格式）：
        <b>帳務/付款日期、備註/內容、提出/支出、存入/收入、對方帳號、交易分行</b>。
        無法判定科目的交易會先列為<b>「待分類」</b>並在「明細」標示提醒，供你（或 Gemini）補上。
      </div>
      <FileBox onRows={handle} />

      {parsed?.error && <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">{parsed.error}</div>}

      {parsed && (parsed.totalRows > 0 || parsed.entries.length > 0) && (
        <div className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3">
          讀到 <b>{parsed.totalRows}</b> 列 · 可匯入 <b className="text-brand">{parsed.entries.length}</b> 筆
          {parsed.needsReviewCount > 0 && <span className="text-amber-600"> · 待分類 {parsed.needsReviewCount} 筆</span>}
          {parsed.skippedNoAmount > 0 && <span> · 略過無金額 {parsed.skippedNoAmount} 列</span>}
          {parsed.skippedNoDate > 0 && <span className="text-amber-600"> · 略過日期無法辨識 {parsed.skippedNoDate} 列</span>}
        </div>
      )}

      {parsed && parsed.entries.length > 0 && (
        <>
          <div className="text-sm text-gray-600">預覽（顯示前 {Math.min(10, parsed.entries.length)} 筆）：</div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="bg-gray-50 text-gray-500 text-xs">
                <th className="px-2 py-2 text-left">日期</th><th className="px-2 py-2 text-left">內容</th>
                <th className="px-2 py-2 text-left">借</th><th className="px-2 py-2 text-left">貸</th><th className="px-2 py-2 text-right">金額</th>
              </tr></thead>
              <tbody>
                {parsed.entries.slice(0, 10).map((e) => {
                  const dr = e.lines.find((l) => l.debit > 0)!; const cr = e.lines.find((l) => l.credit > 0)!
                  return (
                    <tr key={e.id} className="border-t border-gray-100">
                      <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">{e.date}</td>
                      <td className="px-2 py-1.5 text-gray-700">{e.description}</td>
                      <td className="px-2 py-1.5 text-xs text-gray-600">{accName(dr.accountCode)}</td>
                      <td className="px-2 py-1.5 text-xs text-gray-600">{accName(cr.accountCode)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatTWD(dr.debit)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {parsed.unmatchedAccounts.length > 0 && (
            <div className="text-xs text-amber-700">
              下列「帳戶」找不到對應現金科目，已暫用「{cashAccounts[0]?.name}」：{parsed.unmatchedAccounts.join('、')}。
            </div>
          )}
          <button onClick={doImport} className="px-5 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark">確認匯入 {parsed.entries.length} 筆</button>
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

function mapTxRows(rows: string[][], accounts: Account[]) {
  const result = {
    entries: [] as JournalEntry[], unmatchedAccounts: [] as string[],
    error: null as string | null, totalRows: 0, skippedNoAmount: 0, skippedNoDate: 0, needsReviewCount: 0,
  }
  if (rows.length < 2) { result.error = '檔案需含標題列與至少一列資料。'; return result }
  const headers = rows[0]
  const cDate = findCol(headers, '帳務日期', '付款日期', '日期')
  const cDesc = findCol(headers, '備註', '內容', '摘要', '說明')
  const cCat = findCol(headers, '類別')
  const cAcct = findCol(headers, '帳戶')
  const cCpAcct = findCol(headers, '對方帳號')
  const cBranch = findCol(headers, '交易分行', '分行')
  const cInvNo = findCol(headers, '收入發票號碼', '發票號碼', '發票')
  const cVoucher = findCol(headers, '支出憑證類別', '憑證類別', '憑證編號', '憑證')
  const cIn = headers.findIndex((h) => ['存入金額', '收入'].includes(h.trim()) || h.includes('存入') || (h.includes('收入') && !h.includes('發票')))
  const cOut = headers.findIndex((h) => ['提出金額', '支出'].includes(h.trim()) || h.includes('提出') || (h.includes('支出') && !h.includes('憑證')))
  if (cDate < 0 || (cIn < 0 && cOut < 0)) {
    result.error = '找不到日期或收入/支出欄位，請確認標題列名稱。'
    return result
  }

  const cashAccounts = accounts.filter((a) => a.isCash)
  const defaultCash = cashAccounts[0]?.code ?? '1102'
  const unmatched = new Set<string>()
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
    const desc = (cDesc >= 0 ? row[cDesc] : '') || (cCat >= 0 ? row[cCat] : '') || '（無備註）'
    const counterparty = cCat >= 0 ? row[cCat] || undefined : undefined
    const counterpartyAccount = cCpAcct >= 0 ? row[cCpAcct] || undefined : undefined
    const branch = cBranch >= 0 ? row[cBranch] || undefined : undefined
    const invNo = cInvNo >= 0 ? row[cInvNo] : ''
    const voucher = cVoucher >= 0 ? row[cVoucher] : ''
    const voucherNo = (direction === 'in' ? invNo || voucher : voucher || invNo) || undefined
    const acctText = cAcct >= 0 ? row[cAcct] : ''
    let cashCode = defaultCash
    if (acctText) {
      const hit = cashAccounts.find((a) => a.name.includes(acctText) || acctText.includes(a.name))
      if (hit) cashCode = hit.code
      else unmatched.add(acctText)
    }

    // 無法辨識科目 → 列為「待分類」並標記 needsReview，供人工/AI 補分類
    const categoryCode = direction === 'in' ? UNCLASSIFIED_IN : UNCLASSIFIED_OUT
    result.needsReviewCount++

    const input: QuickInput = { date, amount, description: desc, counterparty, direction, cashAccountCode: cashCode }
    try {
      result.entries.push(buildEntry({ ...composeEntry(input, categoryCode), counterpartyAccount, branch, voucherNo, needsReview: true }))
    } catch { /* skip */ }
  }
  result.unmatchedAccounts = [...unmatched]
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
