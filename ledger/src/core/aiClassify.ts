// =============================================================================
// Claude 智慧分類＋信心打分。
// 流程：整理待分類列 → 撈相似歷史分類作為範例 → 批次送 Claude →
// 解析 JSON 結果（科目編號＋信心 0–100＋理由）→ 信心 < 門檻者標人工檢查。
// 純函式為主（prompt 組裝／歷史檢索／解析可測試）；呼叫走 Netlify 代理。
// =============================================================================

import type { Account, JournalEntry } from './types'
import type { AiConfig } from './ai'

/** 信心低於此分數 → 標記待人工檢查 */
export const AI_CONFIDENCE_THRESHOLD = 80
/** 每批送給模型的列數 */
export const AI_BATCH_SIZE = 40

export interface AiRowInput {
  description: string
  direction: 'in' | 'out'
  amount: number
  date: string
  company?: string
  /** 既有關鍵字規則的建議（供模型參考，可推翻） */
  ruleSuggestion?: string
  /** 現行科目（明細評測時提供，讓模型知道現況） */
  currentAccount?: string
}

export interface AiVerdict {
  account: string
  /** 0–100 整數 */
  confidence: number
  reason?: string
}

/** 寫進分錄的 AI 中繼資料 */
export interface AiMeta extends AiVerdict {
  model: string
  at: string
}

// ── 歷史範例檢索 ─────────────────────────────────────────────────────────────

function bigrams(s: string): Set<string> {
  const t = s.replace(/[\s\d/\-_#().,]/g, '')
  const out = new Set<string>()
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2))
  return out
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let hit = 0
  for (const g of a) if (b.has(g)) hit++
  return hit / Math.min(a.size, b.size)
}

export interface HistoryExample {
  description: string
  account: string // code
  company?: string
}

/**
 * 從既有「已分類」分錄（非待確認）建立範例：
 * 每個目標列取最相似的前 3 筆＋全域高頻樣本補滿，去重、上限 cap。
 */
export function buildHistoryExamples(
  targets: AiRowInput[],
  entries: JournalEntry[],
  accounts: Account[],
  cap = 120,
): HistoryExample[] {
  const cash = new Set(accounts.filter((a) => a.isCash).map((a) => a.code))
  const open = new Set(accounts.filter((a) => a.isOpenItem).map((a) => a.code))
  const pool: { desc: string; grams: Set<string>; account: string; company?: string }[] = []
  const seenDesc = new Set<string>()
  for (const e of entries) {
    if (e.needsReview || e.source === 'settlement') continue
    const catLeg = e.lines.find((l) => !cash.has(l.accountCode) && !open.has(l.accountCode))
    if (!catLeg) continue
    const key = e.description.replace(/\s+/g, '')
    if (seenDesc.has(key)) continue // 同摘要只留一筆，避免月結薪資之類灌爆
    seenDesc.add(key)
    pool.push({ desc: e.description, grams: bigrams(e.description), account: catLeg.accountCode, company: e.company })
  }
  if (!pool.length) return []

  const picked = new Map<string, HistoryExample>()
  const add = (p: (typeof pool)[number]) => {
    if (picked.size >= cap) return
    const k = `${p.desc}|${p.account}`
    if (!picked.has(k)) picked.set(k, { description: p.desc, account: p.account, company: p.company })
  }
  // 每個目標列取最相似前 3
  for (const t of targets) {
    const g = bigrams(t.description)
    const ranked = pool
      .map((p) => ({ p, s: similarity(g, p.grams) }))
      .filter((x) => x.s > 0.3)
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
    for (const { p } of ranked) add(p)
    if (picked.size >= cap) break
  }
  // 補滿：直接取 pool 前段（近似高頻樣本）
  for (const p of pool) {
    if (picked.size >= cap) break
    add(p)
  }
  return [...picked.values()]
}

// ── Prompt 組裝 ──────────────────────────────────────────────────────────────

export function buildClassifySystem(accounts: Account[]): string {
  const catZh: Record<string, string> = { asset: '資產', liability: '負債', equity: '權益', revenue: '收入', expense: '費用/成本' }
  const list = accounts
    .filter((a) => a.code !== '4999' && a.code !== '6999')
    .map((a) => `${a.code}｜${a.name}｜${catZh[a.category] ?? a.category}${a.isCash ? '｜現金/銀行' : ''}${a.isOpenItem ? '｜應收應付控制' : ''}`)
    .join('\n')
  return `你是台灣中小企業集團（旅行社、租車、菸酒零售、國際貿易電商、娛樂門市）的資深記帳士。
任務：為銀行交易明細指定會計科目，並誠實評估信心。

科目表（編號｜名稱｜類別）：
${list}

判斷規則：
1. 收到錢（in）通常配收入/負債類；付出錢（out）通常配費用成本/資產/負債類。現金或銀行科目與應收應付控制科目不可作為分類結果。
2. 「歷史分類範例」是人工確認過的正確答案，摘要相似時比照辦理，權重最高。
3. 「規則建議」是關鍵字系統的初判，通常可靠，但你可依內容推翻。
4. 信心分數要誠實：摘要含糊（如「網銀轉帳」「待確認來源」）、金額異常、或範例互相矛盾時給低分。80 分以上代表你認為不需人工複核。
5. 股東往來/借款/週轉金屬公司間資金調度，不是收入費用。

輸出：只回傳 JSON 陣列，不要其他文字，格式：
[{"i":<列編號>,"account":"<科目編號>","confidence":<0-100整數>,"reason":"<15字內中文理由>"}]
每一列都要有結果，account 必須是科目表中的編號。`
}

export function buildClassifyUser(rows: AiRowInput[], examples: HistoryExample[]): string {
  const ex = examples.length
    ? `歷史分類範例（人工確認過）：\n${examples.map((e) => `・「${e.description}」${e.company ? `[${e.company}]` : ''} → ${e.account}`).join('\n')}\n\n`
    : ''
  const lines = rows.map((r, i) =>
    `${i}｜${r.date}｜${r.direction === 'in' ? '收' : '付'}｜${r.amount}｜${r.company ?? ''}｜「${r.description}」` +
    `${r.ruleSuggestion ? `｜規則建議:${r.ruleSuggestion}` : ''}${r.currentAccount ? `｜現行科目:${r.currentAccount}` : ''}`)
    .join('\n')
  return `${ex}待分類交易（列編號｜日期｜收付｜金額｜公司｜摘要）：\n${lines}\n\n回傳 JSON 陣列。`
}

// ── 回應解析 ─────────────────────────────────────────────────────────────────

/** 解析模型回覆；對齊列編號，科目不在表中或格式錯誤者為 null（呼叫端視為需人工）。 */
export function parseClassifyResponse(text: string, rowCount: number, accounts: Account[]): (AiVerdict | null)[] {
  const out: (AiVerdict | null)[] = Array.from({ length: rowCount }, () => null)
  const codes = new Set(accounts.map((a) => a.code))
  const banned = new Set(accounts.filter((a) => a.isCash || a.isOpenItem).map((a) => a.code))
  const cleaned = text.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start < 0 || end <= start) return out
  let arr: unknown
  try { arr = JSON.parse(cleaned.slice(start, end + 1)) } catch { return out }
  if (!Array.isArray(arr)) return out
  for (const item of arr) {
    if (typeof item !== 'object' || item === null) continue
    const o = item as Record<string, unknown>
    const i = Number(o.i)
    const account = String(o.account ?? '')
    if (!Number.isInteger(i) || i < 0 || i >= rowCount) continue
    if (!codes.has(account) || banned.has(account)) continue
    const confidence = Math.max(0, Math.min(100, Math.round(Number(o.confidence) || 0)))
    const reason = typeof o.reason === 'string' ? o.reason.slice(0, 60) : undefined
    out[i] = { account, confidence, reason }
  }
  return out
}

// ── 呼叫（走 Netlify 代理；本機備援直呼 Anthropic）─────────────────────────

async function callClaude(system: string, user: string, cfg: AiConfig): Promise<string> {
  try {
    const res = await fetch('/.netlify/functions/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system, user, model: cfg.model, maxTokens: 8000 }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && typeof (data as { text?: string }).text === 'string') return (data as { text: string }).text
    if (res.status === 501 || res.status === 404) {
      // 代理未設定 → 本機備援
      const direct = await callDirect(system, user, cfg)
      if (direct != null) return direct
      throw new Error('尚未設定：請在 Netlify 環境變數加入 ANTHROPIC_API_KEY（或於設定填入本機金鑰）')
    }
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  } catch (e) {
    if (e instanceof Error && !e.message.startsWith('HTTP') && !e.message.includes('fetch')) throw e
    const direct = await callDirect(system, user, cfg)
    if (direct != null) return direct
    throw e
  }
}

async function callDirect(system: string, user: string, cfg: AiConfig): Promise<string | null> {
  if (!cfg.apiKey) return null
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true', // 僅本機開發備援；正式版走伺服器代理
    },
    body: JSON.stringify({
      model: cfg.model || 'claude-opus-5',
      max_tokens: 8000,
      output_config: { effort: 'low' },
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => null) as { content?: { type: string; text: string }[] } | null
  return data?.content?.filter((b) => b.type === 'text').map((b) => b.text).join('') ?? null
}

export interface ClassifyProgress {
  done: number
  total: number
}

/**
 * 批次分類主流程：分批送出、逐批解析，回傳與 rows 對齊的結果陣列。
 * 任一批失敗即throw（已完成批次的結果隨錯誤丟棄，由呼叫端決定重試）。
 */
export async function classifyRows(
  rows: AiRowInput[],
  entries: JournalEntry[],
  accounts: Account[],
  cfg: AiConfig,
  onProgress?: (p: ClassifyProgress) => void,
): Promise<(AiVerdict | null)[]> {
  const system = buildClassifySystem(accounts)
  const results: (AiVerdict | null)[] = []
  for (let i = 0; i < rows.length; i += AI_BATCH_SIZE) {
    const batch = rows.slice(i, i + AI_BATCH_SIZE)
    const examples = buildHistoryExamples(batch, entries, accounts)
    const user = buildClassifyUser(batch, examples)
    const text = await callClaude(system, user, cfg)
    results.push(...parseClassifyResponse(text, batch.length, accounts))
    onProgress?.({ done: Math.min(i + AI_BATCH_SIZE, rows.length), total: rows.length })
  }
  return results
}

/** 由 verdict 建立分錄用中繼資料 */
export function toAiMeta(v: AiVerdict, model: string): AiMeta {
  return { ...v, model, at: new Date().toISOString() }
}
