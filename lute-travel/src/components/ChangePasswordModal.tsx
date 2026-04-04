import React, { useState } from 'react'
import { useAuth } from '../auth/useAuth'

interface Props { onClose: () => void }

export default function ChangePasswordModal({ onClose }: Props) {
  const { changePassword } = useAuth()
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPw !== confirm) { setMsg({ ok: false, text: '新密碼與確認密碼不一致' }); return }
    setLoading(true)
    const result = await changePassword(oldPw, newPw)
    setLoading(false)
    setMsg({ ok: result.ok, text: result.msg })
    if (result.ok) {
      setOldPw(''); setNewPw(''); setConfirm('')
      setTimeout(onClose, 1200)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-gray-900">變更密碼</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">目前密碼</label>
            <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">新密碼（至少 6 位）</label>
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">確認新密碼</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {msg && (
            <p className={`text-xs ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</p>
          )}

          <button
            type="submit"
            disabled={loading || !oldPw || !newPw || !confirm}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors mt-2"
          >
            {loading ? '處理中…' : '確認變更'}
          </button>
        </form>
      </div>
    </div>
  )
}
