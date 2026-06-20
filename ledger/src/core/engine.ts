// =============================================================================
// 複式簿記引擎（純函式）：把精簡輸入展開成借貸平衡的傳票，並驗證平衡。
// =============================================================================

import { assertInteger } from './money'
import type { EntryLine, JournalEntry } from './types'

export class LedgerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LedgerError'
  }
}

export function sumDebit(lines: EntryLine[]): number {
  return lines.reduce((s, l) => s + l.debit, 0)
}
export function sumCredit(lines: EntryLine[]): number {
  return lines.reduce((s, l) => s + l.credit, 0)
}

/** 驗證：每行恰一邊有值、金額整數、整張借貸平衡。 */
export function assertBalanced(lines: EntryLine[]): void {
  if (lines.length < 2) throw new LedgerError('傳票至少需要兩行（借與貸）')
  for (const l of lines) {
    assertInteger(l.debit, '借方')
    assertInteger(l.credit, '貸方')
    if (l.debit < 0 || l.credit < 0) throw new LedgerError('借貸金額不可為負數')
    if ((l.debit === 0) === (l.credit === 0)) {
      throw new LedgerError('每行分錄必須恰好一邊有值（借或貸）')
    }
  }
  const d = sumDebit(lines)
  const c = sumCredit(lines)
  if (d !== c) throw new LedgerError(`傳票不平衡：借方 ${d} ≠ 貸方 ${c}`)
}

let _seq = 0
export function newId(prefix = 'TX'): string {
  _seq += 1
  return `${prefix}-${Date.now().toString(36)}-${_seq.toString(36)}`
}

/** 建立一張傳票並驗證平衡。 */
export function buildEntry(input: {
  date: string
  description: string
  counterparty?: string
  source: JournalEntry['source']
  lines: EntryLine[]
  settled?: boolean
  settles?: string
  counterpartyAccount?: string
  branch?: string
  voucherNo?: string
  needsReview?: boolean
  id?: string
}): JournalEntry {
  assertBalanced(input.lines)
  return {
    id: input.id ?? newId(),
    date: input.date,
    description: input.description,
    counterparty: input.counterparty,
    source: input.source,
    lines: input.lines,
    settled: input.settled,
    settles: input.settles,
    counterpartyAccount: input.counterpartyAccount,
    branch: input.branch,
    voucherNo: input.voucherNo,
    needsReview: input.needsReview,
    createdAt: new Date().toISOString(),
  }
}

/** 便利建構：兩腳傳票（借 debitCode / 貸 creditCode）。 */
export function twoLegEntry(input: {
  date: string
  description: string
  counterparty?: string
  source: JournalEntry['source']
  amount: number
  debitCode: string
  creditCode: string
  settled?: boolean
  settles?: string
  id?: string
}): JournalEntry {
  const amount = assertInteger(input.amount, '金額')
  if (amount <= 0) throw new LedgerError('金額必須大於 0')
  return buildEntry({
    ...input,
    lines: [
      { accountCode: input.debitCode, debit: amount, credit: 0 },
      { accountCode: input.creditCode, debit: 0, credit: amount },
    ],
  })
}
