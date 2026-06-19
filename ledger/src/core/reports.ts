// =============================================================================
// 三大報表（純函式）：損益表 / 資產負債表 / 現金流量表（直接法）
// includeZero=true 時，列出所有相關科目（沒有金額寫 0）。
// =============================================================================

import type { Account, JournalEntry } from './types'

export interface DateRange { from?: string; to?: string }

function inRange(date: string, range?: DateRange): boolean {
  if (!range) return true
  if (range.from && date < range.from) return false
  if (range.to && date > range.to) return false
  return true
}

/** 各科目淨額（借−貸），可選日期範圍。 */
export function accountNet(entries: JournalEntry[], range?: DateRange): Map<string, number> {
  const net = new Map<string, number>()
  for (const e of entries) {
    if (!inRange(e.date, range)) continue
    for (const l of e.lines) net.set(l.accountCode, (net.get(l.accountCode) ?? 0) + l.debit - l.credit)
  }
  return net
}

// ── 損益表 ────────────────────────────────────────────────────────────────────
export interface PnlRow { code: string; name: string; category: 'revenue' | 'expense'; amount: number }
export interface Pnl { revenue: number; expense: number; netIncome: number; rows: PnlRow[] }

export function profitAndLoss(entries: JournalEntry[], accounts: Account[], range?: DateRange, includeZero = false): Pnl {
  const net = accountNet(entries, range)
  const rows: PnlRow[] = []
  let revenue = 0, expense = 0
  for (const acc of accounts) {
    if (acc.category === 'revenue') {
      const amount = -(net.get(acc.code) ?? 0)
      revenue += amount
      if (amount !== 0 || includeZero) rows.push({ code: acc.code, name: acc.name, category: 'revenue', amount })
    } else if (acc.category === 'expense') {
      const amount = net.get(acc.code) ?? 0
      expense += amount
      if (amount !== 0 || includeZero) rows.push({ code: acc.code, name: acc.name, category: 'expense', amount })
    }
  }
  rows.sort((a, b) => a.code.localeCompare(b.code))
  return { revenue, expense, netIncome: revenue - expense, rows }
}

// ── 資產負債表 ────────────────────────────────────────────────────────────────
export interface BsRow { code: string; name: string; amount: number }
export interface BalanceSheet {
  asOf?: string
  assets: BsRow[]; liabilities: BsRow[]; equity: BsRow[]
  totalAssets: number; totalLiabilities: number; totalEquity: number
  retainedEarnings: number; balanced: boolean
}

export function balanceSheet(entries: JournalEntry[], accounts: Account[], asOf?: string, includeZero = false): BalanceSheet {
  const range: DateRange | undefined = asOf ? { to: asOf } : undefined
  const net = accountNet(entries, range)
  const assets: BsRow[] = [], liabilities: BsRow[] = [], equity: BsRow[] = []
  let totalAssets = 0, totalLiab = 0, totalEquity = 0, retained = 0

  for (const acc of accounts) {
    const n = net.get(acc.code) ?? 0
    if (acc.category === 'asset') {
      totalAssets += n
      if (n !== 0 || includeZero) assets.push({ code: acc.code, name: acc.name, amount: n })
    } else if (acc.category === 'liability') {
      totalLiab += -n
      if (n !== 0 || includeZero) liabilities.push({ code: acc.code, name: acc.name, amount: -n })
    } else if (acc.category === 'equity') {
      totalEquity += -n
      if (n !== 0 || includeZero) equity.push({ code: acc.code, name: acc.name, amount: -n })
    } else if (acc.category === 'revenue') {
      retained += -n
    } else if (acc.category === 'expense') {
      retained -= n
    }
  }
  if (retained !== 0 || includeZero) equity.push({ code: '3999', name: '本期/累計損益', amount: retained })
  totalEquity += retained

  assets.sort((a, b) => a.code.localeCompare(b.code))
  liabilities.sort((a, b) => a.code.localeCompare(b.code))
  equity.sort((a, b) => a.code.localeCompare(b.code))
  return { asOf, assets, liabilities, equity, totalAssets, totalLiabilities: totalLiab, totalEquity, retainedEarnings: retained, balanced: totalAssets === totalLiab + totalEquity }
}

// ── 現金流量表（直接法）────────────────────────────────────────────────────────
export type CashFlowBucket = 'operating' | 'investing' | 'financing'
const FINANCING_CODES = new Set(['2201', '3101', '3201'])

function bucketOf(acc: Account): CashFlowBucket {
  if (FINANCING_CODES.has(acc.code)) return 'financing'
  if (acc.category === 'asset' && acc.code.startsWith('14')) return 'investing'
  if (acc.category === 'equity') return 'financing'
  return 'operating'
}

export interface CashFlowLine { code: string; name: string; amount: number }
export interface CashFlow {
  operating: CashFlowLine[]; investing: CashFlowLine[]; financing: CashFlowLine[]
  operatingTotal: number; investingTotal: number; financingTotal: number
  netChange: number; endingCash: number
}

export function cashFlow(entries: JournalEntry[], accounts: Account[], range?: DateRange, includeZero = false): CashFlow {
  const accByCode = new Map(accounts.map((a) => [a.code, a]))
  const isCash = (code: string) => accByCode.get(code)?.isCash === true
  const agg: Record<CashFlowBucket, Map<string, number>> = { operating: new Map(), investing: new Map(), financing: new Map() }

  if (includeZero) {
    for (const a of accounts) if (!a.isCash) agg[bucketOf(a)].set(a.code, 0)
  }

  for (const e of entries) {
    if (!inRange(e.date, range)) continue
    if (!e.lines.some((l) => isCash(l.accountCode))) continue
    for (const l of e.lines) {
      if (isCash(l.accountCode)) continue
      const acc = accByCode.get(l.accountCode)
      if (!acc) continue
      const amount = l.credit - l.debit
      const b = bucketOf(acc)
      agg[b].set(l.accountCode, (agg[b].get(l.accountCode) ?? 0) + amount)
    }
  }

  const toLines = (m: Map<string, number>): CashFlowLine[] =>
    [...m.entries()]
      .filter(([, v]) => v !== 0 || includeZero)
      .map(([code, amount]) => ({ code, name: accByCode.get(code)?.name ?? code, amount }))
      .sort((a, b) => a.code.localeCompare(b.code))

  const operating = toLines(agg.operating), investing = toLines(agg.investing), financing = toLines(agg.financing)
  const sum = (ls: CashFlowLine[]) => ls.reduce((s, l) => s + l.amount, 0)
  const operatingTotal = sum(operating), investingTotal = sum(investing), financingTotal = sum(financing)

  const net = accountNet(entries, range ? { to: range.to } : undefined)
  let endingCash = 0
  for (const a of accounts) if (a.isCash) endingCash += net.get(a.code) ?? 0

  return { operating, investing, financing, operatingTotal, investingTotal, financingTotal, netChange: operatingTotal + investingTotal + financingTotal, endingCash }
}
