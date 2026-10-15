// =============================================================================
// 每日可用餘額核對：以「起算日（2026-01-01）銀行餘額」為錨點，
// 錨點 + 其後每日銀行科目淨變動 = 系統推算餘額，逐日與銀行可用餘額比對。
// 與「銀行對帳」（帳上自開帳起的全部累計）不同：本核對只看起算日之後的流水，
// 不受起算日前歷史資料是否完整影響，專門驗證每天匯入的金額是否正確。
// 餘額一律視為「日終餘額」（含當日交易）。純函式，方便測試。
// =============================================================================

import type { Account, JournalEntry } from './types'

/**
 * 是否為要核對的銀行帳戶：現金類科目中名稱含「銀行」或「存款」者。
 * 零用金、庫存現金等現金科目沒有銀行餘額可比對，不列入。
 */
export function isBankAccount(a: Pick<Account, 'isCash' | 'name'>): boolean {
  return !!a.isCash && /銀行|存款/.test(a.name) && !/零用金|庫存現金/.test(a.name)
}

/** 預設起算日 */
export const ANCHOR_DATE = '2026-01-01'

/** 某公司某銀行科目某日的銀行餘額（由機器人經 bank-balance API 寫入；存 rules 表） */
export interface DailyBalance {
  id: string
  /** 標記，與 rules 表其他資料區分（同表共存） */
  kind: 'daily_bal'
  date: string // YYYY-MM-DD（日終）
  /** 公司；空字串 = 未指定公司 */
  company: string
  /** 銀行/現金科目 code */
  accountCode: string
  /** 銀行帳戶餘額（整數元；核對用） */
  balance: number
  /** 網銀「可用餘額」（僅記錄；= 帳戶餘額 − 當日交換票 − 圈存 + 透支額度） */
  available?: number
  /** 來源：機器人寫入為 'rpa'（本功能僅開放機器人寫入；早期人工輸入者不帶）*/
  source?: 'rpa'
  updatedAt: string
}

/** 同一（公司, 科目, 日期）只存一筆：固定 id，重複輸入即覆寫。 */
export function dailyBalanceId(company: string, accountCode: string, date: string): string {
  return `DB|${company}|${accountCode}|${date}`
}

/** 核對對象：公司 × 銀行科目 */
export interface BalancePair {
  company: string
  accountCode: string
}
export const pairKey = (p: BalancePair) => `${p.company}\u0000${p.accountCode}`

/** 找出所有需要核對的（公司, 銀行科目）：起算日後有銀行流水者 + 已有餘額紀錄者。 */
export function balancePairs(
  entries: JournalEntry[],
  balances: DailyBalance[],
  cashCodes: Set<string>,
  anchorDate = ANCHOR_DATE,
): BalancePair[] {
  const map = new Map<string, BalancePair>()
  const add = (company: string, accountCode: string) => {
    const p = { company, accountCode }
    map.set(pairKey(p), p)
  }
  for (const e of entries) {
    if (e.date < anchorDate) continue
    for (const l of e.lines) if (cashCodes.has(l.accountCode) && l.debit !== l.credit) add(e.company ?? '', l.accountCode)
  }
  for (const b of balances) if (b.date >= anchorDate) add(b.company, b.accountCode)
  return [...map.values()].sort((a, b) =>
    a.company === b.company ? a.accountCode.localeCompare(b.accountCode) : a.company.localeCompare(b.company),
  )
}

/** 該（公司, 科目）每日銀行淨變動（Σ借−Σ貸），只含 net≠0 的日期。 */
export function dailyNet(entries: JournalEntry[], pair: BalancePair): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of entries) {
    if ((e.company ?? '') !== pair.company) continue
    let net = 0
    for (const l of e.lines) if (l.accountCode === pair.accountCode) net += l.debit - l.credit
    if (net !== 0) m.set(e.date, (m.get(e.date) ?? 0) + net)
  }
  return m
}

export interface DailyRow {
  date: string
  /** 當日系統淨變動 */
  net: number
  /** 系統推算日終餘額 = 錨點餘額 + 錨點後至當日的累計淨變動 */
  computed: number
  /** 銀行可用餘額（未輸入為 undefined） */
  bank?: number
  /** 差額 = 推算 − 銀行（未輸入為 undefined） */
  diff?: number
  /**
   * 差額自上一個「有輸入銀行餘額的日期」以來的變化；≠0 表示問題就發生在
   * （上一個核對日, 本日] 之間——漏匯、重複或金額錯誤。
   */
  newDiff?: number
}

export interface DailyCheck {
  pair: BalancePair
  /** 錨點：起算日當天的餘額紀錄；若起算日未填，取起算日之後最早的一筆 */
  anchor?: DailyBalance
  /** 錨點是否正好在起算日 */
  anchorOnDate: boolean
  /**
   * 帳上餘額（自開帳累計至錨點日，含當日）。應等於錨點的銀行餘額；
   * 不等代表起算日前的歷史資料或期初餘額有誤（資產負債表的銀行存款會錯，但每日核對看不出來）。
   */
  bookAtAnchor?: number
  /** 帳上餘額 − 錨點銀行餘額 */
  anchorDiff?: number
  /** 自錨點（不含）起至 upTo 的逐日列：有流水或有銀行餘額的日期都列出，依日期遞增 */
  rows: DailyRow[]
  /** 最近一個有銀行餘額的核對列 */
  latest?: DailyRow
  /** 第一個出現新差異的日期 */
  firstBreak?: string
  /** 有新差異的日數 */
  breakCount: number
  /** 有流水但未輸入銀行餘額的日數 */
  missingCount: number
}

/** 逐日核對單一（公司, 科目）。 */
export function dailyCheck(
  entries: JournalEntry[],
  balances: DailyBalance[],
  pair: BalancePair,
  upTo: string,
  anchorDate = ANCHOR_DATE,
): DailyCheck {
  const mine = balances
    .filter((b) => b.company === pair.company && b.accountCode === pair.accountCode && b.date >= anchorDate)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const anchor = mine[0]
  const base: DailyCheck = { pair, anchor, anchorOnDate: anchor?.date === anchorDate, rows: [], breakCount: 0, missingCount: 0 }
  if (!anchor) return base

  const net = dailyNet(entries, pair)
  let book = 0
  for (const [d, n] of net) if (d <= anchor.date) book += n
  base.bookAtAnchor = book
  base.anchorDiff = book - anchor.balance
  const bankByDate = new Map(mine.map((b) => [b.date, b.balance]))
  const dates = new Set<string>()
  for (const d of net.keys()) if (d > anchor.date && d <= upTo) dates.add(d)
  for (const d of bankByDate.keys()) if (d > anchor.date && d <= upTo) dates.add(d)

  let run = anchor.balance
  let prevDiff = 0
  const rows: DailyRow[] = []
  for (const date of [...dates].sort()) {
    const n = net.get(date) ?? 0
    run += n
    const row: DailyRow = { date, net: n, computed: run }
    const bank = bankByDate.get(date)
    if (bank !== undefined) {
      row.bank = bank
      row.diff = run - bank
      row.newDiff = row.diff - prevDiff
      prevDiff = row.diff
      if (row.newDiff !== 0) {
        base.breakCount++
        if (!base.firstBreak) base.firstBreak = date
      }
      base.latest = row
    } else {
      base.missingCount++
    }
    rows.push(row)
  }
  base.rows = rows
  return base
}
