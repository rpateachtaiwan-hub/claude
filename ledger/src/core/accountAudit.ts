// =============================================================================
// 科目健檢：掃描使用者「實際」科目表，找出
//  1. 名稱相同或互為子字串的相近科目（易分散記帳）
//  2. 智慧匯入規則指向的科目「名稱與預期不符」或「不存在」
//     （歷史上曾有預設科目佔用同一編號但意義不同，例如 6103 油料 vs 勞健保）
// 純函式，於瀏覽器端對真實資料執行。
// =============================================================================

import { KEYWORD_RULES } from './importMap'
import { UNIFIED_PRESET_ACCOUNTS } from './accounts'
import type { Account } from './types'

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

/** 檢查智慧匯入規則的目標科目：名稱與建議科目表不符（語意衝突）或不存在（規則失效）。 */
export function ruleTargetIssues(accounts: Account[]): RuleTargetIssue[] {
  const presetByCode = new Map(UNIFIED_PRESET_ACCOUNTS.map((a) => [a.code, a]))
  const byCode = new Map(accounts.map((a) => [a.code, a]))
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
    const cur = byCode.get(code)
    if (!cur) {
      out.push({ code, expectedName: expected, missing: true, keywords: kwByCode.get(code)! })
    } else if (norm(cur.name) !== norm(expected)) {
      out.push({ code, expectedName: expected, currentName: cur.name, missing: false, keywords: kwByCode.get(code)! })
    }
  }
  return out.sort((x, y) => x.code.localeCompare(y.code))
}
