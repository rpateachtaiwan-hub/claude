// 傳票輸入：可多行，即時顯示借貸是否平衡，不平衡不能送出
import React, { useState } from 'react'
import { useAccountingStore } from '../../store/accountingStore'
import { formatTWD } from '../../accounting/money'
import type { DraftLine } from '../../accounting/types'

interface Row { accountId: number; debit: number; credit: number; memo: string }

export default function JournalEntryForm() {
  const { accounts, postManualEntry } = useAccountingStore()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [summary, setSummary] = useState('')
  const [rows, setRows] = useState<Row[]>([
    { accountId: accounts[0]?.id ?? 0, debit: 0, credit: 0, memo: '' },
    { accountId: accounts[0]?.id ?? 0, debit: 0, credit: 0, memo: '' },
  ])
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const totalDebit = rows.reduce((s, r) => s + (r.debit || 0), 0)
  const totalCredit = rows.reduce((s, r) => s + (r.credit || 0), 0)
  const balanced = totalDebit === totalCredit && totalDebit > 0
  const eachOneSided = rows.every((r) => (r.debit === 0) !== (r.credit === 0) || (r.debit === 0 && r.credit === 0))

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
    setMsg(null)
  }
  function addRow() { setRows((rs) => [...rs, { accountId: accounts[0]?.id ?? 0, debit: 0, credit: 0, memo: '' }]) }
  function removeRow(i: number) { setRows((rs) => rs.filter((_, idx) => idx !== i)) }

  async function submit() {
    const lines: DraftLine[] = rows
      .filter((r) => r.debit > 0 || r.credit > 0)
      .map((r) => ({ accountId: r.accountId, debit: r.debit || 0, credit: r.credit || 0, memo: r.memo || undefined }))
    try {
      await postManualEntry({ entryDate: date, summary, lines })
      setMsg({ kind: 'ok', text: '傳票已過帳' })
      setRows([{ accountId: accounts[0]?.id ?? 0, debit: 0, credit: 0, memo: '' }, { accountId: accounts[0]?.id ?? 0, debit: 0, credit: 0, memo: '' }])
      setSummary('')
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">傳票日期</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">摘要</label>
            <input value={summary} onChange={(e) => setSummary(e.target.value)} className={inp} placeholder="例：1月薪資" />
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-xs border-b border-gray-100">
              <th className="py-2 text-left">科目</th>
              <th className="py-2 text-right w-32">借方</th>
              <th className="py-2 text-right w-32">貸方</th>
              <th className="py-2 text-left">備註</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="py-1.5 pr-2">
                  <select value={r.accountId} onChange={(e) => update(i, { accountId: Number(e.target.value) })} className={inp}>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                  </select>
                </td>
                <td className="py-1.5 px-1">
                  <input type="number" value={r.debit || ''} min={0}
                    onChange={(e) => update(i, { debit: Math.floor(Number(e.target.value) || 0), credit: 0 })}
                    className={`${inp} text-right`} />
                </td>
                <td className="py-1.5 px-1">
                  <input type="number" value={r.credit || ''} min={0}
                    onChange={(e) => update(i, { credit: Math.floor(Number(e.target.value) || 0), debit: 0 })}
                    className={`${inp} text-right`} />
                </td>
                <td className="py-1.5 px-1">
                  <input value={r.memo} onChange={(e) => update(i, { memo: e.target.value })} className={inp} />
                </td>
                <td className="py-1.5 text-center">
                  {rows.length > 2 && (
                    <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-500">✕</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={`font-bold ${balanced ? 'text-green-700' : 'text-gray-900'}`}>
              <td className="py-2">合計</td>
              <td className="py-2 text-right tabular-nums">{formatTWD(totalDebit)}</td>
              <td className="py-2 text-right tabular-nums">{formatTWD(totalCredit)}</td>
              <td colSpan={2} className="py-2 text-xs">
                {balanced ? '✓ 借貸平衡' : <span className="text-amber-600">借貸差額 {formatTWD(Math.abs(totalDebit - totalCredit))}</span>}
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="flex items-center justify-between">
          <button onClick={addRow} className="text-sm text-blue-600 hover:text-blue-700">+ 新增一行</button>
          <button onClick={submit} disabled={!balanced || !eachOneSided}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400">
            過帳
          </button>
        </div>

        {msg && (
          <div className={`text-sm rounded-lg p-3 ${msg.kind === 'ok' ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'}`}>{msg.text}</div>
        )}
      </div>
    </div>
  )
}

const inp = 'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
