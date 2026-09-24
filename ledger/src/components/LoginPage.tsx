import React, { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import Logo from './Logo'

export default function LoginPage() {
  const { login, error, resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetMsg, setResetMsg] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await login(email.trim(), password)
    setLoading(false)
    setPassword('')
  }

  async function forgot() {
    setResetMsg(null)
    if (!email.trim()) { setResetMsg('請先在上方輸入你的電子郵件，再點「忘記密碼」。'); return }
    setLoading(true)
    const err = await resetPassword(email)
    setLoading(false)
    setResetMsg(err ? `寄送失敗：${err}` : `重設密碼信已寄到 ${email.trim()}，請點信中連結設定新密碼（也檢查垃圾信件夾）。`)
  }

  return (
    <div className="min-h-screen bg-brand-soft flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6"><Logo height={40} /></div>
        <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-gray-900 font-bold">登入輕記帳</h2>
          <div>
            <label className="block text-xs text-gray-500 mb-1">電子郵件</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="username"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">密碼</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          {resetMsg && <p className="text-xs text-brand-dark bg-brand-soft rounded p-2 leading-relaxed">{resetMsg}</p>}
          <button type="submit" disabled={loading || !email || !password}
            className="w-full bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
            {loading ? '處理中…' : '登入'}
          </button>
          <div className="flex items-center justify-between text-[11px]">
            <button type="button" onClick={forgot} disabled={loading} className="text-brand hover:text-brand-dark underline">忘記密碼？</button>
            <span className="text-gray-400">請勿在公用電腦使用</span>
          </div>
        </form>
      </div>
    </div>
  )
}
