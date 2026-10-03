import { describe, it, expect } from 'vitest'
import { UNIFIED_PRESET_ACCOUNTS } from './accounts'
import { twoLegEntry } from './engine'
import { bankingDayGaps, cashTxDates, isBankingDay } from './gapCheck'

describe('交易日缺口檢查', () => {
  it('銀行營業日判定：週末與國定假日為非營業日', () => {
    expect(isBankingDay('2026-07-13')).toBe(true) // 週一
    expect(isBankingDay('2026-07-11')).toBe(false) // 週六
    expect(isBankingDay('2026-07-12')).toBe(false) // 週日
    expect(isBankingDay('2026-02-17')).toBe(false) // 春節初一
    expect(isBankingDay('2026-10-09')).toBe(false) // 國慶連假
  })

  it('缺口偵測：跨週末不中斷、天數只算營業日、門檻過濾', () => {
    // 7/10(五) 有交易，7/20(一) 有交易 → 缺 7/13–7/17 共 5 個營業日
    const tx = new Set(['2026-07-10', '2026-07-20'])
    const gaps = bankingDayGaps(tx, '2026-07-10', '2026-07-20', 3)
    expect(gaps).toEqual([{ from: '2026-07-13', to: '2026-07-17', days: 5 }])
    // 門檻 6 → 不回報
    expect(bankingDayGaps(tx, '2026-07-10', '2026-07-20', 6)).toEqual([])
  })

  it('春節連假不算缺口：2/13(五) 與 2/23(一) 有交易即無缺口', () => {
    const tx = new Set(['2026-02-13', '2026-02-23'])
    expect(bankingDayGaps(tx, '2026-02-13', '2026-02-23', 1)).toEqual([])
  })

  it('尾端缺口：資料停在月初，之後整段回報', () => {
    const tx = new Set(['2026-08-03'])
    const gaps = bankingDayGaps(tx, '2026-08-03', '2026-08-14', 3)
    expect(gaps).toEqual([{ from: '2026-08-04', to: '2026-08-14', days: 9 }])
  })

  it('cashTxDates：只收有銀行腳的分錄、可依公司過濾；應計分錄不列入', () => {
    const entries = [
      twoLegEntry({ date: '2026-07-01', description: '現銷', source: 'cash', amount: 100, debitCode: '1102', creditCode: '4104' }),
      { ...twoLegEntry({ date: '2026-07-02', description: '現銷B', source: 'cash', amount: 100, debitCode: '1102', creditCode: '4104' }), company: 'B公司' },
      twoLegEntry({ date: '2026-07-03', description: '應計', source: 'accrual', amount: 100, debitCode: '6101', creditCode: '2101' }),
    ]
    const all = cashTxDates(entries, UNIFIED_PRESET_ACCOUNTS)
    expect(all.has('2026-07-01')).toBe(true)
    expect(all.has('2026-07-03')).toBe(false) // 應計無銀行腳
    const onlyB = cashTxDates(entries, UNIFIED_PRESET_ACCOUNTS, 'B公司')
    expect(onlyB.has('2026-07-01')).toBe(false)
    expect(onlyB.has('2026-07-02')).toBe(true)
  })
})
