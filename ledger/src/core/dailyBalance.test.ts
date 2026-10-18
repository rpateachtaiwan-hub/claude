import { describe, it, expect } from 'vitest'
import { twoLegEntry } from './engine'
import { CASH_ACCOUNT_CODE, bankAccountChecks, dailyBalanceId, dailyCheck, dailyNet, resolveCompany, type DailyBalance } from './dailyBalance'

const inflow = (date: string, amount: number, company = '路特菸酒', bank = CASH_ACCOUNT_CODE) =>
  ({ ...twoLegEntry({ date, description: '收', source: 'cash', amount, debitCode: bank, creditCode: '4104' }), company })
const outflow = (date: string, amount: number, company = '路特菸酒', bank = CASH_ACCOUNT_CODE) =>
  ({ ...twoLegEntry({ date, description: '付', source: 'cash', amount, debitCode: '6101', creditCode: bank }), company })
const bal = (date: string, balance: number, company = '路特菸酒', accountCode = CASH_ACCOUNT_CODE, updatedAt = '2026-10-01T00:00:00Z'): DailyBalance =>
  ({ id: dailyBalanceId(company, accountCode, date), kind: 'daily_bal', date, company, accountCode, balance, source: 'rpa', updatedAt })
const OPEN = 100_000

describe('每日餘額核對（依公司、固定 112）', () => {
  it('期初餘額 + 起算日後流水 = 推算餘額；起算日（含）前的流水不計，最新一天與銀行同日比對', () => {
    const entries = [inflow('2025-12-20', 99_000), inflow('2026-01-01', 1_000), inflow('2026-01-05', 5_000), outflow('2026-01-06', 1_200)]
    const c = dailyCheck(entries, [bal('2026-01-05', 105_000), bal('2026-01-06', 103_800)], '路特菸酒', OPEN, '2026-12-31')
    expect(c.rows.map((r) => [r.date, r.net, r.computed, r.diff])).toEqual([
      ['2026-01-05', 5_000, 105_000, 0],
      ['2026-01-06', -1_200, 103_800, 0],
    ])
    expect(c.latest).toMatchObject({ date: '2026-01-06', computed: 103_800, bank: 103_800, diff: 0 })
    expect(c.breakCount).toBe(0)
  })

  it('漏匯一筆：差異從發生日起持續，但只有發生日標為新差異', () => {
    const entries = [inflow('2026-01-05', 5_000), inflow('2026-01-08', 1_000)]
    const c = dailyCheck(entries, [bal('2026-01-05', 105_000), bal('2026-01-07', 104_700), bal('2026-01-08', 105_700)], '路特菸酒', OPEN, '2026-12-31')
    expect(c.rows.map((r) => [r.date, r.diff, r.newDiff])).toEqual([
      ['2026-01-05', 0, 0],
      ['2026-01-07', 300, 300],
      ['2026-01-08', 300, 0],
    ])
    expect(c.firstBreak).toBe('2026-01-07')
    expect(c.latest?.diff).toBe(300)
  })

  it('只計該公司的分錄：他公司碰 112 不混入；該公司碰其他科目也不計', () => {
    const entries = [inflow('2026-01-05', 100, '路特菸酒'), inflow('2026-01-05', 50, '路特租車'), inflow('2026-01-05', 7, '路特菸酒', '1101')]
    expect(dailyNet(entries, '路特菸酒').get('2026-01-05')).toBe(100)
    expect(dailyNet(entries, '路特租車').get('2026-01-05')).toBe(50)
  })

  it('同日多筆銀行餘額取最後更新者；他公司的銀行餘額不干擾', () => {
    const c = dailyCheck([inflow('2026-01-05', 10)], [
      bal('2026-01-05', 999, '路特菸酒', CASH_ACCOUNT_CODE, '2026-01-06T00:00:00Z'),
      bal('2026-01-05', 100_010, '路特菸酒', CASH_ACCOUNT_CODE, '2026-01-07T00:00:00Z'),
      bal('2026-01-05', 5, '路特租車'),
    ], '路特菸酒', OPEN, '2026-12-31')
    expect(c.latest?.diff).toBe(0)
  })

  it('帳上起算餘額（該公司 112 自開帳累計，含起算日當天）與 1/1 前分錄筆數', () => {
    const ok = dailyCheck([inflow('2025-06-01', 99_000), inflow('2026-01-01', 1_000)], [], '路特菸酒', OPEN, '2026-12-31')
    expect(ok.bookAtAnchor).toBe(100_000)
    expect(ok.anchorDiff).toBe(0)
    expect(ok.anchorEntries).toBe(2)
    const clean = dailyCheck([inflow('2026-01-05', 1_000)], [], '路特菸酒', OPEN, '2026-12-31')
    expect(clean.anchorEntries).toBe(0) // 期初不入帳的正常狀態：1/1（含）前無分錄
    expect(clean.bookAtAnchor).toBe(0)
  })
})

describe('公司名稱對照', () => {
  it('完全相同優先；前綴差異唯一命中可對到；模糊或對不到回 null', () => {
    expect(resolveCompany('路特菸酒', ['路特菸酒', '路特租車'])).toBe('路特菸酒')
    expect(resolveCompany('娛樂', ['路特娛樂', '路特菸酒'])).toBe('路特娛樂')
    expect(resolveCompany('餐飲', ['路特國際餐飲', '路特菸酒'])).toBe('路特國際餐飲')
    expect(resolveCompany('路特', ['路特娛樂', '路特菸酒'])).toBeNull()
    expect(resolveCompany('不存在', ['路特娛樂'])).toBeNull()
  })

  it('bankAccountChecks：每個設定帳號一列，公司對照系統清單', () => {
    const list = bankAccountChecks(['路特國際貿易', '路特國際餐飲', '路特娛樂', '路特旅行社', '路特租車', '路特菸酒'])
    expect(list).toHaveLength(6)
    expect(list.every((c) => c.company !== null)).toBe(true)
    const yl = list.find((c) => c.accountNo === '062035010608')!
    expect(yl.company).toBe('路特娛樂')
    expect(yl.opening).toBeGreaterThan(0)
  })
})
