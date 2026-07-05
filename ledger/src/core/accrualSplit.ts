// =============================================================================
// 事後應計拆分：把一筆已入帳的「現金分錄」拆成「應計(指定月底) + 沖銷(原付款日)」，
// 或把拆分後的一組還原回單筆現金分錄。複核明細時發現漏拆/誤拆用。
// 拆分後結果與匯入器自動拆分完全一致（openItems 自動沖平、不留在沖銷清單）。
// =============================================================================

import { buildEntry, LedgerError } from './engine'
import type { Account, JournalEntry } from './types'

export interface SplitResult {
  /** 新增的應計分錄（應計日） */
  accrual: JournalEntry
  /** 改寫後的原分錄（沿用原 id/流水號/付款日，變為沖銷） */
  settlement: JournalEntry
}

/** 把現金分錄拆成 應計+沖銷。accrualDate 必須早於付款日；非損益科目不可拆。 */
export function splitToAccrual(
  e: JournalEntry,
  accrualDate: string,
  accounts: Account[],
  opts: { apAccount?: string; arAccount?: string } = {},
): SplitResult {
  if (e.source === 'settlement' || e.settles) throw new LedgerError('沖銷分錄不可再拆分')
  if (e.source === 'accrual') throw new LedgerError('此筆已是應計分錄')
  if (accrualDate >= e.date) throw new LedgerError('應計日期必須早於付款日')
  const byCode = new Map(accounts.map((a) => [a.code, a]))
  const dr = e.lines.find((l) => l.debit > 0)
  const cr = e.lines.find((l) => l.credit > 0)
  if (!dr || !cr || e.lines.length !== 2) throw new LedgerError('僅支援兩腳分錄的拆分')
  const bankLeg = [dr, cr].find((l) => byCode.get(l.accountCode)?.isCash)
  if (!bankLeg) throw new LedgerError('找不到銀行/現金腳，無法拆分')
  const direction: 'in' | 'out' = bankLeg === dr ? 'in' : 'out'
  const catLeg = bankLeg === dr ? cr : dr
  const catAcc = byCode.get(catLeg.accountCode)
  if (!catAcc || (catAcc.category !== 'revenue' && catAcc.category !== 'expense')) {
    throw new LedgerError('另一腳非損益科目（收入/費用），不需跨期應計')
  }
  const control = direction === 'in' ? (opts.arAccount ?? '1141') : (opts.apAccount ?? '2101')
  if (!byCode.has(control)) throw new LedgerError(`控制科目 ${control} 不存在，請先於科目表建立`)
  const amount = dr.debit

  const accrual = buildEntry({
    date: accrualDate, description: e.description, counterparty: e.counterparty, company: e.company,
    counterpartyAccount: e.counterpartyAccount, branch: e.branch, voucherNo: e.voucherNo, note: e.note,
    source: 'accrual', settled: false,
    lines: direction === 'in'
      ? [{ accountCode: control, debit: amount, credit: 0 }, { accountCode: catLeg.accountCode, debit: 0, credit: amount }]
      : [{ accountCode: catLeg.accountCode, debit: amount, credit: 0 }, { accountCode: control, debit: 0, credit: amount }],
  })
  const settlement = buildEntry({
    id: e.id, seq: e.seq, date: e.date,
    description: `${direction === 'in' ? '收款沖銷' : '付款沖銷'}：${e.description}`,
    company: e.company, source: 'settlement', settles: accrual.id, reviewedAt: e.reviewedAt,
    lines: direction === 'in'
      ? [{ accountCode: bankLeg.accountCode, debit: amount, credit: 0 }, { accountCode: control, debit: 0, credit: amount }]
      : [{ accountCode: control, debit: amount, credit: 0 }, { accountCode: bankLeg.accountCode, debit: 0, credit: amount }],
  })
  return { accrual, settlement }
}

/**
 * 還原：把「沖銷 + 其對應應計」合併回單筆現金分錄（沿用沖銷的 id/流水號/付款日）。
 * 僅限一對一全額沖銷的組合（呼叫端需確認沒有其他分錄沖同一張應計）。
 */
export function mergeToCash(
  settlement: JournalEntry,
  accrual: JournalEntry,
  accounts: Account[],
): JournalEntry {
  if (settlement.settles !== accrual.id) throw new LedgerError('兩筆分錄非對應的沖銷/應計組')
  const byCode = new Map(accounts.map((a) => [a.code, a]))
  const sDr = settlement.lines.find((l) => l.debit > 0)
  const sCr = settlement.lines.find((l) => l.credit > 0)
  if (!sDr || !sCr) throw new LedgerError('沖銷分錄不完整')
  const bankLeg = [sDr, sCr].find((l) => byCode.get(l.accountCode)?.isCash)
  if (!bankLeg) throw new LedgerError('沖銷分錄無銀行/現金腳')
  const direction: 'in' | 'out' = bankLeg === sDr ? 'in' : 'out'
  const catLeg = accrual.lines.find((l) => !byCode.get(l.accountCode)?.isOpenItem)
  if (!catLeg) throw new LedgerError('應計分錄找不到損益腳')
  const amount = sDr.debit
  const aAmount = accrual.lines.find((l) => l.debit > 0)?.debit ?? 0
  if (amount !== aAmount) throw new LedgerError('沖銷金額與應計金額不一致（部分沖銷不可還原）')

  return buildEntry({
    id: settlement.id, seq: settlement.seq, date: settlement.date,
    description: accrual.description, counterparty: accrual.counterparty, company: settlement.company ?? accrual.company,
    counterpartyAccount: accrual.counterpartyAccount, branch: accrual.branch, voucherNo: accrual.voucherNo, note: accrual.note,
    source: 'cash', settled: true, reviewedAt: settlement.reviewedAt,
    lines: direction === 'in'
      ? [{ accountCode: bankLeg.accountCode, debit: amount, credit: 0 }, { accountCode: catLeg.accountCode, debit: 0, credit: amount }]
      : [{ accountCode: catLeg.accountCode, debit: amount, credit: 0 }, { accountCode: bankLeg.accountCode, debit: 0, credit: amount }],
  })
}
