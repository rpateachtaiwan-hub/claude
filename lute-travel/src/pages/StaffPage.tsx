import React, { useState } from 'react'
import GuideTable from '../components/guides/GuideTable'
import GuideModal from '../components/guides/GuideModal'
import DriverTable from '../components/drivers/DriverTable'

export default function StaffPage() {
  const [tab, setTab] = useState<'guides' | 'drivers'>('guides')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="bg-white border-b border-gray-200 px-5 py-3 shrink-0">
        <h1 className="text-base font-bold text-gray-900 mb-3">導遊 / 司機管理</h1>
        <div className="flex gap-0 border border-gray-300 rounded-lg w-fit overflow-hidden">
          {(['guides', 'drivers'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t === 'guides' ? '🧑‍🏫 導遊' : '🚌 司機'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {tab === 'guides' ? <GuideTable /> : <DriverTable />}
      </div>
      <GuideModal />
    </div>
  )
}
