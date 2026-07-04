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
// 建議科目表（酒商 + 旅行社資金往來）起步版。
// 以「套用/匯入」方式加入使用者科目表（不覆蓋既有 code），可再增修。
// isCash：現金/銀行；isOpenItem：應收/應付（作為應計拆分的控制科目）。
// =============================================================================
export const LIQUOR_PRESET_ACCOUNTS: Account[] = [
  // 資產
  { code: '1101', name: '現金/零用金', category: 'asset', normalBalance: 'debit', isCash: true },
  { code: '1102', name: '銀行存款-國泰(001035016976)', category: 'asset', normalBalance: 'debit', isCash: true },
  { code: '1103', name: '銀行存款-台企銀', category: 'asset', normalBalance: 'debit', isCash: true },
  { code: '1141', name: '應收帳款', category: 'asset', normalBalance: 'debit', isOpenItem: true },
  { code: '1150', name: '暫付/代墊款', category: 'asset', normalBalance: 'debit' },
  { code: '1180', name: '應收退稅款', category: 'asset', normalBalance: 'debit' },
  // 負債
  { code: '2101', name: '應付帳款', category: 'liability', normalBalance: 'credit', isOpenItem: true },
  { code: '2140', name: '代扣稅款(各類所得扣繳)', category: 'liability', normalBalance: 'credit' },
  { code: '2150', name: '應付薪資', category: 'liability', normalBalance: 'credit' },
  { code: '2160', name: '應付勞健保', category: 'liability', normalBalance: 'credit' },
  { code: '2201', name: '銀行借款-台企銀', category: 'liability', normalBalance: 'credit' },
  { code: '2301', name: '股東往來-旅行社', category: 'liability', normalBalance: 'credit' },
  { code: '2302', name: '股東往來-其他', category: 'liability', normalBalance: 'credit' },
  // 權益
  { code: '3101', name: '業主資本', category: 'equity', normalBalance: 'credit' },
  // 收入
  { code: '4101', name: '營業收入-信用卡', category: 'revenue', normalBalance: 'credit' },
  { code: '4102', name: '營業收入-美國運通', category: 'revenue', normalBalance: 'credit' },
  { code: '4103', name: '營業收入-電子支付(iCash/iPass)', category: 'revenue', normalBalance: 'credit' },
  { code: '4104', name: '營業收入-現金銷貨', category: 'revenue', normalBalance: 'credit' },
  { code: '4201', name: '利息收入', category: 'revenue', normalBalance: 'credit' },
  { code: '4301', name: '其他收入', category: 'revenue', normalBalance: 'credit' },
  { code: '4999', name: '待確認(收入)', category: 'revenue', normalBalance: 'credit' },
  // 成本
  { code: '5101', name: '營業成本-酒', category: 'expense', normalBalance: 'debit' },
  // 費用
  { code: '6101', name: '薪資費用', category: 'expense', normalBalance: 'debit' },
  { code: '6102', name: '租金費用', category: 'expense', normalBalance: 'debit' },
  { code: '6103', name: '勞健保費', category: 'expense', normalBalance: 'debit' },
  { code: '6104', name: '勞工退休金', category: 'expense', normalBalance: 'debit' },
  { code: '6105', name: '銀行手續費', category: 'expense', normalBalance: 'debit' },
  { code: '6106', name: '水電費', category: 'expense', normalBalance: 'debit' },
  { code: '6107', name: '運費/外送費', category: 'expense', normalBalance: 'debit' },
  { code: '6108', name: '職工福利/禮金', category: 'expense', normalBalance: 'debit' },
  { code: '6109', name: '會計/專業服務費', category: 'expense', normalBalance: 'debit' },
  { code: '6110', name: '稅捐規費', category: 'expense', normalBalance: 'debit' },
  { code: '6199', name: '雜費', category: 'expense', normalBalance: 'debit' },
  { code: '6999', name: '待確認(支出)', category: 'expense', normalBalance: 'debit' },
]
