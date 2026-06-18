// =============================================================================
// 會計沖銷 — 前端狀態 (zustand)
//
// 與既有 orderStore 相同策略：有 Supabase 時走 DB（RPC 過帳），否則 localStorage
// 示範模式（含種子科目與幾筆未沖項），讓沖銷工作台在未接 DB 時也能完整操作。
// 所有金額一律整數元，沖銷邏輯一律走 src/accounting/engine.ts 純引擎。
// =============================================================================

import { create } from 'zustand'
import { supabase, hasSupabase } from '../lib/supabase'
import {
  buildSettlementDraft,
  buildCostRecognition,
  buildRevenueRecognition,
  deriveStatus,
  buildEntry,
} from '../accounting/engine'
import {
  listAccounts,
  listOpenItems,
  listPostedLines,
  postSettlement as rpcPostSettlement,
  postJournalEntry as rpcPostJournalEntry,
  postRecognition as rpcPostRecognition,
  upsertAccount as rpcUpsertAccount,
} from '../accounting/service'
import type { PostedLine } from '../accounting/reports'
import type {
  Account,
  AllocationInput,
  DraftEntry,
  DraftLine,
  OpenItem,
  OpenItemType,
  OpenItemWithRemaining,
  SettlementInput,
} from '../accounting/types'

// ── 種子科目（與 supabase/seed/accounts_seed.sql 一致）────────────────────────
const SEED_ACCOUNTS: Account[] = [
  { id: 1, code: '1112', name: '銀行存款', category: 'asset', normalBalance: 'debit', isOpenItem: false, active: true },
  { id: 2, code: '1111', name: '現金', category: 'asset', normalBalance: 'debit', isOpenItem: false, active: true },
  { id: 3, code: '1123', name: '應收帳款', category: 'asset', normalBalance: 'debit', isOpenItem: true, active: true },
  { id: 4, code: '1224', name: '應收帳款-關係企業', category: 'asset', normalBalance: 'debit', isOpenItem: true, active: true },
  { id: 5, code: '2121', name: '應付帳款', category: 'liability', normalBalance: 'credit', isOpenItem: true, active: true },
  { id: 6, code: '2171', name: '應付費用', category: 'liability', normalBalance: 'credit', isOpenItem: false, active: true },
  { id: 7, code: '2014', name: '銷項稅額', category: 'liability', normalBalance: 'credit', isOpenItem: false, active: true },
  { id: 8, code: '3100', name: '資本', category: 'equity', normalBalance: 'credit', isOpenItem: false, active: true },
  { id: 9, code: '3200', name: '保留盈餘', category: 'equity', normalBalance: 'credit', isOpenItem: false, active: true },
  { id: 10, code: '4111', name: '旅遊收入', category: 'revenue', normalBalance: 'credit', isOpenItem: false, active: true },
  { id: 11, code: '4112', name: '佣金收入', category: 'revenue', normalBalance: 'credit', isOpenItem: false, active: true },
  { id: 12, code: '5111', name: '旅遊成本', category: 'expense', normalBalance: 'debit', isOpenItem: false, active: true },
  { id: 13, code: '5112', name: '導遊司機費', category: 'expense', normalBalance: 'debit', isOpenItem: false, active: true },
  { id: 14, code: '5113', name: '車輛/保險成本', category: 'expense', normalBalance: 'debit', isOpenItem: false, active: true },
  { id: 15, code: '6100', name: '薪資費用', category: 'expense', normalBalance: 'debit', isOpenItem: false, active: true },
  { id: 16, code: '614', name: '銀行手續費', category: 'expense', normalBalance: 'debit', isOpenItem: false, active: true },
  { id: 17, code: '6200', name: '雜費', category: 'expense', normalBalance: 'debit', isOpenItem: false, active: true },
]

const AP_ACC = 5, AR_ACC = 3, COST_ACC = 12, REV_ACC = 10

function seedOpenItems(): OpenItem[] {
  return [
    { id: 1, code: 'AP-202001-001', type: 'AP', accountId: AP_ACC, counterparty: '阿明遊覽車', description: '1月包車費', originalAmount: 200_000, originDate: '2020-01-05', status: 'open' },
    { id: 2, code: 'AP-202001-002', type: 'AP', accountId: AP_ACC, counterparty: '小陳司機', description: '1月司機費', originalAmount: 100_000, originDate: '2020-01-08', status: 'open' },
    { id: 3, code: 'AP-202002-003', type: 'AP', accountId: AP_ACC, counterparty: '保險公司', description: '2月旅平險', originalAmount: 45_000, originDate: '2020-02-10', status: 'open' },
    { id: 4, code: 'AR-202001-001', type: 'AR', accountId: AR_ACC, counterparty: 'KLOOK', description: '1月平台撥款', originalAmount: 500_000, originDate: '2020-01-10', status: 'open' },
    { id: 5, code: 'AR-202002-002', type: 'AR', accountId: AR_ACC, counterparty: 'KKday', description: '2月平台撥款', originalAmount: 320_000, originDate: '2020-02-12', status: 'open' },
  ]
}

// ── 內部已過帳傳票（含 id）────────────────────────────────────────────────────
export interface PostedEntry extends DraftEntry {
  id: string
}

interface AccountingState {
  loaded: boolean
  usingSupabase: boolean
  accounts: Account[]
  openItems: OpenItem[]
  allocations: Array<AllocationInput & { settlementId: string }>
  entries: PostedEntry[]
  error: string | null

  init: () => Promise<void>
  // 衍生
  openItemsWithRemaining: () => OpenItemWithRemaining[]
  settledOf: (openItemId: number) => number
  postedLines: () => PostedLine[]
  // 動作
  postSettlement: (input: SettlementInput) => Promise<void>
  postManualEntry: (e: { entryDate: string; summary: string; lines: DraftLine[] }) => Promise<void>
  postRecognition: (input: {
    kind: 'revenue' | 'cost'
    entryDate: string
    amount: number
    counterparty: string
    description: string
    controlAccountId: number
    pnlAccountId: number
  }) => Promise<void>
  saveAccount: (a: Omit<Account, 'id'> & { id?: number }) => Promise<void>
}

const LS_KEY = 'lute-accounting-v1'

function loadLocal(): { openItems: OpenItem[]; allocations: AccountingState['allocations']; entries: PostedEntry[] } | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}
function saveLocal(s: Pick<AccountingState, 'openItems' | 'allocations' | 'entries'>) {
  localStorage.setItem(LS_KEY, JSON.stringify({ openItems: s.openItems, allocations: s.allocations, entries: s.entries }))
}

export const useAccountingStore = create<AccountingState>()((set, get) => ({
  loaded: false,
  usingSupabase: false,
  accounts: [],
  openItems: [],
  allocations: [],
  entries: [],
  error: null,

  init: async () => {
    if (hasSupabase) {
      try {
        const [accounts, openItems, lines] = await Promise.all([
          listAccounts(),
          listOpenItems(),
          listPostedLines(),
        ])
        if (accounts.length) {
          set({
            loaded: true, usingSupabase: true, accounts,
            openItems: openItems as OpenItem[],
            // remaining 由 view 提供，settled 由差額回推
            allocations: openItems
              .filter((o) => o.originalAmount - o.remaining > 0)
              .map((o) => ({ openItemId: o.id, amount: o.originalAmount - o.remaining, settlementId: 'db' })),
            entries: lines.map((l, i) => ({
              id: `db-${i}`, entryDate: '', period: l.period, summary: '', source: 'import',
              lines: [{ accountId: l.accountId, debit: l.debit, credit: l.credit }],
            })),
          })
          return
        }
      } catch (e) {
        // 落到示範模式
        set({ error: e instanceof Error ? e.message : String(e) })
      }
    }
    // 示範模式
    const local = loadLocal()
    set({
      loaded: true, usingSupabase: false, accounts: SEED_ACCOUNTS,
      openItems: local?.openItems ?? seedOpenItems(),
      allocations: local?.allocations ?? [],
      entries: local?.entries ?? [],
    })
  },

  settledOf: (openItemId) =>
    get().allocations.filter((a) => a.openItemId === openItemId).reduce((s, a) => s + a.amount, 0),

  openItemsWithRemaining: () => {
    const { openItems, allocations } = get()
    const settled = new Map<number, number>()
    for (const a of allocations) settled.set(a.openItemId, (settled.get(a.openItemId) ?? 0) + a.amount)
    return openItems.map((o) => {
      const s = settled.get(o.id) ?? 0
      return { ...o, remaining: o.originalAmount - s, status: deriveStatus(o.originalAmount, s) }
    })
  },

  postedLines: () => {
    const out: PostedLine[] = []
    for (const e of get().entries) {
      for (const l of e.lines) out.push({ accountId: l.accountId, debit: l.debit, credit: l.credit, period: e.period })
    }
    return out
  },

  postSettlement: async (input) => {
    // 一律先用純引擎驗證並產生草稿（不平衡/超沖會在此拋錯）
    const items = get().openItemsWithRemaining()
    const draft = buildSettlementDraft(input, items)

    if (get().usingSupabase) {
      await rpcPostSettlement(input)
      await get().init()
      return
    }

    // 示範模式：寫入記憶體 + localStorage
    const settlementId = `S-${Date.now()}`
    set((st) => {
      const entries = [...st.entries, { ...draft.entry, id: settlementId }]
      const allocations = [
        ...st.allocations,
        ...input.allocations.map((a) => ({ openItemId: a.openItemId, amount: a.amount, settlementId })),
      ]
      saveLocal({ openItems: st.openItems, allocations, entries })
      return { entries, allocations }
    })
  },

  postManualEntry: async (e) => {
    const entry = buildEntry({ entryDate: e.entryDate, summary: e.summary, source: 'manual', lines: e.lines })
    if (get().usingSupabase) {
      await rpcPostJournalEntry(entry)
      await get().init()
      return
    }
    set((st) => {
      const entries = [...st.entries, { ...entry, id: `J-${Date.now()}` }]
      saveLocal({ openItems: st.openItems, allocations: st.allocations, entries })
      return { entries }
    })
  },

  postRecognition: async (input) => {
    const draft =
      input.kind === 'revenue'
        ? buildRevenueRecognition({ entryDate: input.entryDate, amount: input.amount, controlAccountId: input.controlAccountId, pnlAccountId: input.pnlAccountId, summary: input.description })
        : buildCostRecognition({ entryDate: input.entryDate, amount: input.amount, controlAccountId: input.controlAccountId, pnlAccountId: input.pnlAccountId, summary: input.description })

    if (get().usingSupabase) {
      await rpcPostRecognition(input)
      await get().init()
      return
    }

    set((st) => {
      const newId = (st.openItems.reduce((m, o) => Math.max(m, o.id), 0) || 0) + 1
      const type: OpenItemType = input.kind === 'revenue' ? 'AR' : 'AP'
      const ym = input.entryDate.slice(0, 7).replace('-', '')
      const seq = String(st.openItems.filter((o) => o.type === type).length + 1).padStart(3, '0')
      const openItem: OpenItem = {
        id: newId, code: `${type}-${ym}-${seq}`, type, accountId: input.controlAccountId,
        counterparty: input.counterparty, description: input.description,
        originalAmount: input.amount, originDate: input.entryDate, status: 'open',
      }
      const entryId = `R-${Date.now()}`
      // 把控制科目那行連回 open_item
      const lines = draft.lines.map((l) =>
        l.accountId === input.controlAccountId ? { ...l, openItemId: newId } : l,
      )
      const entries = [...st.entries, { ...draft, id: entryId, lines }]
      const openItems = [...st.openItems, openItem]
      saveLocal({ openItems, allocations: st.allocations, entries })
      return { openItems, entries }
    })
  },

  saveAccount: async (a) => {
    if (get().usingSupabase) {
      await rpcUpsertAccount(a)
      const accounts = await listAccounts()
      set({ accounts })
      return
    }
    set((st) => {
      const exists = a.id != null && st.accounts.some((x) => x.id === a.id)
      const accounts = exists
        ? st.accounts.map((x) => (x.id === a.id ? { ...x, ...a, id: x.id } : x))
        : [...st.accounts, { ...a, id: (st.accounts.reduce((m, x) => Math.max(m, x.id), 0) || 0) + 1 }]
      return { accounts }
    })
  },
}))
