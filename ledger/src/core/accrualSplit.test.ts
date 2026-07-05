import { describe, it, expect } from 'vitest'
import { UNIFIED_PRESET_ACCOUNTS } from './accounts'
import { rowToEntries, type RowInput } from './importMap'
import { splitToAccrual, mergeToCash } from './accrualSplit'
import { openItems } from './settle'

const A = UNIFIED_PRESET_ACCOUNTS

function cashEntry(p: Partial<RowInput> & Pick<RowInput, 'date' | 'description' | 'direction' | 'amount'>) {
  const entries = rowToEntries({ company: '菸酒', ...p } as RowInput, '1102', A, { accrualOn: false })
  expect(entries).toHaveLength(1)
  return entries[0]
}

describe('事後拆為應計', () => {
  it('費用現金分錄 → 4/30 應計(借費用/貸應付) + 原日沖銷(借應付/貸銀行)，自動沖平', () => {
    const e = cashEntry({ date: '2026-06-09', description: '壹詳會計帳務服務費', direction: 'out', amount: 102445 })
    const { accrual, settlement } = splitToAccrual(e, '2026-04-30', A)
    expect(accrual.date).toBe('2026-04-30')
    expect(accrual.source).toBe('accrual')
    expect(accrual.lines.find((l) => l.accountCode === '6109')!.debit).toBe(102445)
    expect(accrual.lines.find((l) => l.accountCode === '2101')!.credit).toBe(102445)
    // 原分錄改寫為沖銷：沿用原 id 與付款日
    expect(settlement.id).toBe(e.id)
    expect(settlement.date).toBe('2026-06-09')
    expect(settlement.settles).toBe(accrual.id)
    expect(settlement.lines.find((l) => l.accountCode === '2101')!.debit).toBe(102445)
    expect(settlement.lines.find((l) => l.accountCode === '1102')!.credit).toBe(102445)
    expect(openItems([accrual, settlement], A)).toHaveLength(0)
  })

  it('收入現金分錄 → 應計(借應收/貸收入) + 收款沖銷(借銀行/貸應收)', () => {
    const e = cashEntry({ date: '2026-06-03', description: '客人現金款存入', direction: 'in', amount: 68500 })
    const { accrual, settlement } = splitToAccrual(e, '2026-05-31', A)
    expect(accrual.lines.find((l) => l.accountCode === '1141')!.debit).toBe(68500)
    expect(accrual.lines.find((l) => l.accountCode === '4104')!.credit).toBe(68500)
    expect(settlement.lines.find((l) => l.accountCode === '1102')!.debit).toBe(68500)
    expect(openItems([accrual, settlement], A)).toHaveLength(0)
  })

  it('防呆：應計日不得晚於付款日、非損益不可拆、沖銷不可再拆', () => {
    const e = cashEntry({ date: '2026-06-09', description: '手續費', direction: 'out', amount: 15 })
    expect(() => splitToAccrual(e, '2026-06-09', A)).toThrow()
    expect(() => splitToAccrual(e, '2026-07-01', A)).toThrow()
    const transfer = cashEntry({ date: '2026-06-10', description: '自行提款', direction: 'out', amount: 100000 })
    expect(() => splitToAccrual(transfer, '2026-05-31', A)).toThrow(/非損益/)
    const { settlement } = splitToAccrual(e, '2026-05-31', A)
    expect(() => splitToAccrual(settlement, '2026-04-30', A)).toThrow(/沖銷/)
  })

  it('還原：合併回單筆現金分錄（沿用原 id/付款日/摘要），與拆分前等價', () => {
    const e = cashEntry({ date: '2026-06-09', description: '壹詳會計帳務服務費', direction: 'out', amount: 102445 })
    const { accrual, settlement } = splitToAccrual(e, '2026-04-30', A)
    const merged = mergeToCash(settlement, accrual, A)
    expect(merged.id).toBe(e.id)
    expect(merged.date).toBe('2026-06-09')
    expect(merged.description).toBe('壹詳會計帳務服務費')
    expect(merged.source).toBe('cash')
    expect(merged.lines.find((l) => l.accountCode === '6109')!.debit).toBe(102445)
    expect(merged.lines.find((l) => l.accountCode === '1102')!.credit).toBe(102445)
  })

  it('控制科目編號被改（1141→1123、2101→其他）仍可拆分：依 isOpenItem 動態解析', () => {
    const chart = A.map((a) =>
      a.code === '1141' ? { ...a, code: '1123' } : a.code === '2101' ? { ...a, code: '2201X' } : a,
    )
    const out = rowToEntries({ date: '2026-06-09', description: '壹詳會計帳務服務費', direction: 'out', amount: 500, company: '菸酒' } as RowInput, '1102', chart, { accrualOn: false })
    const { accrual, settlement } = splitToAccrual(out[0], '2026-04-30', chart)
    expect(accrual.lines.find((l) => l.accountCode === '2201X')!.credit).toBe(500)
    expect(openItems([accrual, settlement], chart)).toHaveLength(0)

    const inn = rowToEntries({ date: '2026-06-09', description: '客人現金款存入', direction: 'in', amount: 700, company: '菸酒' } as RowInput, '1102', chart, { accrualOn: false })
    const r = splitToAccrual(inn[0], '2026-05-31', chart)
    expect(r.accrual.lines.find((l) => l.accountCode === '1123')!.debit).toBe(700)
    expect(openItems([r.accrual, r.settlement], chart)).toHaveLength(0)
  })

  it('匯入器自動應計同樣支援改碼後的控制科目', () => {
    const chart = A.map((a) => (a.code === '2101' ? { ...a, code: '2199' } : a))
    const entries = rowToEntries({ date: '2026-06-01', description: '2604健保費', direction: 'out', amount: 11216, company: '菸酒' } as RowInput, '1102', chart)
    expect(entries).toHaveLength(2)
    expect(entries[0].lines.find((l) => l.accountCode === '2199')!.credit).toBe(11216)
    expect(openItems(entries, chart)).toHaveLength(0)
  })

  it('還原防呆：非對應組合、部分沖銷拒絕', () => {
    const e1 = cashEntry({ date: '2026-06-09', description: 'X費用', direction: 'out', amount: 100 })
    const e2 = cashEntry({ date: '2026-06-10', description: 'Y費用', direction: 'out', amount: 200 })
    const s1 = splitToAccrual(e1, '2026-05-31', A)
    const s2 = splitToAccrual(e2, '2026-05-31', A)
    expect(() => mergeToCash(s1.settlement, s2.accrual, A)).toThrow()
  })
})
