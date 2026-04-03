import { useStaffStore } from '../../store/staffStore'

export default function GuideTable() {
  const { guides, drivers, openGuideModal, deleteGuide } = useStaffStore()

  function driverName(id: string) {
    return drivers.find((d) => d.id === id)?.name || id
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-700">導遊名單（{guides.length} 人）</h3>
        <button
          onClick={() => openGuideModal()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          新增導遊
        </button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
              <th className="px-4 py-2.5 text-left">中文名</th>
              <th className="px-4 py-2.5 text-left">英文名</th>
              <th className="px-4 py-2.5 text-left">電話</th>
              <th className="px-4 py-2.5 text-left">語種</th>
              <th className="px-4 py-2.5 text-left">不相容司機</th>
              <th className="px-4 py-2.5 text-left">備注</th>
              <th className="px-4 py-2.5 text-center w-20">操作</th>
            </tr>
          </thead>
          <tbody>
            {guides.map((g) => (
              <tr key={g.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5 font-semibold text-gray-900">{g.name}</td>
                <td className="px-4 py-2.5 text-gray-600">{g.englishName || '-'}</td>
                <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{g.phone}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {g.preferredLanguages.map((l) => (
                      <span key={l} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{l}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  {g.incompatibleDrivers?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {g.incompatibleDrivers.map((id) => (
                        <span key={id} className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-xs">{driverName(id)}</span>
                      ))}
                    </div>
                  ) : <span className="text-gray-400 text-xs">無</span>}
                </td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">{g.notes || '-'}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1 justify-center">
                    <button onClick={() => openGuideModal(g)} className="p-1 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    </button>
                    <button onClick={() => { if (confirm(`確定刪除 ${g.name}？`)) deleteGuide(g.id) }} className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
