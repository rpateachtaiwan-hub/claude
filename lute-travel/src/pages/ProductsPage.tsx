import React, { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { v4 as uuid } from 'uuid'
import { useProductStore } from '../store/productStore'
import { Product } from '../types'

export default function ProductsPage() {
  const { products, modalState, selectedProduct, addProduct, updateProduct, deleteProduct, openModal, closeModal } = useProductStore()

  const isOpen = modalState !== 'none'
  const isEdit = modalState === 'edit'

  const { register, handleSubmit, reset } = useForm<Product>()

  useEffect(() => {
    if (isOpen) {
      reset(selectedProduct || { id: '', shortName: '', emailTitle: '', platformNameZh: '', platformNameEn: '', meetingPoint: '' })
    }
  }, [isOpen, selectedProduct, reset])

  function onSubmit(data: Product) {
    const p: Product = { ...data, id: isEdit ? selectedProduct!.id : uuid() }
    isEdit ? updateProduct(p) : addProduct(p)
    closeModal()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">商品管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">維護路線商品資訊</p>
        </div>
        <button
          onClick={() => openModal('add')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          新增商品
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
            <p className="text-sm">尚無商品資料，請點擊「新增商品」</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">路特簡稱</th>
                  <th className="px-4 py-3 text-left">信件稱呼</th>
                  <th className="px-4 py-3 text-left">平台商品名稱（中）</th>
                  <th className="px-4 py-3 text-left">平台商品名稱（英）</th>
                  <th className="px-4 py-3 text-left">集合時間地點</th>
                  <th className="px-4 py-3 text-center w-20">操作</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{p.shortName}</td>
                    <td className="px-4 py-3 text-gray-700">{p.emailTitle || '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{p.platformNameZh || '-'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{p.platformNameEn || '-'}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate" title={p.meetingPoint}>{p.meetingPoint || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => openModal('edit', p)} className="p-1 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50" title="編輯">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                        </button>
                        <button onClick={() => { if (confirm(`確定刪除「${p.shortName}」？`)) deleteProduct(p.id) }} className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50" title="刪除">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-base font-bold">{isEdit ? '編輯商品' : '新增商品'}</h2>
              <button onClick={closeModal} className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-sm text-gray-500">✕</button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="px-6 py-5 grid grid-cols-2 gap-4">
                <F label="路特簡稱 *">
                  <input {...register('shortName', { required: true })} className={inp} placeholder="例：日月潭一日遊" />
                </F>
                <F label="信件稱呼 *">
                  <input {...register('emailTitle', { required: true })} className={inp} placeholder="例：日月潭一日遊" />
                </F>
                <F label="平台商品名稱（中）">
                  <input {...register('platformNameZh')} className={inp} placeholder="例：日月潭一日遊（含午餐）" />
                </F>
                <F label="平台商品名稱（英）">
                  <input {...register('platformNameEn')} className={inp} placeholder="例：Sun Moon Lake Full-Day Tour" />
                </F>
                <F label="集合時間地點" wide>
                  <input {...register('meetingPoint')} className={inp} placeholder="例：08:00 台北車站M4出口" />
                </F>
              </div>

              <div className="flex justify-end gap-2 px-6 py-4 border-t">
                <button type="button" onClick={closeModal} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">取消</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">{isEdit ? '儲存' : '新增'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function F({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inp = 'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
