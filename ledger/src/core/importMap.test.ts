import { describe, it, expect } from 'vitest'
import { UNIFIED_PRESET_ACCOUNTS } from './accounts'
import { USER_CODE_ACCOUNTS } from './testFixtures'
import { openItems } from './settle'
import {
  classifyRow, matchByDescription, parsePeriodCode, parsePeriodEx, monthEndISO, isPnL, isOpeningBalanceRow,
  rowToEntries, planRow, dupKey, existingDupKeys, consumeDup,
  type RowInput,
} from './importMap'

// 使用者實際情境：保留大部分建議科目名稱（可改編號）＋ 自訂編號科目（112/212/402…）
const accounts = [...UNIFIED_PRESET_ACCOUNTS, ...USER_CODE_ACCOUNTS]

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
  it('酒貨款相關 → 使用者自訂 521', () => {
    expect(matchByDescription('Austin個人帳戶－酒貨款', accounts)?.account).toBe('521')
    expect(matchByDescription('國貿公司(國泰)－代付酒貨款', accounts)?.account).toBe('521')
  })
  it('周轉金 → 股東往來-旅行社(2301)', () => {
    expect(matchByDescription('旅行社－借入周轉金', accounts)?.account).toBe('2301')
  })
  it('提領/自行提款/零用金 → 使用者自訂 112', () => {
    expect(matchByDescription('現金 (大同分行提領)', accounts)?.account).toBe('112')
    expect(matchByDescription('自行提款 0130VCEE', accounts)?.account).toBe('112')
    expect(matchByDescription('存剩餘零用金', accounts)?.account).toBe('112')
  })
  it('借款統一 212：台企銀/玉山/和潤', () => {
    expect(matchByDescription('台企銀2606企貸還款', accounts)?.account).toBe('212')
    expect(matchByDescription('償還企業貸款-玉山銀行', accounts)?.account).toBe('212')
    expect(matchByDescription('償還和潤車貸-REC-0626', accounts)?.account).toBe('212')
  })
  it('勞退在薪資之前命中，不誤配薪資', () => {
    expect(matchByDescription('2604勞工退休金', accounts)?.account).toBe('6022')
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
  it('未命中回 null', () => {
    expect(matchByDescription('莫名其妙的東西', accounts)).toBeNull()
  })
  it('期初餘額列：偵測為不入帳列、不再配科目', () => {
    expect(isOpeningBalanceRow('114/12/31餘額')).toBe(true)
    expect(isOpeningBalanceRow('存剩餘零用金')).toBe(false)
    expect(matchByDescription('114/12/31餘額', accounts)).toBeNull()
  })
  it('方向感知：車資收入(in)→4105、司機車資(out)→501', () => {
    expect(matchByDescription('月結-12月車資-路特旅行社_1', accounts, 'in')?.account).toBe('4105')
    expect(matchByDescription('月結-12月車資 劉新迪', accounts, 'out')?.account).toBe('501')
  })
  it('KP店營收 → 門市營業收入(4107)', () => {
    expect(matchByDescription('KP店現金營收- 12/31- 26/1/1', accounts, 'in')?.account).toBe('4107')
  })
  it('電商平台/直客：直客收入(4109)優先於蝦皮；平台類 → 402', () => {
    expect(matchByDescription('直客收入-蝦皮未取退貨', accounts, 'in')?.account).toBe('4109')
    expect(matchByDescription('平台收入-蝦皮', accounts, 'in')?.account).toBe('402')
  })
  it('租金依方向：收租→4111、付租→609', () => {
    expect(matchByDescription('2601-RED-2682  租金', accounts, 'in')?.account).toBe('4111')
    expect(matchByDescription('租金支出', accounts, 'out')?.account).toBe('609')
  })
  it('全表重編號但名稱不變 → 名稱型規則自動跟上（存款利息→利息收入）', () => {
    const renum = UNIFIED_PRESET_ACCOUNTS.map((a, i) => ({ ...a, code: `N${String(i).padStart(3, '0')}` }))
    const m = matchByDescription('存款利息', renum, 'in')
    expect(m).not.toBeNull()
    expect(renum.find((a) => a.code === m!.account)?.name).toBe('利息收入')
  })
  it('語意衝突防護：預期名稱不存在時規則不採用（避免記錯位置）', () => {
    const chart = UNIFIED_PRESET_ACCOUNTS.map((a) => (a.code === '4201' ? { ...a, name: '某某收入' } : a))
    expect(matchByDescription('存款利息', chart, 'in')).toBeNull()
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

describe('擴充期別解析 parsePeriodEx', () => {
  it('內文獨立 YYMM token：月結-2512租車公司車資 → 2025-12', () => {
    expect(parsePeriodEx('月結-2512租車公司車資_1', 2026, 1)).toEqual({ kind: 'month', year: 2025, month: 12 })
  })
  it('單月且大於付款月 → 前一年：月結-12月車資 付於 2026-01', () => {
    expect(parsePeriodEx('月結-12月車資 劉新迪', 2026, 1)).toEqual({ kind: 'month', year: 2025, month: 12 })
  })
  it('單月且小於付款月 → 同年：月結-2月雜支 付於 2026-03', () => {
    expect(parsePeriodEx('月結-2月雜支-詹益慈', 2026, 3)).toEqual({ kind: 'month', year: 2026, month: 2 })
  })
  it('同月不拆：2606租金 付於 6 月', () => {
    expect(parsePeriodEx('2606-RED-2682  租金', 2026, 6)).toBeNull()
  })
  it('區間 → range（標待確認不自動拆）', () => {
    expect(parsePeriodEx('114年11、12月 營業稅繳費', 2026, 1)).toEqual({ kind: 'range' })
    expect(parsePeriodEx('壹詳會計1-4月帳務服務費請款', 2026, 6)).toEqual({ kind: 'range' })
  })
  it('日期片段/車號不誤判', () => {
    expect(parsePeriodEx('月結-12/16-12/31車資 簡誌言_3', 2026, 1)).toBeNull()
    expect(parsePeriodEx('自行提款 0130VCEE', 2026, 6)).toBeNull()
    expect(parsePeriodEx('償還和潤車貸-REC-0626', 2026, 1)).toBeNull()
    expect(parsePeriodEx('KP店現金營收- 12/31- 26/1/1', 2026, 1)).toBeNull()
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
  it('類別精確對應科目名，優先於關鍵字：股東往來-娛樂', () => {
    const c = classifyRow(row({ description: '娛樂公司還款', direction: 'in', catText: '股東往來-娛樂' }), accounts)
    expect(c.account).toBe('2303')
    expect(c.source).toBe('category')
  })
  it('類別為科目名前綴且唯一：長期借款 → 長期借款-和潤', () => {
    const c = classifyRow(row({ description: 'REC-0620 貸款貸款清償', direction: 'out', catText: '長期借款' }), accounts)
    expect(c.account).toBe('2401')
  })
  it('方向合理性：費用科目卻是收款（保險退費）→ 標待確認', () => {
    const c = classifyRow(row({ description: '彭士峯- RDY-3271 強制險＆任意險退費', direction: 'in' }), accounts)
    expect(c.account).toBe('6112')
    expect(c.review).toBe(true)
  })
  it('關係人銷貨（娛樂公司購買）→ 待確認(4999)，由使用者逐筆判斷', () => {
    const c = classifyRow(row({ description: '娛樂公司購買-護手霜', direction: 'in', catText: '收入' }), accounts)
    expect(c.account).toBe('4999')
    expect(c.review).toBe(true)
  })
})

describe('跨期自動拆應計', () => {
  it('2604健保費 6/1 付 → 4/30 應計(借6021/貸應付) + 6/1 沖銷(借應付/貸銀行)，且不留在沖銷清單', () => {
    const entries = rowToEntries(
      row({ description: '2604健保費', direction: 'out', amount: 11216 }),
      '1102', accounts,
    )
    expect(entries).toHaveLength(2)
    const [accrual, settle] = entries
    expect(accrual.source).toBe('accrual')
    expect(accrual.date).toBe('2026-04-30')
    expect(accrual.lines.find((l) => l.accountCode === '6021')!.debit).toBe(11216)
    expect(accrual.lines.find((l) => l.accountCode === '2101')!.credit).toBe(11216)
    expect(settle.source).toBe('settlement')
    expect(settle.date).toBe('2026-06-01')
    expect(settle.settles).toBe(accrual.id)
    expect(settle.lines.find((l) => l.accountCode === '2101')!.debit).toBe(11216)
    expect(settle.lines.find((l) => l.accountCode === '1102')!.credit).toBe(11216)
    expect(openItems(entries, accounts)).toHaveLength(0)
  })

  it('同月份（2606 付於 6 月）不拆，單張現金分錄（房租→609）', () => {
    const entries = rowToEntries(
      row({ description: '2606內江街6號房租+車位', direction: 'out', amount: 63015 }),
      '1102', accounts,
    )
    expect(entries).toHaveLength(1)
    expect(entries[0].source).toBe('cash')
    expect(entries[0].lines.find((l) => l.accountCode === '609')!.debit).toBe(63015)
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

  it('跨年度：月結-12月車資 於 2026-01-02 付 → 2025-12-31 應計(借501/貸應付)+沖銷', () => {
    const entries = rowToEntries(
      row({ date: '2026-01-02', description: '月結-12月車資 劉新迪', direction: 'out', amount: 27953 }),
      '1112', accounts,
    )
    expect(entries).toHaveLength(2)
    expect(entries[0].date).toBe('2025-12-31')
    expect(entries[0].lines.find((l) => l.accountCode === '501')!.debit).toBe(27953)
    expect(entries[1].date).toBe('2026-01-02')
    expect(openItems(entries, accounts)).toHaveLength(0)
  })

  it('2512員工薪資 於 2026-01-05 付 → 2025-12-31 應計', () => {
    const entries = rowToEntries(
      row({ date: '2026-01-05', description: '2512員工薪資', direction: 'out', amount: 577392 }),
      '1111', accounts,
    )
    expect(entries).toHaveLength(2)
    expect(entries[0].date).toBe('2025-12-31')
    expect(entries[0].lines.find((l) => l.accountCode === '6101')!.debit).toBe(577392)
  })

  it('區間（11、12月營業稅）不拆應計、標待確認', () => {
    const entries = rowToEntries(
      row({ date: '2026-01-14', description: '114年11、12月 營業稅繳費', direction: 'out', amount: 49083 }),
      '1112', accounts,
    )
    expect(entries).toHaveLength(1)
    expect(entries[0].source).toBe('cash')
    expect(entries[0].needsReview).toBe(true)
    expect(entries[0].lines.find((l) => l.accountCode === '6110')!.debit).toBe(49083)
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

describe('重複偵測（次數式）', () => {
  it('摘要去空白後視為相同：2604健保費 vs 2604 健保費', () => {
    expect(dupKey('2026-06-01', 11216, '2604健保費', '菸酒')).toBe(dupKey('2026-06-01', 11216, '2604 健保費', '菸酒'))
  })

  it('次數比對：系統已有 2 筆、檔案 3 筆 → 略過 2、保留 1', () => {
    const mk = () => rowToEntries(row({ date: '2026-03-31', description: '春季燃料費', direction: 'out', amount: 1850, company: '租車' }), '1112', accounts)[0]
    const existing = existingDupKeys([mk(), mk()])
    const remaining = new Map(existing)
    const hits = [1, 2, 3].map(() => consumeDup(remaining, '2026-03-31', 1850, '春季燃料費', '租車'))
    expect(hits).toEqual([true, true, false])
  })

  it('應計+沖銷組在系統中 → 以「付款日+原摘要」比對命中檔案付款列', () => {
    const pair = rowToEntries(row({ date: '2026-06-01', description: '2604健保費', direction: 'out', amount: 11216, company: '菸酒' }), '1102', accounts)
    expect(pair).toHaveLength(2)
    const keys = existingDupKeys(pair)
    const remaining = new Map(keys)
    expect(consumeDup(remaining, '2026-06-01', 11216, '2604 健保費', '菸酒')).toBe(true)
    // 應計分錄本身不產生鍵（非銀行流水）
    expect([...keys.values()].reduce((a, b) => a + b, 0)).toBe(1)
  })
})

describe('planRow 預覽', () => {
  it('回報借貸科目與應計月份', () => {
    const p = planRow(row({ description: '2604健保費', direction: 'out', amount: 11216 }), '1102', accounts)
    expect(p.accrual).toBe(true)
    expect(p.accrualDate).toBe('2026-04-30')
    expect(p.account).toBe('6021')
  })
  it('一般列：借費用/貸銀行，不應計', () => {
    const p = planRow(row({ description: '手續費', direction: 'out', amount: 90 }), '1102', accounts)
    expect(p.accrual).toBe(false)
    expect(p.debitCode).toBe('6105')
    expect(p.creditCode).toBe('1102')
  })
})
