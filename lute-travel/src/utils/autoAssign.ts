import { Guide, Driver, DailyTourSlot } from '../types'

interface AutoAssignResult {
  guide: Guide | null
  driver: Driver | null
  reason: string
}

/**
 * 根據行程日期與語言，自動建議可用的導遊和司機
 * 規則：
 * 1. 導遊語種需符合訂單語言
 * 2. 導遊/司機當天未被其他 slot 佔用
 * 3. 導遊與司機無不相容關係
 */
export function autoAssign(
  tourDate: string,
  language: string,
  guides: Guide[],
  drivers: Driver[],
  slots: DailyTourSlot[],
  excludeOrderId?: string
): AutoAssignResult {
  if (!tourDate) return { guide: null, driver: null, reason: '請先填寫出發日期' }

  const daySlots = slots.filter((s) => s.date === tourDate)
  const busyGuideIds = new Set(daySlots.map((s) => s.guideId).filter(Boolean) as string[])
  const busyDriverIds = new Set(daySlots.map((s) => s.driverId).filter(Boolean) as string[])

  // 可用導遊：語種符合 + 當天無排班
  const availableGuides = guides.filter(
    (g) => g.preferredLanguages.includes(language) && !busyGuideIds.has(g.id)
  )

  // 若找不到符合語種的，退而求其次找任意空閒導遊
  const fallbackGuides = availableGuides.length > 0
    ? availableGuides
    : guides.filter((g) => !busyGuideIds.has(g.id))

  const suggestedGuide = fallbackGuides[0] ?? null

  // 可用司機：當天無排班 + 與建議導遊不衝突
  const incompatible = suggestedGuide?.incompatibleDrivers ?? []
  const availableDrivers = drivers.filter(
    (d) => !busyDriverIds.has(d.id) && !incompatible.includes(d.id)
  )
  const suggestedDriver = availableDrivers[0] ?? null

  let reason = ''
  if (!suggestedGuide) reason = '當天所有導遊已排滿'
  else if (!availableGuides.length && fallbackGuides.length) reason = `無 ${language} 導遊，建議備用導遊`
  else reason = `建議最佳人選`

  return { guide: suggestedGuide, driver: suggestedDriver, reason }
}

/**
 * 產生排班通知訊息（給導遊或司機）
 */
export function buildDispatchMessage(params: {
  recipientName: string
  role: 'guide' | 'driver'
  tourDate: string
  productCode: string
  language: string
  totalPax: number
  adults: number
  infants: number
  meetingTime?: string
  partnerName?: string   // 司機名（給導遊看）或導遊名（給司機看）
  bookingRef?: string
  representativeName?: string
  phone?: string
  companyName?: string
}): string {
  const {
    recipientName, role, tourDate, productCode, language,
    totalPax, adults, infants, meetingTime, partnerName,
    bookingRef, representativeName, phone, companyName = '路特旅行社',
  } = params

  const roleLabel = role === 'guide' ? '導遊' : '司機'
  const partnerLabel = role === 'guide' ? '司機' : '導遊'
  const paxDetail = infants > 0 ? `${totalPax} 人（成人 ${adults}、嬰兒 ${infants}）` : `${totalPax} 人`

  const lines = [
    `【${companyName} 排班通知】`,
    ``,
    `親愛的${recipientName}${roleLabel}，`,
    `以下是您的排班資訊，請確認：`,
    ``,
    `📅 日期：${tourDate}`,
    `🗺 行程：${productCode}`,
    `🌐 語言：${language}`,
    `👥 人數：${paxDetail}`,
    meetingTime ? `⏰ 集合時間：${meetingTime}` : null,
    partnerName ? `🤝 搭配${partnerLabel}：${partnerName}` : null,
    ``,
    bookingRef ? `📋 訂單編號：${bookingRef}` : null,
    representativeName ? `👤 代表旅客：${representativeName}` : null,
    phone ? `📞 聯絡電話：${phone}` : null,
    ``,
    `如有疑問請盡速聯繫我們，謝謝！`,
    ``,
    `— ${companyName}`,
  ]

  return lines.filter((l) => l !== null).join('\n')
}
