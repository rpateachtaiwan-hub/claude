// =============================================================================
// 科目健檢：掃描使用者「實際」科目表，找出
//  1. 名稱相同或互為子字串的相近科目（易分散記帳）
//  2. 智慧匯入規則指向的科目「名稱與預期不符」或「不存在」
//     （歷史上曾有預設科目佔用同一編號但意義不同，例如 6103 油料 vs 勞健保）
// 純函式，於瀏覽器端對真實資料執行。
// =============================================================================

import { KEYWORD_RULES, resolveControlAccount } from './importMap'
import { UNIFIED_PRESET_ACCOUNTS } from './accounts'
import type { Account } from './types'

/** 結構性檢查：應收/應付控制科目與現金科目是否存在（缺少會使應計/沖銷/對帳失效）。 */
export function structuralIssues(accounts: Account[]): string[] {
  const out: string[] = []
  if (!accounts.some((a) => a.isCash)) {
    out.push('沒有任何「現金/銀行」科目（isCash）：匯入、現金流量表與銀行對帳將無法運作。')
  }
  if (!resolveControlAccount('in', accounts)) {
    out.push('找不到應收控制科目：請建立資產類科目（如 應收帳款）並勾選「應收/應付（需沖銷）」，否則收入跨期應計與沖銷會失效。')
  }
  if (!resolveControlAccount('out', accounts)) {
    out.push('找不到應付控制科目：請建立負債類科目（如 應付帳款）並勾選「應收/應付（需沖銷）」，否則費用跨期應計與沖銷會失效。')
  }
  return out
}

function norm(s: string): string {
  return String(s).replace(/[\s/／\-‐–（）()．.]/g, '')
}

export interface SimilarPair {
  a: Account
  b: Account
  reason: 'same-name' | 'contains'
}

/** 找名稱重複或互為子字串（長度 ≥3）的科目對。 */
export function findSimilarAccounts(accounts: Account[]): SimilarPair[] {
  const out: SimilarPair[] = []
  for (let i = 0; i < accounts.length; i++) {
    for (let j = i + 1; j < accounts.length; j++) {
      const a = accounts[i]
      const b = accounts[j]
      const na = norm(a.name)
      const nb = norm(b.name)
      if (!na || !nb) continue
      if (na === nb) out.push({ a, b, reason: 'same-name' })
      else if ((na.length >= 3 && nb.includes(na)) || (nb.length >= 3 && na.includes(nb))) {
        out.push({ a, b, reason: 'contains' })
      }
    }
  }
  return out
}

export interface RuleTargetIssue {
  code: string
  /** 智慧匯入預期的科目名稱 */
  expectedName: string
  /** 目前科目表中該編號的名稱（missing 時為 undefined） */
  currentName?: string
  missing: boolean
  /** 會被記到此科目的關鍵字（前幾個，供理解影響） */
  keywords: string[]
}

/**
 * 檢查智慧匯入規則的目標科目。規則採「先認名稱、再認編號」：
 * 只要科目表中存在與建議科目「同名」的科目（編號可不同），規則即有效、不報警。
 * 報警情況：同名科目不存在 —— 且原編號被不同名稱佔用（語意衝突）或原編號也不存在（規則失效）。
 */
export function ruleTargetIssues(accounts: Account[]): RuleTargetIssue[] {
  const presetByCode = new Map(UNIFIED_PRESET_ACCOUNTS.map((a) => [a.code, a]))
  const byCode = new Map(accounts.map((a) => [a.code, a]))
  const names = new Set(accounts.map((a) => norm(a.name)))
  const kwByCode = new Map<string, string[]>()
  for (const r of KEYWORD_RULES) {
    const list = kwByCode.get(r.account) ?? []
    if (list.length < 4) list.push(r.match)
    kwByCode.set(r.account, list)
  }
  const out: RuleTargetIssue[] = []
  for (const code of kwByCode.keys()) {
    const expected = presetByCode.get(code)?.name
    if (!expected) continue
    if (names.has(norm(expected))) continue // 同名科目存在（編號可能已改）→ 規則有效
    const cur = byCode.get(code)
    if (cur) out.push({ code, expectedName: expected, currentName: cur.name, missing: false, keywords: kwByCode.get(code)! })
    else out.push({ code, expectedName: expected, missing: true, keywords: kwByCode.get(code)! })
  }
  return out.sort((x, y) => x.code.localeCompare(y.code))
}
