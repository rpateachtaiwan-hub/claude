// =============================================================================
// 以 Google Gemini 判斷分類科目。
// 正式版：透過 Netlify serverless 代理 /.netlify/functions/gemini（金鑰存伺服器，不外洩）。
// 備援：若代理不可用且使用者在本機填了自己的金鑰，則直接呼叫 Google。
// =============================================================================

import type { Account, QuickInput } from './types'

export interface AiConfig {
  enabled: boolean
  model: string // 例：gemini-2.0-flash
  apiKey: string // 選填，本機開發備援用；正式版可留空
}

export interface AiResult {
  accountCode: string
  reason: string
}

function buildPrompt(input: QuickInput, accounts: Account[]) {
  const wanted = input.direction === 'in'
    ? (['revenue', 'liability', 'equity'] as const)
    : (['expense', 'asset', 'liability'] as const)
  const candidates = accounts.filter(
    (a) => !a.isCash && !a.isOpenItem && a.code !== '4999' && a.code !== '6999' && (wanted as readonly string[]).includes(a.category),
  )
  const list = candidates.map((a) => `${a.code} ${a.name}（${a.category}）`).join('\n')
  const prompt = `你是台灣小型企業的記帳助理。根據交易資訊，從候選科目清單中挑出最適合的「會計科目編號」。
交易方向：${input.direction === 'in' ? '收入（收到錢）' : '支出（付出錢）'}
金額：${input.amount}
摘要：${input.description}
對象：${input.counterparty ?? '（無）'}

候選科目（只能從這裡選一個，回傳其編號）：
${list}

只回傳 JSON：{"accountCode":"<編號>","reason":"<簡短中文理由>"}`
  return { prompt, candidates }
}

async function callProxy(prompt: string, model: string): Promise<string | null> {
  try {
    const res = await fetch('/.netlify/functions/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data?.text as string) ?? null
  } catch {
    return null
  }
}

async function callDirect(prompt: string, cfg: AiConfig): Promise<string | null> {
  if (!cfg.apiKey) return null
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data?.candidates?.[0]?.content?.parts?.[0]?.text as string) ?? null
  } catch {
    return null
  }
}

export async function classifyWithGemini(input: QuickInput, accounts: Account[], cfg: AiConfig): Promise<AiResult | null> {
  if (!cfg.enabled) return null
  const { prompt, candidates } = buildPrompt(input, accounts)
  if (!candidates.length) return null

  let text = await callProxy(prompt, cfg.model)
  if (text == null) text = await callDirect(prompt, cfg)
  if (!text) return null

  try {
    const parsed = JSON.parse(text) as AiResult
    if (candidates.some((a) => a.code === parsed.accountCode)) {
      return { accountCode: parsed.accountCode, reason: parsed.reason || 'Gemini 建議' }
    }
  } catch {
    /* ignore */
  }
  return null
}
