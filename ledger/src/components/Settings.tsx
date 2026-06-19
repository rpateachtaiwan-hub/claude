import React, { useState } from 'react'
import { useLedger } from '../store/useLedger'
import { downloadCSV, toCSV } from '../lib/csv'
import type { Account, Category } from '../core/types'

const CATS: Category[] = ['asset', 'liability', 'equity', 'revenue', 'expense']
const catZh: Record<Category, string> = { asset: '資產', liability: '負債', equity: '權益', revenue: '收入', expense: '費用' }

export default function Settings() {
  const { accounts, addAccount, deleteAccount, aiConfig, setAiConfig } = useLedger()
  const [editing, setEditing] = useState<Account | null>(null)
  const [adding, setAdding] = useState(false)

  const [key, setKey] = useState(aiConfig.apiKey)
  const [model, setModel] = useState(aiConfig.model)
  const [saved, setSaved] = useState(false)

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Gemini 智慧判斷 */}
      <section>
        <h2 className="text-sm font-bold text-gray-900 mb-2">智慧分類（Google Gemini）</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-xs text-gray-500 leading-relaxed">
            填入你的 Gemini API 金鑰後，「記一筆」會改用 Gemini 判斷科目與借貸（取代固定規則）。
            金鑰只存在你的瀏覽器、由瀏覽器直接呼叫 Google。未填則使用內建預設分類。
          </p>
          <L t="Gemini API 金鑰"><input type="password" value={key} onChange={(e) => { setKey(e.target.value); setSaved(false) }} className={inp} placeholder="AIza..." /></L>
          <L t="模型"><input value={model} onChange={(e) => { setModel(e.target.value); setSaved(false) }} className={inp} placeholder="gemini-2.0-flash" /></L>
          <div className="flex items-center gap-3">
            <button onClick={() => { setAiConfig({ apiKey: key.trim(), model: model.trim() || 'gemini-2.0-flash' }); setSaved(true) }}
              className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark">儲存</button>
            <span className="text-xs text-gray-500">
              狀態：{aiConfig.apiKey ? `✓ 已啟用（${aiConfig.model}）` : '未設定，使用預設分類'}{saved && ' · 已儲存'}
            </span>
          </div>
          <p className="text-[11px] text-amber-600">提醒：部署到公開網址時，金鑰會存在使用者瀏覽器；多人或對外使用建議改用伺服器代理（後續可加）。</p>
        </div>
      </section>

      {/* 科目表 */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-gray-900">科目表</h2>
          <div className="flex gap-3">
            <button onClick={() => downloadCSV('科目表', toCSV(['編號', '科目', '類別'], accounts.map((a) => [a.code, a.name, catZh[a.category]])))} className="text-sm text-gray-500 hover:text-gray-700">⬇ 匯出</button>
            <button onClick={() => setAdding(true)} className="text-sm text-brand hover:text-brand-dark">+ 新增科目</button>
          </div>
        </div>
        <div className="bg-brand-soft border border-brand-light/40 rounded-lg p-3 text-xs text-gray-600 leading-relaxed mb-2">
          <b>「類別」是會計五大分類</b>，決定科目出現在哪張報表、以及借貸方向：
          <br />· <b>資產</b>（現金、應收、設備…）、<b>負債</b>（應付、借款…）、<b>權益</b>（資本）→ <b>資產負債表</b>。
          <br />· <b>收入</b>、<b>費用</b> → <b>損益表</b>。
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="px-3 py-2 text-left">編號</th><th className="px-3 py-2 text-left">名稱</th>
              <th className="px-3 py-2 text-left">類別</th><th className="px-3 py-2 text-center">現金</th><th className="px-3 py-2 text-center w-16">操作</th>
            </tr></thead>
            <tbody>
              {[...accounts].sort((a, b) => a.code.localeCompare(b.code)).map((a) => (
                <tr key={a.code} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-mono text-xs">{a.code}</td>
                  <td className="px-3 py-2 text-gray-800">{a.name}{a.isOpenItem ? ' 🔁' : ''}</td>
                  <td className="px-3 py-2 text-gray-500">{catZh[a.category]}</td>
                  <td className="px-3 py-2 text-center">{a.isCash ? '💵' : ''}</td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    <button onClick={() => setEditing(a)} className="text-gray-400 hover:text-brand mr-2" title="編輯">✎</button>
                    <button onClick={() => { if (confirm(`刪除科目「${a.name}」？（不影響已記錄的交易）`)) deleteAccount(a.code) }} className="text-gray-300 hover:text-red-500" title="刪除">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {(adding || editing) && <AccountModal account={editing} onClose={() => { setAdding(false); setEditing(null) }} onSave={addAccount} />}
    </div>
  )
}

function AccountModal({ account, onClose, onSave }: { account: Account | null; onClose: () => void; onSave: (a: Account) => void }) {
  const isEdit = !!account
  const [code, setCode] = useState(account?.code ?? '')
  const [name, setName] = useState(account?.name ?? '')
  const [category, setCategory] = useState<Category>(account?.category ?? 'expense')
  const [isCash, setIsCash] = useState(account?.isCash ?? false)
  const [isOpenItem, setIsOpenItem] = useState(account?.isOpenItem ?? false)

  function save() {
    const normalBalance = category === 'asset' || category === 'expense' ? 'debit' : 'credit'
    onSave({ code: code.trim(), name: name.trim(), category, normalBalance, isCash, isOpenItem, active: true })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-bold text-sm">{isEdit ? '編輯科目' : '新增科目'}</h3>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>
        <div className="p-5 space-y-3">
          <L t="編號"><input value={code} onChange={(e) => setCode(e.target.value)} className={inp} placeholder="例：6107" disabled={isEdit} /></L>
          <L t="名稱"><input value={name} onChange={(e) => setName(e.target.value)} className={inp} placeholder="例：保險費" /></L>
          <L t="類別">
            <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={inp}>
              {CATS.map((c) => <option key={c} value={c}>{catZh[c]}</option>)}
            </select>
          </L>
          <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={isCash} onChange={(e) => setIsCash(e.target.checked)} />現金/銀行帳戶</label>
          <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={isOpenItem} onChange={(e) => setIsOpenItem(e.target.checked)} />應收/應付（需沖銷）</label>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm">取消</button>
          <button onClick={save} disabled={!code || !name} className="px-3 py-1.5 rounded-lg bg-brand text-white text-sm disabled:bg-gray-200">儲存</button>
        </div>
      </div>
    </div>
  )
}

function L({ t, children }: { t: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-gray-500 mb-1">{t}</label>{children}</div>
}
const inp = 'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand'
