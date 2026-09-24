// =============================================================================
// 會計沖銷 — Supabase 服務層（過帳 / 讀取）
//
// 真正的「單一交易過帳」由 DB 函式 post_settlement 負責（見 0002 migration），
// 本層只負責 camelCase ↔ snake_case 轉換與 RPC 呼叫，與既有 lib/supabase.ts 風格一致。
// =============================================================================

import { supabase } from '../lib/supabase'
import type {
  Account,
  DraftLine,
  OpenItemType,
  OpenItemWithRemaining,
  SettlementInput,
} from './types'

// ── mappers ──────────────────────────────────────────────────────────────────
export function dbToAccount(row: Record<string, unknown>): Account {
  return {
    id: row.id as number,
    code: row.code as string,
    name: row.name as string,
    category: row.category as Account['category'],
    normalBalance: row.normal_balance as Account['normalBalance'],
    isOpenItem: (row.is_open_item as boolean) ?? false,
    active: (row.active as boolean) ?? true,
  }
}

export function dbToOpenItem(row: Record<string, unknown>): OpenItemWithRemaining {
  const original = Number(row.original_amount ?? 0)
  const settled = Number(row.settled ?? 0) // 由 view/查詢提供；否則 0
  return {
    id: row.id as number,
    code: row.code as string,
    type: row.type as OpenItemType,
    accountId: row.account_id as number,
    counterparty: (row.counterparty as string) ?? null,
    description: (row.description as string) ?? '',
    originalAmount: original,
    originEntryId: (row.origin_entry_id as number) ?? null,
    originDate: (row.origin_date as string) ?? '',
    status: row.status as OpenItemWithRemaining['status'],
    remaining: original - settled,
  }
}

// ── 讀取 ──────────────────────────────────────────────────────────────────────
export async function listAccounts(): Promise<Account[]> {
  const { data, error } = await supabase.from('accounts').select('*').order('code')
  if (error) throw error
  return (data ?? []).map(dbToAccount)
}

/**
 * 取得未沖清單（含 remaining）。需在 DB 端提供 settled 欄位，
 * 建議建立 view `open_items_with_remaining`（remaining = original_amount − Σallocations）。
 */
export async function listOpenItems(
  type?: OpenItemType,
  onlyOpen = false,
): Promise<OpenItemWithRemaining[]> {
  let q = supabase.from('open_items_with_remaining').select('*')
  if (type) q = q.eq('type', type)
  if (onlyOpen) q = q.neq('status', 'closed')
  const { data, error } = await q.order('origin_date')
  if (error) throw error
  return (data ?? []).map(dbToOpenItem)
}

/** 取得已過帳分錄明細（供損益/試算表/對帳）。 */
export async function listPostedLines(): Promise<
  Array<{ accountId: number; debit: number; credit: number; period: string }>
> {
  const { data, error } = await supabase
    .from('journal_lines')
    .select('account_id, debit, credit, journal_entries(period)')
  if (error) throw error
  return (data ?? []).map((row: Record<string, unknown>) => ({
    accountId: row.account_id as number,
    debit: Number(row.debit ?? 0),
    credit: Number(row.credit ?? 0),
    period: ((row.journal_entries as { period?: string } | null)?.period) ?? '',
  }))
}

// ── 過帳（呼叫 DB 交易函式）──────────────────────────────────────────────────
export async function postSettlement(input: SettlementInput, createdBy?: string): Promise<number> {
  const payload = {
    settlement_date: input.settlementDate,
    type: input.type,
    bank_account_id: input.bankAccountId,
    fee_amount: input.feeAmount ?? 0,
    fee_account_id: input.feeAccountId ?? null,
    batch_no: input.batchNo ?? defaultBatchNo(input),
    note: input.note ?? null,
    created_by: createdBy ?? null,
    allocations: input.allocations.map((a) => ({ open_item_id: a.openItemId, amount: a.amount })),
  }
  const { data, error } = await supabase.rpc('post_settlement', { payload })
  if (error) throw error
  return data as number
}

function defaultBatchNo(input: SettlementInput): string {
  const d = input.settlementDate.replace(/-/g, '')
  const prefix = input.type === 'receipt' ? 'R' : 'P'
  return `${prefix}-${d}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`
}

// ── 手動傳票過帳（DB 交易）──────────────────────────────────────────────────
export async function postJournalEntry(
  entry: { entryDate: string; summary: string; lines: DraftLine[] },
  createdBy?: string,
): Promise<number> {
  const payload = {
    entry_date: entry.entryDate,
    summary: entry.summary,
    source: 'manual',
    created_by: createdBy ?? null,
    lines: entry.lines.map((l) => ({
      account_id: l.accountId, debit: l.debit, credit: l.credit,
      memo: l.memo ?? null, open_item_id: l.openItemId ?? null,
    })),
  }
  const { data, error } = await supabase.rpc('post_journal_entry', { payload })
  if (error) throw error
  return data as number
}

// ── 認列掛帳（DB 交易：建 open_item + 傳票）─────────────────────────────────
export async function postRecognition(
  input: {
    kind: 'revenue' | 'cost'
    entryDate: string
    amount: number
    counterparty: string
    description: string
    controlAccountId: number
    pnlAccountId: number
  },
  createdBy?: string,
): Promise<number> {
  const payload = {
    kind: input.kind, entry_date: input.entryDate, amount: input.amount,
    counterparty: input.counterparty, description: input.description,
    control_account_id: input.controlAccountId, pnl_account_id: input.pnlAccountId,
    created_by: createdBy ?? null,
  }
  const { data, error } = await supabase.rpc('post_recognition', { payload })
  if (error) throw error
  return data as number
}

// ── 科目維護 ─────────────────────────────────────────────────────────────────
function accountToDb(a: Omit<Account, 'id'> & { id?: number }) {
  return {
    ...(a.id ? { id: a.id } : {}),
    code: a.code, name: a.name, category: a.category,
    normal_balance: a.normalBalance, is_open_item: a.isOpenItem, active: a.active,
  }
}

export async function upsertAccount(a: Omit<Account, 'id'> & { id?: number }): Promise<Account> {
  const { data, error } = await supabase.from('accounts').upsert(accountToDb(a), { onConflict: 'code' }).select().single()
  if (error) throw error
  return dbToAccount(data as Record<string, unknown>)
}
