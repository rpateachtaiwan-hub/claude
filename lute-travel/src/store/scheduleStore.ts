import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DailyTourSlot } from '../types'
import { MOCK_SLOTS } from '../data/mockData'

function calcPL(s: Omit<DailyTourSlot, 'profitLoss' | 'id' | 'date' | 'productCode' | 'language' | 'pax' | 'adults' | 'infants'>): number {
  return s.platformRevenue + s.cashRevenue - s.guideFee - s.driverFee - s.insuranceCost - s.miscExpense
}

function withPL(s: DailyTourSlot): DailyTourSlot {
  return { ...s, profitLoss: calcPL(s) }
}

interface ScheduleStore {
  slots: DailyTourSlot[]

  addSlot: (s: DailyTourSlot) => void
  updateSlot: (s: DailyTourSlot) => void
  deleteSlot: (id: string) => void
  getSlotsForDate: (date: string) => DailyTourSlot[]
  getSlotsForMonth: (year: number, month: number) => DailyTourSlot[]
}

export const useScheduleStore = create<ScheduleStore>()(
  persist(
    (set, get) => ({
      slots: MOCK_SLOTS.map(withPL),

      addSlot: (s) => set((st) => ({ slots: [...st.slots, withPL(s)] })),
      updateSlot: (s) => set((st) => ({ slots: st.slots.map((x) => (x.id === s.id ? withPL(s) : x)) })),
      deleteSlot: (id) => set((st) => ({ slots: st.slots.filter((x) => x.id !== id) })),

      getSlotsForDate: (date) => get().slots.filter((s) => s.date === date),
      getSlotsForMonth: (year, month) =>
        get().slots.filter((s) => {
          const d = new Date(s.date + 'T00:00:00')
          return d.getFullYear() === year && d.getMonth() + 1 === month
        }),
    }),
    { name: 'lute-schedule-v1' }
  )
)

export { calcPL }
