import React, { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { v4 as uuid } from 'uuid'
import { Driver, VEHICLE_TYPES } from '../../types'
import { useStaffStore } from '../../store/staffStore'

type Tab = 'basic' | 'bank'

export default function DriverTable() {
  const { drivers, driverModal, openDriverModal, closeDriverModal, addDriver, updateDriver, deleteDriver } = useStaffStore()
  const { open, driver } = driverModal
  const isEdit = !!driver
  const [tab, setTab] = useState<Tab>('basic')

  const { register, handleSubmit, reset } = useForm<Driver>()

  useEffect(() => {
    if (open) {
      setTab('basic')
      reset(driver || { id: '', name: '', phone: '', vehicleType: '中巴' })
    }
  }, [open, driver, reset])

  function onSubmit(data: Driver) {
    const d: Driver = { ...data, id: isEdit ? driver!.id : uuid() }
    isEdit ? updateDriver(d) : addDriver(d)
    closeDriverModal()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-700">司機名單（{drivers.length} 人）</h3>
        <button onClick={() => openDriverModal()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          新增司機
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
              <th className="px-4 py-2.5 text-left">姓名</th>
              <th className="px-4 py-2.5 text-left">手機</th>
              <th className="px-4 py-2.5 text-left">車牌</th>
              <th className="px-4 py-2.5 text-left">車型</th>
              <th className="px-4 py-2.5 text-left">E-mail</th>
              <th className="px-4 py-2.5 text-center w-20">操作</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5 font-semibold text-gray-900">{d.name}{d.englishName ? <span className="text-gray-400 font-normal ml-1">({d.englishName})</span> : null}</td>
                <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{d.phone || '-'}</td>
                <td className="px-4 py-2.5 font-mono text-gray-700">{d.licensePlate || '-'}</td>
                <td className="px-4 py-2.5">
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-semibold">{d.vehicleType}</span>
                </td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">{d.email || '-'}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1 justify-center">
                    <button onClick={() => openDriverModal(d)} className="p-1 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    </button>
                    <button onClick={() => { if (confirm(`確定刪除 ${d.name}？`)) deleteDriver(d.id) }} className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Driver Modal */}
      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <h2 className="text-base font-bold">{isEdit ? '編輯司機' : '新增司機'}</h2>
              <button onClick={closeDriverModal} className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-sm text-gray-500">✕</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b shrink-0">
              {(['basic', 'bank'] as Tab[]).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t === 'basic' ? '基本資料' : '銀行資料'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5">
                {tab === 'basic' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <F label="類型">
                        <select {...register('staffType')} className={inp}>
                          <option value="">— 請選擇 —</option>
                          <option value="全職">全職</option>
                          <option value="兼職">兼職</option>
                          <option value="外包">外包</option>
                          <option value="其他">其他</option>
                        </select>
                      </F>
                      <F label="中文姓名 *"><input {...register('name', { required: true })} className={inp} /></F>
                      <F label="英文姓名"><input {...register('englishName')} className={inp} /></F>
                      <F label="出生年月日"><input {...register('dateOfBirth')} type="date" className={inp} /></F>
                      <F label="身分證字號"><input {...register('idNumber')} className={inp} placeholder="A123456789" /></F>
                      <F label="手機"><input {...register('phone')} className={inp} placeholder="+886-912-345-678" /></F>
                      <F label="E-mail"><input {...register('email')} type="email" className={inp} /></F>
                      <F label="車牌"><input {...register('licensePlate')} className={inp} placeholder="ABC-1234" /></F>
                      <F label="車型">
                        <select {...register('vehicleType')} className={inp}>
                          {VEHICLE_TYPES.map((v) => <option key={v}>{v}</option>)}
                        </select>
                      </F>
                    </div>
                    <F label="戶籍地址"><input {...register('registeredAddress')} className={inp} /></F>
                    <F label="通訊地址"><input {...register('mailingAddress')} className={inp} /></F>
                    <F label="備注"><input {...register('notes')} className={inp} /></F>
                  </div>
                )}
                {tab === 'bank' && (
                  <div className="space-y-4">
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                      ⚠️ 銀行資料為敏感資訊，請確保只有授權人員能存取此系統
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <F label="銀行代號"><input {...register('bankCode')} className={inp} placeholder="004" /></F>
                      <F label="分行代號"><input {...register('branchCode')} className={inp} placeholder="0012" /></F>
                      <F label="帳戶號碼"><input {...register('bankAccount')} className={inp} /></F>
                      <F label="戶名"><input {...register('accountName')} className={inp} /></F>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
                <button type="button" onClick={closeDriverModal} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">取消</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 font-medium">{isEdit ? '儲存' : '新增'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-gray-500 mb-1">{label}</label>{children}</div>
}

const inp = 'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
