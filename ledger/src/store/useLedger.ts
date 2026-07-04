// =============================================================================
// 輕記帳 — 前端狀態 (zustand)
// 示範模式：資料存 localStorage。設定 Supabase 後：讀寫雲端資料表。
// =============================================================================

import { create } from 'zustand'
import { supabase, hasSupabase } from '../lib/supabase'
import { DEFAULT_ACCOUNTS, PLACEHOLDER_ACCOUNTS } from '../core/accounts'
import { buildEntry } from '../core/engine'
import { composeEntry, sourceFromLegs, suggest } from '../core/suggest'
import { buildSettlement, openItems as computeOpenItems, type OpenItem } from '../core/settle'
import type { AiConfig } from '../core/ai'
import type { Account, JournalEntry, QuickInput, Rule, Suggestion } from '../core/types'

const LS_KEY = 'qing-ledger-v1'
const LS_AI = 'qing-ledger-ai'
const DEFAULT_AI: AiConfig = { enabled: true, model: 'gemini-2.0-flash', apiKey: '' }

interface PersistShape {
  accounts: Account[]
  rules: Rule[]
  entries: JournalEntry[]
  companies: string[]
}

/** 日記帳輸入：直接指定借/貸科目與金額 */
export interface JournalInput {
  date: string
  company?: string
  description: string
  debitCode: string
  creditCode: string
  amount: number
  voucherNo?: string
  note?: string
}

interface LedgerState extends PersistShape {
  ready: boolean
  usingSupabase: boolean
  aiConfig: AiConfig

  init: () => Promise<void>
  /** 離線/無金鑰時的預設建議（不含學習規則） */
  preview: (input: QuickInput) => Suggestion
  /** 記一筆：以最終選定的非現金腳科目過帳 */
  commit: (input: QuickInput, chosenAccountCode: string) => Promise<JournalEntry>
  /** 日記帳：直接指定借/貸科目與金額過帳 */
  postJournal: (j: JournalInput) => Promise<JournalEntry>
  updateEntry: (entry: JournalEntry) => Promise<void>
  updateEntriesBulk: (entries: JournalEntry[]) => Promise<void>
  deleteEntry: (id: string) => Promise<void>
  deleteEntriesBulk: (ids: string[]) => Promise<void>
  addAccount: (a: Account) => Promise<void>
  deleteAccount: (code: string) => Promise<void>
  addCompany: (name: string) => Promise<void>
  deleteCompany: (name: string) => Promise<void>
  setAiConfig: (cfg: AiConfig) => void
  // 沖銷
  openItems: () => OpenItem[]
  settle: (itemId: string, amount: number, cashAccountCode: string, date: string) => Promise<void>
  // 批次匯入
  addEntriesBulk: (entries: JournalEntry[]) => Promise<void>
  addAccountsBulk: (accounts: Account[]) => Promise<void>
  /** 為尚無流水號的舊資料補編號（依日期、建立時間排序） */
  backfillSeq: () => Promise<number>
}

/** 取得目前最大流水號（無資料則 0） */
function maxSeq(entries: JournalEntry[]): number {
  let m = 0
  for (const e of entries) if (typeof e.seq === 'number' && e.seq > m) m = e.seq
  return m
}

function loadAi(): AiConfig {
  try {
    const raw = localStorage.getItem(LS_AI)
    return raw ? { ...DEFAULT_AI, ...JSON.parse(raw) } : DEFAULT_AI
  } catch {
    return DEFAULT_AI
  }
}

/** 確保「待確認」等預設科目一定在清單中（避免顯示成代號） */
function withPlaceholders(accs: Account[]): Account[] {
  const codes = new Set(accs.map((a) => a.code))
  return [...accs, ...PLACEHOLDER_ACCOUNTS.filter((p) => !codes.has(p.code))]
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
  aiConfig: DEFAULT_AI,
  accounts: [],
  rules: [],
  entries: [],
  companies: [],

  init: async () => {
    if (hasSupabase) {
      try {
        const [accRes, ruleRes, entRes, coRes] = await Promise.all([
          supabase.from('accounts').select('data').order('code'),
          supabase.from('rules').select('data'),
          supabase.from('entries').select('data').order('date'),
          supabase.from('companies').select('name').order('name'),
        ])
        if (!accRes.error && accRes.data) {
          const accounts = withPlaceholders(accRes.data.length ? accRes.data.map((r) => r.data as Account) : DEFAULT_ACCOUNTS)
          const rules = (ruleRes.data?.length ? ruleRes.data.map((r) => r.data as Rule) : [])
          const entries = (entRes.data ?? []).map((r) => r.data as JournalEntry)
          const companies = (!coRes.error && coRes.data) ? coRes.data.map((r) => r.name as string) : []
          set({ ready: true, usingSupabase: true, aiConfig: loadAi(), accounts, rules, entries, companies })
          // 舊資料若無流水號，自動補編（一次性）
          if (entries.some((e) => typeof e.seq !== 'number')) await get().backfillSeq()
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
      aiConfig: loadAi(),
      accounts: withPlaceholders(local?.accounts ?? DEFAULT_ACCOUNTS),
      rules: local?.rules ?? [],
      entries: local?.entries ?? [],
      companies: local?.companies ?? [],
    })
    // 舊資料若無流水號，自動補編（一次性）
    if ((local?.entries ?? []).some((e) => typeof e.seq !== 'number')) await get().backfillSeq()
  },

  preview: (input) => suggest(input, [], get().accounts),

  setAiConfig: (cfg) => {
    localStorage.setItem(LS_AI, JSON.stringify(cfg))
    set({ aiConfig: cfg })
  },

  commit: async (input, chosenAccountCode) => {
    const draft = composeEntry(input, chosenAccountCode, get().accounts)
    const entry = buildEntry({ ...draft, seq: maxSeq(get().entries) + 1 }) // 驗證借貸平衡 + 流水號
    const entries = [...get().entries, entry]
    set({ entries })
    if (get().usingSupabase) await supabase.from('entries').insert({ id: entry.id, date: entry.date, data: entry })
    else saveLocal({ accounts: get().accounts, rules: get().rules, entries, companies: get().companies })
    return entry
  },

  postJournal: async (j) => {
    const accounts = get().accounts
    const { source, settled } = sourceFromLegs(j.debitCode, j.creditCode, accounts)
    const entry = buildEntry({
      date: j.date,
      description: j.description,
      company: j.company,
      voucherNo: j.voucherNo,
      note: j.note,
      source,
      settled,
      seq: maxSeq(get().entries) + 1,
      lines: [
        { accountCode: j.debitCode, debit: j.amount, credit: 0 },
        { accountCode: j.creditCode, debit: 0, credit: j.amount },
      ],
    })
    const entries = [...get().entries, entry]
    set({ entries })
    if (get().usingSupabase) await supabase.from('entries').insert({ id: entry.id, date: entry.date, data: entry })
    else saveLocal({ accounts: get().accounts, rules: get().rules, entries, companies: get().companies })
    return entry
  },

  updateEntry: async (entry) => {
    const entries = get().entries.map((e) => (e.id === entry.id ? entry : e))
    set({ entries })
    if (get().usingSupabase) await supabase.from('entries').upsert({ id: entry.id, date: entry.date, data: entry })
    else saveLocal({ accounts: get().accounts, rules: get().rules, entries, companies: get().companies })
  },

  updateEntriesBulk: async (updated) => {
    const byId = new Map(updated.map((e) => [e.id, e]))
    const entries = get().entries.map((e) => byId.get(e.id) ?? e)
    set({ entries })
    if (get().usingSupabase) await supabase.from('entries').upsert(updated.map((e) => ({ id: e.id, date: e.date, data: e })))
    else saveLocal({ accounts: get().accounts, rules: get().rules, entries, companies: get().companies })
  },

  deleteEntry: async (id) => {
    const entries = get().entries.filter((e) => e.id !== id)
    set({ entries })
    if (get().usingSupabase) await supabase.from('entries').delete().eq('id', id)
    else saveLocal({ accounts: get().accounts, rules: get().rules, entries, companies: get().companies })
  },

  deleteEntriesBulk: async (ids) => {
    const idset = new Set(ids)
    const entries = get().entries.filter((e) => !idset.has(e.id))
    set({ entries })
    if (get().usingSupabase) await supabase.from('entries').delete().in('id', ids)
    else saveLocal({ accounts: get().accounts, rules: get().rules, entries, companies: get().companies })
  },

  addAccount: async (a) => {
    const accounts = [...get().accounts.filter((x) => x.code !== a.code), a]
    set({ accounts })
    if (get().usingSupabase) await supabase.from('accounts').upsert({ code: a.code, data: a })
    else saveLocal({ accounts, rules: get().rules, entries: get().entries, companies: get().companies })
  },

  deleteAccount: async (code) => {
    const accounts = get().accounts.filter((a) => a.code !== code)
    set({ accounts })
    if (get().usingSupabase) await supabase.from('accounts').delete().eq('code', code)
    else saveLocal({ accounts, rules: get().rules, entries: get().entries, companies: get().companies })
  },

  addCompany: async (name) => {
    const n = name.trim()
    if (!n || get().companies.includes(n)) return
    const companies = [...get().companies, n].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    set({ companies })
    if (get().usingSupabase) await supabase.from('companies').upsert({ name: n })
    else saveLocal({ accounts: get().accounts, rules: get().rules, entries: get().entries, companies })
  },

  deleteCompany: async (name) => {
    const companies = get().companies.filter((c) => c !== name)
    set({ companies })
    if (get().usingSupabase) await supabase.from('companies').delete().eq('name', name)
    else saveLocal({ accounts: get().accounts, rules: get().rules, entries: get().entries, companies })
  },

  openItems: () => computeOpenItems(get().entries, get().accounts),

  settle: async (itemId, amount, cashAccountCode, date) => {
    const item = computeOpenItems(get().entries, get().accounts).find((i) => i.id === itemId)
    if (!item) throw new Error('找不到未沖項目')
    const base = buildSettlement(item, { date, amount, cashAccountCode })
    const entry: JournalEntry = { ...base, seq: maxSeq(get().entries) + 1 }
    const entries = [...get().entries, entry]
    set({ entries })
    if (get().usingSupabase) await supabase.from('entries').insert({ id: entry.id, date: entry.date, data: entry })
    else saveLocal({ accounts: get().accounts, rules: get().rules, entries, companies: get().companies })
  },

  addEntriesBulk: async (newEntries) => {
    // 依序補上流水號（接續目前最大值）
    let n = maxSeq(get().entries)
    const stamped = newEntries.map((e) => ({ ...e, seq: e.seq ?? ++n }))
    const entries = [...get().entries, ...stamped]
    set({ entries })
    if (get().usingSupabase) {
      await supabase.from('entries').insert(stamped.map((e) => ({ id: e.id, date: e.date, data: e })))
    } else {
      saveLocal({ accounts: get().accounts, rules: get().rules, entries, companies: get().companies })
    }
  },

  addAccountsBulk: async (incoming) => {
    const byCode = new Map(get().accounts.map((a) => [a.code, a]))
    for (const a of incoming) byCode.set(a.code, a)
    const accounts = [...byCode.values()]
    set({ accounts })
    if (get().usingSupabase) {
      await supabase.from('accounts').upsert(incoming.map((a) => ({ code: a.code, data: a })))
    } else {
      saveLocal({ accounts, rules: get().rules, entries: get().entries, companies: get().companies })
    }
  },

  backfillSeq: async () => {
    const cur = get().entries
    // 已有流水號者保留；未編號者依日期、建立時間排序後接續最大值補編
    const need = cur.filter((e) => typeof e.seq !== 'number')
    if (!need.length) return 0
    need.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt ?? '') < (b.createdAt ?? '') ? -1 : 1))
    let n = maxSeq(cur)
    const seqById = new Map<string, number>()
    for (const e of need) seqById.set(e.id, ++n)
    const entries = cur.map((e) => (seqById.has(e.id) ? { ...e, seq: seqById.get(e.id)! } : e))
    set({ entries })
    if (get().usingSupabase) {
      const updated = entries.filter((e) => seqById.has(e.id))
      // 分批 upsert，避免單次過大
      for (let i = 0; i < updated.length; i += 500) {
        const chunk = updated.slice(i, i + 500)
        await supabase.from('entries').upsert(chunk.map((e) => ({ id: e.id, date: e.date, data: e })))
      }
    } else {
      saveLocal({ accounts: get().accounts, rules: get().rules, entries, companies: get().companies })
    }
    return need.length
  },
}))
