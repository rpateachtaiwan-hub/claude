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
]

export const DEFAULT_CASH_ACCOUNT = '1102' // 銀行存款
export const AR_ACCOUNT = '1141'
export const AP_ACCOUNT = '2101'
export const DEFAULT_REVENUE = '4101'
export const DEFAULT_EXPENSE = '6199'

export function accountMap(accounts: Account[]): Map<string, Account> {
  return new Map(accounts.map((a) => [a.code, a]))
}
