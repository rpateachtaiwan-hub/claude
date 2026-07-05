import { describe, it, expect } from 'vitest'
import { UNIFIED_PRESET_ACCOUNTS } from './accounts'
import { findSimilarAccounts, ruleTargetIssues } from './accountAudit'
import type { Account } from './types'

const acc = (code: string, name: string, category: Account['category'] = 'expense'): Account =>
  ({ code, name, category, normalBalance: 'debit' })

describe('科目健檢', () => {
  it('建議科目表自身乾淨：無相近重複、規則目標全數相符', () => {
    expect(findSimilarAccounts(UNIFIED_PRESET_ACCOUNTS)).toEqual([])
    expect(ruleTargetIssues(UNIFIED_PRESET_ACCOUNTS)).toEqual([])
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

  it('規則目標編號被不同意義科目佔用 → 語意衝突警告（6103 油料 vs 勞健保費）', () => {
    const chart = UNIFIED_PRESET_ACCOUNTS.map((a) => (a.code === '6103' ? { ...a, name: '油料/交通費' } : a))
    const issues = ruleTargetIssues(chart)
    const hit = issues.find((i) => i.code === '6103')
    expect(hit).toBeDefined()
    expect(hit!.missing).toBe(false)
    expect(hit!.currentName).toBe('油料/交通費')
    expect(hit!.expectedName).toBe('勞健保費')
    expect(hit!.keywords).toContain('健保費')
  })

  it('規則目標科目不存在 → 規則失效警告', () => {
    const chart = UNIFIED_PRESET_ACCOUNTS.filter((a) => a.code !== '6104')
    const issues = ruleTargetIssues(chart)
    const hit = issues.find((i) => i.code === '6104')
    expect(hit).toBeDefined()
    expect(hit!.missing).toBe(true)
  })
})
