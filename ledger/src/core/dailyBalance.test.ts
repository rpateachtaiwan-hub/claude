import { describe, it, expect } from 'vitest'
import { twoLegEntry } from './engine'
import { balancePairs, dailyBalanceId, dailyCheck, dailyNet, isBankAccount, type DailyBalance } from './dailyBalance'

const inflow = (date: string, amount: number, company = '菸酒', bank = '1102') =>
  ({ ...twoLegEntry({ date, description: '收', source: 'cash', amount, debitCode: bank, creditCode: '4104' }), company })
const outflow = (date: string, amount: number, company = '菸酒', bank = '1102') =>
  ({ ...twoLegEntry({ date, description: '付', source: 'cash', amount, debitCode: '6101', creditCode: bank }), company })
const bal = (date: string, balance: number, company = '菸酒', accountCode = '1102'): DailyBalance =>
  ({ id: dailyBalanceId(company, accountCode, date), kind: 'daily_bal', date, company, accountCode, balance, updatedAt: '' })
const P = { company: '菸酒', accountCode: '1102' }

describe('每日可用餘額核對', () => {
  it('錨點 + 起算日後流水 = 推算餘額；起算日前與起算日當天的流水不計（餘額為日終）', () => {
    const entries = [inflow('2025-12-20', 999_999), inflow('2026-01-01', 7), inflow('2026-01-05', 5_000), outflow('2026-01-06', 1_200)]
    const balances = [bal('2026-01-01', 100_000), bal('2026-01-05', 105_000), bal('2026-01-06', 103_800)]
    const c = dailyCheck(entries, balances, P, '2026-12-31')
    expect(c.anchor?.balance).toBe(100_000)
    expect(c.anchorOnDate).toBe(true)
    expect(c.rows.map((r) => [r.date, r.net, r.computed, r.diff])).toEqual([
      ['2026-01-05', 5_000, 105_000, 0],
      ['2026-01-06', -1_200, 103_800, 0],
    ])
    expect(c.breakCount).toBe(0)
    expect(c.latest?.date).toBe('2026-01-06')
  })

  it('漏匯一筆：差異從發生日起持續，但只有發生日標為新差異', () => {
    // 1/7 銀行實際付出 300，系統漏記
    const entries = [inflow('2026-01-05', 5_000), inflow('2026-01-08', 1_000)]
    const balances = [bal('2026-01-01', 0), bal('2026-01-05', 5_000), bal('2026-01-07', 4_700), bal('2026-01-08', 5_700)]
    const c = dailyCheck(entries, balances, P, '2026-12-31')
    expect(c.rows.map((r) => [r.date, r.diff, r.newDiff])).toEqual([
      ['2026-01-05', 0, 0],
      ['2026-01-07', 300, 300],
      ['2026-01-08', 300, 0],
    ])
    expect(c.firstBreak).toBe('2026-01-07')
    expect(c.breakCount).toBe(1)
  })

  it('有流水但未填銀行餘額的日期列出並計數；upTo 之後不列', () => {
    const entries = [inflow('2026-01-05', 100), inflow('2026-01-06', 50), inflow('2026-02-01', 1)]
    const balances = [bal('2026-01-01', 0), bal('2026-01-06', 150)]
    const c = dailyCheck(entries, balances, P, '2026-01-31')
    expect(c.rows.map((r) => [r.date, r.computed, r.bank])).toEqual([
      ['2026-01-05', 100, undefined],
      ['2026-01-06', 150, 150],
    ])
    expect(c.missingCount).toBe(1)
    expect(c.breakCount).toBe(0)
  })

  it('起算日未填：改以之後最早一筆為錨點並標示', () => {
    const c = dailyCheck([inflow('2026-01-03', 10)], [bal('2026-01-02', 500), bal('2026-01-03', 510)], P, '2026-12-31')
    expect(c.anchor?.date).toBe('2026-01-02')
    expect(c.anchorOnDate).toBe(false)
    expect(c.latest?.diff).toBe(0)
  })

  it('起算日帳上餘額（自開帳累計，含起算日當天）vs 起算銀行餘額', () => {
    const entries = [inflow('2025-06-01', 80_000), inflow('2025-12-20', 19_000), inflow('2026-01-01', 1_000), inflow('2026-01-05', 5)]
    const ok = dailyCheck(entries, [bal('2026-01-01', 100_000)], P, '2026-12-31')
    expect(ok.bookAtAnchor).toBe(100_000)
    expect(ok.anchorDiff).toBe(0)
    const bad = dailyCheck(entries.slice(1), [bal('2026-01-01', 100_000)], P, '2026-12-31') // 漏了 2025 期初
    expect(bad.anchorDiff).toBe(-80_000)
  })

  it('無錨點：不產生核對列', () => {
    const c = dailyCheck([inflow('2026-01-03', 10)], [], P, '2026-12-31')
    expect(c.anchor).toBeUndefined()
    expect(c.rows).toEqual([])
  })

  it('公司與科目分開核對', () => {
    const entries = [inflow('2026-01-05', 100, '菸酒'), inflow('2026-01-05', 900, '租車'), inflow('2026-01-05', 7, '菸酒', '1101')]
    expect(dailyNet(entries, P).get('2026-01-05')).toBe(100)
    expect(dailyNet(entries, { company: '租車', accountCode: '1102' }).get('2026-01-05')).toBe(900)
    const pairs = balancePairs(entries, [bal('2026-01-01', 0, '旅行社', '1103')], new Set(['1101', '1102', '1103']))
    expect(pairs).toEqual([
      { company: '旅行社', accountCode: '1103' },
      { company: '租車', accountCode: '1102' },
      { company: '菸酒', accountCode: '1101' },
      { company: '菸酒', accountCode: '1102' },
    ])
  })

})

describe('銀行科目判定', () => {
  it('零用金/現金不列入，銀行存款列入', () => {
    expect(isBankAccount({ isCash: true, name: '現金/零用金' })).toBe(false)
    expect(isBankAccount({ isCash: true, name: '現金' })).toBe(false)
    expect(isBankAccount({ isCash: true, name: '銀行存款-國泰娛樂(062-010608)' })).toBe(true)
    expect(isBankAccount({ isCash: true, name: '銀行存款-台企銀' })).toBe(true)
    expect(isBankAccount({ isCash: false, name: '銀行借款' })).toBe(false)
  })
})
