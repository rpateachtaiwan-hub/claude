import React, { useMemo, useState } from 'react'
import { useLedger } from '../store/useLedger'
import { buildEntry } from '../core/engine'
import { composeEntry, suggest } from '../core/suggest'
import { formatTWD } from '../core/money'
import { normalizeDate, parseAmount, parseDelimited } from '../lib/csv'
import type { Account, Category, JournalEntry, QuickInput, Rule } from '../core/types'

type Mode = 'tx' | 'accounts'

export default function ImportData() {
  const [mode, setMode] = useState<Mode>('tx')
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setMode('tx')} className={tab(mode === 'tx')}>匯入歷史交易</button>
        <button onClick={() => setMode('accounts')} className={tab(mode === 'accounts')}>匯入會計科目</button>
      </div>
      {mode === 'tx' ? <ImportTx /> : <ImportAccounts />}
    </div>
  )
}

const tab = (active: boolean) =>
  `px-4 py-2 rounded-lg text-sm font-medium ${active ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600'}`

// ── 匯入歷史交易 ──────────────────────────────────────────────────────────────
function ImportTx() {
  const { accounts, rules, addEntriesBulk } = useLedger()
  const [text, setText] = useState('')
  const [done, setDone] = useState<string | null>(null)

  const accName = (code: string) => accounts.find((a) => a.code === code)?.name ?? code
  const cashAccounts = accounts.filter((a) => a.isCash)

  const parsed = useMemo(() => parseTx(text, accounts, rules), [text, accounts, rules])

  async function doImport() {
    if (!parsed.entries.length) return
    await addEntriesBulk(parsed.entries)
    setDone(`已匯入 ${parsed.entries.length} 筆交易`)
    setText('')
  }

  return (
    <div className="space-y-3">
      <div className="bg-blue-50/60 border border-blue-200 rounded-lg p-3 text-xs text-gray-600 leading-relaxed">
        在 Excel/Google Sheet 選取資料（<b>含標題列</b>）→ 複製 → 貼到下方框內。
        會自動辨識欄位：<b>付款日期、內容、帳戶、收入、支出</b>（其餘欄位忽略）。
        有「收入」金額視為收款、有「支出」金額視為付款，科目用學過的規則自動建議。
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6}
        placeholder={'付款日期\t月份\t類別\t內容\t帳戶\t收入\t支出\n2026/01/03\t1月\t收入\t平台收入 KLOOK\t國泰115\t6031\t'}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />

      {parsed.error && <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">{parsed.error}</div>}

      {parsed.entries.length > 0 && (
        <>
          <div className="text-sm text-gray-600">預覽（共 {parsed.entries.length} 筆，顯示前 {Math.min(10, parsed.entries.length)} 筆）：</div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
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
              下列「帳戶」在科目表找不到對應現金科目，已暫用「{cashAccounts[0]?.name}」：{parsed.unmatchedAccounts.join('、')}。
              可先到「設定」新增這些銀行科目再重匯。
            </div>
          )}
          <button onClick={doImport} className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">確認匯入 {parsed.entries.length} 筆</button>
        </>
      )}
      {done && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">{done}</div>}
    </div>
  )
}

function findCol(headers: string[], ...keys: string[]): number {
  return headers.findIndex((h) => keys.some((k) => h.includes(k)))
}

function parseTx(text: string, accounts: Account[], rules: Rule[]) {
  const result = { entries: [] as JournalEntry[], unmatchedAccounts: [] as string[], error: null as string | null }
  const rows = parseDelimited(text)
  if (rows.length < 2) {
    if (text.trim()) result.error = '請貼上含標題列的資料（至少兩列）。'
    return result
  }
  const headers = rows[0]
  const cDate = findCol(headers, '付款日期', '日期')
  const cDesc = findCol(headers, '內容', '摘要', '說明')
  const cCat = findCol(headers, '類別')
  const cAcct = findCol(headers, '帳戶')
  const cIn = headers.findIndex((h) => h.trim() === '收入' || (h.includes('收入') && !h.includes('發票')))
  const cOut = headers.findIndex((h) => h.trim() === '支出' || (h.includes('支出') && !h.includes('憑證')))
  if (cDate < 0 || (cIn < 0 && cOut < 0)) {
    result.error = '找不到「付款日期」或「收入/支出」欄位，請確認有貼到標題列。'
    return result
  }

  const cashAccounts = accounts.filter((a) => a.isCash)
  const defaultCash = cashAccounts[0]?.code ?? '1102'
  const unmatched = new Set<string>()

  for (const row of rows.slice(1)) {
    const dateRaw = row[cDate] ?? ''
    const income = cIn >= 0 ? parseAmount(row[cIn] ?? '') : 0
    const expense = cOut >= 0 ? parseAmount(row[cOut] ?? '') : 0
    const amount = income > 0 ? income : expense
    if (amount <= 0) continue // 跳過空列 / #N/A
    if (!/\d{4}/.test(dateRaw)) continue

    const direction: 'in' | 'out' = income > 0 ? 'in' : 'out'
    const desc = (cDesc >= 0 ? row[cDesc] : '') || (cCat >= 0 ? row[cCat] : '') || '匯入'
    const counterparty = cCat >= 0 ? row[cCat] : undefined
    const acctText = cAcct >= 0 ? row[cAcct] : ''
    let cashCode = defaultCash
    if (acctText) {
      const hit = cashAccounts.find((a) => a.name.includes(acctText) || acctText.includes(a.name))
      if (hit) cashCode = hit.code
      else unmatched.add(acctText)
    }

    const input: QuickInput = { date: normalizeDate(dateRaw), amount, description: desc, counterparty, direction, cashAccountCode: cashCode }
    const sug = suggest(input, rules, accounts)
    try {
      result.entries.push(buildEntry(composeEntry(input, sug.accountCode)))
    } catch {
      /* 略過無法建立的列 */
    }
  }
  result.unmatchedAccounts = [...unmatched]
  return result
}

// ── 匯入會計科目（編號 / 科目）────────────────────────────────────────────────
function ImportAccounts() {
  const { addAccountsBulk } = useLedger()
  const [text, setText] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const parsed = useMemo(() => parseAccounts(text), [text])

  async function doImport() {
    if (!parsed.length) return
    await addAccountsBulk(parsed)
    setDone(`已匯入/更新 ${parsed.length} 個科目`)
    setText('')
  }

  return (
    <div className="space-y-3">
      <div className="bg-blue-50/60 border border-blue-200 rounded-lg p-3 text-xs text-gray-600 leading-relaxed">
        貼上你的會計分類（含「編號」「科目」兩欄）。系統會依<b>編號開頭數字</b>自動判斷類別：
        1=資產、2=負債、3=權益、4=收入、5/6/7=費用；名稱含「現金/銀行/存款」標記為現金科目，「應收/應付」標記為需沖銷。匯入後可在「設定」微調。
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6}
        placeholder={'編號\t科目\n1102\t銀行存款\n4101\t營業收入\n6103\t油料費'}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
      {parsed.length > 0 && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
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
          <button onClick={doImport} className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">確認匯入 {parsed.length} 個科目</button>
        </>
      )}
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
    default: return 'expense' // 5/6/7...
  }
}

function parseAccounts(text: string): Account[] {
  const rows = parseDelimited(text)
  if (!rows.length) return []
  // 略過標題列
  const data = /編號|科目|代號|名稱/.test(rows[0].join('')) ? rows.slice(1) : rows
  const out: Account[] = []
  const seen = new Set<string>()
  for (const row of data) {
    if (row.length < 2) continue
    // 編號 = 數字較多的那欄
    let code = row[0]
    let name = row[1]
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
