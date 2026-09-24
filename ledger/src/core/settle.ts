// =============================================================================
// 沖銷（收/付款）核心：未沖應收/應付清單，與沖銷分錄產生。支援部分沖銷。
// =============================================================================

import { buildEntry, LedgerError } from './engine'
import { assertInteger } from './money'
import type { Account, JournalEntry } from './types'

export interface OpenItem {
  id: string // = 應計傳票 id
  type: 'AR' | 'AP'
  controlCode: string
  /** 原始應計傳票的借方科目 code */
  debitCode: string
  /** 原始應計傳票的貸方科目 code */
  creditCode: string
  date: string
  description: string
  counterparty?: string
  company?: string
  amount: number // 原始掛帳金額
  settled: number // 已沖金額
  remaining: number
}

/** 從所有傳票計算未沖（remaining > 0）的應收/應付清單。 */
export function openItems(entries: JournalEntry[], accounts: Account[]): OpenItem[] {
  const accByCode = new Map(accounts.map((a) => [a.code, a]))
  const settledByTarget = new Map<string, number>()
  for (const e of entries) {
    if (!e.settles) continue
    const accrual = entries.find((x) => x.id === e.settles)
    if (!accrual) continue
    const control = accrual.lines.find((l) => accByCode.get(l.accountCode)?.isOpenItem)
    if (!control) continue
    const line = e.lines.find((l) => l.accountCode === control.accountCode)
    if (!line) continue
    settledByTarget.set(e.settles, (settledByTarget.get(e.settles) ?? 0) + line.debit + line.credit)
  }

  const items: OpenItem[] = []
  for (const e of entries) {
    if (e.source !== 'accrual') continue
    const control = e.lines.find((l) => accByCode.get(l.accountCode)?.isOpenItem)
    if (!control) continue
    const acc = accByCode.get(control.accountCode)!
    const type: OpenItem['type'] = acc.category === 'asset' ? 'AR' : 'AP'
    const amount = type === 'AR' ? control.debit : control.credit
    const settled = settledByTarget.get(e.id) ?? 0
    const remaining = amount - settled
    if (remaining <= 0) continue
    const debitLine = e.lines.find((l) => l.debit > 0)
    const creditLine = e.lines.find((l) => l.credit > 0)
    items.push({
      id: e.id, type, controlCode: control.accountCode,
      debitCode: debitLine?.accountCode ?? control.accountCode,
      creditCode: creditLine?.accountCode ?? control.accountCode,
      date: e.date,
      description: e.description, counterparty: e.counterparty, company: e.company, amount, settled, remaining,
    })
  }
  return items
}

/** 產生一筆沖銷（收/付款）分錄。AR：借 現金/貸 應收；AP：借 應付/貸 現金。 */
export function buildSettlement(
  item: OpenItem,
  opts: { date: string; amount: number; cashAccountCode: string },
): JournalEntry {
  const amount = assertInteger(opts.amount, '沖銷金額')
  if (amount <= 0) throw new LedgerError('沖銷金額必須大於 0')
  if (amount > item.remaining) throw new LedgerError(`沖銷金額 ${amount} 超過未沖餘額 ${item.remaining}`)

  const isAR = item.type === 'AR'
  const lines = isAR
    ? [
        { accountCode: opts.cashAccountCode, debit: amount, credit: 0 },
        { accountCode: item.controlCode, debit: 0, credit: amount },
      ]
    : [
        { accountCode: item.controlCode, debit: amount, credit: 0 },
        { accountCode: opts.cashAccountCode, debit: 0, credit: amount },
      ]
  return buildEntry({
    date: opts.date,
    description: `${isAR ? '收款沖銷' : '付款沖銷'}：${item.description}`,
    counterparty: item.counterparty,
    company: item.company,
    source: 'settlement',
    lines,
    settles: item.id,
  })
}
