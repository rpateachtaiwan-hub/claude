import Dashboard from '../components/dashboard/Dashboard'

export default function DashboardPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="bg-white border-b border-gray-200 px-5 py-3 shrink-0">
        <h1 className="text-base font-bold text-gray-900">損益統計 Dashboard</h1>
        <p className="text-xs text-gray-400">按月份查看收入、成本與損益分析</p>
      </div>
      <Dashboard />
    </div>
  )
}
