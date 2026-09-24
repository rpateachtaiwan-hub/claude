// =============================================================================
// 會計沖銷系統 — 領域型別 (camelCase；DB 為 snake_case，由 mapper 轉換)
// 金額一律為「整數元」(TWD 無小數)。型別上以 number 表示，並由 money.ts 驗證為整數。
// =============================================================================

export type AccountCategory = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
export type NormalBalance = 'debit' | 'credit'
export type EntrySource = 'manual' | 'settlement' | 'import'
export type OpenItemType = 'AR' | 'AP'
export type OpenItemStatus = 'open' | 'partial' | 'closed'
export type SettlementType = 'receipt' | 'payment'

export interface Account {
  id: number
  code: string
  name: string
  category: AccountCategory
  normalBalance: NormalBalance
  isOpenItem: boolean
  active: boolean
}

export interface OpenItem {
  id: number
  code: string
  type: OpenItemType
  accountId: number
  counterparty?: string | null
  description: string
  /** 原始掛帳金額（正整數元） */
  originalAmount: number
  originEntryId?: number | null
  /** ISO 日期字串 'YYYY-MM-DD' */
  originDate: string
  status: OpenItemStatus
}

/** 帶有目前未沖餘額的未沖項（remaining = originalAmount − Σ已分配） */
export interface OpenItemWithRemaining extends OpenItem {
  remaining: number
}

export interface AllocationInput {
  openItemId: number
  /** 本次分配到此未沖項的金額（正整數元，≤ remaining） */
  amount: number
}

export interface SettlementInput {
  settlementDate: string
  type: SettlementType
  bankAccountId: number
  feeAmount?: number
  feeAccountId?: number | null
  allocations: AllocationInput[]
  note?: string
  batchNo?: string
}

/** 一條待產生的分錄明細 */
export interface DraftLine {
  accountId: number
  debit: number
  credit: number
  memo?: string
  openItemId?: number | null
}

/** 一張待過帳的傳票 */
export interface DraftEntry {
  entryDate: string
  /** 'YYYY-MM'，由 entryDate 衍生 */
  period: string
  summary: string
  source: EntrySource
  batchNo?: string | null
  lines: DraftLine[]
}

/** 沖銷引擎輸出：一張傳票 + 總額 + 分配明細 */
export interface SettlementDraft {
  entry: DraftEntry
  totalAmount: number
  allocations: AllocationInput[]
}
