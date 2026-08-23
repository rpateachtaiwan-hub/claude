// =============================================================================
// 報表邏輯 (Milestone 3) — 純函式：損益表 / 試算表 / 帳齡 / 對帳檢核
//
// 重要：損益與試算表只看 account + 借貸金額，與 open_item 無關，
// 因此沖銷機制不影響既有損益計算。
// =============================================================================

import type { Account, OpenItemType, OpenItemWithRemaining } from './types'

/** 已過帳的分錄明細（報表輸入）。 */
export interface PostedLine {
  accountId: number
  debit: number
  credit: number
  period: string // 'YYYY-MM'
}

export interface OpeningBalance {
  accountId: number
  amount: number
  side: 'debit' | 'credit'
}

// ── 損益表 ────────────────────────────────────────────────────────────────────

export interface PnlRow {
  accountId: number
  code: string
  name: string
  category: 'revenue' | 'expense'
  amount: number // 收入=Σ貸−Σ借；費用=Σ借−Σ貸
}
export interface PnlReport {
  revenue: number
  expense: number
  netIncome: number
  rows: PnlRow[]
}

/**
 * 損益表：依 account.category 彙總。
 * @param periods 若提供，只計入這些期間（'YYYY-MM'）；否則全部。
 */
export function profitAndLoss(
  lines: PostedLine[],
  accounts: Account[],
  periods?: string[],
): PnlReport {
  const accById = new Map(accounts.map((a) => [a.id, a]))
  const periodSet = periods ? new Set(periods) : null
  const agg = new Map<number, { debit: number; credit: number }>()

  for (const l of lines) {
    if (periodSet && !periodSet.has(l.period)) continue
    const acc = accById.get(l.accountId)
    if (!acc || (acc.category !== 'revenue' && acc.category !== 'expense')) continue
    const cur = agg.get(l.accountId) ?? { debit: 0, credit: 0 }
    cur.debit += l.debit
    cur.credit += l.credit
    agg.set(l.accountId, cur)
  }

  const rows: PnlRow[] = []
  let revenue = 0
  let expense = 0
  for (const [accountId, { debit, credit }] of agg) {
    const acc = accById.get(accountId)!
    const category = acc.category as 'revenue' | 'expense'
    const amount = category === 'revenue' ? credit - debit : debit - credit
    if (category === 'revenue') revenue += amount
    else expense += amount
    rows.push({ accountId, code: acc.code, name: acc.name, category, amount })
  }
  rows.sort((a, b) => a.code.localeCompare(b.code))
  return { revenue, expense, netIncome: revenue - expense, rows }
}

// ── 試算表 ────────────────────────────────────────────────────────────────────

export interface TrialBalanceRow {
  accountId: number
  code: string
  name: string
  debitBalance: number
  creditBalance: number
}
export interface TrialBalance {
  rows: TrialBalanceRow[]
  totalDebit: number
  totalCredit: number
  balanced: boolean
}

/**
 * 試算表：每科目 = 期初數 ± (Σ借−Σ貸)，依 normal_balance 取號顯示在借或貸側。
 * @param periods 若提供，只計入這些期間；否則全部（期初數一律計入）。
 */
export function trialBalance(
  lines: PostedLine[],
  accounts: Account[],
  openings: OpeningBalance[] = [],
  periods?: string[],
): TrialBalance {
  const accById = new Map(accounts.map((a) => [a.id, a]))
  const periodSet = periods ? new Set(periods) : null

  // 以「借正貸負」累計每科目淨額
  const signed = new Map<number, number>()
  for (const ob of openings) {
    const delta = ob.side === 'debit' ? ob.amount : -ob.amount
    signed.set(ob.accountId, (signed.get(ob.accountId) ?? 0) + delta)
  }
  for (const l of lines) {
    if (periodSet && !periodSet.has(l.period)) continue
    signed.set(l.accountId, (signed.get(l.accountId) ?? 0) + l.debit - l.credit)
  }

  const rows: TrialBalanceRow[] = []
  let totalDebit = 0
  let totalCredit = 0
  for (const [accountId, net] of signed) {
    const acc = accById.get(accountId)
    if (!acc) continue
    if (net === 0) continue
    // net > 0 → 借餘；net < 0 → 貸餘
    const debitBalance = net > 0 ? net : 0
    const creditBalance = net < 0 ? -net : 0
    totalDebit += debitBalance
    totalCredit += creditBalance
    rows.push({ accountId, code: acc.code, name: acc.name, debitBalance, creditBalance })
  }
  rows.sort((a, b) => a.code.localeCompare(b.code))
  return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit }
}

// ── 應收/應付帳齡 ─────────────────────────────────────────────────────────────

export interface AgingBucket {
  label: string
  /** [minDays, maxDays] 含；maxDays 為 null 表示無上限 */
  range: [number, number | null]
  amount: number
  count: number
}
export interface AgingReport {
  type: OpenItemType
  asOf: string
  buckets: AgingBucket[]
  total: number
}

const DEFAULT_BUCKETS: Array<{ label: string; range: [number, number | null] }> = [
  { label: '0-30', range: [0, 30] },
  { label: '31-60', range: [31, 60] },
  { label: '61-90', range: [61, 90] },
  { label: '90+', range: [91, null] },
]

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10))
  const to = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10))
  return Math.floor((to - from) / 86_400_000)
}

/**
 * 帳齡：取 remaining > 0 的未沖項，依 origin_date 與 asOf 的天數差分桶。
 */
export function aging(
  items: OpenItemWithRemaining[],
  type: OpenItemType,
  asOf: string,
  bucketDefs = DEFAULT_BUCKETS,
): AgingReport {
  const buckets: AgingBucket[] = bucketDefs.map((b) => ({ ...b, amount: 0, count: 0 }))
  let total = 0
  for (const item of items) {
    if (item.type !== type || item.remaining <= 0) continue
    const age = daysBetween(item.originDate, asOf)
    const bucket =
      buckets.find((b) => age >= b.range[0] && (b.range[1] === null || age <= b.range[1])) ??
      buckets[buckets.length - 1]
    bucket.amount += item.remaining
    bucket.count += 1
    total += item.remaining
  }
  return { type, asOf, buckets, total }
}

// ── 對帳檢核 ──────────────────────────────────────────────────────────────────

export interface ReconcileResult {
  accountId: number
  /** 未沖項 remaining 合計 */
  openItemsTotal: number
  /** 試算表上該科目餘額（依 normal_balance 取正號） */
  ledgerBalance: number
  matched: boolean
  difference: number
}

/**
 * 對帳：某控制科目（應收/應付）的未沖餘額合計，應等於試算表上該科目餘額。
 */
export function reconcileControl(
  accountId: number,
  account: Account,
  items: OpenItemWithRemaining[],
  tb: TrialBalance,
): ReconcileResult {
  const openItemsTotal = items
    .filter((i) => i.accountId === accountId && i.remaining > 0)
    .reduce((s, i) => s + i.remaining, 0)

  const row = tb.rows.find((r) => r.accountId === accountId)
  const ledgerBalance = account.normalBalance === 'debit'
    ? (row?.debitBalance ?? 0)
    : (row?.creditBalance ?? 0)

  const difference = openItemsTotal - ledgerBalance
  return { accountId, openItemsTotal, ledgerBalance, matched: difference === 0, difference }
}
