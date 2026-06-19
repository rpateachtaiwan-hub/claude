// =============================================================================
// 三大報表（純函式）：損益表 / 資產負債表 / 現金流量表（直接法）
// 全部建立在嚴謹複式分錄之上；只看 account 與借貸金額。
// =============================================================================

import type { Account, Category, JournalEntry } from './types'

export interface DateRange {
  from?: string // YYYY-MM-DD（含）
  to?: string // YYYY-MM-DD（含）
}

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
    for (const l of e.lines) {
      net.set(l.accountCode, (net.get(l.accountCode) ?? 0) + l.debit - l.credit)
    }
  }
  return net
}

// ── 損益表 ────────────────────────────────────────────────────────────────────
export interface PnlRow { code: string; name: string; category: 'revenue' | 'expense'; amount: number }
export interface Pnl { revenue: number; expense: number; netIncome: number; rows: PnlRow[] }

export function profitAndLoss(entries: JournalEntry[], accounts: Account[], range?: DateRange): Pnl {
  const accByCode = new Map(accounts.map((a) => [a.code, a]))
  const net = accountNet(entries, range)
  const rows: PnlRow[] = []
  let revenue = 0
  let expense = 0
  for (const [code, n] of net) {
    const acc = accByCode.get(code)
    if (!acc) continue
    if (acc.category === 'revenue') {
      const amount = -n // 收入為貸方 → 貸−借 = −(借−貸)
      revenue += amount
      if (amount !== 0) rows.push({ code, name: acc.name, category: 'revenue', amount })
    } else if (acc.category === 'expense') {
      const amount = n // 費用為借方
      expense += amount
      if (amount !== 0) rows.push({ code, name: acc.name, category: 'expense', amount })
    }
  }
  rows.sort((a, b) => a.code.localeCompare(b.code))
  return { revenue, expense, netIncome: revenue - expense, rows }
}

// ── 資產負債表 ────────────────────────────────────────────────────────────────
export interface BsRow { code: string; name: string; amount: number }
export interface BalanceSheet {
  asOf?: string
  assets: BsRow[]
  liabilities: BsRow[]
  equity: BsRow[]
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  retainedEarnings: number
  balanced: boolean
}

export function balanceSheet(entries: JournalEntry[], accounts: Account[], asOf?: string): BalanceSheet {
  const accByCode = new Map(accounts.map((a) => [a.code, a]))
  const range: DateRange | undefined = asOf ? { to: asOf } : undefined
  const net = accountNet(entries, range)

  const assets: BsRow[] = []
  const liabilities: BsRow[] = []
  const equity: BsRow[] = []
  let totalAssets = 0
  let totalLiab = 0
  let totalEquity = 0
  let retained = 0

  for (const [code, n] of net) {
    const acc = accByCode.get(code)
    if (!acc) continue
    if (acc.category === 'asset') {
      const amount = n // 資產借方為正
      totalAssets += amount
      if (amount !== 0) assets.push({ code, name: acc.name, amount })
    } else if (acc.category === 'liability') {
      const amount = -n // 負債貸方為正
      totalLiab += amount
      if (amount !== 0) liabilities.push({ code, name: acc.name, amount })
    } else if (acc.category === 'equity') {
      const amount = -n // 權益貸方為正（業主提取為借→負）
      totalEquity += amount
      if (amount !== 0) equity.push({ code, name: acc.name, amount })
    } else if (acc.category === 'revenue') {
      retained += -n
    } else if (acc.category === 'expense') {
      retained -= n
    }
  }

  // 累計損益（保留盈餘）併入權益
  if (retained !== 0) equity.push({ code: '3999', name: '本期/累計損益', amount: retained })
  totalEquity += retained

  assets.sort((a, b) => a.code.localeCompare(b.code))
  liabilities.sort((a, b) => a.code.localeCompare(b.code))
  equity.sort((a, b) => a.code.localeCompare(b.code))

  return {
    asOf,
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities: totalLiab,
    totalEquity,
    retainedEarnings: retained,
    balanced: totalAssets === totalLiab + totalEquity,
  }
}

// ── 現金流量表（直接法）────────────────────────────────────────────────────────
export type CashFlowBucket = 'operating' | 'investing' | 'financing'

const FINANCING_CODES = new Set(['2201', '3101', '3201']) // 借款、資本、提取

function bucketOf(acc: Account): CashFlowBucket {
  if (FINANCING_CODES.has(acc.code)) return 'financing'
  if (acc.category === 'asset' && acc.code.startsWith('14')) return 'investing' // 固定資產
  if (acc.category === 'equity') return 'financing'
  return 'operating' // 收入/費用/應收/應付/流動資產負債
}

export interface CashFlowLine { code: string; name: string; amount: number } // 正=流入、負=流出
export interface CashFlow {
  operating: CashFlowLine[]
  investing: CashFlowLine[]
  financing: CashFlowLine[]
  operatingTotal: number
  investingTotal: number
  financingTotal: number
  netChange: number
  endingCash: number
}

export function cashFlow(entries: JournalEntry[], accounts: Account[], range?: DateRange): CashFlow {
  const accByCode = new Map(accounts.map((a) => [a.code, a]))
  const isCash = (code: string) => accByCode.get(code)?.isCash === true

  const agg: Record<CashFlowBucket, Map<string, number>> = {
    operating: new Map(), investing: new Map(), financing: new Map(),
  }

  for (const e of entries) {
    if (!inRange(e.date, range)) continue
    const hasCash = e.lines.some((l) => isCash(l.accountCode))
    if (!hasCash) continue // 無現金移動（純應計）不計入
    for (const l of e.lines) {
      if (isCash(l.accountCode)) continue // 現金腳本身不分類
      const acc = accByCode.get(l.accountCode)
      if (!acc) continue
      const amount = l.credit - l.debit // 對非現金腳：貸→現金流入(+)、借→現金流出(−)
      const b = bucketOf(acc)
      agg[b].set(l.accountCode, (agg[b].get(l.accountCode) ?? 0) + amount)
    }
  }

  const toLines = (m: Map<string, number>): CashFlowLine[] =>
    [...m.entries()]
      .filter(([, v]) => v !== 0)
      .map(([code, amount]) => ({ code, name: accByCode.get(code)?.name ?? code, amount }))
      .sort((a, b) => a.code.localeCompare(b.code))

  const operating = toLines(agg.operating)
  const investing = toLines(agg.investing)
  const financing = toLines(agg.financing)
  const sum = (ls: CashFlowLine[]) => ls.reduce((s, l) => s + l.amount, 0)
  const operatingTotal = sum(operating)
  const investingTotal = sum(investing)
  const financingTotal = sum(financing)

  // 期末現金 = 所有現金科目淨額（至範圍結束）
  const net = accountNet(entries, range ? { to: range.to } : undefined)
  let endingCash = 0
  for (const a of accounts) if (a.isCash) endingCash += net.get(a.code) ?? 0

  return {
    operating, investing, financing,
    operatingTotal, investingTotal, financingTotal,
    netChange: operatingTotal + investingTotal + financingTotal,
    endingCash,
  }
}
