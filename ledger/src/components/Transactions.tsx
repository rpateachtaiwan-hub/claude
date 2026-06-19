import React from 'react'
import { useLedger } from '../store/useLedger'
import { formatTWD } from '../core/money'
import { downloadCSV, toCSV } from '../lib/csv'

export default function Transactions() {
  const { entries, accounts, deleteEntry } = useLedger()
  const accName = (code: string) => accounts.find((a) => a.code === code)?.name ?? code
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? 1 : -1))

  function exportCsv() {
    const rows = sorted.map((e) => {
      const dr = e.lines.find((l) => l.debit > 0)!
      const cr = e.lines.find((l) => l.credit > 0)!
      return [e.date, e.description, e.counterparty ?? '', accName(dr.accountCode), accName(cr.accountCode), dr.debit,
        e.source === 'accrual' ? '應計' : e.source === 'settlement' ? '沖銷' : '現金']
    })
    downloadCSV('交易明細', toCSV(['日期', '摘要', '對象', '借方科目', '貸方科目', '金額', '類型'], rows))
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-3">
      <div className="flex justify-end">
        <button onClick={exportCsv} className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">⬇ 匯出 Excel</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="px-3 py-2.5 text-left">日期</th>
              <th className="px-3 py-2.5 text-left">摘要</th>
              <th className="px-3 py-2.5 text-left">借 / 貸</th>
              <th className="px-3 py-2.5 text-right">金額</th>
              <th className="px-3 py-2.5 text-center w-10"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-gray-400">還沒有任何紀錄，去「記一筆」開始吧</td></tr>}
            {sorted.map((e) => {
              const debit = e.lines.find((l) => l.debit > 0)!
              const credit = e.lines.find((l) => l.credit > 0)!
              return (
                <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50 align-top">
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{e.date}</td>
                  <td className="px-3 py-2.5 text-gray-800">
                    {e.description}
                    {e.counterparty && <span className="text-gray-400 text-xs"> · {e.counterparty}</span>}
                    {e.source === 'accrual' && <span className="ml-1 text-[10px] text-amber-600 bg-amber-50 rounded px-1">應計</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-600">
                    借 {accName(debit.accountCode)}<br />貸 {accName(credit.accountCode)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium">{formatTWD(debit.debit)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <button onClick={() => { if (confirm('刪除這筆紀錄？')) deleteEntry(e.id) }} className="text-gray-300 hover:text-red-500">✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
