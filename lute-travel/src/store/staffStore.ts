import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Guide, Driver } from '../types'
import { MOCK_GUIDES, MOCK_DRIVERS } from '../data/mockData'

interface StaffStore {
  guides: Guide[]
  drivers: Driver[]
  guideModal: { open: boolean; guide: Guide | null }
  driverModal: { open: boolean; driver: Driver | null }

  addGuide: (g: Guide) => void
  updateGuide: (g: Guide) => void
  deleteGuide: (id: string) => void
  addDriver: (d: Driver) => void
  updateDriver: (d: Driver) => void
  deleteDriver: (id: string) => void

  openGuideModal: (guide?: Guide | null) => void
  closeGuideModal: () => void
  openDriverModal: (driver?: Driver | null) => void
  closeDriverModal: () => void
}

export const useStaffStore = create<StaffStore>()(
  persist(
    (set) => ({
      guides: MOCK_GUIDES,
      drivers: MOCK_DRIVERS,
      guideModal: { open: false, guide: null },
      driverModal: { open: false, driver: null },

      addGuide: (g) => set((s) => ({ guides: [...s.guides, g] })),
      updateGuide: (g) => set((s) => ({ guides: s.guides.map((x) => (x.id === g.id ? g : x)) })),
      deleteGuide: (id) => set((s) => ({ guides: s.guides.filter((x) => x.id !== id) })),
      addDriver: (d) => set((s) => ({ drivers: [...s.drivers, d] })),
      updateDriver: (d) => set((s) => ({ drivers: s.drivers.map((x) => (x.id === d.id ? d : x)) })),
      deleteDriver: (id) => set((s) => ({ drivers: s.drivers.filter((x) => x.id !== id) })),

      openGuideModal: (guide = null) => set({ guideModal: { open: true, guide } }),
      closeGuideModal: () => set({ guideModal: { open: false, guide: null } }),
      openDriverModal: (driver = null) => set({ driverModal: { open: true, driver } }),
      closeDriverModal: () => set({ driverModal: { open: false, driver: null } }),
    }),
    { name: 'lute-staff-v1' }
  )
)
