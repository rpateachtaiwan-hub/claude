// =============================================================================
// 每日餘額核對：起算餘額（2026-01-01 日終，財務提供、固定於 netlify/shared/openingBalances.mjs）
// ＋ 之後每筆交易的「銀行現金腳」淨變動 = 系統推算餘額，與機器人抓回的同日銀行帳戶餘額比對。
// 以「銀行帳戶（科目）」為單位計算，不受分錄公司欄位影響（銀行餘額只看錢有沒有進出這個帳戶）。
// 餘額一律視為「日終餘額」（含當日交易）。純函式，方便測試。
// =============================================================================

import { ANCHOR_DATE, OPENING_BALANCES } from '../../netlify/shared/openingBalances.mjs'
import type { Account, JournalEntry } from './types'

export { ANCHOR_DATE, OPENING_BALANCES }

/**
 * 是否為要核對的銀行帳戶：匯入時當作「銀行現金腳」的科目，也就是名稱註明銀行帳號者
 * （如「銀行存款-國泰娛樂(062-010608)」）。零用金、外幣及其他未註明帳號的存款科目不列入。
 * 與 netlify/shared/bankBalance.mjs 的 isBankAccount 規則相同。
 */
export function isBankAccount(a: Pick<Account, 'isCash' | 'name'>): boolean {
  return !!a.isCash && /\d{3}-\d{6}|\d{10,}/.test(a.name) && !/零用金|庫存現金|外幣|外匯/.test(a.name)
}

/** 某銀行科目某日的銀行餘額（由機器人經 bank-balance API 寫入；存 rules 表） */
export interface DailyBalance {
  id: string
  /** 標記，與 rules 表其他資料區分（同表共存） */
  kind: 'daily_bal'
  date: string // YYYY-MM-DD（日終）
  /** 公司（機器人寫入時推斷，僅供顯示） */
  company: string
  /** 銀行科目 code */
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

/** 要核對的銀行科目：起算日後有流水、有機器人餘額、或已設定起算餘額者。 */
export function accountsToCheck(
  entries: JournalEntry[],
  balances: DailyBalance[],
  bankCodes: Set<string>,
  opening: Readonly<Record<string, number>> = OPENING_BALANCES,
  anchorDate = ANCHOR_DATE,
): string[] {
  const set = new Set<string>()
  for (const e of entries) {
    if (e.date <= anchorDate) continue
    for (const l of e.lines) if (bankCodes.has(l.accountCode) && l.debit !== l.credit) set.add(l.accountCode)
  }
  for (const b of balances) if (bankCodes.has(b.accountCode)) set.add(b.accountCode)
  for (const c of Object.keys(opening)) if (bankCodes.has(c)) set.add(c)
  return [...set].sort()
}

/** 該銀行科目每日淨變動（Σ借−Σ貸，跨所有公司），只含 net≠0 的日期。 */
export function dailyNet(entries: JournalEntry[], accountCode: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of entries) {
    let net = 0
    for (const l of e.lines) if (l.accountCode === accountCode) net += l.debit - l.credit
    if (net !== 0) m.set(e.date, (m.get(e.date) ?? 0) + net)
  }
  return m
}

/** 使用該科目最多次的公司（顯示用）。 */
export function companyOf(entries: JournalEntry[], accountCode: string): string {
  const count = new Map<string, number>()
  for (const e of entries) {
    if (!e.lines.some((l) => l.accountCode === accountCode)) continue
    const c = e.company ?? ''
    count.set(c, (count.get(c) ?? 0) + 1)
  }
  let best = '', n = 0
  for (const [c, v] of count) if (v > n) { best = c; n = v }
  return best
}

export interface DailyRow {
  date: string
  /** 當日系統淨變動 */
  net: number
  /** 系統推算日終餘額 = 起算餘額 + 起算日後至當日的累計淨變動 */
  computed: number
  /** 機器人抓回的銀行帳戶餘額（無資料為 undefined） */
  bank?: number
  /** 差額 = 推算 − 銀行 */
  diff?: number
  /** 差額自上一個有銀行餘額的日期以來的變化；≠0 表示問題發生在（上一個核對日, 本日] 之間 */
  newDiff?: number
}

export interface DailyCheck {
  accountCode: string
  /** 起算餘額（未設定為 undefined） */
  opening?: number
  /** 帳上餘額（自開帳累計至起算日，含當日）；應等於起算餘額 */
  bookAtAnchor?: number
  /** 帳上起算餘額 − 起算餘額；≠0 代表起算日前歷史資料或期初有誤 */
  anchorDiff?: number
  /** 起算日後至 upTo 的逐日列（有流水或有銀行餘額的日期），依日期遞增 */
  rows: DailyRow[]
  /** 最新一個有銀行餘額的日期（主比對：系統推算 vs 銀行，同一天） */
  latest?: DailyRow
  /** 第一個出現新差異的日期 */
  firstBreak?: string
  breakCount: number
}

/** 銀行餘額依日期（同日多筆取最後更新者）。 */
function bankByDate(balances: DailyBalance[], accountCode: string): Map<string, number> {
  const pick = new Map<string, DailyBalance>()
  for (const b of balances) {
    if (b.accountCode !== accountCode) continue
    const cur = pick.get(b.date)
    if (!cur || b.updatedAt > cur.updatedAt) pick.set(b.date, b)
  }
  return new Map([...pick].map(([d, b]) => [d, b.balance]))
}

/** 核對單一銀行科目。 */
export function dailyCheck(
  entries: JournalEntry[],
  balances: DailyBalance[],
  accountCode: string,
  upTo: string,
  opening: Readonly<Record<string, number>> = OPENING_BALANCES,
  anchorDate = ANCHOR_DATE,
): DailyCheck {
  const base: DailyCheck = { accountCode, opening: opening[accountCode], rows: [], breakCount: 0 }
  if (base.opening === undefined) return base

  const net = dailyNet(entries, accountCode)
  let book = 0
  for (const [d, n] of net) if (d <= anchorDate) book += n
  base.bookAtAnchor = book
  base.anchorDiff = book - base.opening

  const bank = bankByDate(balances, accountCode)
  const dates = new Set<string>()
  for (const d of net.keys()) if (d > anchorDate && d <= upTo) dates.add(d)
  for (const d of bank.keys()) if (d > anchorDate && d <= upTo) dates.add(d)

  let run = base.opening
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
