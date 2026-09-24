import { describe, it, expect } from 'vitest'
import { DEFAULT_ACCOUNTS } from './accounts'
import { learn, suggest, SEED_RULES } from './suggest'
import type { QuickInput } from './types'

const accounts = DEFAULT_ACCOUNTS

describe('智慧建議', () => {
  it('支出無規則時，預設費用科目（雜費）、借方', () => {
    const input: QuickInput = { date: '2026-01-03', amount: 1200, description: '不明小額支出', direction: 'out' }
    const s = suggest(input, [], accounts)
    expect(s.confidence).toBe('default')
    expect(s.accountCode).toBe('6199')
    expect(s.side).toBe('debit')
    // 借 6199 / 貸 銀行
    expect(s.entry.lines.find((l) => l.accountCode === '6199')!.debit).toBe(1200)
    expect(s.entry.lines.find((l) => l.accountCode === '1102')!.credit).toBe(1200)
  })

  it('收入無規則時，預設收入科目、貸方', () => {
    const input: QuickInput = { date: '2026-01-03', amount: 8000, description: '客戶付現', direction: 'in' }
    const s = suggest(input, [], accounts)
    expect(s.accountCode).toBe('4101')
    expect(s.side).toBe('credit')
    expect(s.entry.lines.find((l) => l.accountCode === '1102')!.debit).toBe(8000)
  })

  it('種子規則命中：中油加油 → 油料/交通費', () => {
    const input: QuickInput = { date: '2026-01-03', amount: 2000, description: '中油加油站', direction: 'out' }
    const s = suggest(input, SEED_RULES, accounts)
    expect(s.confidence).toBe('rule')
    expect(s.accountCode).toBe('6103')
    expect(s.matchedRule).toBeDefined()
  })

  it('應計：收入產生應收、支出產生應付', () => {
    const inAccr = suggest({ date: '2026-01-03', amount: 5000, description: '賒銷', direction: 'in', accrual: true }, [], accounts)
    expect(inAccr.entry.lines.find((l) => l.accountCode === '1141')!.debit).toBe(5000) // 應收
    expect(inAccr.entry.source).toBe('accrual')

    const outAccr = suggest({ date: '2026-01-03', amount: 3000, description: '賒購', direction: 'out', accrual: true }, [], accounts)
    expect(outAccr.entry.lines.find((l) => l.accountCode === '2101')!.credit).toBe(3000) // 應付
  })
})

describe('規則式學習（更正後下次變準）', () => {
  it('使用者更正科目後，同樣摘要下次自動採用新科目', () => {
    const input: QuickInput = { date: '2026-01-03', amount: 9000, description: '春天廣告社', counterparty: '春天廣告社', direction: 'out' }

    // 第一次：無規則 → 預設雜費
    const first = suggest(input, [], accounts)
    expect(first.accountCode).toBe('6199')

    // 使用者更正為「廣告行銷費 6106」→ 學起來
    const rules = learn(input, '6106', [])
    expect(rules.length).toBe(1)

    // 第二次：同對象 → 命中規則、用 6106
    const second = suggest(input, rules, accounts)
    expect(second.confidence).toBe('rule')
    expect(second.accountCode).toBe('6106')
  })

  it('最新更正權重最高，覆蓋舊規則', () => {
    const input: QuickInput = { date: '2026-01-03', amount: 100, description: 'X 商店', counterparty: 'X 商店', direction: 'out' }
    let rules = learn(input, '6199', []) // 先學成雜費
    rules = learn(input, '6103', rules) // 再更正成油料費
    const s = suggest(input, rules, accounts)
    expect(s.accountCode).toBe('6103')
  })
})
