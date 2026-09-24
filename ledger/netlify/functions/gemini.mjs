// Netlify serverless 代理：保管 Gemini 金鑰於伺服器端（環境變數 GEMINI_API_KEY）。
// 前端 POST { prompt, model } → 由此向 Google 呼叫並回傳 { text }。
export async function handler(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  const key = process.env.GEMINI_API_KEY
  if (!key) return json(500, { error: 'GEMINI_API_KEY 尚未設定' })

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'bad json' }) }
  const prompt = body.prompt
  const model = body.model || 'gemini-2.0-flash'
  if (!prompt) return json(400, { error: 'no prompt' })

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } }),
    })
    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    return json(200, { text })
  } catch (e) {
    return json(502, { error: String(e) })
  }
}

function json(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) }
}
