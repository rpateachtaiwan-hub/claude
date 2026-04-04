import { create } from 'zustand'

const SESSION_MS = 30 * 60 * 1000 // 30 分鐘

// 預設密碼 hash（SHA-256 of "routor2026"）
// 使用者可在設定中更改
const DEFAULT_HASH = '7b6e4f8a2c1d9e3f5a7b6e4f8a2c1d9e3f5a7b6e4f8a2c1d9e3f5a7b6e4f8a'

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function getStoredHash(): string {
  return localStorage.getItem('lute_pw_hash') || DEFAULT_HASH
}

interface AuthStore {
  isAuthenticated: boolean
  lastActivity: number
  loginError: string

  login: (password: string) => Promise<boolean>
  logout: () => void
  touch: () => void
  checkExpiry: () => void
  changePassword: (oldPw: string, newPw: string) => Promise<{ ok: boolean; msg: string }>
}

export const useAuth = create<AuthStore>((set, get) => ({
  isAuthenticated: false,
  lastActivity: 0,
  loginError: '',

  login: async (password) => {
    const hash = await sha256(password)
    if (hash === getStoredHash()) {
      set({ isAuthenticated: true, lastActivity: Date.now(), loginError: '' })
      return true
    }
    set({ loginError: '密碼錯誤，請再試一次' })
    return false
  },

  logout: () => set({ isAuthenticated: false, lastActivity: 0, loginError: '' }),

  touch: () => set({ lastActivity: Date.now() }),

  checkExpiry: () => {
    const { isAuthenticated, lastActivity, logout } = get()
    if (isAuthenticated && Date.now() - lastActivity > SESSION_MS) {
      logout()
    }
  },

  changePassword: async (oldPw, newPw) => {
    const oldHash = await sha256(oldPw)
    if (oldHash !== getStoredHash()) return { ok: false, msg: '舊密碼錯誤' }
    if (newPw.length < 6) return { ok: false, msg: '新密碼至少需要 6 個字元' }
    const newHash = await sha256(newPw)
    localStorage.setItem('lute_pw_hash', newHash)
    return { ok: true, msg: '密碼已更新成功' }
  },
}))
