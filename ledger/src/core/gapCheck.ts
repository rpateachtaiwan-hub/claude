// =============================================================================
// 交易日缺口檢查：以「銀行營業日」（週一～週五，扣除台灣國定假日）為基準，
// 找出連續無任何銀行交易的日期區間——用來發現「該有資料卻沒匯到」的缺漏。
// 只看有現金/銀行腳的分錄（應計分錄不是銀行流水，不列入）。純函式可測試。
// =============================================================================

import type { Account, JournalEntry } from './types'

/** 台灣 2026（民國115年）政府行政機關放假日中落在週一～五者；2026 無補班日。 */
export const TW_HOLIDAYS = new Set<string>([
  '2026-01-01', // 元旦
  '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', // 春節（2/14–2/22）
  '2026-02-27', // 和平紀念日連假
  '2026-04-03', '2026-04-06', // 兒童節、清明節連假
  '2026-05-01', // 勞動節
  '2026-06-19', // 端午節
  '2026-09-25', '2026-09-28', // 中秋、教師節
  '2026-10-09', // 國慶連假
  '2026-10-26', // 光復節連假
  '2026-12-25', // 行憲紀念日
])

/** 是否為銀行營業日（週一～五且非國定假日）。 */
export function isBankingDay(iso: string, holidays: Set<string> = TW_HOLIDAYS): boolean {
  const d = new Date(`${iso}T00:00:00`)
  const dow = d.getDay()
  if (dow === 0 || dow === 6) return false
  return !holidays.has(iso)
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 取出「有銀行流水」的日期集合（分錄需含現金/銀行腳；可限定公司）。 */
export function cashTxDates(entries: JournalEntry[], accounts: Account[], company?: string): Set<string> {
  const cash = new Set(accounts.filter((a) => a.isCash).map((a) => a.code))
  const out = new Set<string>()
  for (const e of entries) {
    if (company && e.company !== company) continue
    if (e.lines.some((l) => cash.has(l.accountCode))) out.add(e.date)
  }
  return out
}

export interface DateGap {
  from: string
  to: string
  /** 區間內的銀行營業日數 */
  days: number
}

/**
 * 掃描 [from, to]（含兩端）之間的銀行營業日，回報「連續 ≥ minGapDays 個營業日
 * 都沒有交易」的區間。週末與假日不中斷也不計入天數。
 */
export function bankingDayGaps(
  txDates: Set<string>,
  from: string,
  to: string,
  minGapDays = 3,
  holidays: Set<string> = TW_HOLIDAYS,
): DateGap[] {
  const gaps: DateGap[] = []
  let cur: { from: string; to: string; days: number } | null = null
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!isBankingDay(d, holidays)) continue
    if (txDates.has(d)) {
      if (cur && cur.days >= minGapDays) gaps.push(cur)
      cur = null
    } else {
      if (cur) { cur.to = d; cur.days++ } else cur = { from: d, to: d, days: 1 }
    }
  }
  if (cur && cur.days >= minGapDays) gaps.push(cur)
  return gaps
}
