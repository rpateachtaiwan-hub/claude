// ─── Order types ──────────────────────────────────────────────────────────────
export interface Passenger {
  id: string
  orderRef: string
  sequenceNo: number
  passportName: string
  dateOfBirth: string
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
  driverId?: string
  representativeName?: string
  phone?: string
  email?: string
  dropOffLocation?: string
  passengers: Passenger[]
}

// ─── Staff types ───────────────────────────────────────────────────────────────
/** 導遊與司機共用的個人 / 財務欄位 */
export interface StaffBase {
  id: string
  name: string
  englishName?: string
  dateOfBirth?: string      // 出生年月日
  idNumber?: string         // 身分證字號
  phone: string
  email?: string
  registeredAddress?: string // 戶籍地址
  mailingAddress?: string    // 通訊地址
  bankCode?: string          // 銀行代號
  branchCode?: string        // 分行代號
  bankAccount?: string       // 帳戶號碼
  accountName?: string       // 戶名
  notes?: string
}

export interface Guide extends StaffBase {
  preferredLanguages: string[]
  incompatibleDrivers?: string[]
}

export interface Driver extends StaffBase {
  licensePlate?: string
  vehicleType: '大巴' | '中巴' | '小巴' | 'VAN'
}

// ─── Scheduling types ──────────────────────────────────────────────────────────
export interface DailyTourSlot {
  id: string
  date: string
  productCode: string
  language: string
  pax: number
  adults: number
  infants: number
  guideId?: string
  driverId?: string
  vehicleType?: string
  guideFee: number
  driverFee: number
  insuranceCost: number
  platformRevenue: number
  cashRevenue: number
  miscExpense: number
  vehicleNote?: string
  profitLoss?: number
}

// ─── Filter / UI types ─────────────────────────────────────────────────────────
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

// ─── Constants ─────────────────────────────────────────────────────────────────
export const PLATFORMS = ['KLOOK', 'VIATOR', 'TRIP', 'SANPU', 'JAMES巫', 'ROUTOR']
export const LANGUAGES = ['英語', '日文', '中文', '越文', '韓文']
export const PRODUCTS = [
  '06:45 日月潭一日遊',
  '08:15 野九十十',
  '08:30 烏來一日遊',
  '08:45 十九',
  '09:00 台中一日遊',
  '09:00 陽明山北投',
  '09:45 野十黃九',
  '10:00 野十九跳石',
  '11:15 野十夜九份',
  '12:45 十九',
  '太魯閣一日遊',
  '其他',
]

export const STATUS_LABELS: Record<Order['status'], string> = {
  active: '有效', cancelled: '取消', pending: '待確認',
}
export const STATUS_COLORS: Record<Order['status'], string> = {
  active: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  pending: 'bg-amber-100 text-amber-800',
}
export const VEHICLE_TYPES = ['大巴', '中巴', '小巴', 'VAN'] as const
