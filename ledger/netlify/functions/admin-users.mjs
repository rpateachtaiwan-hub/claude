// Netlify serverless：使用者管理 API（零外部相依，直接呼叫 Supabase GoTrue Admin API）。
// service_role 金鑰只存在伺服器端環境變數 SUPABASE_SERVICE_ROLE_KEY（絕不進前端）。
// 每次呼叫都驗證：Bearer token 為有效登入者、且其角色為管理員（app_metadata.role）。
// 尚未設定角色的既有帳號一律視為管理員（與現況相容）。

export async function handler(event) {
  try {
    return await route(event)
  } catch (e) {
    return json(500, { error: `函式錯誤：${e && e.message ? e.message : String(e)}` })
  }
}

async function route(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })

  const url = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!url || !serviceKey) return json(501, { error: 'NOT_CONFIGURED' }) // 前端據此顯示設定教學

  const adminHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }
  const gotrue = (path) => `${url.replace(/\/+$/, '')}/auth/v1${path}`

  // ── 呼叫者驗證 ──────────────────────────────────────────────────────────
  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { error: '未登入' })
  const meRes = await fetch(gotrue('/user'), { headers: { apikey: serviceKey, Authorization: `Bearer ${token}` } })
  if (!meRes.ok) return json(401, { error: '登入已失效，請重新登入' })
  const caller = await meRes.json()
  const callerRole = caller?.app_metadata?.role ?? 'admin'
  if (callerRole !== 'admin') return json(403, { error: '僅管理員可管理使用者' })

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'bad json' }) }

  switch (body.action) {
    case 'list': {
      const res = await fetch(gotrue('/admin/users?page=1&per_page=200'), { headers: adminHeaders })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return json(500, { error: msgOf(data, res) })
      const list = Array.isArray(data.users) ? data.users : Array.isArray(data) ? data : []
      const users = list.map((u) => ({
        id: u.id,
        email: u.email,
        role: (u.app_metadata && u.app_metadata.role) === 'viewer' ? 'viewer' : 'admin',
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
      }))
      return json(200, { users, callerId: caller.id })
    }
    case 'create': {
      const { email, password, role } = body
      if (!email || !password || password.length < 6) return json(400, { error: '請提供 Email 與至少 6 字元密碼' })
      const res = await fetch(gotrue('/admin/users'), {
        method: 'POST', headers: adminHeaders,
        body: JSON.stringify({
          email, password,
          email_confirm: true, // 直接可登入，不需驗證信
          app_metadata: { role: role === 'viewer' ? 'viewer' : 'admin' },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return json(400, { error: msgOf(data, res) })
      return json(200, { ok: true })
    }
    case 'delete': {
      if (body.userId === caller.id) return json(400, { error: '不可刪除自己的帳號' })
      const res = await fetch(gotrue(`/admin/users/${encodeURIComponent(body.userId)}`), { method: 'DELETE', headers: adminHeaders })
      if (!res.ok) return json(400, { error: msgOf(await res.json().catch(() => ({})), res) })
      return json(200, { ok: true })
    }
    case 'setRole': {
      const role = body.role === 'viewer' ? 'viewer' : 'admin'
      if (body.userId === caller.id && role !== 'admin') return json(400, { error: '不可將自己降為檢視者（避免無人能管理）' })
      const res = await fetch(gotrue(`/admin/users/${encodeURIComponent(body.userId)}`), {
        method: 'PUT', headers: adminHeaders, body: JSON.stringify({ app_metadata: { role } }),
      })
      if (!res.ok) return json(400, { error: msgOf(await res.json().catch(() => ({})), res) })
      return json(200, { ok: true })
    }
    case 'setPassword': {
      if (!body.password || body.password.length < 6) return json(400, { error: '密碼至少 6 字元' })
      const res = await fetch(gotrue(`/admin/users/${encodeURIComponent(body.userId)}`), {
        method: 'PUT', headers: adminHeaders, body: JSON.stringify({ password: body.password }),
      })
      if (!res.ok) return json(400, { error: msgOf(await res.json().catch(() => ({})), res) })
      return json(200, { ok: true })
    }
    default:
      return json(400, { error: 'unknown action' })
  }
}

/** 去除環境變數常見的引號/空白（貼上時容易夾帶） */
function clean(s) {
  return (s || '').trim().replace(/^["']|["']$/g, '')
}

function msgOf(data, res) {
  return (data && (data.msg || data.message || data.error_description || data.error)) || `HTTP ${res.status}`
}

function json(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) }
}
