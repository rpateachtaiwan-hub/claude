import { create } from 'zustand'
import { supabase, hasSupabase, makeAuxClient } from '../lib/supabase'

interface AuthState {
  ready: boolean // 是否已完成 session 還原
  authed: boolean
  email: string | null
  /** 角色：admin（可管理使用者）或 viewer（唯讀，需搭配 roles.sql 的 RLS 才強制生效）。未設定視為 admin。 */
  role: 'admin' | 'viewer'
  error: string
  /** 使用者點了「忘記密碼」信中的連結進站 → 強制先設定新密碼 */
  recovery: boolean
  init: () => Promise<void>
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  /** 寄送重設密碼信。回傳錯誤訊息或 null（成功） */
  resetPassword: (email: string) => Promise<string | null>
  /** 變更目前登入者密碼（含重設流程）。回傳錯誤訊息或 null */
  updatePassword: (newPassword: string) => Promise<string | null>
  /** 建立新使用者（不影響目前登入 session）。回傳錯誤訊息或 null */
  createUser: (email: string, password: string) => Promise<string | null>
}

export const useAuth = create<AuthState>((set) => ({
  ready: false,
  authed: false,
  email: null,
  role: 'admin',
  error: '',
  recovery: false,

  init: async () => {
    if (!hasSupabase) {
      // 示範模式（未接資料庫）不需登入
      set({ ready: true, authed: true, email: null })
      return
    }
    const roleOf = (u: { app_metadata?: Record<string, unknown> } | null | undefined): 'admin' | 'viewer' =>
      u?.app_metadata?.role === 'viewer' ? 'viewer' : 'admin'
    const { data } = await supabase.auth.getSession()
    set({ ready: true, authed: !!data.session, email: data.session?.user?.email ?? null, role: roleOf(data.session?.user) })
    supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') set({ recovery: true })
      set({ authed: !!s, email: s?.user?.email ?? null, role: roleOf(s?.user) })
    })
  },

  login: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { set({ error: '帳號或密碼錯誤' }); return false }
    set({ error: '' })
    return true
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ authed: false, email: null, recovery: false })
  },

  resetPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    })
    return error ? error.message : null
  },

  updatePassword: async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return error.message
    set({ recovery: false })
    return null
  },

  createUser: async (email, password) => {
    // 用獨立 client signUp，避免把目前管理員的登入換成新帳號
    const aux = makeAuxClient()
    const { data, error } = await aux.auth.signUp({ email: email.trim(), password })
    if (error) return error.message
    // Supabase 對已存在的 Email 會回傳「identities 為空」的假成功
    if ((data.user?.identities?.length ?? 0) === 0) return '此 Email 已有帳號'
    // 專案若啟用「Confirm email」，需先點驗證信才能登入
    if (!data.session) return 'NEEDS_CONFIRM'
    return null
  },
}))
