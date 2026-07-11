// Netlify serverless：使用者管理 API。
// service_role 金鑰只存在伺服器端環境變數 SUPABASE_SERVICE_ROLE_KEY（絕不進前端）。
// 每次呼叫都驗證：Bearer token 為有效登入者、且其角色為管理員（app_metadata.role）。
// 尚未設定角色的既有帳號一律視為管理員（與現況相容）。
import { createClient } from '@supabase/supabase-js'

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return json(501, { error: 'NOT_CONFIGURED' }) // 前端據此顯示設定教學

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  // ── 呼叫者驗證 ──────────────────────────────────────────────────────────
  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { error: '未登入' })
  const { data: callerData, error: callerErr } = await admin.auth.getUser(token)
  const caller = callerData?.user
  if (callerErr || !caller) return json(401, { error: '登入已失效，請重新登入' })
  const callerRole = caller.app_metadata?.role ?? 'admin'
  if (callerRole !== 'admin') return json(403, { error: '僅管理員可管理使用者' })

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'bad json' }) }

  try {
    switch (body.action) {
      case 'list': {
        const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
        if (error) return json(500, { error: error.message })
        const users = data.users.map((u) => ({
          id: u.id,
          email: u.email,
          role: u.app_metadata?.role ?? 'admin',
          createdAt: u.created_at,
          lastSignInAt: u.last_sign_in_at ?? null,
        }))
        return json(200, { users, callerId: caller.id })
      }
      case 'create': {
        const { email, password, role } = body
        if (!email || !password || password.length < 6) return json(400, { error: '請提供 Email 與至少 6 字元密碼' })
        const { error } = await admin.auth.admin.createUser({
          email, password,
          email_confirm: true, // 直接可登入，不需驗證信
          app_metadata: { role: role === 'viewer' ? 'viewer' : 'admin' },
        })
        if (error) return json(400, { error: error.message })
        return json(200, { ok: true })
      }
      case 'delete': {
        if (body.userId === caller.id) return json(400, { error: '不可刪除自己的帳號' })
        const { error } = await admin.auth.admin.deleteUser(body.userId)
        if (error) return json(400, { error: error.message })
        return json(200, { ok: true })
      }
      case 'setRole': {
        const role = body.role === 'viewer' ? 'viewer' : 'admin'
        if (body.userId === caller.id && role !== 'admin') return json(400, { error: '不可將自己降為檢視者（避免無人能管理）' })
        const { error } = await admin.auth.admin.updateUserById(body.userId, { app_metadata: { role } })
        if (error) return json(400, { error: error.message })
        return json(200, { ok: true })
      }
      case 'setPassword': {
        if (!body.password || body.password.length < 6) return json(400, { error: '密碼至少 6 字元' })
        const { error } = await admin.auth.admin.updateUserById(body.userId, { password: body.password })
        if (error) return json(400, { error: error.message })
        return json(200, { ok: true })
      }
      default:
        return json(400, { error: 'unknown action' })
    }
  } catch (e) {
    return json(500, { error: String(e) })
  }
}

function json(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) }
}
