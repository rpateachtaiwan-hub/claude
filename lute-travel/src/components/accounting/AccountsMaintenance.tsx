// 科目主檔（檢視）。編輯/新增待 Auth + DB 寫入接線後開放。
import React from 'react'
import { useAccountingStore } from '../../store/accountingStore'

const CAT_LABEL: Record<string, string> = {
  asset: '資產', liability: '負債', equity: '權益', revenue: '收入', expense: '費用',
}

export default function AccountsMaintenance() {
  const { accounts } = useAccountingStore()
  return (
    <div className="p-6">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden max-w-3xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="px-4 py-2.5 text-left">編號</th>
              <th className="px-4 py-2.5 text-left">科目名稱</th>
              <th className="px-4 py-2.5 text-left">類別</th>
              <th className="px-4 py-2.5 text-center">正常餘額</th>
              <th className="px-4 py-2.5 text-center">未沖追蹤</th>
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
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">科目新增/編輯將於 Auth 與資料庫寫入接線後開放（里程碑 6）。</p>
      </div>
    </div>
  )
}
