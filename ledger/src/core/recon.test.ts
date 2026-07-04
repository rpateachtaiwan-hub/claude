import { describe, it, expect } from 'vitest'
import { UNIFIED_PRESET_ACCOUNTS } from './accounts'
import { rowToEntries, type RowInput } from './importMap'
import { bankBalanceAsOf, monthlyBankBalances } from './recon'
import { twoLegEntry } from './engine'

const A = UNIFIED_PRESET_ACCOUNTS

function row(p: Partial<RowInput> & Pick<RowInput, 'date' | 'description' | 'direction' | 'amount'>): RowInput {
  return { company: '菸酒', ...p } as RowInput
}

describe('銀行對帳', () => {
  it('帳上餘額 = 期初 + Σ收入 − Σ支出（截至日含當日、之後不計）', () => {
    const entries = [
      ...rowToEntries(row({ date: '2026-01-01', description: '114/12/31餘額', direction: 'in', amount: 100_000 }), '1102', A),
      ...rowToEntries(row({ date: '2026-01-05', description: '客人現金款存入', direction: 'in', amount: 50_000 }), '1102', A),
      ...rowToEntries(row({ date: '2026-01-10', description: '手續費', direction: 'out', amount: 15 }), '1102', A),
      ...rowToEntries(row({ date: '2026-02-01', description: '客人現金款存入', direction: 'in', amount: 30_000 }), '1102', A),
    ]
    expect(bankBalanceAsOf(entries, '1102', '2026-01-31')).toBe(149_985)
    expect(bankBalanceAsOf(entries, '1102', '2026-01-10')).toBe(149_985)
    expect(bankBalanceAsOf(entries, '1102', '2026-01-09')).toBe(150_000)
    expect(bankBalanceAsOf(entries, '1102', '2026-02-28')).toBe(179_985)
  })

  it('應計拆分不影響銀行餘額：銀行只在付款日動', () => {
    const pair = rowToEntries(row({ date: '2026-06-01', description: '2604健保費', direction: 'out', amount: 11_216 }), '1102', A)
    expect(pair).toHaveLength(2)
    // 4/30 應計當下銀行未動
    expect(bankBalanceAsOf(pair, '1102', '2026-04-30')).toBe(0)
    expect(bankBalanceAsOf(pair, '1102', '2026-05-31')).toBe(0)
    // 6/1 付款日才流出
    expect(bankBalanceAsOf(pair, '1102', '2026-06-01')).toBe(-11_216)
  })

  it('公司過濾：只計該公司的分錄', () => {
    const entries = [
      { ...twoLegEntry({ date: '2026-01-05', description: 'A收', source: 'cash', amount: 100, debitCode: '1101', creditCode: '4104' }), company: '菸酒' },
      { ...twoLegEntry({ date: '2026-01-06', description: 'B收', source: 'cash', amount: 900, debitCode: '1101', creditCode: '4104' }), company: '租車' },
    ]
    expect(bankBalanceAsOf(entries, '1101', '2026-12-31', '菸酒')).toBe(100)
    expect(bankBalanceAsOf(entries, '1101', '2026-12-31')).toBe(1000)
  })

  it('逐月淨變動與月底累計', () => {
    const entries = [
      ...rowToEntries(row({ date: '2026-01-01', description: '114/12/31餘額', direction: 'in', amount: 1000 }), '1102', A),
      ...rowToEntries(row({ date: '2026-01-20', description: '手續費', direction: 'out', amount: 200 }), '1102', A),
      ...rowToEntries(row({ date: '2026-03-05', description: '客人現金款存入', direction: 'in', amount: 500 }), '1102', A),
    ]
    const m = monthlyBankBalances(entries, '1102', '2026-12-31')
    expect(m).toEqual([
      { month: '2026-01', net: 800, ending: 800 },
      { month: '2026-03', net: 500, ending: 1300 },
    ])
  })
})
