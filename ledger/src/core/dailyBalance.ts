// =============================================================================
// 每日餘額核對：每家公司各有一個台幣帳戶，各自對該公司的 112 銀行現金。
// 系統推算 = 該公司 2026-01-01 期初餘額（財務提供、固定於 netlify/shared/openingBalances.mjs）
//          + 1/1 之後（不含 1/1）至當日、該公司分錄中 112 的（借 − 貸），
// 與機器人抓回的同日該公司台幣帳戶「帳戶餘額」比對。餘額一律視為「日終餘額」（含當日交易）。
// 純函式，方便測試。與 netlify/shared/bankBalance.mjs 規則相同。
// =============================================================================

import { ANCHOR_DATE, BANK_ACCOUNTS, CASH_ACCOUNT_CODE } from '../../netlify/shared/openingBalances.mjs'
import type { JournalEntry } from './types'

export { ANCHOR_DATE, BANK_ACCOUNTS, CASH_ACCOUNT_CODE }

/** 某公司某日的銀行餘額（由機器人經 bank-balance API 寫入；存 rules 表） */
export interface DailyBalance {
  id: string
  /** 標記，與 rules 表其他資料區分（同表共存） */
  kind: 'daily_bal'
  date: string // YYYY-MM-DD（日終）
  /** 公司（核對單位；每家公司一個台幣帳戶） */
  company: string
  /** 科目 code（固定為 112 銀行現金） */
  accountCode: string
  /** 銀行帳戶餘額（整數元；核對用） */
  balance: number
  /** 網銀「可用餘額」（僅記錄；= 帳戶餘額 − 當日交換票 − 圈存 + 透支額度） */
  available?: number
  /** 來源：機器人寫入為 'rpa' */
  source?: 'rpa'
  updatedAt: string
}

/** 同一（公司, 科目, 日期）只存一筆：固定 id，重複寫入即覆寫。 */
export function dailyBalanceId(company: string, accountCode: string, date: string): string {
  return `DB|${company}|${accountCode}|${date}`
}

/**
 * 把設定檔的公司名稱對到系統 companies 表的實際名稱：
 * 完全相同優先；否則容忍前綴差異（「娛樂」↔「路特娛樂」），唯一命中才回傳，對不到回 null。
 * 與 netlify/shared/bankBalance.mjs 的 resolveCompany 規則相同。
 */
export function resolveCompany(name: string, companies: string[]): string | null {
  const n = (name ?? '').trim()
  if (!n) return null
  if (companies.includes(n)) return n
  const hits = companies.filter((c) => c && (c.includes(n) || n.includes(c)))
  return hits.length === 1 ? hits[0] : null
}

/** 要核對的清單：BANK_ACCOUNTS 每個帳號一列，公司名稱對照系統 companies 表。 */
export interface BankAccountCheck {
  accountNo: string
  /** 設定檔上的公司名稱 */
  configured: string
  /** 對到系統 companies 表的實際名稱；對不到為 null（畫面上提示修設定） */
  company: string | null
  opening: number
}

export function bankAccountChecks(companies: string[]): BankAccountCheck[] {
  return Object.entries(BANK_ACCOUNTS).map(([accountNo, c]) => ({
    accountNo,
    configured: c.company,
    company: resolveCompany(c.company, companies),
    opening: c.opening,
  }))
}

/** 該公司分錄在 112 的每日淨變動（Σ借−Σ貸），只含 net≠0 的日期。 */
export function dailyNet(entries: JournalEntry[], company: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of entries) {
    if (e.company !== company) continue
    let net = 0
    for (const l of e.lines) if (l.accountCode === CASH_ACCOUNT_CODE) net += l.debit - l.credit
    if (net !== 0) m.set(e.date, (m.get(e.date) ?? 0) + net)
  }
  return m
}

export interface DailyRow {
  date: string
  /** 當日系統淨變動 */
  net: number
  /** 系統推算日終餘額 = 期初餘額 + 起算日後至當日的累計淨變動 */
  computed: number
  /** 機器人抓回的銀行帳戶餘額（無資料為 undefined） */
  bank?: number
  /** 差額 = 推算 − 銀行 */
  diff?: number
  /** 差額自上一個有銀行餘額的日期以來的變化；≠0 表示問題發生在（上一個核對日, 本日] 之間 */
  newDiff?: number
}

export interface DailyCheck {
  company: string
  opening: number
  /** 帳上餘額（該公司 112 自開帳累計至起算日，含當日）。本系統期初不入帳，正常為 0 */
  bookAtAnchor: number
  /** 帳上起算餘額 − 期初餘額 */
  anchorDiff: number
  /** 起算日（含）前碰到 112 的分錄筆數；>0 時畫面提示確認日期是否正確 */
  anchorEntries: number
  /** 起算日後至 upTo 的逐日列（有流水或有銀行餘額的日期），依日期遞增 */
  rows: DailyRow[]
  /** 最新一個有銀行餘額的日期（主比對：系統推算 vs 銀行，同一天） */
  latest?: DailyRow
  /** 第一個出現新差異的日期 */
  firstBreak?: string
  breakCount: number
}

/** 銀行餘額依日期（同日多筆取最後更新者）；只取該公司、科目 112 的資料。 */
function bankByDate(balances: DailyBalance[], company: string): Map<string, number> {
  const pick = new Map<string, DailyBalance>()
  for (const b of balances) {
    if (b.company !== company || b.accountCode !== CASH_ACCOUNT_CODE) continue
    const cur = pick.get(b.date)
    if (!cur || b.updatedAt > cur.updatedAt) pick.set(b.date, b)
  }
  return new Map([...pick].map(([d, b]) => [d, b.balance]))
}

/** 核對單一公司。 */
export function dailyCheck(
  entries: JournalEntry[],
  balances: DailyBalance[],
  company: string,
  opening: number,
  upTo: string,
  anchorDate = ANCHOR_DATE,
): DailyCheck {
  const net = dailyNet(entries, company)
  let book = 0
  for (const [d, n] of net) if (d <= anchorDate) book += n
  let anchorEntries = 0
  for (const e of entries) {
    if (e.company !== company || e.date > anchorDate) continue
    if (e.lines.some((l) => l.accountCode === CASH_ACCOUNT_CODE && l.debit !== l.credit)) anchorEntries++
  }
  const base: DailyCheck = { company, opening, bookAtAnchor: book, anchorDiff: book - opening, anchorEntries, rows: [], breakCount: 0 }

  const bank = bankByDate(balances, company)
  const dates = new Set<string>()
  for (const d of net.keys()) if (d > anchorDate && d <= upTo) dates.add(d)
  for (const d of bank.keys()) if (d > anchorDate && d <= upTo) dates.add(d)

  let run = opening
  let prevDiff = 0
  for (const date of [...dates].sort()) {
    const n = net.get(date) ?? 0
    run += n
    const row: DailyRow = { date, net: n, computed: run }
    const b = bank.get(date)
    if (b !== undefined) {
      row.bank = b
      row.diff = run - b
      row.newDiff = row.diff - prevDiff
      prevDiff = row.diff
      if (row.newDiff !== 0) {
        base.breakCount++
        if (!base.firstBreak) base.firstBreak = date
      }
      base.latest = row
    }
    base.rows.push(row)
  }
  return base
}
