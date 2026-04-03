import { Routes, Route } from 'react-router-dom'
import MonthlyCalendar from '../components/scheduling/MonthlyCalendar'
import DailySchedule from '../components/scheduling/DailySchedule'

export default function SchedulePage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Routes>
        <Route index element={<MonthlyCalendar />} />
        <Route path=":date" element={<DailySchedule />} />
      </Routes>
    </div>
  )
}
