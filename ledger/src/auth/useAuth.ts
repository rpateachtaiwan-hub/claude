import { create } from 'zustand'
import { supabase, hasSupabase } from '../lib/supabase'

interface AuthState {
  ready: boolean // 是否已完成 session 還原
  authed: boolean
  email: string | null
  error: string
  init: () => Promise<void>
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  ready: false,
  authed: false,
  email: null,
  error: '',

  init: async () => {
    if (!hasSupabase) {
      // 示範模式（未接資料庫）不需登入
      set({ ready: true, authed: true, email: null })
      return
    }
    const { data } = await supabase.auth.getSession()
    set({ ready: true, authed: !!data.session, email: data.session?.user?.email ?? null })
    supabase.auth.onAuthStateChange((_e, s) => {
      set({ authed: !!s, email: s?.user?.email ?? null })
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
    set({ authed: false, email: null })
  },
}))
