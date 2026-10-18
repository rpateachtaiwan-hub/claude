// =============================================================================
// 銀行餘額機器人 API 的純邏輯（無 I/O，供 netlify/functions/bank-balance.mjs 使用並可單元測試）。
// 與前端 src/core/dailyBalance.ts 共用相同規則：
//   每家公司各有一個台幣帳戶，各自對該公司的 112 銀行現金——
//   系統餘額 = 該公司 2026-01-01 期初餘額（openingBalances.mjs）
//            + 1/1 之後（不含 1/1）至當日、該公司分錄中 112 的（借 − 貸），
//   與同日該公司台幣帳戶的網銀「帳戶餘額」比對。id = DB|公司|科目|日期、餘額為日終。
// =============================================================================

import { ANCHOR_DATE, BANK_ACCOUNTS, CASH_ACCOUNT_CODE } from './openingBalances.mjs'

export { ANCHOR_DATE, BANK_ACCOUNTS, CASH_ACCOUNT_CODE }

export const dailyBalanceId = (company, accountCode, date) => `DB|${company}|${accountCode}|${date}`

const digits = (s) => String(s ?? '').replace(/\D/g, '')

/**
 * 把設定檔的公司名稱對到系統 companies 表的實際名稱：
 * 完全相同優先；否則容忍前綴差異（「娛樂」↔「路特娛樂」），唯一命中才回傳，對不到回 null。
 */
export function resolveCompany(name, companies) {
  const n = String(name ?? '').trim()
  if (!n) return null
  if (companies.includes(n)) return n
  const hits = companies.filter((c) => c && (c.includes(n) || n.includes(c)))
  return hits.length === 1 ? hits[0] : null
}

/** 金額：接受數字或「878,803.00」字串，四捨五入為整數元。 */
export function toAmount(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v)
  const t = String(v ?? '').replace(/[,\s]|NT\$|\$|元/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  return Math.round(Number(t))
}

/** 日期：2026-10-14、2026/10/14、115/10/14 → YYYY-MM-DD。 */
export function toDate(s) {
  const m = String(s ?? '').trim().match(/^(\d{2,4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (!m) return null
  let y = Number(m[1])
  if (y < 1911) y += 1911
  const mo = Number(m[2]), d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** 驗證並正規化一列機器人送來的資料；回傳 { row } 或 { error }。 */
export function normalizeRow(r, i) {
  const at = `第 ${i + 1} 筆`
  const date = toDate(r?.date)
  if (!date) return { error: `${at}：日期「${r?.date}」無法辨識` }
  const balance = toAmount(r?.balance)
  if (balance === null) return { error: `${at}：帳戶餘額「${r?.balance}」不是數字` }
  const available = r?.available === undefined || r?.available === '' ? undefined : toAmount(r.available)
  if (available === null) return { error: `${at}：可用餘額「${r?.available}」不是數字` }
  const accountNo = digits(r?.accountNo)
  if (!accountNo) return { error: `${at}：缺少帳號 accountNo` }
  return { row: { date, balance, available, accountNo } }
}

/** 某分錄對某科目的淨變動（借 − 貸）。 */
export function netOf(entry, accountCode) {
  let n = 0
  for (const l of entry?.lines ?? []) if (l.accountCode === accountCode) n += (l.debit || 0) - (l.credit || 0)
  return n
}

/**
 * 推算某日日終餘額並與同日銀行餘額比對：
 * 推算 = 該公司期初餘額 + 起算日後（不含）至當日（含）分錄在 112 的淨變動。
 * entries 須先由呼叫端過濾為「該公司」的分錄。
 */
export function checkOn(opening, entries, accountCode, date, bank, anchorDate = ANCHOR_DATE) {
  if (opening === undefined) return { status: 'no_anchor' }
  if (date <= anchorDate) return { status: 'before_anchor' }
  let computed = opening
  for (const e of entries) if (e.date > anchorDate && e.date <= date) computed += netOf(e, accountCode)
  const diff = computed - bank
  return { status: diff === 0 ? 'match' : 'mismatch', computed, diff }
}
