import React, { useState } from 'react'
import { useLedger } from '../store/useLedger'
import type { Account, Category } from '../core/types'

const CATS: Category[] = ['asset', 'liability', 'equity', 'revenue', 'expense']
const catZh: Record<Category, string> = { asset: '資產', liability: '負債', equity: '權益', revenue: '收入', expense: '費用' }

export default function Settings() {
  const { accounts, rules, addAccount, deleteRule } = useLedger()
  const accName = (code: string) => accounts.find((a) => a.code === code)?.name ?? code
  const [adding, setAdding] = useState(false)

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* 學到的規則 */}
      <section>
        <h2 className="text-sm font-bold text-gray-900 mb-2">已學習的分類規則</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="px-3 py-2 text-left">關鍵字 / 對象</th><th className="px-3 py-2 text-left">方向</th>
              <th className="px-3 py-2 text-left">→ 科目</th><th className="px-3 py-2 text-right">權重</th><th className="w-10"></th>
            </tr></thead>
            <tbody>
              {[...rules].sort((a, b) => b.weight - a.weight).map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-800">{r.keyword}</td>
                  <td className="px-3 py-2 text-gray-500">{r.direction === 'in' ? '收入' : r.direction === 'out' ? '支出' : '不分'}</td>
                  <td className="px-3 py-2 text-gray-700">{accName(r.accountCode)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{r.weight}</td>
                  <td className="px-3 py-2 text-center"><button onClick={() => deleteRule(r.id)} className="text-gray-300 hover:text-red-500">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-1">記帳時更正科目，這裡就會多一條規則；權重越高越優先。</p>
      </section>

      {/* 科目表 */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-gray-900">科目表</h2>
          <button onClick={() => setAdding(true)} className="text-sm text-blue-600 hover:text-blue-700">+ 新增科目</button>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="px-3 py-2 text-left">編號</th><th className="px-3 py-2 text-left">名稱</th>
              <th className="px-3 py-2 text-left">類別</th><th className="px-3 py-2 text-center">現金</th>
            </tr></thead>
            <tbody>
              {[...accounts].sort((a, b) => a.code.localeCompare(b.code)).map((a) => (
                <tr key={a.code} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-mono text-xs">{a.code}</td>
                  <td className="px-3 py-2 text-gray-800">{a.name}</td>
                  <td className="px-3 py-2 text-gray-500">{catZh[a.category]}</td>
                  <td className="px-3 py-2 text-center">{a.isCash ? '💵' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {adding && <AccountModal onClose={() => setAdding(false)} onSave={addAccount} />}
    </div>
  )
}

function AccountModal({ onClose, onSave }: { onClose: () => void; onSave: (a: Account) => void }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState<Category>('expense')
  const [isCash, setIsCash] = useState(false)

  function save() {
    const normalBalance = category === 'asset' || category === 'expense' ? 'debit' : 'credit'
    onSave({ code, name, category, normalBalance, isCash, active: true })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-bold text-sm">新增科目</h3>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>
        <div className="p-5 space-y-3">
          <L t="編號"><input value={code} onChange={(e) => setCode(e.target.value)} className={inp} placeholder="例：6107" /></L>
          <L t="名稱"><input value={name} onChange={(e) => setName(e.target.value)} className={inp} placeholder="例：保險費" /></L>
          <L t="類別">
            <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={inp}>
              {CATS.map((c) => <option key={c} value={c}>{catZh[c]}</option>)}
            </select>
          </L>
          <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={isCash} onChange={(e) => setIsCash(e.target.checked)} />這是現金/銀行帳戶</label>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm">取消</button>
          <button onClick={save} disabled={!code || !name} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm disabled:bg-gray-200">儲存</button>
        </div>
      </div>
    </div>
  )
}

function L({ t, children }: { t: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-gray-500 mb-1">{t}</label>{children}</div>
}
const inp = 'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
