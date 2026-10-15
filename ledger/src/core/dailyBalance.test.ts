import { describe, it, expect } from 'vitest'
import { twoLegEntry } from './engine'
import { accountsToCheck, companyOf, dailyBalanceId, dailyCheck, dailyNet, isBankAccount, type DailyBalance } from './dailyBalance'

const inflow = (date: string, amount: number, company = '菸酒', bank = '1111') =>
  ({ ...twoLegEntry({ date, description: '收', source: 'cash', amount, debitCode: bank, creditCode: '4104' }), company })
const outflow = (date: string, amount: number, company = '菸酒', bank = '1111') =>
  ({ ...twoLegEntry({ date, description: '付', source: 'cash', amount, debitCode: '6101', creditCode: bank }), company })
const bal = (date: string, balance: number, accountCode = '1111', company = '菸酒', updatedAt = '2026-10-01T00:00:00Z'): DailyBalance =>
  ({ id: dailyBalanceId(company, accountCode, date), kind: 'daily_bal', date, company, accountCode, balance, source: 'rpa', updatedAt })
const OPEN = { '1111': 100_000 }

describe('每日餘額核對', () => {
  it('起算餘額 + 起算日後流水 = 推算餘額；起算日（含）前的流水不計，最新一天與銀行同日比對', () => {
    const entries = [inflow('2025-12-20', 99_000), inflow('2026-01-01', 1_000), inflow('2026-01-05', 5_000), outflow('2026-01-06', 1_200)]
    const c = dailyCheck(entries, [bal('2026-01-05', 105_000), bal('2026-01-06', 103_800)], '1111', '2026-12-31', OPEN)
    expect(c.rows.map((r) => [r.date, r.net, r.computed, r.diff])).toEqual([
      ['2026-01-05', 5_000, 105_000, 0],
      ['2026-01-06', -1_200, 103_800, 0],
    ])
    expect(c.latest).toMatchObject({ date: '2026-01-06', computed: 103_800, bank: 103_800, diff: 0 })
    expect(c.breakCount).toBe(0)
  })

  it('漏匯一筆：差異從發生日起持續，但只有發生日標為新差異', () => {
    const entries = [inflow('2026-01-05', 5_000), inflow('2026-01-08', 1_000)]
    const c = dailyCheck(entries, [bal('2026-01-05', 105_000), bal('2026-01-07', 104_700), bal('2026-01-08', 105_700)], '1111', '2026-12-31', OPEN)
    expect(c.rows.map((r) => [r.date, r.diff, r.newDiff])).toEqual([
      ['2026-01-05', 0, 0],
      ['2026-01-07', 300, 300],
      ['2026-01-08', 300, 0],
    ])
    expect(c.firstBreak).toBe('2026-01-07')
    expect(c.latest?.diff).toBe(300)
  })

  it('跨公司標記的分錄都計入同一銀行帳戶', () => {
    const entries = [inflow('2026-01-05', 100, '菸酒'), inflow('2026-01-05', 50, '租車')]
    expect(dailyNet(entries, '1111').get('2026-01-05')).toBe(150)
    expect(companyOf([...entries, inflow('2026-01-06', 1, '菸酒')], '1111')).toBe('菸酒')
  })

  it('同日多筆銀行餘額取最後更新者', () => {
    const c = dailyCheck([inflow('2026-01-05', 10)], [
      bal('2026-01-05', 999, '1111', '菸酒', '2026-01-06T00:00:00Z'),
      bal('2026-01-05', 100_010, '1111', '租車', '2026-01-07T00:00:00Z'),
    ], '1111', '2026-12-31', OPEN)
    expect(c.latest?.diff).toBe(0)
  })

  it('帳上起算餘額（自開帳累計，含起算日當天）vs 起算餘額', () => {
    const ok = dailyCheck([inflow('2025-06-01', 99_000), inflow('2026-01-01', 1_000)], [], '1111', '2026-12-31', OPEN)
    expect(ok.bookAtAnchor).toBe(100_000)
    expect(ok.anchorDiff).toBe(0)
    const bad = dailyCheck([inflow('2026-01-01', 1_000)], [], '1111', '2026-12-31', OPEN)
    expect(bad.anchorDiff).toBe(-99_000)
  })

  it('未設定起算餘額：不產生核對列', () => {
    const c = dailyCheck([inflow('2026-01-03', 10)], [bal('2026-01-03', 10)], '1111', '2026-12-31', {})
    expect(c.opening).toBeUndefined()
    expect(c.rows).toEqual([])
  })

  it('要核對的科目：起算日後有流水、有銀行餘額或有設定起算餘額的銀行科目', () => {
    const entries = [inflow('2026-01-05', 1, '菸酒', '1111'), inflow('2026-01-05', 1, '菸酒', '1101'), inflow('2025-12-01', 1, '菸酒', '1113')]
    const codes = accountsToCheck(entries, [bal('2026-01-05', 1, '1112')], new Set(['1111', '1112', '1113', '1114']), { '1114': 0, '1101': 5 })
    expect(codes).toEqual(['1111', '1112', '1114'])
  })
})

describe('銀行科目判定', () => {
  it('只核對名稱註明銀行帳號的匯入銀行科目', () => {
    expect(isBankAccount({ isCash: true, name: '銀行存款-國泰娛樂(062-010608)' })).toBe(true)
    expect(isBankAccount({ isCash: true, name: '銀行存款-國泰(001035016976)' })).toBe(true)
    expect(isBankAccount({ isCash: true, name: '現金/零用金' })).toBe(false)
    expect(isBankAccount({ isCash: true, name: '銀行存款-台企銀' })).toBe(false)
    expect(isBankAccount({ isCash: true, name: '定期存款' })).toBe(false)
    expect(isBankAccount({ isCash: true, name: '外幣存款-國泰(031-087072820)' })).toBe(false)
    expect(isBankAccount({ isCash: false, name: '銀行借款(031-006012)' })).toBe(false)
  })
})
