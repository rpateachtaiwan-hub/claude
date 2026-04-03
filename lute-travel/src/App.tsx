import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
import OrdersPage   from './pages/OrdersPage'
import SchedulePage from './pages/SchedulePage'
import StaffPage    from './pages/StaffPage'
import DashboardPage from './pages/DashboardPage'
import { useScheduleStore } from './store/scheduleStore'

const NAV_ITEMS = [
  { to: '/orders',    icon: '📋', label: '訂單管理',  sub: 'Orders'   },
  { to: '/schedule',  icon: '📅', label: '排班派遣',  sub: 'Schedule' },
  { to: '/staff',     icon: '👥', label: '導遊/司機', sub: 'Staff'    },
  { to: '/dashboard', icon: '📊', label: '損益統計',  sub: 'Dashboard'},
]

function Sidebar() {
  const { slots } = useScheduleStore()
  const today = new Date().toISOString().slice(0, 10)
  const todayNoGuide = slots.filter((s) => s.date === today && !s.guideId).length

  return (
    <aside className="w-52 bg-slate-900 text-slate-300 flex flex-col shrink-0">
      <div className="px-4 pt-5 pb-4 border-b border-slate-700">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0">✈</div>
          <div>
            <p className="text-white text-sm font-bold leading-tight">路特旅行社</p>
            <p className="text-slate-500 text-[10px]">ROUTOR TRAVEL</p>
          </div>
        </div>
      </div>

      <nav className="px-2 py-3 flex-1 space-y-0.5">
        {NAV_ITEMS.map(({ to, icon, label, sub }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <span className="text-base w-5 text-center">{icon}</span>
            <div>
              <p className="leading-tight">{label}</p>
              <p className="text-[10px] opacity-60">{sub}</p>
            </div>
            {to === '/schedule' && todayNoGuide > 0 && (
              <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {todayNoGuide}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-slate-700 text-[10px] text-slate-600">
        v2.0 · 路特旅行社
      </div>
    </aside>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          <Routes>
            <Route path="/" element={<Navigate to="/orders" replace />} />
            <Route path="/orders"   element={<OrdersPage />} />
            <Route path="/schedule/*" element={<SchedulePage />} />
            <Route path="/staff"    element={<StaffPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
