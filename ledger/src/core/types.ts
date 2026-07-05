// =============================================================================
// 輕記帳 — 領域型別
// 金額一律「整數元」(TWD 無小數)。科目以 code 為主鍵（字串，跨示範/雲端皆穩定）。
// =============================================================================

export type Category = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
export type Side = 'debit' | 'credit'
export type EntrySource = 'cash' | 'accrual' | 'settlement' | 'manual'

export interface Account {
  code: string
  name: string
  category: Category
  /** 正常餘額方向 */
  normalBalance: Side
  /** 是否為現金/銀行類科目（現金流量表用） */
  isCash?: boolean
  /** 是否為應收/應付（需沖款追蹤） */
  isOpenItem?: boolean
  active?: boolean
}

/** 一條分錄明細 */
export interface EntryLine {
  accountCode: string
  debit: number
  credit: number
}

/** 一張傳票（複式，借貸平衡） */
export interface JournalEntry {
  id: string
  /** 流水號（遞增整數，支援上兆筆） */
  seq?: number
  date: string // YYYY-MM-DD
  description: string
  counterparty?: string
  /** 所屬公司（多公司帳務用） */
  company?: string
  source: EntrySource
  lines: EntryLine[]
  /** 若此筆為應計（產生應收/應付），記錄是否已收/付清（沖銷後為 true） */
  settled?: boolean
  /** 若此筆為「沖銷（收/付款）」分錄，指向被沖銷的應計傳票 id */
  settles?: string
  /** 對方帳號（銀行匯入用） */
  counterpartyAccount?: string
  /** 交易分行（銀行匯入用） */
  branch?: string
  /** 憑證編號（發票號碼 / 憑證類別） */
  voucherNo?: string
  /** 備註（自由文字） */
  note?: string
  /** 無法辨識科目、待人工/AI 補分類 */
  needsReview?: boolean
  /** 人工核對完成時間（核對進度追蹤用；未核對為空） */
  reviewedAt?: string
  createdAt?: string
}

// ── 智慧建議相關 ──────────────────────────────────────────────────────────────

/** 使用者在「記一筆」輸入的精簡資料 */
export interface QuickInput {
  date: string
  amount: number
  description: string
  counterparty?: string
  /** 所屬公司 */
  company?: string
  /** 憑證編號 */
  voucherNo?: string
  /** 錢的方向：收入帳(in) / 支出(out) */
  direction: 'in' | 'out'
  /** 使用的現金/銀行科目 code（現金基礎時）；應計時可省略 */
  cashAccountCode?: string
  /** 是否為應計（未實際收付，產生應收/應付） */
  accrual?: boolean
}

/** 學習規則：關鍵字/對象 → 建議科目 */
export interface Rule {
  id: string
  /** 比對用關鍵字（出現在摘要或對象中即命中） */
  keyword: string
  /** 建議的損益/資產/負債科目 code（非現金那一腳） */
  accountCode: string
  /** 適用方向；'any' 表示不分收支 */
  direction: 'in' | 'out' | 'any'
  /** 權重：每次被採用 +1，越高越優先 */
  weight: number
}

/** 建議結果 */
export interface Suggestion {
  /** 建議產生的傳票（借貸已配好） */
  entry: Omit<JournalEntry, 'id' | 'createdAt'>
  /** 命中的科目 code（非現金腳） */
  accountCode: string
  /** 此科目腳的方向 */
  side: Side
  /** 信心：'rule'=學過的規則命中、'default'=用類別預設 */
  confidence: 'rule' | 'default'
  /** 命中的規則（若有），供解釋 */
  matchedRule?: Rule
  reason: string
}
