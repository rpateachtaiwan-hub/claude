import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isSameMonth, isToday, parseISO,
} from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { useScheduleStore } from '../../store/scheduleStore'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function langColor(lang: string) {
  if (lang === '英語') return 'bg-blue-100 text-blue-700'
  if (lang === '日文') return 'bg-rose-100 text-rose-700'
  if (lang === '中文') return 'bg-purple-100 text-purple-700'
  return 'bg-gray-100 text-gray-600'
}

export default function MonthlyCalendar() {
  const nav = useNavigate()
  const { slots } = useScheduleStore()
  const [current, setCurrent] = useState(() => new Date())

  const year = current.getFullYear()
  const month = current.getMonth()
  const firstDay = startOfMonth(current)
  const lastDay  = endOfMonth(current)
  const days     = eachDayOfInterval({ start: firstDay, end: lastDay })
  // Pad start: Sunday=0
  const padStart = getDay(firstDay)
  const padEnd   = (7 - ((days.length + padStart) % 7)) % 7

  function prevMonth() { setCurrent(new Date(year, month - 1, 1)) }
  function nextMonth() { setCurrent(new Date(year, month + 1, 1)) }
  function goToday()   { setCurrent(new Date()) }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Calendar header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-1.5 rounded hover:bg-gray-100 text-gray-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
          </button>
          <h2 className="text-base font-bold text-gray-900">
            {format(current, 'yyyy年 M月', { locale: zhTW })}
          </h2>
          <button onClick={nextMonth} className="p-1.5 rounded hover:bg-gray-100 text-gray-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
          </button>
          <button onClick={goToday} className="ml-2 text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-50">
            今天
          </button>
        </div>
        <div className="text-xs text-gray-400">點擊日期查看當日排班</div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`py-2 text-center text-xs font-semibold ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-500'}`}>
            {w}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-hidden">
        {/* Pad start */}
        {Array.from({ length: padStart }).map((_, i) => (
          <div key={`ps-${i}`} className="border-b border-r border-gray-100 bg-gray-50/50" />
        ))}

        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const daySlots = slots.filter((s) => s.date === dateStr)
          const today = isToday(day)
          const weekend = getDay(day) === 0 || getDay(day) === 6
          const noGuideSlots = daySlots.filter((s) => !s.guideId).length

          return (
            <div
              key={dateStr}
              onClick={() => nav(`/schedule/${dateStr}`)}
              className={`border-b border-r border-gray-100 p-1.5 cursor-pointer hover:bg-blue-50/40 transition-colors min-h-[90px]
                ${today ? 'bg-blue-50' : ''}
              `}
            >
              {/* Day number */}
              <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full
                ${today ? 'bg-blue-600 text-white' : weekend ? (getDay(day) === 0 ? 'text-red-500' : 'text-blue-500') : 'text-gray-700'}
              `}>
                {format(day, 'd')}
              </div>

              {/* Slot mini cards */}
              <div className="space-y-0.5">
                {noGuideSlots > 0 && (
                  <div className="text-[10px] bg-amber-100 text-amber-700 rounded px-1 py-0.5 font-semibold">
                    ⚠️ {noGuideSlots} 班未排導遊
                  </div>
                )}
                {daySlots.slice(0, 3).map((s) => (
                  <div key={s.id} className={`text-[10px] rounded px-1 py-0.5 flex items-center gap-1 ${langColor(s.language)}`}>
                    <span className="font-semibold truncate max-w-[80px]">{s.productCode.split(' ')[0]}</span>
                    <span>{s.pax}人</span>
                  </div>
                ))}
                {daySlots.length > 3 && (
                  <div className="text-[10px] text-gray-400">+{daySlots.length - 3} 更多</div>
                )}
              </div>
            </div>
          )
        })}

        {/* Pad end */}
        {Array.from({ length: padEnd }).map((_, i) => (
          <div key={`pe-${i}`} className="border-b border-r border-gray-100 bg-gray-50/50" />
        ))}
      </div>
    </div>
  )
}
