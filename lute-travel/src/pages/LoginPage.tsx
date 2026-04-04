import React, { useState } from 'react'
import { useAuth } from '../auth/useAuth'

export default function LoginPage() {
  const { login, loginError } = useAuth()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await login(password)
    setLoading(false)
    setPassword('')
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">✈</div>
          <h1 className="text-white text-xl font-bold">路特旅行社</h1>
          <p className="text-slate-400 text-sm mt-1">ROUTOR TRAVEL · 管理系統</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-800 rounded-2xl p-6 shadow-xl">
          <h2 className="text-white font-semibold mb-5">請輸入登入密碼</h2>

          <div className="mb-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密碼"
              autoFocus
              className="w-full bg-slate-700 text-white placeholder-slate-400 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {loginError && (
            <p className="text-red-400 text-xs mb-3">{loginError}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg text-sm transition-colors"
          >
            {loading ? '驗證中…' : '登入'}
          </button>
        </form>

        <p className="text-slate-600 text-[11px] text-center mt-6">
          資料僅儲存於本機瀏覽器 · 請勿在公用電腦使用
        </p>
      </div>
    </div>
  )
}
