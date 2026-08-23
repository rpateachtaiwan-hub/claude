// 報表：損益表 / 試算表 / 對帳檢核
import React, { useState } from 'react'
import { useAccountingStore } from '../../store/accountingStore'
import { profitAndLoss, trialBalance, reconcileControl } from '../../accounting/reports'
import { formatTWD } from '../../accounting/money'

type Tab = 'pnl' | 'tb' | 'recon'

export default function Reports() {
  const { accounts, postedLines, openItemsWithRemaining } = useAccountingStore()
  const [tab, setTab] = useState<Tab>('pnl')

  const lines = postedLines()
  const pnl = profitAndLoss(lines, accounts)
  const tb = trialBalance(lines, accounts)
  const items = openItemsWithRemaining()
  const controlAccounts = accounts.filter((a) => a.isOpenItem)

  return (
    <div className="p-6 space-y-4">
      <div className="flex gap-2">
        {([['pnl', '損益表'], ['tb', '試算表'], ['recon', '對帳檢核']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>{label}</button>
        ))}
      </div>

      {tab === 'pnl' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden max-w-2xl">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-gray-500 text-xs"><th className="px-4 py-2.5 text-left">科目</th><th className="px-4 py-2.5 text-left">類別</th><th className="px-4 py-2.5 text-right">金額</th></tr></thead>
            <tbody>
              {pnl.rows.map((r) => (
                <tr key={r.accountId} className="border-t border-gray-100">
                  <td className="px-4 py-2.5 text-gray-700">{r.code} {r.name}</td>
                  <td className="px-4 py-2.5 text-gray-400">{r.category === 'revenue' ? '收入' : '費用/成本'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatTWD(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-medium">
              <tr className="border-t border-gray-200"><td className="px-4 py-2 text-gray-600" colSpan={2}>收入合計</td><td className="px-4 py-2 text-right tabular-nums">{formatTWD(pnl.revenue)}</td></tr>
              <tr><td className="px-4 py-2 text-gray-600" colSpan={2}>費用/成本合計</td><td className="px-4 py-2 text-right tabular-nums">{formatTWD(pnl.expense)}</td></tr>
              <tr className="border-t border-gray-200 font-bold text-gray-900"><td className="px-4 py-2.5" colSpan={2}>本期淨利</td><td className={`px-4 py-2.5 text-right tabular-nums ${pnl.netIncome < 0 ? 'text-red-600' : 'text-green-700'}`}>{formatTWD(pnl.netIncome)}</td></tr>
            </tfoot>
          </table>
        </div>
      )}

      {tab === 'tb' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden max-w-2xl">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-gray-500 text-xs"><th className="px-4 py-2.5 text-left">科目</th><th className="px-4 py-2.5 text-right">借方餘額</th><th className="px-4 py-2.5 text-right">貸方餘額</th></tr></thead>
            <tbody>
              {tb.rows.map((r) => (
                <tr key={r.accountId} className="border-t border-gray-100">
                  <td className="px-4 py-2.5 text-gray-700">{r.code} {r.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.debitBalance ? formatTWD(r.debitBalance) : ''}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.creditBalance ? formatTWD(r.creditBalance) : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-bold text-gray-900">
              <tr className="border-t border-gray-200">
                <td className="px-4 py-2.5">合計 {tb.balanced ? <span className="text-green-700 text-xs">✓ 平衡</span> : <span className="text-red-600 text-xs">✗ 不平衡</span>}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatTWD(tb.totalDebit)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatTWD(tb.totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {tab === 'recon' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden max-w-3xl">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="px-4 py-2.5 text-left">控制科目</th>
              <th className="px-4 py-2.5 text-right">未沖餘額合計</th>
              <th className="px-4 py-2.5 text-right">試算表餘額</th>
              <th className="px-4 py-2.5 text-right">差額</th>
              <th className="px-4 py-2.5 text-center">檢核</th>
            </tr></thead>
            <tbody>
              {controlAccounts.map((a) => {
                const r = reconcileControl(a.id, a, items, tb)
                return (
                  <tr key={a.id} className="border-t border-gray-100">
                    <td className="px-4 py-2.5 text-gray-700">{a.code} {a.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatTWD(r.openItemsTotal)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatTWD(r.ledgerBalance)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${r.difference !== 0 ? 'text-red-600' : ''}`}>{formatTWD(r.difference)}</td>
                    <td className="px-4 py-2.5 text-center">{r.matched ? <span className="text-green-700">✓ 相符</span> : <span className="text-red-600">✗ 不符</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">未沖項 remaining 合計應等於試算表上對應應收/應付科目的餘額。</p>
        </div>
      )}
    </div>
  )
}
