import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Order, Filters, ModalState } from '../types'
import { MOCK_ORDERS } from '../data/mockData'

interface OrderStore {
  orders: Order[]
  modalState: ModalState
  selectedOrder: Order | null
  prefillData: Partial<Order> | null
  filters: Filters

  addOrder: (o: Order) => void
  updateOrder: (o: Order) => void
  deleteOrder: (id: string) => void
  cancelOrder: (id: string, note: string) => void
  openModal: (state: ModalState, order?: Order | null) => void
  openAddWithPrefill: (data: Partial<Order>) => void
  closeModal: () => void
  setFilters: (f: Partial<Filters>) => void
  resetFilters: () => void
}

const DEFAULT_FILTERS: Filters = {
  dateFrom: '', dateTo: '', platforms: [], languages: [],
  productCode: '', status: '', search: '',
}

export const useOrderStore = create<OrderStore>()(
  persist(
    (set) => ({
      orders: MOCK_ORDERS,
      modalState: 'none',
      selectedOrder: null,
      prefillData: null,
      filters: DEFAULT_FILTERS,

      addOrder: (o) => set((s) => ({ orders: [o, ...s.orders] })),
      updateOrder: (o) => set((s) => ({ orders: s.orders.map((x) => (x.id === o.id ? o : x)) })),
      deleteOrder: (id) => set((s) => ({ orders: s.orders.filter((x) => x.id !== id) })),
      cancelOrder: (id, note) =>
        set((s) => ({
          orders: s.orders.map((x) =>
            x.id === id ? { ...x, status: 'cancelled', statusNote: note } : x
          ),
        })),
      openModal: (state, order = null) =>
        set({ modalState: state, selectedOrder: order, prefillData: null }),
      openAddWithPrefill: (data) =>
        set({ modalState: 'add', selectedOrder: null, prefillData: data }),
      closeModal: () =>
        set({ modalState: 'none', selectedOrder: null, prefillData: null }),
      setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),
    }),
    { name: 'lute-orders-v2' }
  )
)
