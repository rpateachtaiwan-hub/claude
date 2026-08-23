// =============================================================================
// 沖銷引擎 (Milestone 2) — 純函式、可測試，無 DB 依賴。
//
// 與 supabase/migrations/0002_post_settlement_fn.sql 為同一套規則的兩個實作：
//   * 本檔負責邏輯與驗收測試（純函式，輸入 → 傳票草稿）。
//   * SQL 函式負責真正的單一交易過帳與併發鎖定。
// 兩者規則必須保持一致。
// =============================================================================

import { assertInteger } from './money'
import { periodOf } from './money'
import type {
  Account,
  AllocationInput,
  DraftEntry,
  DraftLine,
  OpenItem,
  OpenItemStatus,
  OpenItemWithRemaining,
  SettlementDraft,
  SettlementInput,
} from './types'

export class SettlementError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SettlementError'
  }
}

// ── 衍生值 ────────────────────────────────────────────────────────────────────

/** 由原始金額與已沖額推導狀態。 */
export function deriveStatus(originalAmount: number, settled: number): OpenItemStatus {
  if (settled >= originalAmount) return 'closed'
  if (settled > 0) return 'partial'
  return 'open'
}

export function remainingOf(item: OpenItem, settled: number): number {
  return item.originalAmount - settled
}

// ── 平衡驗證（傳票不變條件：Σ借 = Σ貸）─────────────────────────────────────────

export function sumDebit(lines: DraftLine[]): number {
  return lines.reduce((s, l) => s + l.debit, 0)
}
export function sumCredit(lines: DraftLine[]): number {
  return lines.reduce((s, l) => s + l.credit, 0)
}

/** 驗證每行恰一邊有值、金額為整數、且整張平衡；不平衡拋 SettlementError。 */
export function assertBalanced(lines: DraftLine[]): void {
  if (lines.length === 0) throw new SettlementError('傳票至少需要一行分錄')
  for (const l of lines) {
    assertInteger(l.debit, '借方')
    assertInteger(l.credit, '貸方')
    if (l.debit < 0 || l.credit < 0) throw new SettlementError('借貸金額不可為負數')
    if ((l.debit === 0) === (l.credit === 0)) {
      throw new SettlementError('每行分錄必須恰好一邊有值（借或貸）')
    }
  }
  const d = sumDebit(lines)
  const c = sumCredit(lines)
  if (d !== c) {
    throw new SettlementError(`傳票不平衡：借方 ${d} ≠ 貸方 ${c}`)
  }
}

/** 通用傳票草稿建立（手動傳票用）：建立後立即驗證平衡。 */
export function buildEntry(input: {
  entryDate: string
  summary: string
  source?: DraftEntry['source']
  batchNo?: string | null
  lines: DraftLine[]
}): DraftEntry {
  assertBalanced(input.lines)
  return {
    entryDate: input.entryDate,
    period: periodOf(input.entryDate),
    summary: input.summary,
    source: input.source ?? 'manual',
    batchNo: input.batchNo ?? null,
    lines: input.lines,
  }
}

// ── 沖銷引擎主函式 ────────────────────────────────────────────────────────────

/**
 * 依沖銷輸入產生一張平衡傳票（含多筆借/貸應收應付腳 + 手續費 + 銀行現金）。
 *
 * @param input       沖銷輸入（日期、type、銀行科目、手續費、分配清單）
 * @param items       本次涉及的未沖項（需含目前 remaining），至少涵蓋 input 中所有 openItemId
 *
 * 規則（與 SQL 函式一致）：
 *   payment / AP：借 應付(各 amount, 連 open_item) + 借 手續費(fee) + 貸 銀行(total+fee)
 *   receipt / AR：貸 應收(各 amount, 連 open_item) + 借 手續費(fee) + 借 銀行(total−fee)
 */
export function buildSettlementDraft(
  input: SettlementInput,
  items: OpenItemWithRemaining[],
): SettlementDraft {
  const fee = input.feeAmount ?? 0
  assertInteger(fee, '手續費')
  if (fee < 0) throw new SettlementError('手續費不可為負數')
  if (fee > 0 && input.feeAccountId == null) {
    throw new SettlementError('有手續費時必須指定手續費科目')
  }
  if (!input.allocations || input.allocations.length === 0) {
    throw new SettlementError('至少需要一筆沖銷分配')
  }

  const expectedType = input.type === 'receipt' ? 'AR' : 'AP'
  const byId = new Map(items.map((i) => [i.id, i]))

  let total = 0
  const allocLines: DraftLine[] = []

  for (const alloc of input.allocations) {
    const amount = assertInteger(alloc.amount, '分配金額')
    if (amount <= 0) throw new SettlementError(`分配金額必須大於 0 (open_item_id=${alloc.openItemId})`)

    const item = byId.get(alloc.openItemId)
    if (!item) throw new SettlementError(`找不到未沖項 (open_item_id=${alloc.openItemId})`)
    if (item.type !== expectedType) {
      throw new SettlementError(
        `未沖項類型 (${item.type}) 與沖銷類型 (${input.type}) 不符 (open_item_id=${alloc.openItemId})`,
      )
    }
    if (amount > item.remaining) {
      throw new SettlementError(
        `分配金額 ${amount} 超過未沖餘額 ${item.remaining} (open_item_id=${alloc.openItemId})`,
      )
    }

    total += amount

    if (input.type === 'payment') {
      allocLines.push({
        accountId: item.accountId,
        debit: amount,
        credit: 0,
        memo: item.description,
        openItemId: item.id,
      })
    } else {
      allocLines.push({
        accountId: item.accountId,
        debit: 0,
        credit: amount,
        memo: item.description,
        openItemId: item.id,
      })
    }
  }

  if (total <= 0) throw new SettlementError('沖銷總額必須大於 0')
  if (input.type === 'receipt' && fee > total) {
    throw new SettlementError(`收款手續費 ${fee} 不可超過收款總額 ${total}`)
  }

  const lines: DraftLine[] = [...allocLines]

  if (fee > 0) {
    // 手續費皆為借方（費用）
    lines.push({ accountId: input.feeAccountId!, debit: fee, credit: 0, memo: '銀行手續費' })
  }

  if (input.type === 'payment') {
    lines.push({ accountId: input.bankAccountId, debit: 0, credit: total + fee, memo: '銀行付款' })
  } else {
    lines.push({ accountId: input.bankAccountId, debit: total - fee, credit: 0, memo: '銀行收款' })
  }

  const entry = buildEntry({
    entryDate: input.settlementDate,
    summary: input.type === 'receipt' ? '收款沖銷' : '付款沖銷',
    source: 'settlement',
    batchNo: input.batchNo ?? null,
    lines,
  })

  return { entry, totalAmount: total, allocations: input.allocations }
}

// ── 認列（掛帳）建立未沖項對應傳票 ──────────────────────────────────────────────

export interface RecognitionInput {
  entryDate: string
  /** 認列金額（正整數元） */
  amount: number
  /** 收入/成本 對應科目 */
  pnlAccountId: number
  /** 應收(AR)或應付(AP)科目 */
  controlAccountId: number
  summary: string
  memo?: string
}

/**
 * 認列收入：借 應收 + 貸 收入。回傳傳票草稿（應收腳的 openItemId 待過帳後回填）。
 */
export function buildRevenueRecognition(input: RecognitionInput): DraftEntry {
  const amount = assertInteger(input.amount, '認列金額')
  if (amount <= 0) throw new SettlementError('認列金額必須大於 0')
  return buildEntry({
    entryDate: input.entryDate,
    summary: input.summary,
    source: 'manual',
    lines: [
      { accountId: input.controlAccountId, debit: amount, credit: 0, memo: input.memo },
      { accountId: input.pnlAccountId, debit: 0, credit: amount, memo: input.memo },
    ],
  })
}

/**
 * 認列成本：借 成本 + 貸 應付。回傳傳票草稿（應付腳的 openItemId 待過帳後回填）。
 */
export function buildCostRecognition(input: RecognitionInput): DraftEntry {
  const amount = assertInteger(input.amount, '認列金額')
  if (amount <= 0) throw new SettlementError('認列金額必須大於 0')
  return buildEntry({
    entryDate: input.entryDate,
    summary: input.summary,
    source: 'manual',
    lines: [
      { accountId: input.pnlAccountId, debit: amount, credit: 0, memo: input.memo },
      { accountId: input.controlAccountId, debit: 0, credit: amount, memo: input.memo },
    ],
  })
}

// 供報表/UI 使用：找出科目（小工具）
export function findAccount(accounts: Account[], code: string): Account | undefined {
  return accounts.find((a) => a.code === code)
}
