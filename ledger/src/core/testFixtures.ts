import type { Account } from './types'

/** 使用者確認的自訂編號科目（測試用；名稱任意，規則對這些編號是「直接認編號」） */
export const USER_CODE_ACCOUNTS: Account[] = [
  { code: '112', name: '庫存現金', category: 'asset', normalBalance: 'debit', isCash: true },
  { code: '212', name: '借款', category: 'liability', normalBalance: 'credit' },
  { code: '402', name: '平台收入', category: 'revenue', normalBalance: 'credit' },
  { code: '521', name: '進貨-酒', category: 'expense', normalBalance: 'debit' },
  { code: '531', name: '進貨-商品', category: 'expense', normalBalance: 'debit' },
  { code: '501', name: '車資成本', category: 'expense', normalBalance: 'debit' },
  { code: '609', name: '租金支出', category: 'expense', normalBalance: 'debit' },
  { code: '610', name: '電話網路', category: 'expense', normalBalance: 'debit' },
  { code: '611', name: '水電瓦斯', category: 'expense', normalBalance: 'debit' },
  { code: '6021', name: '勞健保', category: 'expense', normalBalance: 'debit' },
  { code: '6022', name: '退休金', category: 'expense', normalBalance: 'debit' },
]
