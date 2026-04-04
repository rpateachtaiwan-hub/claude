import { create } from 'zustand'
import { Order, Filters, ModalState } from '../types'
import { MOCK_ORDERS } from '../data/mockData'
import { supabase, dbToOrder, dbToPassenger, orderToDb } from '../lib/supabase'

interface OrderStore {
  orders: Order[]
  modalState: ModalState
  selectedOrder: Order | null
  prefillData: Partial<Order> | null
  filters: Filters
  synced: boolean

  init: () => Promise<void>
  addOrder: (o: Order) => Promise<void>
  updateOrder: (o: Order) => Promise<void>
  deleteOrder: (id: string) => Promise<void>
  cancelOrder: (id: string, note: string) => Promise<void>
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

const hasSupabase = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

export const useOrderStore = create<OrderStore>()((set, get) => ({
  orders: [],
  modalState: 'none',
  selectedOrder: null,
  prefillData: null,
  filters: DEFAULT_FILTERS,
  synced: false,

  // ── Load orders from Supabase (or localStorage fallback) ──────────────────
  init: async () => {
    if (!hasSupabase) {
      // localStorage fallback
      const raw = localStorage.getItem('lute-orders-v2')
      const parsed = raw ? JSON.parse(raw) : null
      set({ orders: parsed?.state?.orders ?? MOCK_ORDERS, synced: false })
      return
    }

    const { data: orderRows } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })

    const { data: passengerRows } = await supabase
      .from('passengers')
      .select('*')

    const orders: Order[] = (orderRows ?? []).map((row) => {
      const o = dbToOrder(row)
      o.passengers = (passengerRows ?? [])
        .filter((p) => p.order_ref === o.bookingRef)
        .map(dbToPassenger)
      return o
    })

    set({ orders: orders.length ? orders : MOCK_ORDERS, synced: true })

    // Realtime subscription — new orders added by scheduled agent appear instantly
    supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        const newOrder = dbToOrder(payload.new as Record<string, unknown>)
        set((s) => {
          if (s.orders.some((o) => o.id === newOrder.id)) return s
          return { orders: [newOrder, ...s.orders] }
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        const updated = dbToOrder(payload.new as Record<string, unknown>)
        set((s) => ({
          orders: s.orders.map((o) => (o.id === updated.id ? { ...updated, passengers: o.passengers } : o)),
        }))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, (payload) => {
        set((s) => ({ orders: s.orders.filter((o) => o.id !== (payload.old as { id: string }).id) }))
      })
      .subscribe()
  },

  // ── Mutations ─────────────────────────────────────────────────────────────
  addOrder: async (o) => {
    set((s) => ({ orders: [o, ...s.orders] }))
    if (!hasSupabase) { _saveLocalStorage(get().orders); return }

    const { passengers, ...rest } = o
    await supabase.from('orders').upsert(orderToDb({ ...rest, passengers: [] }))
    if (passengers.length) {
      await supabase.from('passengers').upsert(passengers.map((p) => ({
        id: p.id, order_ref: p.orderRef, sequence_no: p.sequenceNo,
        passport_name: p.passportName, date_of_birth: p.dateOfBirth,
        passport_no: p.passportNo, nationality: p.nationality,
        kakao_id: p.kakaoId, is_representative: p.isRepresentative,
      })))
    }
  },

  updateOrder: async (o) => {
    set((s) => ({ orders: s.orders.map((x) => (x.id === o.id ? o : x)) }))
    if (!hasSupabase) { _saveLocalStorage(get().orders); return }

    const { passengers, ...rest } = o
    await supabase.from('orders').upsert(orderToDb({ ...rest, passengers: [] }))
    if (passengers.length) {
      await supabase.from('passengers').delete().eq('order_ref', o.bookingRef)
      await supabase.from('passengers').upsert(passengers.map((p) => ({
        id: p.id, order_ref: p.orderRef, sequence_no: p.sequenceNo,
        passport_name: p.passportName, date_of_birth: p.dateOfBirth,
        passport_no: p.passportNo, nationality: p.nationality,
        kakao_id: p.kakaoId, is_representative: p.isRepresentative,
      })))
    }
  },

  deleteOrder: async (id) => {
    const order = get().orders.find((o) => o.id === id)
    set((s) => ({ orders: s.orders.filter((x) => x.id !== id) }))
    if (!hasSupabase) { _saveLocalStorage(get().orders); return }
    if (order) await supabase.from('orders').delete().eq('id', id)
  },

  cancelOrder: async (id, note) => {
    set((s) => ({
      orders: s.orders.map((x) =>
        x.id === id ? { ...x, status: 'cancelled', statusNote: note } : x
      ),
    }))
    if (!hasSupabase) { _saveLocalStorage(get().orders); return }
    await supabase.from('orders').update({ status: 'cancelled', status_note: note }).eq('id', id)
  },

  // ── UI actions (no DB needed) ─────────────────────────────────────────────
  openModal: (state, order = null) =>
    set({ modalState: state, selectedOrder: order, prefillData: null }),
  openAddWithPrefill: (data) =>
    set({ modalState: 'add', selectedOrder: null, prefillData: data }),
  closeModal: () =>
    set({ modalState: 'none', selectedOrder: null, prefillData: null }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
}))

function _saveLocalStorage(orders: Order[]) {
  localStorage.setItem('lute-orders-v2', JSON.stringify({ state: { orders }, version: 0 }))
}
