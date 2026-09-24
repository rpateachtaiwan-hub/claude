// Netlify serverless：Claude（Anthropic API）代理。
// 金鑰只存在伺服器端環境變數 ANTHROPIC_API_KEY，不進瀏覽器。
// 前端 POST { system, user, model, maxTokens } → 回傳 { text, model, usage }。
// 與本專案其他函式一致採零相依 fetch（Netlify 函式打包外部套件曾出過 502）。
export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })

  const key = clean(process.env.ANTHROPIC_API_KEY)
  if (!key) return json(501, { error: 'NOT_CONFIGURED' }) // 前端據此顯示設定教學

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'bad json' }) }
  const { system, user, model, maxTokens } = body
  if (!user) return json(400, { error: 'no prompt' })

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-opus-5',
        max_tokens: maxTokens || 8000,
        // 分類型工作負載：adaptive thinking（Opus 5 預設）＋低 effort 兼顧品質與成本
        output_config: { effort: 'low' },
        system: system || undefined,
        messages: [{ role: 'user', content: user }],
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || `HTTP ${res.status}`
      return json(res.status === 429 ? 429 : 502, { error: msg })
    }
    if (data.stop_reason === 'refusal') return json(502, { error: '模型拒絕此請求（refusal）' })
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')
    return json(200, { text, model: data.model, usage: data.usage })
  } catch (e) {
    return json(502, { error: String(e) })
  }
}

function clean(s) {
  return (s || '').trim().replace(/^["']|["']$/g, '')
}

function json(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) }
}
