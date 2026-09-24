import { describe, it, expect } from 'vitest'
import { DEFAULT_ACCOUNTS } from './accounts'
import { twoLegEntry } from './engine'
import { accountDrilldown, balanceSheet, cashFlow, profitAndLoss } from './reports'
import type { JournalEntry } from './types'

function scenario(): JournalEntry[] {
  return [
    // 1. 業主投入資本（理財活動，現金流入）
    twoLegEntry({ date: '2026-01-01', description: '業主投資', source: 'cash', amount: 1_000_000, debitCode: '1102', creditCode: '3101' }),
    // 2. 購置設備（投資活動，現金流出）
    twoLegEntry({ date: '2026-01-05', description: '買設備', source: 'cash', amount: 300_000, debitCode: '1411', creditCode: '1102' }),
    // 3. 現金銷貨（營業活動，收入）
    twoLegEntry({ date: '2026-01-10', description: '現銷', source: 'cash', amount: 500_000, debitCode: '1102', creditCode: '4101' }),
    // 4. 付租金（營業活動，費用）
    twoLegEntry({ date: '2026-01-15', description: '付租金', source: 'cash', amount: 50_000, debitCode: '6102', creditCode: '1102' }),
    // 5. 賒購成本（應計，無現金 → 不計入現金流量）
    twoLegEntry({ date: '2026-01-20', description: '賒購', source: 'accrual', amount: 200_000, debitCode: '5101', creditCode: '2101' }),
    // 6. 銀行借款（理財活動，現金流入）
    twoLegEntry({ date: '2026-01-25', description: '借款', source: 'cash', amount: 100_000, debitCode: '1102', creditCode: '2201' }),
  ]
}

const accounts = DEFAULT_ACCOUNTS

describe('損益表', () => {
  it('收入/費用/淨利正確', () => {
    const pnl = profitAndLoss(scenario(), accounts)
    expect(pnl.revenue).toBe(500_000)
    expect(pnl.expense).toBe(250_000) // 租金 50,000 + 營業成本 200,000
    expect(pnl.netIncome).toBe(250_000)
  })
})

describe('資產負債表', () => {
  it('資產 = 負債 + 權益（含累計損益）', () => {
    const bs = balanceSheet(scenario(), accounts)
    expect(bs.totalAssets).toBe(1_550_000) // 銀行 1,250,000 + 設備 300,000
    expect(bs.totalLiabilities).toBe(300_000) // 應付 200,000 + 借款 100,000
    expect(bs.retainedEarnings).toBe(250_000)
    expect(bs.totalEquity).toBe(1_250_000) // 資本 1,000,000 + 累計損益 250,000
    expect(bs.balanced).toBe(true)
  })
})

describe('現金流量表（直接法）', () => {
  it('營業/投資/理財分類正確，且淨變動 = 期末現金', () => {
    const cf = cashFlow(scenario(), accounts)
    expect(cf.operatingTotal).toBe(450_000) // 收入 500,000 − 租金 50,000
    expect(cf.investingTotal).toBe(-300_000) // 買設備
    expect(cf.financingTotal).toBe(1_100_000) // 資本 1,000,000 + 借款 100,000
    expect(cf.netChange).toBe(1_250_000)
    expect(cf.endingCash).toBe(1_250_000)
  })

  it('純應計（無現金）不出現在現金流量表', () => {
    const cf = cashFlow(scenario(), accounts)
    // 營業成本 5101 是賒購、無現金腳 → 不應出現在 operating
    expect(cf.operating.find((l) => l.code === '5101')).toBeUndefined()
  })
})

describe('報表下鑽 accountDrilldown', () => {
  it('收入科目：分錄貢獻＝貸−借，Σ明細必等於損益表數字', () => {
    const entries = [
      ...scenario(),
      twoLegEntry({ date: '2026-02-10', description: '二月現銷', source: 'cash', amount: 80_000, debitCode: '1102', creditCode: '4101' }),
    ]
    const items = accountDrilldown(entries, DEFAULT_ACCOUNTS, '4101', { from: '2026-01-01', to: '2026-01-31' })
    expect(items).toHaveLength(1)
    expect(items[0].entry.description).toBe('現銷')
    expect(items[0].amount).toBe(500_000)
    const pnl = profitAndLoss(entries, DEFAULT_ACCOUNTS, { from: '2026-01-01', to: '2026-01-31' })
    const row = pnl.rows.find((r) => r.code === '4101')!
    expect(items.reduce((s, it) => s + it.amount, 0)).toBe(row.amount)
  })

  it('費用科目：貢獻＝借−貸；期間外與未觸及該科目的分錄不列入', () => {
    const items = accountDrilldown(scenario(), DEFAULT_ACCOUNTS, '6102', { from: '2026-01-01', to: '2026-01-31' })
    expect(items).toHaveLength(1)
    expect(items[0].amount).toBe(50_000)
    const feb = accountDrilldown(scenario(), DEFAULT_ACCOUNTS, '6102', { from: '2026-02-01', to: '2026-02-28' })
    expect(feb).toHaveLength(0)
  })

  it('依日期排序、退款（負貢獻）保留正負號', () => {
    const entries = [
      twoLegEntry({ date: '2026-01-20', description: '銷貨', source: 'cash', amount: 900, debitCode: '1102', creditCode: '4101' }),
      twoLegEntry({ date: '2026-01-05', description: '銷貨退回', source: 'cash', amount: 100, debitCode: '4101', creditCode: '1102' }),
    ]
    const items = accountDrilldown(entries, DEFAULT_ACCOUNTS, '4101')
    expect(items.map((it) => it.entry.description)).toEqual(['銷貨退回', '銷貨'])
    expect(items.map((it) => it.amount)).toEqual([-100, 900])
    expect(items.reduce((s, it) => s + it.amount, 0)).toBe(800)
  })
})
