import React, { useState } from 'react'
import { Order } from '../../types'
import { useStaffStore } from '../../store/staffStore'
import { buildDispatchMessage } from '../../utils/autoAssign'

interface Props {
  order: Order
  onClose: () => void
}

type Recipient = 'guide' | 'driver' | 'both'

export default function DispatchModal({ order, onClose }: Props) {
  const { guides, drivers } = useStaffStore()
  const [recipient, setRecipient] = useState<Recipient>('guide')
  const [copied, setCopied] = useState(false)

  const guide = guides.find((g) => g.id === order.guideId)
  const driver = drivers.find((d) => d.id === order.driverId)

  function buildMsg(role: 'guide' | 'driver') {
    const person = role === 'guide' ? guide : driver
    if (!person) return ''
    const partner = role === 'guide' ? driver : guide
    return buildDispatchMessage({
      recipientName: person.name,
      role,
      tourDate: order.tourDate,
      productCode: order.productCode,
      language: order.language,
      totalPax: order.totalPax,
      adults: order.adults,
      infants: order.infants,
      meetingTime: order.meetingTime,
      partnerName: partner?.name,
      bookingRef: order.bookingRef,
      representativeName: order.representativeName,
      phone: order.phone,
    })
  }

  const messages = {
    guide: guide ? buildMsg('guide') : '',
    driver: driver ? buildMsg('driver') : '',
  }

  const currentMsg = recipient === 'both'
    ? [messages.guide, messages.driver].filter(Boolean).join('\n\n' + '─'.repeat(30) + '\n\n')
    : messages[recipient] || ''

  const currentPerson = recipient === 'guide' ? guide : recipient === 'driver' ? driver : null

  async function copyToClipboard() {
    await navigator.clipboard.writeText(currentMsg)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function openLine() {
    const encoded = encodeURIComponent(currentMsg)
    // On mobile opens LINE; on desktop copies to clipboard as fallback
    window.open(`https://line.me/R/msg/text/?${encoded}`, '_blank')
  }

  function openEmail() {
    if (!currentPerson?.email) { copyToClipboard(); return }
    const subject = encodeURIComponent(`【路特旅行社】排班通知 ${order.tourDate}`)
    const body = encodeURIComponent(currentMsg)
    window.open(`mailto:${currentPerson.email}?subject=${subject}&body=${body}`)
  }

  function openWhatsApp() {
    const phone = currentPerson?.phone?.replace(/[^0-9+]/g, '') || ''
    const encoded = encodeURIComponent(currentMsg)
    window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank')
  }

  const hasGuide = !!guide
  const hasDriver = !!driver

  if (!hasGuide && !hasDriver) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center" onClick={(e) => e.stopPropagation()}>
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-gray-700 font-medium">尚未指派導遊或司機</p>
          <p className="text-gray-400 text-sm mt-1">請先在訂單中指派導遊/司機後再發送通知</p>
          <button onClick={onClose} className="mt-5 px-5 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">關閉</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">發送排班通知</h2>
            <p className="text-xs text-gray-400 mt-0.5">{order.tourDate} · {order.productCode}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 text-sm">✕</button>
        </div>

        {/* Recipient tabs */}
        <div className="px-5 pt-4 shrink-0">
          <div className="flex gap-2">
            {hasGuide && (
              <button
                onClick={() => setRecipient('guide')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  recipient === 'guide' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                🧑‍🏫 導遊 {guide?.name}
              </button>
            )}
            {hasDriver && (
              <button
                onClick={() => setRecipient('driver')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  recipient === 'driver' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                🚌 司機 {driver?.name}
              </button>
            )}
            {hasGuide && hasDriver && (
              <button
                onClick={() => setRecipient('both')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  recipient === 'both' ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                同時發送
              </button>
            )}
          </div>
        </div>

        {/* Message preview */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <textarea
            value={currentMsg}
            onChange={(e) => {/* allow manual edit but don't persist */void e}}
            rows={14}
            className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm font-mono text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          />
        </div>

        {/* Send buttons */}
        <div className="px-5 pb-5 shrink-0">
          <p className="text-xs text-gray-400 mb-2">選擇發送方式：</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={copyToClipboard}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              {copied ? '✅ 已複製！' : '📋 複製訊息'}
            </button>
            <button
              onClick={openLine}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#06C755] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              💬 用 LINE 發送
            </button>
            <button
              onClick={openEmail}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              ✉️ 用 Email 發送
            </button>
            <button
              onClick={openWhatsApp}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#25D366] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              💬 用 WhatsApp 發送
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
