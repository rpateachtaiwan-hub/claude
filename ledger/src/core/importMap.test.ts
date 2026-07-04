import { describe, it, expect } from 'vitest'
import { LIQUOR_PRESET_ACCOUNTS } from './accounts'
import { openItems } from './settle'
import {
  classifyRow, matchByDescription, parsePeriodCode, monthEndISO, isPnL, rowToEntries, planRow,
  type RowInput,
} from './importMap'

const accounts = LIQUOR_PRESET_ACCOUNTS

function row(p: Partial<RowInput> & Pick<RowInput, 'description' | 'direction'>): RowInput {
  return { date: '2026-06-01', amount: 1000, ...p }
}

describe('關鍵字配科目', () => {
  it('客人現金款存入 → 營業收入-現金銷貨(4104)', () => {
    expect(matchByDescription('客人現金款存入', accounts)?.account).toBe('4104')
  })
  it('現金款存入（無「客人」）→ 待確認(4999) 且需複核', () => {
    const m = matchByDescription('現金款存入', accounts)
    expect(m?.account).toBe('4999')
    expect(m?.review).toBe(true)
  })
  it('酒貨款相關 → 營業成本-酒(5101)', () => {
    expect(matchByDescription('Austin個人帳戶－酒貨款', accounts)?.account).toBe('5101')
    expect(matchByDescription('國貿公司(國泰)－代付酒貨款', accounts)?.account).toBe('5101')
  })
  it('周轉金 → 股東往來-旅行社(2301)', () => {
    expect(matchByDescription('旅行社－借入周轉金', accounts)?.account).toBe('2301')
  })
  it('提領 → 現金/零用金(1101)', () => {
    expect(matchByDescription('現金 (大同分行提領)', accounts)?.account).toBe('1101')
    expect(matchByDescription('自行提款 0130VCEE', accounts)?.account).toBe('1101')
  })
  it('台企銀企貸還款 → 銀行借款(2201)', () => {
    expect(matchByDescription('台企銀2606企貸還款', accounts)?.account).toBe('2201')
  })
  it('勞退在薪資之前命中，不誤配薪資', () => {
    expect(matchByDescription('2604勞工退休金', accounts)?.account).toBe('6104')
    expect(matchByDescription('2605金炫宗薪資', accounts)?.account).toBe('6101')
  })
  it('實體專屬規則優先於通用「代墊款」：Jeff個人帳戶→股東往來-其他(2302)', () => {
    expect(matchByDescription('Jeff個人帳戶－Jeff2605代墊款', accounts)?.account).toBe('2302')
  })
  it('一般員工代墊款 → 雜費(6199) 且需複核', () => {
    const m = matchByDescription('2605 郭芷妤代墊款', accounts)
    expect(m?.account).toBe('6199')
    expect(m?.review).toBe(true)
  })
  it('存剩餘零用金 → 現金/零用金(1101) 轉帳', () => {
    expect(matchByDescription('存剩餘零用金', accounts)?.account).toBe('1101')
  })
  it('未命中回 null', () => {
    expect(matchByDescription('莫名其妙的東西', accounts)).toBeNull()
  })
})

describe('期別代碼', () => {
  it('2604 → 26年4月', () => {
    expect(parsePeriodCode('2604健保費')).toEqual({ year: 2026, month: 4 })
  })
  it('同月 2606 可解析（是否拆分由 rowToEntries 判斷）', () => {
    expect(parsePeriodCode('2606內江街6號房租+車位')).toEqual({ year: 2026, month: 6 })
  })
  it('假代碼不誤判：0130VCEE(月=30)、手續費(非數字)', () => {
    expect(parsePeriodCode('0130VCEE')).toBeNull()
    expect(parsePeriodCode('手續費')).toBeNull()
  })
  it('月底計算', () => {
    expect(monthEndISO(2026, 4)).toBe('2026-04-30')
    expect(monthEndISO(2026, 2)).toBe('2026-02-28')
  })
})

describe('classifyRow fallback', () => {
  it('未命中且無類別 → 支出落 6999、需複核', () => {
    const c = classifyRow(row({ description: '???', direction: 'out' }), accounts)
    expect(c.account).toBe('6999')
    expect(c.review).toBe(true)
    expect(c.source).toBe('fallback')
  })
  it('類別覆寫可作次要 fallback', () => {
    const c = classifyRow(row({ description: '???', direction: 'out', catText: '雜項' }), accounts, { catOverride: { 雜項: '6199' } })
    expect(c.account).toBe('6199')
    expect(c.source).toBe('category')
  })
})

describe('跨期自動拆應計', () => {
  it('2604健保費 6/1 付 → 4/30 應計(借6103/貸2101) + 6/1 沖銷(借2101/貸1102)，且不留在沖銷清單', () => {
    const entries = rowToEntries(
      row({ description: '2604健保費', direction: 'out', amount: 11216 }),
      '1102', accounts,
    )
    expect(entries).toHaveLength(2)
    const [accrual, settle] = entries
    expect(accrual.source).toBe('accrual')
    expect(accrual.date).toBe('2026-04-30')
    expect(accrual.lines.find((l) => l.accountCode === '6103')!.debit).toBe(11216)
    expect(accrual.lines.find((l) => l.accountCode === '2101')!.credit).toBe(11216)
    expect(settle.source).toBe('settlement')
    expect(settle.date).toBe('2026-06-01')
    expect(settle.settles).toBe(accrual.id)
    expect(settle.lines.find((l) => l.accountCode === '2101')!.debit).toBe(11216)
    expect(settle.lines.find((l) => l.accountCode === '1102')!.credit).toBe(11216)
    // 已自動沖平 → 不在未沖清單
    expect(openItems(entries, accounts)).toHaveLength(0)
  })

  it('同月份（2606 付於 6 月）不拆，單張現金分錄', () => {
    const entries = rowToEntries(
      row({ description: '2606內江街6號房租+車位', direction: 'out', amount: 63015 }),
      '1102', accounts,
    )
    expect(entries).toHaveLength(1)
    expect(entries[0].source).toBe('cash')
    expect(entries[0].lines.find((l) => l.accountCode === '6102')!.debit).toBe(63015)
  })

  it('非損益（周轉金）即使有代碼也不拆', () => {
    const entries = rowToEntries(
      row({ description: '2604旅行社－還出周轉金', direction: 'out', amount: 300000 }),
      '1102', accounts,
    )
    expect(entries).toHaveLength(1)
    expect(entries[0].source).toBe('cash')
    expect(isPnL('2301', accounts)).toBe(false)
  })

  it('待確認（科目不確定）的跨期列不自動拆應計，維持現金＋待複核', () => {
    const entries = rowToEntries(
      row({ description: '2605 郭芷妤代墊款', direction: 'out', amount: 798 }),
      '1102', accounts,
    )
    expect(entries).toHaveLength(1)
    expect(entries[0].source).toBe('cash')
    expect(entries[0].needsReview).toBe(true)
  })

  it('全域關閉應計時不拆', () => {
    const entries = rowToEntries(
      row({ description: '2604健保費', direction: 'out', amount: 11216 }),
      '1102', accounts, { accrualOn: false },
    )
    expect(entries).toHaveLength(1)
    expect(entries[0].source).toBe('cash')
  })

  it('收入跨期：借應收/貸收入 + 收款沖銷', () => {
    const entries = rowToEntries(
      row({ description: '2604客人現金款存入', direction: 'in', amount: 5000 }),
      '1102', accounts,
    )
    expect(entries).toHaveLength(2)
    expect(entries[0].lines.find((l) => l.accountCode === '1141')!.debit).toBe(5000)
    expect(entries[0].lines.find((l) => l.accountCode === '4104')!.credit).toBe(5000)
    expect(openItems(entries, accounts)).toHaveLength(0)
  })
})

describe('planRow 預覽', () => {
  it('回報借貸科目與應計月份', () => {
    const p = planRow(row({ description: '2604健保費', direction: 'out', amount: 11216 }), '1102', accounts)
    expect(p.accrual).toBe(true)
    expect(p.accrualDate).toBe('2026-04-30')
    expect(p.account).toBe('6103')
  })
  it('一般列：借費用/貸銀行，不應計', () => {
    const p = planRow(row({ description: '手續費', direction: 'out', amount: 90 }), '1102', accounts)
    expect(p.accrual).toBe(false)
    expect(p.debitCode).toBe('6105')
    expect(p.creditCode).toBe('1102')
  })
})
