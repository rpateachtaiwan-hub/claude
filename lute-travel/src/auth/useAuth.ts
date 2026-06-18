import { create } from 'zustand'
import { supabase, hasSupabase } from '../lib/supabase'

const SESSION_MS = 30 * 60 * 1000 // 30 分鐘（本機模式閒置登出）

// 本機模式預設密碼 hash（SHA-256 of "routor2026"）。
// 接上 Supabase 後改用 Supabase Auth 帳號登入，不再使用此密碼。
const DEFAULT_HASH = '1cdeed9ce0bcf9c3b5a3390b704c5a12a431551cd4fcb2ec566eb75d1a291e02'

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function getStoredHash(): string {
  return localStorage.getItem('lute_pw_hash') || DEFAULT_HASH
}

interface AuthStore {
  isAuthenticated: boolean
  ready: boolean // 是否已完成 session 還原（避免重新整理時誤判未登入）
  userEmail: string | null
  lastActivity: number
  loginError: string

  init: () => Promise<void>
  /** 本機模式：login(密碼)；Supabase 模式：login(email, password) */
  login: (a: string, b?: string) => Promise<boolean>
  logout: () => void
  touch: () => void
  checkExpiry: () => void
  changePassword: (oldPw: string, newPw: string) => Promise<{ ok: boolean; msg: string }>
}

export const useAuth = create<AuthStore>((set, get) => ({
  isAuthenticated: false,
  ready: false,
  userEmail: null,
  lastActivity: 0,
  loginError: '',

  // 啟動時還原登入狀態
  init: async () => {
    if (hasSupabase) {
      const { data } = await supabase.auth.getSession()
      const session = data.session
      set({
        isAuthenticated: !!session,
        userEmail: session?.user?.email ?? null,
        lastActivity: Date.now(),
        ready: true,
      })
      // 監聽登入/登出/Token 更新
      supabase.auth.onAuthStateChange((_event, s) => {
        set({ isAuthenticated: !!s, userEmail: s?.user?.email ?? null })
      })
      return
    }
    // 本機模式：等使用者輸入密碼
    set({ ready: true })
  },

  login: async (a, b) => {
    if (hasSupabase) {
      const email = a
      const password = b ?? ''
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        set({ loginError: '帳號或密碼錯誤' })
        return false
      }
      set({ isAuthenticated: true, lastActivity: Date.now(), loginError: '' })
      return true
    }
    // 本機模式：共用密碼
    const hash = await sha256(a)
    if (hash === getStoredHash()) {
      set({ isAuthenticated: true, lastActivity: Date.now(), loginError: '' })
      return true
    }
    set({ loginError: '密碼錯誤，請再試一次' })
    return false
  },

  logout: () => {
    if (hasSupabase) void supabase.auth.signOut()
    set({ isAuthenticated: false, lastActivity: 0, loginError: '', userEmail: null })
  },

  touch: () => set({ lastActivity: Date.now() }),

  checkExpiry: () => {
    // Supabase 模式由 JWT 自動續期管理；本機模式才做閒置登出
    if (hasSupabase) return
    const { isAuthenticated, lastActivity, logout } = get()
    if (isAuthenticated && Date.now() - lastActivity > SESSION_MS) {
      logout()
    }
  },

  changePassword: async (oldPw, newPw) => {
    if (newPw.length < 6) return { ok: false, msg: '新密碼至少需要 6 個字元' }
    if (hasSupabase) {
      const { error } = await supabase.auth.updateUser({ password: newPw })
      if (error) return { ok: false, msg: error.message }
      return { ok: true, msg: '密碼已更新成功' }
    }
    const oldHash = await sha256(oldPw)
    if (oldHash !== getStoredHash()) return { ok: false, msg: '舊密碼錯誤' }
    const newHash = await sha256(newPw)
    localStorage.setItem('lute_pw_hash', newHash)
    return { ok: true, msg: '密碼已更新成功' }
  },
}))
