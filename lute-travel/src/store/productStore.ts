import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Product } from '../types'

interface ProductStore {
  products: Product[]
  modalState: 'none' | 'add' | 'edit'
  selectedProduct: Product | null

  addProduct: (p: Product) => void
  updateProduct: (p: Product) => void
  deleteProduct: (id: string) => void
  openModal: (state: 'add' | 'edit', product?: Product | null) => void
  closeModal: () => void
}

export const useProductStore = create<ProductStore>()(
  persist(
    (set) => ({
      products: [],
      modalState: 'none',
      selectedProduct: null,

      addProduct: (p) => set((s) => ({ products: [...s.products, p] })),
      updateProduct: (p) => set((s) => ({ products: s.products.map((x) => (x.id === p.id ? p : x)) })),
      deleteProduct: (id) => set((s) => ({ products: s.products.filter((x) => x.id !== id) })),
      openModal: (state, product = null) => set({ modalState: state, selectedProduct: product }),
      closeModal: () => set({ modalState: 'none', selectedProduct: null }),
    }),
    { name: 'lute-products-v1' }
  )
)
