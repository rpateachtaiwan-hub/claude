// 前端呼叫使用者管理 API（Netlify Function）。以目前登入者的 access token 驗證身分。
import { supabase } from './supabase'

export interface ManagedUser {
  id: string
  email: string
  role: 'admin' | 'viewer'
  createdAt: string
  lastSignInAt: string | null
}

export interface AdminApiResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  /** Function 未部署或未設定 SUPABASE_SERVICE_ROLE_KEY */
  unavailable?: boolean
}

export async function adminUsersCall<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<AdminApiResult<T>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, error: '未登入' }
  try {
    const res = await fetch('/.netlify/functions/admin-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action, ...payload }),
    })
    if (res.status === 404 || res.status === 501) return { ok: false, unavailable: true, error: '使用者管理 API 尚未設定' }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: (data as { error?: string }).error ?? `HTTP ${res.status}` }
    return { ok: true, data: data as T }
  } catch {
    return { ok: false, unavailable: true, error: '無法連線使用者管理 API（本機開發環境無 Netlify Functions）' }
  }
}
