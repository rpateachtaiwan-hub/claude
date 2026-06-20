import React, { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import Logo from './Logo'

export default function LoginPage() {
  const { login, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await login(email.trim(), password)
    setLoading(false)
    setPassword('')
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
          <button type="submit" disabled={loading || !email || !password}
            className="w-full bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
            {loading ? '登入中…' : '登入'}
          </button>
          <p className="text-[11px] text-gray-400 text-center">帳號由管理員於 Supabase 後台建立 · 請勿在公用電腦使用</p>
        </form>
      </div>
    </div>
  )
}
