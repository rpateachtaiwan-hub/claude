// =============================================================================
// 智慧建議 + 規則式學習（可解釋、不靠黑盒）
//
//  • suggest(): 依「關鍵字/對象 → 科目」規則 + 類別預設，建議該筆的借貸與科目。
//  • learn():   使用者採用或更正後，把「關鍵字 → 科目」記起來；最新更正優先。
//
// 設計：cash 基礎時另一腳是現金/銀行；accrual 時是應收/應付。建議的是「非現金腳」科目。
// =============================================================================

import { AP_ACCOUNT, AR_ACCOUNT, DEFAULT_CASH_ACCOUNT, DEFAULT_EXPENSE, DEFAULT_REVENUE } from './accounts'
import type { Account, EntryLine, EntrySource, JournalEntry, QuickInput, Rule, Side, Suggestion } from './types'

/** 依借/貸兩腳科目判斷傳票性質：含現金→現金；含應收/應付→應計；否則一般轉帳。 */
export function sourceFromLegs(
  debitCode: string,
  creditCode: string,
  accounts: Account[],
): { source: EntrySource; settled?: boolean } {
  const byCode = new Map(accounts.map((a) => [a.code, a]))
  const isCash = (c: string) => byCode.get(c)?.isCash
  const isOpen = (c: string) => byCode.get(c)?.isOpenItem
  if (isCash(debitCode) || isCash(creditCode)) return { source: 'cash', settled: true }
  if (isOpen(debitCode) || isOpen(creditCode)) return { source: 'accrual', settled: false }
  return { source: 'manual' }
}

function haystack(input: QuickInput): string {
  return `${input.counterparty ?? ''} ${input.description ?? ''}`.toLowerCase()
}

/** 找出命中且權重最高的規則。 */
export function matchRule(input: QuickInput, rules: Rule[]): Rule | undefined {
  const hay = haystack(input)
  const candidates = rules.filter(
    (r) =>
      r.keyword.trim() !== '' &&
      hay.includes(r.keyword.toLowerCase()) &&
      (r.direction === 'any' || r.direction === input.direction),
  )
  if (!candidates.length) return undefined
  return candidates.sort((a, b) => b.weight - a.weight)[0]
}

/** 非現金腳科目的方向：收入腳為貸、費用腳為借。 */
export function categorySideOf(direction: 'in' | 'out'): Side {
  return direction === 'in' ? 'credit' : 'debit'
}

/** 另一腳科目：現金基礎=銀行/現金；應計=應收/應付。可傳入科目表以動態解析（科目代號可能被改）。 */
export function settleCodeOf(input: QuickInput, accounts?: Account[]): string {
  if (input.accrual) {
    const cat = input.direction === 'in' ? 'asset' : 'liability'
    const found = accounts?.find((a) => a.isOpenItem && a.category === cat)?.code
    return found ?? (input.direction === 'in' ? AR_ACCOUNT : AP_ACCOUNT)
  }
  if (input.cashAccountCode && accounts?.some((a) => a.code === input.cashAccountCode)) return input.cashAccountCode
  if (!accounts) return input.cashAccountCode ?? DEFAULT_CASH_ACCOUNT
  if (accounts.some((a) => a.code === DEFAULT_CASH_ACCOUNT)) return DEFAULT_CASH_ACCOUNT
  return input.cashAccountCode ?? accounts.find((a) => a.isCash)?.code ?? accounts.find((a) => a.category === 'asset')?.code ?? DEFAULT_CASH_ACCOUNT
}

/** 找出可用的預設分類科目（當寫死代號不存在時，改用科目表中第一個對應類別）。 */
export function fallbackCategoryCode(direction: 'in' | 'out', accounts: Account[]): string {
  const preferred = direction === 'in' ? DEFAULT_REVENUE : DEFAULT_EXPENSE
  if (accounts.some((a) => a.code === preferred)) return preferred
  const cat = direction === 'in' ? 'revenue' : 'expense'
  return accounts.find((a) => a.category === cat && !a.isCash && !a.isOpenItem)?.code ?? preferred
}

/** 依輸入與指定的非現金腳科目，組出一張平衡傳票的內容（不含 id）。 */
export function composeEntry(
  input: QuickInput,
  categoryCode: string,
  accounts?: Account[],
): Omit<JournalEntry, 'id' | 'createdAt'> {
  const settleCode = settleCodeOf(input, accounts)
  const amount = input.amount
  const lines: EntryLine[] = []
  if (input.direction === 'in') {
    lines.push({ accountCode: settleCode, debit: amount, credit: 0 })
    lines.push({ accountCode: categoryCode, debit: 0, credit: amount })
  } else {
    lines.push({ accountCode: categoryCode, debit: amount, credit: 0 })
    lines.push({ accountCode: settleCode, debit: 0, credit: amount })
  }
  return {
    date: input.date,
    description: input.description,
    counterparty: input.counterparty,
    company: input.company,
    voucherNo: input.voucherNo,
    source: input.accrual ? 'accrual' : 'cash',
    lines,
    settled: input.accrual ? false : true,
  }
}

/**
 * 建議該筆的傳票（借貸已配好）與非現金腳科目。
 */
export function suggest(input: QuickInput, rules: Rule[], accounts: Account[]): Suggestion {
  const accByCode = new Map(accounts.map((a) => [a.code, a]))
  const matched = matchRule(input, rules)

  const categoryCode = matched?.accountCode ?? fallbackCategoryCode(input.direction, accounts)
  const categoryAcc = accByCode.get(categoryCode)
  const categorySide: Side = categorySideOf(input.direction)
  const settleCode = settleCodeOf(input, accounts)
  const entry = composeEntry(input, categoryCode, accounts)

  const sideZh = categorySide === 'debit' ? '借方' : '貸方'
  const settleName = accByCode.get(settleCode)?.name ?? settleCode
  const reason = matched
    ? `命中規則「${matched.keyword}」→ ${categoryAcc?.name ?? categoryCode}（${sideZh}），對方科目：${settleName}`
    : `無學習規則，依${input.direction === 'in' ? '收入' : '支出'}預設 → ${categoryAcc?.name ?? categoryCode}（${sideZh}），對方科目：${settleName}`

  return {
    entry,
    accountCode: categoryCode,
    side: categorySide,
    confidence: matched ? 'rule' : 'default',
    matchedRule: matched,
    reason,
  }
}

/**
 * 學習：把「關鍵字 → 採用的科目」記起來。最新更正權重躍升至最高，下次優先採用。
 * keyword 取對象(優先)或摘要。
 */
export function learn(input: QuickInput, chosenAccountCode: string, rules: Rule[]): Rule[] {
  const keyword = (input.counterparty?.trim() || input.description?.trim() || '').toLowerCase()
  if (!keyword) return rules

  // 同一關鍵字目前最高權重 → 新規則躍升其上（最新更正勝出）
  const sameKeyword = rules.filter((r) => r.keyword.toLowerCase() === keyword)
  const maxWeight = sameKeyword.reduce((m, r) => Math.max(m, r.weight), 0)
  const newWeight = maxWeight + 1

  const existing = rules.find(
    (r) => r.keyword.toLowerCase() === keyword && r.accountCode === chosenAccountCode && r.direction === input.direction,
  )
  if (existing) {
    return rules.map((r) => (r === existing ? { ...r, weight: newWeight } : r))
  }
  const rule: Rule = {
    id: `R-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    keyword,
    accountCode: chosenAccountCode,
    direction: input.direction,
    weight: newWeight,
  }
  return [...rules, rule]
}

// 初始種子規則（常見關鍵字），讓系統一開始就堪用；之後靠學習越來越準。
export const SEED_RULES: Rule[] = [
  { id: 'seed-1', keyword: '加油', accountCode: '6103', direction: 'out', weight: 1 },
  { id: 'seed-2', keyword: '中油', accountCode: '6103', direction: 'out', weight: 1 },
  { id: 'seed-3', keyword: '台電', accountCode: '6104', direction: 'out', weight: 1 },
  { id: 'seed-4', keyword: '水費', accountCode: '6104', direction: 'out', weight: 1 },
  { id: 'seed-5', keyword: '租金', accountCode: '6102', direction: 'out', weight: 1 },
  { id: 'seed-6', keyword: '薪資', accountCode: '6101', direction: 'out', weight: 1 },
  { id: 'seed-7', keyword: '手續費', accountCode: '6105', direction: 'out', weight: 1 },
  { id: 'seed-8', keyword: '廣告', accountCode: '6106', direction: 'out', weight: 1 },
  { id: 'seed-9', keyword: 'facebook', accountCode: '6106', direction: 'out', weight: 1 },
  { id: 'seed-10', keyword: 'google', accountCode: '6106', direction: 'out', weight: 1 },
]
