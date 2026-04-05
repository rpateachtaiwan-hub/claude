import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom'
import OrdersPage   from './pages/OrdersPage'
import SchedulePage from './pages/SchedulePage'
import StaffPage    from './pages/StaffPage'
import DashboardPage from './pages/DashboardPage'
import LoginPage    from './pages/LoginPage'
import ProductsPage from './pages/ProductsPage'
import ChangePasswordModal from './components/ChangePasswordModal'
import { useScheduleStore } from './store/scheduleStore'
import { useOrderStore } from './store/orderStore'
import { useAuth } from './auth/useAuth'

const NAV_ITEMS = [
  { to: '/orders',    icon: '📋', label: '訂單管理',  sub: 'Orders'   },
  { to: '/schedule',  icon: '📅', label: '排班派遣',  sub: 'Schedule' },
  { to: '/staff',     icon: '👥', label: '導遊/司機', sub: 'Staff'    },
  { to: '/products',  icon: '🗂️', label: '商品管理',  sub: 'Products' },
  { to: '/dashboard', icon: '📊', label: '損益統計',  sub: 'Dashboard'},
]

function Sidebar({ onChangePw }: { onChangePw: () => void }) {
  const { slots } = useScheduleStore()
  const { logout } = useAuth()
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

      <div className="px-2 pb-2 space-y-0.5">
        <button
          onClick={onChangePw}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <span className="text-base w-5 text-center">🔑</span>
          <span>變更密碼</span>
        </button>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-red-900 hover:text-red-300 transition-colors"
        >
          <span className="text-base w-5 text-center">🚪</span>
          <span>登出</span>
        </button>
      </div>

      <div className="px-4 py-3 border-t border-slate-700 text-[10px] text-slate-600">
        v2.0 · 路特旅行社
      </div>
    </aside>
  )
}

function AuthenticatedApp() {
  const { touch, checkExpiry } = useAuth()
  const { init } = useOrderStore()
  const [showChangePw, setShowChangePw] = useState(false)

  useEffect(() => { init() }, [init])

  // Activity tracking for session timeout
  useEffect(() => {
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    const handler = () => touch()
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }))
    return () => events.forEach((e) => window.removeEventListener(e, handler))
  }, [touch])

  // Poll for session expiry every minute
  useEffect(() => {
    const id = setInterval(checkExpiry, 60_000)
    return () => clearInterval(id)
  }, [checkExpiry])

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar onChangePw={() => setShowChangePw(true)} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/orders" replace />} />
          <Route path="/orders"    element={<OrdersPage />} />
          <Route path="/schedule/*" element={<SchedulePage />} />
          <Route path="/staff"     element={<StaffPage />} />
          <Route path="/products"  element={<ProductsPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </main>
      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </div>
  )
}

export default function App() {
  const { isAuthenticated } = useAuth()

  return (
    <BrowserRouter>
      {isAuthenticated ? <AuthenticatedApp /> : <LoginPage />}
    </BrowserRouter>
  )
}
