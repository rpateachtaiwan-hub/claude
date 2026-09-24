// =============================================================================
// 沖銷引擎驗收測試 (對應規格書 §8 驗收條件)
// =============================================================================

import { describe, it, expect } from 'vitest'
import {
  assertBalanced,
  buildEntry,
  buildSettlementDraft,
  buildCostRecognition,
  buildRevenueRecognition,
  deriveStatus,
  remainingOf,
  sumCredit,
  sumDebit,
  SettlementError,
} from './engine'
import type { Account, OpenItemWithRemaining, SettlementInput } from './types'

// ── 測試用科目 ───────────────────────────────────────────────────────────────
const AP = 21 // 應付帳款 2121
const AR = 11 // 應收帳款 1123
const BANK = 5 // 銀行存款 1112
const FEE = 9 // 銀行手續費 614
const REVENUE = 41 // 旅遊收入
const COST = 51 // 旅遊成本

const accounts: Account[] = [
  { id: AP, code: '2121', name: '應付帳款', category: 'liability', normalBalance: 'credit', isOpenItem: true, active: true },
  { id: AR, code: '1123', name: '應收帳款', category: 'asset', normalBalance: 'debit', isOpenItem: true, active: true },
  { id: BANK, code: '1112', name: '銀行存款', category: 'asset', normalBalance: 'debit', isOpenItem: false, active: true },
  { id: FEE, code: '614', name: '銀行手續費', category: 'expense', normalBalance: 'debit', isOpenItem: false, active: true },
  { id: REVENUE, code: '4111', name: '旅遊收入', category: 'revenue', normalBalance: 'credit', isOpenItem: false, active: true },
  { id: COST, code: '5111', name: '旅遊成本', category: 'expense', normalBalance: 'debit', isOpenItem: false, active: true },
]

function ap(id: number, amount: number, remaining = amount): OpenItemWithRemaining {
  return {
    id, code: `AP-${id}`, type: 'AP', accountId: AP, description: `應付#${id}`,
    originalAmount: amount, originDate: '2020-01-01', status: 'open', remaining,
  }
}
function ar(id: number, amount: number, remaining = amount): OpenItemWithRemaining {
  return {
    id, code: `AR-${id}`, type: 'AR', accountId: AR, description: `應收#${id}`,
    originalAmount: amount, originDate: '2020-01-01', status: 'open', remaining,
  }
}

// ── §8.1 傳票必須平衡，否則拒絕 ──────────────────────────────────────────────
describe('傳票平衡不變條件', () => {
  it('Σ借 = Σ貸 才能建立傳票', () => {
    const entry = buildEntry({
      entryDate: '2020-01-10', summary: '測試',
      lines: [
        { accountId: COST, debit: 1000, credit: 0 },
        { accountId: AP, debit: 0, credit: 1000 },
      ],
    })
    expect(sumDebit(entry.lines)).toBe(sumCredit(entry.lines))
    expect(entry.period).toBe('2020-01')
  })

  it('不平衡的傳票被拒絕', () => {
    expect(() =>
      assertBalanced([
        { accountId: COST, debit: 1000, credit: 0 },
        { accountId: AP, debit: 0, credit: 900 },
      ]),
    ).toThrow(SettlementError)
  })

  it('一行同時有借與貸被拒絕', () => {
    expect(() =>
      assertBalanced([{ accountId: COST, debit: 100, credit: 100 }]),
    ).toThrow(/恰好一邊/)
  })
})

// ── §8.2 全額沖一筆應付 → remaining=0、closed ────────────────────────────────
describe('全額沖一筆應付', () => {
  it('產生平衡傳票，沖後 remaining=0、status=closed', () => {
    const item = ap(1, 200_000)
    const input: SettlementInput = {
      settlementDate: '2020-01-31', type: 'payment', bankAccountId: BANK,
      allocations: [{ openItemId: 1, amount: 200_000 }],
    }
    const draft = buildSettlementDraft(input, [item])
    expect(draft.totalAmount).toBe(200_000)
    assertBalanced(draft.entry.lines)

    const debitAp = draft.entry.lines.find((l) => l.accountId === AP)!
    expect(debitAp.debit).toBe(200_000)
    expect(debitAp.openItemId).toBe(1)

    const settled = 200_000
    expect(remainingOf(item, settled)).toBe(0)
    expect(deriveStatus(item.originalAmount, settled)).toBe('closed')
  })
})

// ── §8.3 一次付款沖多筆應付 → 一張傳票、多行借應付 + 一行貸銀行 (+手續費) ─────
describe('一次付款沖多筆應付（含手續費）', () => {
  it('規格範例：200,000 + 100,000，手續費 15 → 貸銀行 300,015', () => {
    const items = [ap(1, 200_000), ap(2, 100_000)]
    const input: SettlementInput = {
      settlementDate: '2020-01-31', type: 'payment', bankAccountId: BANK,
      feeAmount: 15, feeAccountId: FEE,
      allocations: [
        { openItemId: 1, amount: 200_000 },
        { openItemId: 2, amount: 100_000 },
      ],
    }
    const draft = buildSettlementDraft(input, items)

    // 一張傳票
    expect(draft.totalAmount).toBe(300_000)
    assertBalanced(draft.entry.lines)
    expect(draft.entry.source).toBe('settlement')

    // 多行借應付（連 open_item）
    const apLines = draft.entry.lines.filter((l) => l.accountId === AP)
    expect(apLines.map((l) => l.debit).sort((a, b) => a - b)).toEqual([100_000, 200_000])
    expect(apLines.every((l) => l.openItemId != null)).toBe(true)

    // 手續費借方
    const feeLine = draft.entry.lines.find((l) => l.accountId === FEE)!
    expect(feeLine.debit).toBe(15)

    // 一行貸銀行 = total + fee
    const bankLines = draft.entry.lines.filter((l) => l.accountId === BANK)
    expect(bankLines).toHaveLength(1)
    expect(bankLines[0].credit).toBe(300_015)
    expect(bankLines[0].debit).toBe(0)

    // 借方合計 = 貸方合計 = 300,015
    expect(sumDebit(draft.entry.lines)).toBe(300_015)
    expect(sumCredit(draft.entry.lines)).toBe(300_015)
  })
})

// ── §8.4 部分沖銷 → remaining = original − 套用額、status=partial ─────────────
describe('部分沖銷', () => {
  it('沖一部分後仍留在清單、status=partial', () => {
    const item = ap(1, 200_000)
    const input: SettlementInput = {
      settlementDate: '2020-02-15', type: 'payment', bankAccountId: BANK,
      allocations: [{ openItemId: 1, amount: 80_000 }],
    }
    const draft = buildSettlementDraft(input, [item])
    expect(draft.totalAmount).toBe(80_000)

    const settled = 80_000
    expect(remainingOf(item, settled)).toBe(120_000)
    expect(deriveStatus(item.originalAmount, settled)).toBe('partial')
  })

  it('分配超過 remaining 被拒絕', () => {
    const item = ap(1, 200_000, 50_000) // 已沖過一些，剩 50,000
    expect(() =>
      buildSettlementDraft(
        { settlementDate: '2020-03-01', type: 'payment', bankAccountId: BANK, allocations: [{ openItemId: 1, amount: 60_000 }] },
        [item],
      ),
    ).toThrow(/超過未沖餘額/)
  })
})

// ── §8.5 收款沖應收方向正確（貸應收、借銀行、手續費借方）─────────────────────
describe('收款沖應收', () => {
  it('貸應收、借銀行 = total − fee、手續費借方', () => {
    const item = ar(1, 500_000)
    const input: SettlementInput = {
      settlementDate: '2020-01-31', type: 'receipt', bankAccountId: BANK,
      feeAmount: 30, feeAccountId: FEE,
      allocations: [{ openItemId: 1, amount: 500_000 }],
    }
    const draft = buildSettlementDraft(input, [item])

    const arLine = draft.entry.lines.find((l) => l.accountId === AR)!
    expect(arLine.credit).toBe(500_000) // 貸應收
    expect(arLine.debit).toBe(0)
    expect(arLine.openItemId).toBe(1)

    const feeLine = draft.entry.lines.find((l) => l.accountId === FEE)!
    expect(feeLine.debit).toBe(30) // 手續費借方

    const bankLine = draft.entry.lines.find((l) => l.accountId === BANK)!
    expect(bankLine.debit).toBe(499_970) // 借銀行 = 500,000 − 30
    expect(bankLine.credit).toBe(0)

    assertBalanced(draft.entry.lines)
  })

  it('類型不符（用 receipt 沖 AP）被拒絕', () => {
    expect(() =>
      buildSettlementDraft(
        { settlementDate: '2020-01-31', type: 'receipt', bankAccountId: BANK, allocations: [{ openItemId: 1, amount: 100 }] },
        [ap(1, 100)],
      ),
    ).toThrow(/不符/)
  })
})

// ── §8.7 金額皆為整數元，無浮點誤差 ─────────────────────────────────────────
describe('整數元', () => {
  it('非整數分配金額被拒絕', () => {
    expect(() =>
      buildSettlementDraft(
        { settlementDate: '2020-01-31', type: 'payment', bankAccountId: BANK, allocations: [{ openItemId: 1, amount: 100.5 }] },
        [ap(1, 200)],
      ),
    ).toThrow()
  })

  it('所有輸出金額皆為整數', () => {
    const draft = buildSettlementDraft(
      {
        settlementDate: '2020-01-31', type: 'payment', bankAccountId: BANK,
        feeAmount: 15, feeAccountId: FEE,
        allocations: [{ openItemId: 1, amount: 200_000 }, { openItemId: 2, amount: 100_000 }],
      },
      [ap(1, 200_000), ap(2, 100_000)],
    )
    for (const l of draft.entry.lines) {
      expect(Number.isInteger(l.debit)).toBe(true)
      expect(Number.isInteger(l.credit)).toBe(true)
    }
  })

  it('有手續費卻未指定手續費科目被拒絕', () => {
    expect(() =>
      buildSettlementDraft(
        { settlementDate: '2020-01-31', type: 'payment', bankAccountId: BANK, feeAmount: 15, allocations: [{ openItemId: 1, amount: 100 }] },
        [ap(1, 100)],
      ),
    ).toThrow(/手續費科目/)
  })
})

// ── 認列（掛帳）建立未沖項對應傳票 ────────────────────────────────────────────
describe('認列傳票', () => {
  it('認列收入：借應收、貸收入', () => {
    const e = buildRevenueRecognition({
      entryDate: '2020-01-05', amount: 500_000,
      controlAccountId: AR, pnlAccountId: REVENUE, summary: '認列旅遊收入',
    })
    expect(e.lines.find((l) => l.accountId === AR)!.debit).toBe(500_000)
    expect(e.lines.find((l) => l.accountId === REVENUE)!.credit).toBe(500_000)
    assertBalanced(e.lines)
  })

  it('認列成本：借成本、貸應付', () => {
    const e = buildCostRecognition({
      entryDate: '2020-01-05', amount: 200_000,
      controlAccountId: AP, pnlAccountId: COST, summary: '認列旅遊成本',
    })
    expect(e.lines.find((l) => l.accountId === COST)!.debit).toBe(200_000)
    expect(e.lines.find((l) => l.accountId === AP)!.credit).toBe(200_000)
    assertBalanced(e.lines)
  })
})
