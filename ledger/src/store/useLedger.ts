// =============================================================================
// 輕記帳 — 前端狀態 (zustand)
// 示範模式：資料存 localStorage。設定 Supabase 後：讀寫雲端資料表。
// =============================================================================

import { create } from 'zustand'
import { supabase, hasSupabase } from '../lib/supabase'
import { DEFAULT_ACCOUNTS } from '../core/accounts'
import { buildEntry } from '../core/engine'
import { composeEntry, learn, suggest, SEED_RULES } from '../core/suggest'
import type { Account, JournalEntry, QuickInput, Rule, Suggestion } from '../core/types'

const LS_KEY = 'qing-ledger-v1'

interface PersistShape {
  accounts: Account[]
  rules: Rule[]
  entries: JournalEntry[]
}

interface LedgerState extends PersistShape {
  ready: boolean
  usingSupabase: boolean

  init: () => Promise<void>
  preview: (input: QuickInput) => Suggestion
  /** 記一筆：以最終選定的非現金腳科目過帳，並學習 */
  commit: (input: QuickInput, chosenAccountCode: string) => Promise<JournalEntry>
  deleteEntry: (id: string) => Promise<void>
  addAccount: (a: Account) => Promise<void>
  deleteRule: (id: string) => Promise<void>
}

function loadLocal(): PersistShape | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as PersistShape) : null
  } catch {
    return null
  }
}
function saveLocal(s: PersistShape) {
  localStorage.setItem(LS_KEY, JSON.stringify(s))
}

export const useLedger = create<LedgerState>()((set, get) => ({
  ready: false,
  usingSupabase: false,
  accounts: [],
  rules: [],
  entries: [],

  init: async () => {
    if (hasSupabase) {
      try {
        const [accRes, ruleRes, entRes] = await Promise.all([
          supabase.from('accounts').select('data').order('code'),
          supabase.from('rules').select('data'),
          supabase.from('entries').select('data').order('date'),
        ])
        if (!accRes.error && accRes.data) {
          const accounts = (accRes.data.length ? accRes.data.map((r) => r.data as Account) : DEFAULT_ACCOUNTS)
          const rules = (ruleRes.data?.length ? ruleRes.data.map((r) => r.data as Rule) : SEED_RULES)
          const entries = (entRes.data ?? []).map((r) => r.data as JournalEntry)
          set({ ready: true, usingSupabase: true, accounts, rules, entries })
          return
        }
      } catch {
        /* 落到示範模式 */
      }
    }
    const local = loadLocal()
    set({
      ready: true,
      usingSupabase: false,
      accounts: local?.accounts ?? DEFAULT_ACCOUNTS,
      rules: local?.rules ?? SEED_RULES,
      entries: local?.entries ?? [],
    })
  },

  preview: (input) => suggest(input, get().rules, get().accounts),

  commit: async (input, chosenAccountCode) => {
    const draft = composeEntry(input, chosenAccountCode)
    const entry = buildEntry(draft) // 驗證借貸平衡
    const rules = learn(input, chosenAccountCode, get().rules)
    const entries = [...get().entries, entry]
    set({ entries, rules })

    if (get().usingSupabase) {
      await supabase.from('entries').insert({ id: entry.id, date: entry.date, data: entry })
      const changed = rules.find((r) => r.accountCode === chosenAccountCode &&
        r.keyword === (input.counterparty?.trim() || input.description?.trim() || '').toLowerCase())
      if (changed) await supabase.from('rules').upsert({ id: changed.id, data: changed })
    } else {
      saveLocal({ accounts: get().accounts, rules, entries })
    }
    return entry
  },

  deleteEntry: async (id) => {
    const entries = get().entries.filter((e) => e.id !== id)
    set({ entries })
    if (get().usingSupabase) await supabase.from('entries').delete().eq('id', id)
    else saveLocal({ accounts: get().accounts, rules: get().rules, entries })
  },

  addAccount: async (a) => {
    const accounts = [...get().accounts.filter((x) => x.code !== a.code), a]
    set({ accounts })
    if (get().usingSupabase) await supabase.from('accounts').upsert({ code: a.code, data: a })
    else saveLocal({ accounts, rules: get().rules, entries: get().entries })
  },

  deleteRule: async (id) => {
    const rules = get().rules.filter((r) => r.id !== id)
    set({ rules })
    if (get().usingSupabase) await supabase.from('rules').delete().eq('id', id)
    else saveLocal({ accounts: get().accounts, rules, entries: get().entries })
  },
}))
