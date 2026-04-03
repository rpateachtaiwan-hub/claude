import React, { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { v4 as uuid } from 'uuid'
import { Guide, LANGUAGES } from '../../types'
import { useStaffStore } from '../../store/staffStore'

export default function GuideModal() {
  const { guideModal, closeGuideModal, addGuide, updateGuide, drivers } = useStaffStore()
  const { open, guide } = guideModal
  const isEdit = !!guide

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<Guide & { incompatibleDriversStr: string }>()

  useEffect(() => {
    if (open) {
      reset(guide
        ? { ...guide, incompatibleDriversStr: (guide.incompatibleDrivers || []).join(',') }
        : { id: '', name: '', phone: '', preferredLanguages: [], incompatibleDriversStr: '' }
      )
    }
  }, [open, guide, reset])

  function onSubmit(data: Guide & { incompatibleDriversStr: string }) {
    const g: Guide = {
      id: isEdit ? guide!.id : uuid(),
      name: data.name,
      englishName: data.englishName,
      phone: data.phone,
      preferredLanguages: data.preferredLanguages,
      notes: data.notes,
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-bold">{isEdit ? '編輯導遊' : '新增導遊'}</h2>
          <button onClick={closeGuideModal} className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-sm text-gray-500">✕</button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">中文姓名 *</label>
              <input {...register('name', { required: true })} className={inp} />
            </div>
            <div>
              <label className="label">英文名</label>
              <input {...register('englishName')} className={inp} placeholder="Sophie" />
            </div>
            <div>
              <label className="label">電話</label>
              <input {...register('phone')} className={inp} placeholder="+886-..." />
            </div>
            <div>
              <label className="label">備注</label>
              <input {...register('notes')} className={inp} />
            </div>
          </div>

          <div>
            <label className="label">語種偏好（多選）</label>
            <Controller
              name="preferredLanguages"
              control={control}
              defaultValue={[]}
              render={({ field }) => (
                <div className="flex flex-wrap gap-2 mt-1">
                  {LANGUAGES.map((l) => {
                    const checked = field.value?.includes(l)
                    return (
                      <button
                        key={l}
                        type="button"
                        onClick={() => {
                          const next = checked
                            ? field.value.filter((x: string) => x !== l)
                            : [...(field.value || []), l]
                          field.onChange(next)
                        }}
                        className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                          checked ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'
                        }`}
                      >
                        {l}
                      </button>
                    )
                  })}
                </div>
              )}
            />
          </div>

          <div>
            <label className="label">不相容司機（ID 以逗號分隔）</label>
            <input {...register('incompatibleDriversStr')} className={inp} placeholder="d_weian, d2" />
            <p className="text-xs text-gray-400 mt-1">可用司機ID：{drivers.map((d) => `${d.id}(${d.name})`).join(', ')}</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={closeGuideModal} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">取消</button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 font-medium">
              {isEdit ? '儲存' : '新增'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inp = 'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
