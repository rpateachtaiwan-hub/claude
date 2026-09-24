import { describe, it, expect } from 'vitest'
import { UNIFIED_PRESET_ACCOUNTS } from './accounts'
import { USER_CODE_ACCOUNTS } from './testFixtures'
import { findSimilarAccounts, ruleTargetIssues } from './accountAudit'
import type { Account } from './types'

const FULL_CHART = [...UNIFIED_PRESET_ACCOUNTS, ...USER_CODE_ACCOUNTS]

const acc = (code: string, name: string, category: Account['category'] = 'expense'): Account =>
  ({ code, name, category, normalBalance: 'debit' })

describe('科目健檢', () => {
  it('建議科目表自身無相近重複；補上自訂編號後規則目標全數相符', () => {
    expect(findSimilarAccounts(UNIFIED_PRESET_ACCOUNTS)).toEqual([])
    expect(ruleTargetIssues(FULL_CHART)).toEqual([])
  })

  it('同名不同編號 → same-name（如 2150/2151 應付薪資）', () => {
    const pairs = findSimilarAccounts([acc('2150', '應付薪資', 'liability'), acc('2151', '應付薪資', 'liability')])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].reason).toBe('same-name')
  })

  it('互為子字串 → contains（如 營業收入 vs 營業收入-信用卡）', () => {
    const pairs = findSimilarAccounts([acc('4101', '營業收入', 'revenue'), acc('4102', '營業收入-信用卡', 'revenue')])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].reason).toBe('contains')
  })

  it('名稱含空白/斜線視為相同（現金/零用金 vs 現金 零用金）', () => {
    const pairs = findSimilarAccounts([acc('1101', '現金/零用金', 'asset'), acc('1109', '現金 零用金', 'asset')])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].reason).toBe('same-name')
  })

  it('名稱型規則目標：同名科目不存在且編號被不同名稱佔用 → 語意衝突警告（4201 利息收入）', () => {
    const chart = FULL_CHART.map((a) => (a.code === '4201' ? { ...a, name: '某某收入' } : a))
    const issues = ruleTargetIssues(chart)
    const hit = issues.find((i) => i.code === '4201')
    expect(hit).toBeDefined()
    expect(hit!.missing).toBe(false)
    expect(hit!.currentName).toBe('某某收入')
    expect(hit!.expectedName).toBe('利息收入')
    expect(hit!.keywords).toContain('存款利息')
  })

  it('自訂編號規則目標：編號不存在 → 規則失效警告（6022 勞退）', () => {
    const chart = FULL_CHART.filter((a) => a.code !== '6022')
    const issues = ruleTargetIssues(chart)
    const hit = issues.find((i) => i.code === '6022')
    expect(hit).toBeDefined()
    expect(hit!.missing).toBe(true)
    expect(hit!.expectedName).toBe('')
    expect(hit!.keywords).toContain('勞退')
  })
})
