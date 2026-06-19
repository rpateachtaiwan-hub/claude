// =============================================================================
// 以 Google Gemini 判斷分類科目（取代規則式學習）。
// 金鑰存於使用者本機，直接由瀏覽器呼叫 Gemini REST API。
// 失敗或未設定時回傳 null，由呼叫端改用預設建議。
// =============================================================================

import type { Account, QuickInput } from './types'

export interface AiConfig {
  apiKey: string
  model: string // 例：gemini-2.0-flash
}

export interface AiResult {
  accountCode: string
  reason: string
}

export async function classifyWithGemini(
  input: QuickInput,
  accounts: Account[],
  cfg: AiConfig,
): Promise<AiResult | null> {
  if (!cfg.apiKey) return null

  // 候選科目：依方向限定（收入→收入類；支出→費用/資產/負債），排除現金與應收應付
  const wanted = input.direction === 'in'
    ? (['revenue', 'liability', 'equity'] as const)
    : (['expense', 'asset', 'liability'] as const)
  const candidates = accounts.filter(
    (a) => !a.isCash && !a.isOpenItem && (wanted as readonly string[]).includes(a.category),
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return null
    const parsed = JSON.parse(text) as AiResult
    // 驗證 accountCode 在候選內
    if (!candidates.some((a) => a.code === parsed.accountCode)) return null
    return { accountCode: parsed.accountCode, reason: parsed.reason || 'Gemini 建議' }
  } catch {
    return null
  }
}
