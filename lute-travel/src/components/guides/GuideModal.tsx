import React, { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { v4 as uuid } from 'uuid'
import { Guide, LANGUAGES } from '../../types'
import { useStaffStore } from '../../store/staffStore'

type FormData = Guide & { incompatibleDriversStr: string }
type Tab = 'basic' | 'bank'

export default function GuideModal() {
  const { guideModal, closeGuideModal, addGuide, updateGuide, drivers } = useStaffStore()
  const { open, guide } = guideModal
  const isEdit = !!guide
  const [tab, setTab] = useState<Tab>('basic')

  const { register, handleSubmit, reset, control } = useForm<FormData>()

  useEffect(() => {
    if (open) {
      setTab('basic')
      reset(guide
        ? { ...guide, incompatibleDriversStr: (guide.incompatibleDrivers || []).join(', ') }
        : { id: '', name: '', phone: '', preferredLanguages: [], incompatibleDriversStr: '' }
      )
    }
  }, [open, guide, reset])

  function onSubmit(data: FormData) {
    const g: Guide = {
      ...data,
      id: isEdit ? guide!.id : uuid(),
      incompatibleDrivers: data.incompatibleDriversStr
        ? data.incompatibleDriversStr.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
    }
    isEdit ? updateGuide(g) : addGuide(g)
    closeGuideModal()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-base font-bold">{isEdit ? '編輯導遊' : '新增導遊'}</h2>
          <button onClick={closeGuideModal} className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-sm text-gray-500">✕</button>
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
                  <F label="英文姓名"><input {...register('englishName')} className={inp} placeholder="Sophie" /></F>
                  <F label="出生年月日"><input {...register('dateOfBirth')} type="date" className={inp} /></F>
                  <F label="身分證字號"><input {...register('idNumber')} className={inp} placeholder="A123456789" /></F>
                  <F label="手機 *"><input {...register('phone', { required: true })} className={inp} placeholder="+886-912-345-678" /></F>
                  <F label="E-mail"><input {...register('email')} type="email" className={inp} /></F>
                </div>
                <F label="戶籍地址"><input {...register('registeredAddress')} className={inp} /></F>
                <F label="通訊地址"><input {...register('mailingAddress')} className={inp} /></F>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">語種偏好（多選）</label>
                  <Controller name="preferredLanguages" control={control} defaultValue={[]}
                    render={({ field }) => (
                      <div className="flex flex-wrap gap-2">
                        {LANGUAGES.map((l) => {
                          const checked = field.value?.includes(l)
                          return (
                            <button key={l} type="button"
                              onClick={() => field.onChange(checked ? field.value.filter((x: string) => x !== l) : [...(field.value || []), l])}
                              className={`px-3 py-1 rounded-full text-sm border transition-colors ${checked ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}
                            >{l}</button>
                          )
                        })}
                      </div>
                    )}
                  />
                </div>
                <F label="不相容司機（ID 以逗號分隔）">
                  <input {...register('incompatibleDriversStr')} className={inp} placeholder="d_weian, d2" />
                  <p className="text-xs text-gray-400 mt-1">現有司機：{drivers.map((d) => `${d.name}(${d.id})`).join('、')}</p>
                </F>
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
            <button type="button" onClick={closeGuideModal} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">取消</button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 font-medium">{isEdit ? '儲存' : '新增'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs text-gray-500 mb-1">{label}</label>{children}</div>
}

const inp = 'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
