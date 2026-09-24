import { describe, it, expect } from 'vitest'
import { assertBalanced, buildEntry, sumCredit, sumDebit, twoLegEntry, LedgerError } from './engine'

describe('複式簿記引擎', () => {
  it('twoLegEntry 產生借貸平衡的傳票', () => {
    const e = twoLegEntry({
      date: '2026-01-05', description: '付租金', source: 'cash',
      amount: 50_000, debitCode: '6102', creditCode: '1102',
    })
    expect(sumDebit(e.lines)).toBe(50_000)
    expect(sumCredit(e.lines)).toBe(50_000)
    expect(e.lines).toHaveLength(2)
  })

  it('不平衡的傳票被拒絕', () => {
    expect(() =>
      assertBalanced([
        { accountCode: '6102', debit: 50_000, credit: 0 },
        { accountCode: '1102', debit: 0, credit: 40_000 },
      ]),
    ).toThrow(LedgerError)
  })

  it('一行同時有借與貸被拒絕', () => {
    expect(() => assertBalanced([{ accountCode: 'x', debit: 1, credit: 1 }, { accountCode: 'y', debit: 0, credit: 0 }])).toThrow()
  })

  it('非整數金額被拒絕', () => {
    expect(() =>
      buildEntry({ date: '2026-01-01', description: 't', source: 'manual', lines: [
        { accountCode: 'a', debit: 10.5, credit: 0 },
        { accountCode: 'b', debit: 0, credit: 10.5 },
      ] }),
    ).toThrow()
  })
})
