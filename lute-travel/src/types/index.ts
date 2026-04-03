export interface Passenger {
  id: string
  orderRef: string   // e.g. "AWB862233=01/11"
  sequenceNo: number
  passportName: string
  dateOfBirth: string  // YYYY-MM-DD
  passportNo: string
  nationality?: string
  kakaoId?: string
  isRepresentative: boolean
}

export interface Order {
  id: string
  bookingRef: string
  orderDate: string
  tourDate: string
  productCode: string
  totalPax: number
  adults: number
  infants: number
  platform: string
  platformRevenue: number
  cashRevenue: number
  language: string
  status: 'active' | 'cancelled' | 'pending'
  statusNote?: string
  meetingTime?: string
  guideId?: string
  representativeName?: string
  phone?: string
  email?: string
  dropOffLocation?: string
  passengers: Passenger[]
}

export interface Filters {
  dateFrom: string
  dateTo: string
  platforms: string[]
  languages: string[]
  productCode: string
  status: string
  search: string
}

export type ModalState = 'none' | 'add' | 'edit' | 'detail' | 'import'

// ─── Constants ────────────────────────────────────────────────
export const PLATFORMS = ['KLOOK', 'VIATOR', 'TRIP', 'SANPU', 'JAMES巫', 'ROUTOR']
export const LANGUAGES = ['英語', '日文', '中文', '越文', '韓文']
export const PRODUCTS = [
  '06:45 日月潭一日遊',
  '08:15 野九十十',
  '09:00 台中一日遊',
  '09:45 野十黃九',
  '11:15 野十夜九份',
  '08:30 烏來一日遊',
  '太魯閣一日遊',
  '其他',
]
export const STATUS_LABELS: Record<Order['status'], string> = {
  active: '有效',
  cancelled: '取消',
  pending: '待確認',
}
export const STATUS_COLORS: Record<Order['status'], string> = {
  active: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  pending: 'bg-amber-100 text-amber-800',
}
