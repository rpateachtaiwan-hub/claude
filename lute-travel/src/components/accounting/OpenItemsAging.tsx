// 未沖明細 / 帳齡
import React, { useState } from 'react'
import { useAccountingStore } from '../../store/accountingStore'
import { aging } from '../../accounting/reports'
import { formatTWD } from '../../accounting/money'
import type { OpenItemType } from '../../accounting/types'

const STATUS_LABEL: Record<string, string> = { open: '未沖', partial: '部分沖銷', closed: '已結清' }
const STATUS_CLS: Record<string, string> = {
  open: 'bg-amber-100 text-amber-700', partial: 'bg-blue-100 text-blue-700', closed: 'bg-gray-100 text-gray-500',
}

export default function OpenItemsAging() {
  const { openItemsWithRemaining, accounts, postRecognition } = useAccountingStore()
  const [type, setType] = useState<OpenItemType>('AP')
  const [showRecog, setShowRecog] = useState(false)
  const asOf = new Date().toISOString().slice(0, 10)

  const all = openItemsWithRemaining().filter((o) => o.type === type)
  const report = aging(all, type, asOf)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['AP', 'AR'] as OpenItemType[]).map((t) => (
            <button key={t} onClick={() => setType(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${type === t ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {t === 'AP' ? '應付未沖' : '應收未沖'}
            </button>
          ))}
        </div>
        <button onClick={() => setShowRecog(true)} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
          + 認列掛帳
        </button>
      </div>

      {/* 帳齡分桶 */}
      <div className="grid grid-cols-4 gap-3">
        {report.buckets.map((b) => (
          <div key={b.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-400">{b.label} 天</div>
            <div className="text-lg font-bold text-gray-900 tabular-nums">{formatTWD(b.amount)}</div>
            <div className="text-xs text-gray-400">{b.count} 筆</div>
          </div>
        ))}
      </div>

      {/* 明細 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="px-3 py-2.5 text-left">代號</th>
              <th className="px-3 py-2.5 text-left">對象</th>
              <th className="px-3 py-2.5 text-left">摘要</th>
              <th className="px-3 py-2.5 text-left">認列日</th>
              <th className="px-3 py-2.5 text-right">原始金額</th>
              <th className="px-3 py-2.5 text-right">未沖餘額</th>
              <th className="px-3 py-2.5 text-center">狀態</th>
            </tr>
          </thead>
          <tbody>
            {all.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">尚無資料</td></tr>}
            {all.map((it) => (
              <tr key={it.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2.5 font-mono text-xs">{it.code}</td>
                <td className="px-3 py-2.5 text-gray-700">{it.counterparty}</td>
                <td className="px-3 py-2.5 text-gray-700">{it.description}</td>
                <td className="px-3 py-2.5 text-gray-500">{it.originDate}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatTWD(it.originalAmount)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium">{formatTWD(it.remaining)}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] ${STATUS_CLS[it.status]}`}>{STATUS_LABEL[it.status]}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-bold text-gray-900">
              <td colSpan={5} className="px-3 py-2.5 text-right">未沖合計</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatTWD(report.total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {showRecog && <RecognitionModal onClose={() => setShowRecog(false)} />}
    </div>
  )

  function RecognitionModal({ onClose }: { onClose: () => void }) {
    const [kind, setKind] = useState<'cost' | 'revenue'>('cost')
    const [date, setDate] = useState(asOf)
    const [amount, setAmount] = useState(0)
    const [counterparty, setCounterparty] = useState('')
    const [description, setDescription] = useState('')
    const [err, setErr] = useState<string | null>(null)

    const control = accounts.find((a) => a.code === (kind === 'cost' ? '2121' : '1123'))!
    const pnlAccounts = accounts.filter((a) => a.category === (kind === 'cost' ? 'expense' : 'revenue'))
    const [pnlId, setPnlId] = useState(() => pnlAccounts[0]?.id ?? 0)

    async function save() {
      try {
        await postRecognition({ kind, entryDate: date, amount, counterparty, description, controlAccountId: control.id, pnlAccountId: pnlId })
        onClose()
      } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    }

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h2 className="text-base font-bold">認列掛帳</h2>
            <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500">✕</button>
          </div>
          <div className="px-6 py-5 space-y-3">
            <div className="flex gap-2">
              {([['cost', '認列成本（應付）'], ['revenue', '認列收入（應收）']] as const).map(([k, label]) => (
                <button key={k} onClick={() => { setKind(k); setPnlId(accounts.filter((a) => a.category === (k === 'cost' ? 'expense' : 'revenue'))[0]?.id ?? 0) }}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm ${kind === k ? 'bg-blue-600 text-white' : 'border border-gray-300 text-gray-600'}`}>{label}</button>
              ))}
            </div>
            <Lbl t="日期"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} /></Lbl>
            <Lbl t={kind === 'cost' ? '成本科目' : '收入科目'}>
              <select value={pnlId} onChange={(e) => setPnlId(Number(e.target.value))} className={inp}>
                {pnlAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
              </select>
            </Lbl>
            <Lbl t="對象"><input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} className={inp} placeholder="廠商/平台/客戶" /></Lbl>
            <Lbl t="摘要"><input value={description} onChange={(e) => setDescription(e.target.value)} className={inp} /></Lbl>
            <Lbl t="金額"><input type="number" value={amount || ''} min={1} onChange={(e) => setAmount(Math.floor(Number(e.target.value) || 0))} className={`${inp} text-right`} /></Lbl>
            {err && <div className="text-sm text-red-600 bg-red-50 rounded p-2">{err}</div>}
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">取消</button>
            <button onClick={save} disabled={amount <= 0 || !description} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400">建立</button>
          </div>
        </div>
      </div>
    )
  }
}

function Lbl({ t, children }: { t: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-gray-500 mb-1">{t}</label>{children}</div>
}
const inp = 'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
