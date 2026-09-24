// =============================================================================
// 報表測試 — 含 §8.6「AR/AP 帳齡合計與試算表對應科目餘額相符」
// =============================================================================

import { describe, it, expect } from 'vitest'
import { buildSettlementDraft, buildCostRecognition, buildRevenueRecognition } from './engine'
import { aging, profitAndLoss, reconcileControl, trialBalance, type PostedLine } from './reports'
import type { Account, DraftEntry, OpenItemWithRemaining } from './types'

const AP = 21, AR = 11, BANK = 5, FEE = 9, REVENUE = 41, COST = 51
const accounts: Account[] = [
  { id: AP, code: '2121', name: '應付帳款', category: 'liability', normalBalance: 'credit', isOpenItem: true, active: true },
  { id: AR, code: '1123', name: '應收帳款', category: 'asset', normalBalance: 'debit', isOpenItem: true, active: true },
  { id: BANK, code: '1112', name: '銀行存款', category: 'asset', normalBalance: 'debit', isOpenItem: false, active: true },
  { id: FEE, code: '614', name: '銀行手續費', category: 'expense', normalBalance: 'debit', isOpenItem: false, active: true },
  { id: REVENUE, code: '4111', name: '旅遊收入', category: 'revenue', normalBalance: 'credit', isOpenItem: false, active: true },
  { id: COST, code: '5111', name: '旅遊成本', category: 'expense', normalBalance: 'debit', isOpenItem: false, active: true },
]

function toPosted(e: DraftEntry): PostedLine[] {
  return e.lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, period: e.period }))
}

// 建立一個完整情境：認列 2 筆應付 + 1 筆應收，付款全沖應付、收款部分沖應收。
function buildScenario() {
  const lines: PostedLine[] = []

  // 認列成本 → AP open items
  const cost1 = buildCostRecognition({ entryDate: '2020-01-05', amount: 200_000, controlAccountId: AP, pnlAccountId: COST, summary: '成本1' })
  const cost2 = buildCostRecognition({ entryDate: '2020-01-08', amount: 100_000, controlAccountId: AP, pnlAccountId: COST, summary: '成本2' })
  // 認列收入 → AR open item
  const rev1 = buildRevenueRecognition({ entryDate: '2020-01-10', amount: 500_000, controlAccountId: AR, pnlAccountId: REVENUE, summary: '收入1' })
  lines.push(...toPosted(cost1), ...toPosted(cost2), ...toPosted(rev1))

  const apItems: OpenItemWithRemaining[] = [
    { id: 1, code: 'AP-1', type: 'AP', accountId: AP, description: '應付1', originalAmount: 200_000, originDate: '2020-01-05', status: 'open', remaining: 200_000 },
    { id: 2, code: 'AP-2', type: 'AP', accountId: AP, description: '應付2', originalAmount: 100_000, originDate: '2020-01-08', status: 'open', remaining: 100_000 },
  ]
  const arItems: OpenItemWithRemaining[] = [
    { id: 3, code: 'AR-1', type: 'AR', accountId: AR, description: '應收1', originalAmount: 500_000, originDate: '2020-01-10', status: 'open', remaining: 500_000 },
  ]

  // 付款全沖兩筆應付（手續費 15）
  const pay = buildSettlementDraft(
    { settlementDate: '2020-01-31', type: 'payment', bankAccountId: BANK, feeAmount: 15, feeAccountId: FEE, allocations: [{ openItemId: 1, amount: 200_000 }, { openItemId: 2, amount: 100_000 }] },
    apItems,
  )
  apItems[0].remaining = 0; apItems[0].status = 'closed'
  apItems[1].remaining = 0; apItems[1].status = 'closed'

  // 收款部分沖應收（沖 300,000，剩 200,000）
  const receipt = buildSettlementDraft(
    { settlementDate: '2020-01-31', type: 'receipt', bankAccountId: BANK, allocations: [{ openItemId: 3, amount: 300_000 }] },
    arItems,
  )
  arItems[0].remaining = 200_000; arItems[0].status = 'partial'

  lines.push(...toPosted(pay.entry), ...toPosted(receipt.entry))
  return { lines, apItems, arItems }
}

describe('損益表', () => {
  it('依 category 彙總，沖銷不影響損益', () => {
    const { lines } = buildScenario()
    const pnl = profitAndLoss(lines, accounts)
    expect(pnl.revenue).toBe(500_000) // 旅遊收入
    // 費用 = 旅遊成本 300,000 + 銀行手續費 15
    expect(pnl.expense).toBe(300_015)
    expect(pnl.netIncome).toBe(199_985)
  })
})

describe('試算表', () => {
  it('借貸總額相等（平衡）', () => {
    const { lines } = buildScenario()
    const tb = trialBalance(lines, accounts)
    expect(tb.balanced).toBe(true)
    expect(tb.totalDebit).toBe(tb.totalCredit)
  })

  it('應付全沖後餘額為 0，應收剩 200,000', () => {
    const { lines } = buildScenario()
    const tb = trialBalance(lines, accounts)
    const apRow = tb.rows.find((r) => r.accountId === AP)
    expect(apRow).toBeUndefined() // 餘額 0 不列入
    const arRow = tb.rows.find((r) => r.accountId === AR)!
    expect(arRow.debitBalance).toBe(200_000)
  })
})

// ── §8.6 帳齡合計 = 試算表對應科目餘額 ───────────────────────────────────────
describe('對帳檢核（帳齡合計 = 試算表餘額）', () => {
  it('AR：未沖餘額合計 = 試算表應收餘額', () => {
    const { lines, arItems } = buildScenario()
    const tb = trialBalance(lines, accounts)
    const arAging = aging(arItems, 'AR', '2020-02-15')
    const recon = reconcileControl(AR, accounts.find((a) => a.id === AR)!, arItems, tb)

    expect(arAging.total).toBe(200_000)
    expect(recon.openItemsTotal).toBe(arAging.total)
    expect(recon.ledgerBalance).toBe(200_000)
    expect(recon.matched).toBe(true)
  })

  it('AP：全沖後未沖合計 0 = 試算表應付餘額 0', () => {
    const { lines, apItems } = buildScenario()
    const tb = trialBalance(lines, accounts)
    const apAging = aging(apItems, 'AP', '2020-02-15')
    const recon = reconcileControl(AP, accounts.find((a) => a.id === AP)!, apItems, tb)

    expect(apAging.total).toBe(0)
    expect(recon.openItemsTotal).toBe(0)
    expect(recon.ledgerBalance).toBe(0)
    expect(recon.matched).toBe(true)
  })
})

describe('帳齡分桶', () => {
  it('依 origin_date 分到正確帳齡桶', () => {
    const items: OpenItemWithRemaining[] = [
      { id: 1, code: 'AR-1', type: 'AR', accountId: AR, description: 'a', originalAmount: 100, originDate: '2020-01-01', status: 'open', remaining: 100 },
      { id: 2, code: 'AR-2', type: 'AR', accountId: AR, description: 'b', originalAmount: 200, originDate: '2020-02-20', status: 'open', remaining: 200 },
    ]
    const rep = aging(items, 'AR', '2020-03-01') // #1 約 60 天、#2 約 10 天
    expect(rep.total).toBe(300)
    const b0 = rep.buckets.find((b) => b.label === '0-30')!
    const b31 = rep.buckets.find((b) => b.label === '31-60')!
    expect(b0.amount).toBe(200)
    expect(b31.amount).toBe(100)
  })
})
