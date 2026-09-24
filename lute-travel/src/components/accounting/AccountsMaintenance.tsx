// 科目主檔維護：新增 / 編輯（Supabase 模式寫入 DB；示範模式存於記憶體）
import React, { useState } from 'react'
import { useAccountingStore } from '../../store/accountingStore'
import type { Account, AccountCategory, NormalBalance } from '../../accounting/types'

const CAT_LABEL: Record<AccountCategory, string> = {
  asset: '資產', liability: '負債', equity: '權益', revenue: '收入', expense: '費用',
}
const CATS: AccountCategory[] = ['asset', 'liability', 'equity', 'revenue', 'expense']

export default function AccountsMaintenance() {
  const { accounts, saveAccount } = useAccountingStore()
  const [editing, setEditing] = useState<Account | null>(null)
  const [adding, setAdding] = useState(false)

  return (
    <div className="p-6">
      <div className="flex justify-end mb-3 max-w-3xl">
        <button onClick={() => setAdding(true)} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">+ 新增科目</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden max-w-3xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="px-4 py-2.5 text-left">編號</th>
              <th className="px-4 py-2.5 text-left">科目名稱</th>
              <th className="px-4 py-2.5 text-left">類別</th>
              <th className="px-4 py-2.5 text-center">正常餘額</th>
              <th className="px-4 py-2.5 text-center">未沖追蹤</th>
              <th className="px-4 py-2.5 text-center w-16">操作</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5 font-mono text-xs text-gray-900">{a.code}</td>
                <td className="px-4 py-2.5 text-gray-700">{a.name}</td>
                <td className="px-4 py-2.5 text-gray-500">{CAT_LABEL[a.category]}</td>
                <td className="px-4 py-2.5 text-center text-gray-500">{a.normalBalance === 'debit' ? '借' : '貸'}</td>
                <td className="px-4 py-2.5 text-center">{a.isOpenItem ? <span className="text-blue-600">●</span> : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-2.5 text-center">
                  <button onClick={() => setEditing(a)} className="text-gray-400 hover:text-amber-600" title="編輯">✎</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(adding || editing) && (
        <AccountModal account={editing} onClose={() => { setAdding(false); setEditing(null) }} onSave={saveAccount} />
      )}
    </div>
  )
}

function AccountModal({
  account, onClose, onSave,
}: {
  account: Account | null
  onClose: () => void
  onSave: (a: Omit<Account, 'id'> & { id?: number }) => Promise<void>
}) {
  const [code, setCode] = useState(account?.code ?? '')
  const [name, setName] = useState(account?.name ?? '')
  const [category, setCategory] = useState<AccountCategory>(account?.category ?? 'asset')
  const [normalBalance, setNormalBalance] = useState<NormalBalance>(account?.normalBalance ?? 'debit')
  const [isOpenItem, setIsOpenItem] = useState(account?.isOpenItem ?? false)
  const [active, setActive] = useState(account?.active ?? true)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    try {
      await onSave({ id: account?.id, code, name, category, normalBalance, isOpenItem, active })
      onClose()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-bold">{account ? '編輯科目' : '新增科目'}</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500">✕</button>
        </div>
        <div className="px-6 py-5 grid grid-cols-2 gap-3">
          <Lbl t="編號"><input value={code} onChange={(e) => setCode(e.target.value)} className={inp} placeholder="例：1123" /></Lbl>
          <Lbl t="名稱"><input value={name} onChange={(e) => setName(e.target.value)} className={inp} /></Lbl>
          <Lbl t="類別">
            <select value={category} onChange={(e) => setCategory(e.target.value as AccountCategory)} className={inp}>
              {CATS.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
            </select>
          </Lbl>
          <Lbl t="正常餘額">
            <select value={normalBalance} onChange={(e) => setNormalBalance(e.target.value as NormalBalance)} className={inp}>
              <option value="debit">借</option>
              <option value="credit">貸</option>
            </select>
          </Lbl>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={isOpenItem} onChange={(e) => setIsOpenItem(e.target.checked)} />未沖項追蹤</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />啟用</label>
          {err && <div className="col-span-2 text-sm text-red-600 bg-red-50 rounded p-2">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">取消</button>
          <button onClick={save} disabled={!code || !name} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400">儲存</button>
        </div>
      </div>
    </div>
  )
}

function Lbl({ t, children }: { t: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-gray-500 mb-1">{t}</label>{children}</div>
}
const inp = 'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
