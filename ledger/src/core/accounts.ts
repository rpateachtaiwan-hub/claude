import type { Account } from './types'

// 預設科目表（小型企業通用，可在 UI 增修）。
// isCash：現金/銀行類，用於現金流量表。isOpenItem：應收/應付。
export const DEFAULT_ACCOUNTS: Account[] = [
  // 資產
  { code: '1101', name: '現金', category: 'asset', normalBalance: 'debit', isCash: true },
  { code: '1102', name: '銀行存款', category: 'asset', normalBalance: 'debit', isCash: true },
  { code: '1141', name: '應收帳款', category: 'asset', normalBalance: 'debit', isOpenItem: true },
  { code: '1411', name: '設備', category: 'asset', normalBalance: 'debit' },
  { code: '1201', name: '預付費用', category: 'asset', normalBalance: 'debit' },
  // 負債
  { code: '2101', name: '應付帳款', category: 'liability', normalBalance: 'credit', isOpenItem: true },
  { code: '2151', name: '應付薪資', category: 'liability', normalBalance: 'credit' },
  { code: '2201', name: '銀行借款', category: 'liability', normalBalance: 'credit' },
  { code: '2161', name: '應付稅金', category: 'liability', normalBalance: 'credit' },
  // 權益
  { code: '3101', name: '業主資本', category: 'equity', normalBalance: 'credit' },
  { code: '3201', name: '業主提取', category: 'equity', normalBalance: 'debit' },
  // 收入
  { code: '4101', name: '營業收入', category: 'revenue', normalBalance: 'credit' },
  { code: '4201', name: '其他收入', category: 'revenue', normalBalance: 'credit' },
  // 費用
  { code: '5101', name: '營業成本', category: 'expense', normalBalance: 'debit' },
  { code: '6101', name: '薪資費用', category: 'expense', normalBalance: 'debit' },
  { code: '6102', name: '租金費用', category: 'expense', normalBalance: 'debit' },
  { code: '6103', name: '油料/交通費', category: 'expense', normalBalance: 'debit' },
  { code: '6104', name: '水電費', category: 'expense', normalBalance: 'debit' },
  { code: '6105', name: '銀行手續費', category: 'expense', normalBalance: 'debit' },
  { code: '6106', name: '廣告行銷費', category: 'expense', normalBalance: 'debit' },
  { code: '6199', name: '雜費', category: 'expense', normalBalance: 'debit' },
  // 待分類（匯入時無法辨識科目者暫列於此，請於明細補上正確科目）
  { code: '4999', name: '待確認(收入)', category: 'revenue', normalBalance: 'credit' },
  { code: '6999', name: '待確認(支出)', category: 'expense', normalBalance: 'debit' },
]

export const UNCLASSIFIED_IN = '4999'
export const UNCLASSIFIED_OUT = '6999'
export const PLACEHOLDER_ACCOUNTS: Account[] = DEFAULT_ACCOUNTS.filter((a) => a.code === '4999' || a.code === '6999')

export const DEFAULT_CASH_ACCOUNT = '1102' // 銀行存款
export const AR_ACCOUNT = '1141'
export const AP_ACCOUNT = '2101'
export const DEFAULT_REVENUE = '4101'
export const DEFAULT_EXPENSE = '6199'

export function accountMap(accounts: Account[]): Map<string, Account> {
  return new Map(accounts.map((a) => [a.code, a]))
}

// =============================================================================
// 多公司統一建議科目表（菸酒 / 旅行社 / 租車 / 貿易(電商) / 娛樂(KP店)）。
// 以「套用/匯入」方式加入使用者科目表（不覆蓋既有 code），可再增修。
// isCash：現金/銀行；isOpenItem：應收/應付（作為應計拆分的控制科目）。
// 股東往來-X：向 X 借為貸方餘額（負債）；借給 X 則呈借方餘額（報表顯示為負，屬正常）。
// =============================================================================
export const UNIFIED_PRESET_ACCOUNTS: Account[] = [
  // 資產
  { code: '1101', name: '現金/零用金', category: 'asset', normalBalance: 'debit', isCash: true },
  { code: '1102', name: '銀行存款-國泰(001035016976)', category: 'asset', normalBalance: 'debit', isCash: true },
  { code: '1103', name: '銀行存款-台企銀', category: 'asset', normalBalance: 'debit', isCash: true },
  { code: '1111', name: '銀行存款-國泰旅行社(031-006012)', category: 'asset', normalBalance: 'debit', isCash: true },
  { code: '1112', name: '銀行存款-國泰租車(031-007663)', category: 'asset', normalBalance: 'debit', isCash: true },
  { code: '1113', name: '銀行存款-國泰貿易(115-006712)', category: 'asset', normalBalance: 'debit', isCash: true },
  { code: '1114', name: '銀行存款-國泰娛樂(062-010608)', category: 'asset', normalBalance: 'debit', isCash: true },
  { code: '1141', name: '應收帳款', category: 'asset', normalBalance: 'debit', isOpenItem: true },
  { code: '1150', name: '暫付/代墊款', category: 'asset', normalBalance: 'debit' },
  { code: '1180', name: '應收退稅款', category: 'asset', normalBalance: 'debit' },
  // 負債
  { code: '2101', name: '應付帳款', category: 'liability', normalBalance: 'credit', isOpenItem: true },
  { code: '2140', name: '代扣稅款(各類所得扣繳)', category: 'liability', normalBalance: 'credit' },
  { code: '2150', name: '應付薪資', category: 'liability', normalBalance: 'credit' },
  { code: '2160', name: '應付勞健保', category: 'liability', normalBalance: 'credit' },
  { code: '2201', name: '銀行借款-台企銀', category: 'liability', normalBalance: 'credit' },
  { code: '2202', name: '銀行借款-玉山', category: 'liability', normalBalance: 'credit' },
  { code: '2301', name: '股東往來-旅行社', category: 'liability', normalBalance: 'credit' },
  { code: '2302', name: '股東往來-其他', category: 'liability', normalBalance: 'credit' },
  { code: '2303', name: '股東往來-娛樂', category: 'liability', normalBalance: 'credit' },
  { code: '2304', name: '股東往來-國貿', category: 'liability', normalBalance: 'credit' },
  { code: '2305', name: '股東往來-菸酒', category: 'liability', normalBalance: 'credit' },
  { code: '2306', name: '股東往來-租車', category: 'liability', normalBalance: 'credit' },
  { code: '2401', name: '長期借款-和潤(車貸)', category: 'liability', normalBalance: 'credit' },
  // 權益
  { code: '3101', name: '業主資本', category: 'equity', normalBalance: 'credit' },
  { code: '3202', name: '期初餘額', category: 'equity', normalBalance: 'credit' },
  // 收入
  { code: '4101', name: '營業收入-信用卡', category: 'revenue', normalBalance: 'credit' },
  { code: '4102', name: '營業收入-美國運通', category: 'revenue', normalBalance: 'credit' },
  { code: '4103', name: '營業收入-電子支付(iCash/iPass)', category: 'revenue', normalBalance: 'credit' },
  { code: '4104', name: '營業收入-現金銷貨', category: 'revenue', normalBalance: 'credit' },
  { code: '4105', name: '車資收入', category: 'revenue', normalBalance: 'credit' },
  { code: '4107', name: '門市營業收入(KP店)', category: 'revenue', normalBalance: 'credit' },
  { code: '4108', name: '平台收入(蝦皮/綠界)', category: 'revenue', normalBalance: 'credit' },
  { code: '4109', name: '直客收入', category: 'revenue', normalBalance: 'credit' },
  { code: '4110', name: '關係人銷貨收入', category: 'revenue', normalBalance: 'credit' },
  { code: '4111', name: '租金收入', category: 'revenue', normalBalance: 'credit' },
  { code: '4201', name: '利息收入', category: 'revenue', normalBalance: 'credit' },
  { code: '4301', name: '其他收入', category: 'revenue', normalBalance: 'credit' },
  { code: '4999', name: '待確認(收入)', category: 'revenue', normalBalance: 'credit' },
  // 成本
  { code: '5101', name: '營業成本-酒', category: 'expense', normalBalance: 'debit' },
  { code: '5103', name: '營業成本-商品', category: 'expense', normalBalance: 'debit' },
  { code: '5104', name: '營業成本-關係人進貨', category: 'expense', normalBalance: 'debit' },
  { code: '5105', name: '營業成本-車資(司機/外包)', category: 'expense', normalBalance: 'debit' },
  { code: '5201', name: '國際物流費', category: 'expense', normalBalance: 'debit' },
  { code: '5202', name: '進口稅金', category: 'expense', normalBalance: 'debit' },
  // 費用
  { code: '6101', name: '薪資費用', category: 'expense', normalBalance: 'debit' },
  { code: '6102', name: '租金費用', category: 'expense', normalBalance: 'debit' },
  { code: '6103', name: '勞健保費', category: 'expense', normalBalance: 'debit' },
  { code: '6104', name: '勞工退休金', category: 'expense', normalBalance: 'debit' },
  { code: '6105', name: '銀行手續費', category: 'expense', normalBalance: 'debit' },
  { code: '6106', name: '水電費', category: 'expense', normalBalance: 'debit' },
  { code: '6107', name: '運費/外送費', category: 'expense', normalBalance: 'debit' },
  { code: '6108', name: '職工福利/禮金', category: 'expense', normalBalance: 'debit' },
  { code: '6109', name: '專業服務費(會計/律師)', category: 'expense', normalBalance: 'debit' },
  { code: '6110', name: '稅捐規費', category: 'expense', normalBalance: 'debit' },
  { code: '6111', name: '罰款支出', category: 'expense', normalBalance: 'debit' },
  { code: '6112', name: '保險費', category: 'expense', normalBalance: 'debit' },
  { code: '6113', name: '電信費', category: 'expense', normalBalance: 'debit' },
  { code: '6199', name: '雜費', category: 'expense', normalBalance: 'debit' },
  { code: '6999', name: '待確認(支出)', category: 'expense', normalBalance: 'debit' },
]

/** @deprecated 舊名稱，保留相容；請改用 UNIFIED_PRESET_ACCOUNTS */
export const LIQUOR_PRESET_ACCOUNTS = UNIFIED_PRESET_ACCOUNTS
