// =============================================================================
// 銀行對帳：帳上銀行科目餘額 vs 真實銀行餘額。
// 原理：本系統記的是銀行流水（應計不碰銀行科目），故任一日的帳上餘額
// 應「分毫不差」等於銀行對帳單當日餘額；差 1 元即代表有漏/重/錯。
// 純函式，方便測試。
// =============================================================================

import type { JournalEntry } from './types'

/** 對帳點：使用者輸入的「某日銀行真實餘額」。帳上餘額永遠即時重算，資料變動時狀態自動更新。 */
export interface ReconPoint {
  id: string
  /** 標記，與 rules 表其他資料區分（同表共存） */
  kind: 'recon'
  /** 對帳截止日 YYYY-MM-DD（含當日） */
  date: string
  /** 銀行/現金科目 code */
  accountCode: string
  /** 限定公司；空 = 不限 */
  company?: string
  /** 銀行對帳單上的真實餘額（整數元） */
  realBalance: number
  createdAt: string
}

/** 帳上餘額：該科目截至 asOf（含）的 Σ借−Σ貸，可選擇限定公司。 */
export function bankBalanceAsOf(
  entries: JournalEntry[],
  accountCode: string,
  asOf: string,
  company?: string,
): number {
  let s = 0
  for (const e of entries) {
    if (e.date > asOf) continue
    if (company && e.company !== company) continue
    for (const l of e.lines) {
      if (l.accountCode === accountCode) s += l.debit - l.credit
    }
  }
  return s
}

export interface MonthlyBalance {
  month: string // YYYY-MM
  net: number // 當月淨變動
  ending: number // 月底累計帳上餘額
}

/** 逐月淨變動與月底餘額（找出「哪個月開始對不上」用）。回傳依月份遞增。 */
export function monthlyBankBalances(
  entries: JournalEntry[],
  accountCode: string,
  upTo: string, // YYYY-MM-DD；只統計到此日（含）
  company?: string,
): MonthlyBalance[] {
  const byMonth = new Map<string, number>()
  for (const e of entries) {
    if (e.date > upTo) continue
    if (company && e.company !== company) continue
    let net = 0
    for (const l of e.lines) if (l.accountCode === accountCode) net += l.debit - l.credit
    if (net === 0) continue
    const m = e.date.slice(0, 7)
    byMonth.set(m, (byMonth.get(m) ?? 0) + net)
  }
  const months = [...byMonth.keys()].sort()
  let run = 0
  return months.map((m) => {
    const net = byMonth.get(m)!
    run += net
    return { month: m, net, ending: run }
  })
}
