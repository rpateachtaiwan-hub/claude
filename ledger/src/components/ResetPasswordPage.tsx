import React, { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import Logo from './Logo'

/** 使用者點擊「忘記密碼」信中連結進站後，強制先設定新密碼。 */
export default function ResetPasswordPage() {
  const { email, updatePassword, logout } = useAuth()
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (pw1.length < 6) { setErr('密碼至少 6 個字元。'); return }
    if (pw1 !== pw2) { setErr('兩次輸入的密碼不一致。'); return }
    setLoading(true)
    const msg = await updatePassword(pw1)
    setLoading(false)
    if (msg) setErr(`設定失敗：${msg}`)
  }

  return (
    <div className="min-h-screen bg-brand-soft flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6"><Logo height={40} /></div>
        <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-gray-900 font-bold">設定新密碼</h2>
          <p className="text-xs text-gray-500">帳號：{email ?? ''}。請設定新密碼後繼續使用。</p>
          <div>
            <label className="block text-xs text-gray-500 mb-1">新密碼（至少 6 字元）</label>
            <input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} autoFocus autoComplete="new-password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">再輸入一次</label>
            <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          {err && <p className="text-red-500 text-xs">{err}</p>}
          <button type="submit" disabled={loading || !pw1 || !pw2}
            className="w-full bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
            {loading ? '設定中…' : '設定新密碼並進入系統'}
          </button>
          <button type="button" onClick={() => logout()} className="w-full text-[11px] text-gray-400 underline">取消並登出</button>
        </form>
      </div>
    </div>
  )
}
