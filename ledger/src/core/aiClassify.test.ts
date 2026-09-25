import { describe, it, expect } from 'vitest'
import { UNIFIED_PRESET_ACCOUNTS } from './accounts'
import { USER_CODE_ACCOUNTS } from './testFixtures'
import { twoLegEntry } from './engine'
import { rowToEntries, planRow, type RowInput } from './importMap'
import {
  AI_CONFIDENCE_THRESHOLD,
  buildHistoryExamples, buildClassifySystem, buildClassifyUser, parseClassifyResponse,
  type AiRowInput,
} from './aiClassify'

const A = [...UNIFIED_PRESET_ACCOUNTS, ...USER_CODE_ACCOUNTS]

describe('AI 分類：歷史範例檢索', () => {
  const history = [
    twoLegEntry({ date: '2026-01-05', description: '月結-12月車資 劉新迪', source: 'cash', amount: 27953, debitCode: '501', creditCode: '1102' }),
    twoLegEntry({ date: '2026-02-05', description: '月結-1月車資 詹益慈', source: 'cash', amount: 18000, debitCode: '501', creditCode: '1102' }),
    twoLegEntry({ date: '2026-01-10', description: '2601員工薪資', source: 'cash', amount: 500000, debitCode: '6101', creditCode: '1102' }),
    { ...twoLegEntry({ date: '2026-01-11', description: '莫名支出', source: 'cash', amount: 100, debitCode: '6999', creditCode: '1102' }), needsReview: true },
  ]

  it('相似摘要的已分類紀錄被撈出；待確認紀錄不作為範例', () => {
    const targets: AiRowInput[] = [{ description: '月結-2月車資 馮啓宇', direction: 'out', amount: 9000, date: '2026-03-05' }]
    const ex = buildHistoryExamples(targets, history, A)
    expect(ex.some((e) => e.description.includes('車資') && e.account === '501')).toBe(true)
    expect(ex.some((e) => e.description === '莫名支出')).toBe(false)
  })

  it('同摘要去重、cap 上限生效', () => {
    const many = Array.from({ length: 300 }, (_, i) =>
      twoLegEntry({ date: '2026-01-01', description: `樣本${i}`, source: 'cash', amount: 10, debitCode: '6199', creditCode: '1102' }))
    const ex = buildHistoryExamples([{ description: '樣本1', direction: 'out', amount: 10, date: '2026-02-01' }], many, A, 50)
    expect(ex.length).toBeLessThanOrEqual(50)
  })
})

describe('AI 分類：prompt 與解析', () => {
  it('system 含科目表、user 含列資料與歷史範例', () => {
    const sys = buildClassifySystem(A)
    expect(sys).toContain('6101')
    expect(sys).toContain('薪資費用')
    const user = buildClassifyUser(
      [{ description: '網銀轉帳', direction: 'out', amount: 500, date: '2026-08-01', company: '租車', ruleSuggestion: '6199' }],
      [{ description: '月結-12月車資', account: '501' }],
    )
    expect(user).toContain('網銀轉帳')
    expect(user).toContain('規則建議:6199')
    expect(user).toContain('月結-12月車資')
  })

  it('解析：含 code fence、對齊列編號、無效/現金科目剔除、往來科目開放、信心夾限', () => {
    const text = '```json\n[' +
      '{"i":0,"account":"6101","confidence":95,"reason":"薪資"},' +
      '{"i":1,"account":"9999","confidence":90},' + // 不存在 → null
      '{"i":2,"account":"1102","confidence":88},' + // 現金科目 → null
      '{"i":3,"account":"6199","confidence":150},' + // 夾限到 100
      '{"i":4,"account":"1141","confidence":85,"reason":"關係企業還款"},' + // 應收(需沖銷)科目 → 開放直接入帳
      '{"i":9,"account":"6101","confidence":80}' + // 超出範圍 → 忽略
      ']\n```'
    const out = parseClassifyResponse(text, 5, A)
    expect(out[0]).toEqual({ account: '6101', confidence: 95, reason: '薪資' })
    expect(out[1]).toBeNull()
    expect(out[2]).toBeNull()
    expect(out[3]?.confidence).toBe(100)
    expect(out[4]).toEqual({ account: '1141', confidence: 85, reason: '關係企業還款' })
  })

  it('往來科目經 AI 入帳＝單純現金分錄（借銀行/貸應收），不產生應計掛帳', () => {
    const r: RowInput = { date: '2026-08-20', amount: 100000, direction: 'in', description: '網銀轉帳 關係企業借款', company: '租車' }
    const entries = rowToEntries(r, '1112', A, { ai: { account: '1141', confidence: 88, model: 'claude-opus-5', at: 'x' } })
    expect(entries).toHaveLength(1)
    expect(entries[0].source).toBe('cash')
    expect(entries[0].lines.find((l) => l.accountCode === '1112')!.debit).toBe(100000)
    expect(entries[0].lines.find((l) => l.accountCode === '1141')!.credit).toBe(100000)
    expect(entries[0].needsReview).toBeFalsy()
  })

  it('解析：非 JSON 回傳全 null，不拋錯', () => {
    const out = parseClassifyResponse('抱歉我無法判斷', 2, A)
    expect(out).toEqual([null, null])
  })
})

describe('AI 分類：匯入管線整合（aiOverride）', () => {
  const row: RowInput = { date: '2026-08-01', amount: 500, direction: 'out', description: '網銀轉帳', company: '租車' }
  const meta = (confidence: number) => ({ account: '6199', confidence, reason: '測試', model: 'claude-opus-5', at: '2026-09-24T00:00:00Z' })

  it('信心 ≥ 門檻：採用 AI 科目、不標待確認、分錄帶 ai 中繼資料', () => {
    const entries = rowToEntries(row, '1112', A, { ai: meta(92) })
    expect(entries).toHaveLength(1)
    expect(entries[0].lines.find((l) => l.accountCode === '6199')!.debit).toBe(500)
    expect(entries[0].needsReview).toBeFalsy()
    expect(entries[0].ai?.confidence).toBe(92)
  })

  it('信心 < 門檻：仍記 AI 科目但標待確認（轉人工）', () => {
    const p = planRow(row, '1112', A, { ai: meta(AI_CONFIDENCE_THRESHOLD - 1) })
    expect(p.account).toBe('6199')
    expect(p.review).toBe(true)
    const entries = rowToEntries(row, '1112', A, { ai: meta(AI_CONFIDENCE_THRESHOLD - 1) })
    expect(entries[0].needsReview).toBe(true)
  })

  it('AI 覆寫優先於關鍵字規則；跨期應計仍可拆並帶 ai', () => {
    const r: RowInput = { date: '2026-06-01', amount: 11216, direction: 'out', description: '2604健保費', company: '菸酒' }
    const noAi = planRow(r, '1102', A, {})
    expect(noAi.account).toBe('6021') // 關鍵字
    const withAi = rowToEntries(r, '1102', A, { ai: { account: '6103', confidence: 90, model: 'claude-opus-5', at: 'x' } })
    expect(withAi).toHaveLength(2) // 仍拆應計
    expect(withAi[0].lines.find((l) => l.accountCode === '6103')!.debit).toBe(11216)
    expect(withAi[0].ai?.account).toBe('6103')
  })
})
