import { describe, it, expect } from 'vitest'
import { DEFAULT_ACCOUNTS } from './accounts'
import { twoLegEntry } from './engine'
import { buildSettlement, openItems } from './settle'
import { cashFlow } from './reports'
import type { JournalEntry } from './types'

const accounts = DEFAULT_ACCOUNTS

// 賒購（應付）：借 營業成本 / 貸 應付帳款
function accrualAP(id: string, amount: number): JournalEntry {
  return { ...twoLegEntry({ date: '2026-01-10', description: '賒購', source: 'accrual', amount, debitCode: '5101', creditCode: '2101' }), id }
}
// 賒銷（應收）：借 應收帳款 / 貸 營業收入
function accrualAR(id: string, amount: number): JournalEntry {
  return { ...twoLegEntry({ date: '2026-01-10', description: '賒銷', source: 'accrual', amount, debitCode: '1141', creditCode: '4101' }), id }
}

describe('沖銷', () => {
  it('未沖清單顯示應付餘額', () => {
    const items = openItems([accrualAP('AP1', 100_000)], accounts)
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe('AP')
    expect(items[0].remaining).toBe(100_000)
  })

  it('部分沖銷後 remaining 減少、仍在清單', () => {
    const ap = accrualAP('AP1', 100_000)
    const pay = buildSettlement(openItems([ap], accounts)[0], { date: '2026-02-01', amount: 30_000, cashAccountCode: '1102' })
    const items = openItems([ap, pay], accounts)
    expect(items[0].remaining).toBe(70_000)
    // 付款沖應付：借 應付 / 貸 銀行
    expect(pay.lines.find((l) => l.accountCode === '2101')!.debit).toBe(30_000)
    expect(pay.lines.find((l) => l.accountCode === '1102')!.credit).toBe(30_000)
  })

  it('全額沖銷後從清單消失', () => {
    const ap = accrualAP('AP1', 100_000)
    const pay = buildSettlement(openItems([ap], accounts)[0], { date: '2026-02-01', amount: 100_000, cashAccountCode: '1102' })
    expect(openItems([ap, pay], accounts)).toHaveLength(0)
  })

  it('超額沖銷被拒絕', () => {
    const ap = accrualAP('AP1', 100_000)
    expect(() => buildSettlement(openItems([ap], accounts)[0], { date: '2026-02-01', amount: 120_000, cashAccountCode: '1102' })).toThrow()
  })

  it('收款沖應收：借 銀行 / 貸 應收', () => {
    const ar = accrualAR('AR1', 50_000)
    const rcv = buildSettlement(openItems([ar], accounts)[0], { date: '2026-02-01', amount: 50_000, cashAccountCode: '1102' })
    expect(rcv.lines.find((l) => l.accountCode === '1102')!.debit).toBe(50_000)
    expect(rcv.lines.find((l) => l.accountCode === '1141')!.credit).toBe(50_000)
  })

  it('應計掛帳不影響現金，沖銷時才進現金流量（營業活動）', () => {
    const ap = accrualAP('AP1', 100_000)
    const pay = buildSettlement(openItems([ap], accounts)[0], { date: '2026-02-01', amount: 100_000, cashAccountCode: '1102' })
    const cf = cashFlow([ap, pay], accounts)
    // 沖銷分錄：借 應付 / 貸 銀行 → 應付(營業)流出 100,000
    expect(cf.operatingTotal).toBe(-100_000)
    expect(cf.endingCash).toBe(-100_000)
  })
})
