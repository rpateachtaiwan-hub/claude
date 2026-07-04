// =============================================================================
// 智慧匯入配對：以「內容(摘要)」關鍵字配科目、解析期別代碼(YYMM)、跨期自動拆應計。
// 純函式，方便測試。所有金額為整數元。
// =============================================================================

import { buildEntry } from './engine'
import type { Account, JournalEntry } from './types'

/** 關鍵字 → 非現金腳科目。最具體者放前面（子字串比對，先命中者勝）。 */
export interface KeywordRule {
  match: string
  account: string
  /** 命中但仍需人工確認（先入帳、標記待分類） */
  review?: boolean
}

// 注意順序：「客人現金款存入」必須在「現金款存入」之前；
//          「各類所得扣繳稅款」在一般「稅」之前；「代付酒貨款」在「代墊款」之前。
export const KEYWORD_RULES: KeywordRule[] = [
  // 收入類
  { match: '客人現金款存入', account: '4104' },
  { match: '信用卡帳款', account: '4101' },
  { match: '美國運通', account: '4102' },
  { match: '運通帳款', account: '4102' },
  { match: 'iCash', account: '4103' },
  { match: 'iPass', account: '4103' },
  { match: '存款利息', account: '4201' },
  { match: '退稅代墊返還', account: '4999', review: true },
  { match: '現金款存入', account: '4999', review: true }, // 無「客人」者需人工判斷
  { match: '高雄費用', account: '4999', review: true },
  // 成本（酒貨款）
  { match: '代付酒貨款', account: '5101' },
  { match: '國貿公司', account: '5101' },
  { match: 'Austin個人帳戶', account: '5101' },
  { match: '酒貨款', account: '5101' },
  // 費用
  { match: '勞工退休金', account: '6104' },
  { match: '勞退', account: '6104' },
  { match: '健保費', account: '6103' },
  { match: '勞保費', account: '6103' },
  { match: '薪資', account: '6101' },
  { match: '內江街', account: '6102' },
  { match: '房租', account: '6102' },
  { match: '外送費用', account: '6107' },
  { match: '手續費', account: '6105' },
  { match: '北水', account: '6106' },
  { match: '水費', account: '6106' },
  { match: '電費', account: '6106' },
  { match: '禮金', account: '6108' },
  { match: '帳務服務費', account: '6109' },
  { match: '會計', account: '6109' },
  { match: '各類所得扣繳稅款', account: '2140', review: true },
  // 資產負債表科目（非損益）— 需在「代墊款」等通用規則之前，讓實體專屬規則優先
  { match: '周轉金', account: '2301' },
  { match: '旅行社', account: '2301' },
  { match: 'Jeff個人帳戶', account: '2302' },
  { match: '企貸還款', account: '2201' },
  { match: '台企銀', account: '2201' },
  { match: '大同分行提領', account: '1101' },
  { match: '自行提款', account: '1101' },
  { match: '零用金', account: '1101' },
  { match: '提領', account: '1101' },
  // 通用（最後才落到這些）
  { match: '代墊款', account: '6199', review: true },
]

/** 以內容關鍵字配科目；僅在該科目存在於科目表時才採用。未命中回 null。 */
export function matchByDescription(
  desc: string,
  accounts: Account[],
): { account: string; review: boolean } | null {
  const codes = new Set(accounts.map((a) => a.code))
  for (const r of KEYWORD_RULES) {
    if (desc.includes(r.match) && codes.has(r.account)) {
      return { account: r.account, review: !!r.review }
    }
  }
  return null
}

/** 解析開頭期別代碼 YYMM（如 2604=26年4月）。MM 需 01–12、YY 需 20–40，否則回 null。 */
export function parsePeriodCode(desc: string): { year: number; month: number } | null {
  const m = String(desc).trim().match(/^(\d{2})(\d{2})/)
  if (!m) return null
  const yy = Number(m[1])
  const mm = Number(m[2])
  if (mm < 1 || mm > 12) return null
  if (yy < 20 || yy > 40) return null
  return { year: 2000 + yy, month: mm }
}

/** 科目是否為損益（收入/費用/成本），可作跨期應計。資產/負債/權益不應計。 */
export function isPnL(accountCode: string, accounts: Account[]): boolean {
  const a = accounts.find((x) => x.code === accountCode)
  return !!a && (a.category === 'revenue' || a.category === 'expense')
}

/** 該月月底 YYYY-MM-DD（month 為 1–12）。 */
export function monthEndISO(year: number, month: number): string {
  const d = new Date(year, month, 0) // 第 0 天 = 上個月最後一天 → 即 month 月月底
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface RowInput {
  date: string // 付款日 YYYY-MM-DD
  amount: number // 正整數
  direction: 'in' | 'out'
  description: string
  catText?: string
  counterpartyAccount?: string
  branch?: string
  voucherNo?: string
  company?: string
}

export interface ClassifyOpts {
  /** 使用者對「類別文字 → 科目 code」的覆寫 */
  catOverride?: Record<string, string>
  /** 類別文字直配科目的次要 fallback（沿用既有 matchCategory 傳入結果） */
  matchCategory?: (catText: string, accounts: Account[]) => string | null
}

export interface Classified {
  account: string
  review: boolean
  source: 'keyword' | 'category' | 'fallback'
}

/** 決定非現金腳科目：內容關鍵字 → 類別覆寫/配對 → 待確認 fallback。 */
export function classifyRow(row: RowInput, accounts: Account[], opts: ClassifyOpts = {}): Classified {
  const kw = matchByDescription(row.description, accounts)
  if (kw) return { account: kw.account, review: kw.review, source: 'keyword' }

  const codes = new Set(accounts.map((a) => a.code))
  const cat = (row.catText ?? '').trim()
  if (cat) {
    const ov = opts.catOverride?.[cat]
    if (ov && codes.has(ov)) return { account: ov, review: false, source: 'category' }
    const auto = opts.matchCategory?.(cat, accounts) ?? null
    if (auto && codes.has(auto)) return { account: auto, review: false, source: 'category' }
  }

  const fallback = row.direction === 'in' ? '4999' : '6999'
  return { account: fallback, review: true, source: 'fallback' }
}

export interface BuildOpts extends ClassifyOpts {
  /** 全域是否啟用 YYMM 跨期自動拆應計（預設 true） */
  accrualOn?: boolean
  /** 應付控制科目（費用/成本應計用），預設 2101 */
  apAccount?: string
  /** 應收控制科目（收入應計用），預設 1141 */
  arAccount?: string
}

/**
 * 單列 → 一或兩張傳票。
 *  - 一般：單張現金分錄（銀行 vs 非銀行科目）。
 *  - 跨期（YYMM < 付款月、且為損益科目、控制科目存在）：應計(月底) + 沖銷(付款日)。
 */
export function rowToEntries(
  row: RowInput,
  bankCode: string,
  accounts: Account[],
  opts: BuildOpts = {},
): JournalEntry[] {
  const accrualOn = opts.accrualOn !== false
  const apAccount = opts.apAccount ?? '2101'
  const arAccount = opts.arAccount ?? '1141'
  const codes = new Set(accounts.map((a) => a.code))

  const cls = classifyRow(row, accounts, opts)
  const amount = row.amount
  const common = {
    company: row.company,
    counterpartyAccount: row.counterpartyAccount,
    branch: row.branch,
    voucherNo: row.voucherNo,
  }

  // 是否要拆應計？
  const code = parsePeriodCode(row.description)
  const [payY, payM] = row.date.split('-').map(Number)
  const crossPeriod = !!code && (code.year < payY || (code.year === payY && code.month < payM))
  const control = row.direction === 'in' ? arAccount : apAccount
  const canAccrue = accrualOn && crossPeriod && cls.source !== 'fallback' && !cls.review && isPnL(cls.account, accounts) && codes.has(control)

  if (canAccrue && code) {
    const accrualDate = monthEndISO(code.year, code.month)
    let accrual: JournalEntry
    if (row.direction === 'in') {
      // 收入應計：借 應收 / 貸 收入
      accrual = buildEntry({
        ...common, date: accrualDate, description: row.description, source: 'accrual', settled: false,
        lines: [
          { accountCode: control, debit: amount, credit: 0 },
          { accountCode: cls.account, debit: 0, credit: amount },
        ],
      })
      // 收款沖銷：借 銀行 / 貸 應收
      const settlement = buildEntry({
        company: row.company, date: row.date, description: `收款沖銷：${row.description}`, source: 'settlement', settles: accrual.id,
        lines: [
          { accountCode: bankCode, debit: amount, credit: 0 },
          { accountCode: control, debit: 0, credit: amount },
        ],
      })
      return [accrual, settlement]
    } else {
      // 費用/成本應計：借 費用 / 貸 應付
      accrual = buildEntry({
        ...common, date: accrualDate, description: row.description, source: 'accrual', settled: false,
        lines: [
          { accountCode: cls.account, debit: amount, credit: 0 },
          { accountCode: control, debit: 0, credit: amount },
        ],
      })
      // 付款沖銷：借 應付 / 貸 銀行
      const settlement = buildEntry({
        company: row.company, date: row.date, description: `付款沖銷：${row.description}`, source: 'settlement', settles: accrual.id,
        lines: [
          { accountCode: control, debit: amount, credit: 0 },
          { accountCode: bankCode, debit: 0, credit: amount },
        ],
      })
      return [accrual, settlement]
    }
  }

  // 一般現金分錄
  const lines = row.direction === 'in'
    ? [{ accountCode: bankCode, debit: amount, credit: 0 }, { accountCode: cls.account, debit: 0, credit: amount }]
    : [{ accountCode: cls.account, debit: amount, credit: 0 }, { accountCode: bankCode, debit: 0, credit: amount }]
  const entry = buildEntry({ ...common, date: row.date, description: row.description, source: 'cash', settled: true, needsReview: cls.review, lines })
  return [entry]
}

/** 供預覽：不建傳票，只回報單列將如何處理。 */
export interface RowPlan {
  debitCode: string
  creditCode: string
  account: string // 非銀行腳
  review: boolean
  accrual: boolean
  accrualDate?: string
}

export function planRow(row: RowInput, bankCode: string, accounts: Account[], opts: BuildOpts = {}): RowPlan {
  const accrualOn = opts.accrualOn !== false
  const apAccount = opts.apAccount ?? '2101'
  const arAccount = opts.arAccount ?? '1141'
  const codes = new Set(accounts.map((a) => a.code))
  const cls = classifyRow(row, accounts, opts)
  const code = parsePeriodCode(row.description)
  const [payY, payM] = row.date.split('-').map(Number)
  const crossPeriod = !!code && (code.year < payY || (code.year === payY && code.month < payM))
  const control = row.direction === 'in' ? arAccount : apAccount
  const accrual = accrualOn && crossPeriod && cls.source !== 'fallback' && !cls.review && isPnL(cls.account, accounts) && codes.has(control)
  const debitCode = row.direction === 'in' ? bankCode : cls.account
  const creditCode = row.direction === 'in' ? cls.account : bankCode
  return {
    debitCode, creditCode, account: cls.account, review: cls.review,
    accrual, accrualDate: accrual && code ? monthEndISO(code.year, code.month) : undefined,
  }
}
