// =============================================================================
// 智慧匯入配對（多公司版）：
//  1. 分類順序：類別覆寫 → 類別精確對應科目名 → 內容關鍵字（可分方向）
//     → 類別前綴唯一對應 → 類別子字串 → 待確認
//  2. 期別解析：YYMM（2604、2512，含內文獨立 token）、單月（月結-12月、12月健保費，
//     月份大於付款月自動視為前一年）、區間（1-4月、11、12月 → 標待確認不自動拆）
//  3. 跨期且科目確定 → 自動拆「應計(該月月底) + 沖銷(付款日)」
//  4. 重複偵測：日期+金額+摘要(去空白)+公司，按「數量」比對（同日同額合法重複不誤刪）
// 純函式，方便測試。所有金額為整數元。
// =============================================================================

import { buildEntry } from './engine'
import { UNIFIED_PRESET_ACCOUNTS } from './accounts'
import type { Account, JournalEntry } from './types'

/** 名稱正規化（去空白/符號），科目名稱比對用。 */
export function normAccountName(s: string): string {
  return String(s).replace(/[\s/／\-‐–（）()．.]/g, '')
}

const PRESET_BY_CODE = new Map(UNIFIED_PRESET_ACCOUNTS.map((a) => [a.code, a]))

/**
 * 解析規則目標科目：規則寫的是「建議科目表的編號」，但使用者可能已改編號。
 * 1) 先找名稱與建議科目相同的科目（編號可能不同）
 * 2) 名稱找不到時，僅當該編號無建議名稱可比才直接用編號
 *    （編號被「不同名稱」的科目佔用時視為語意衝突 → 不採用，讓該列落到後續判斷/待確認）
 */
export function resolveRuleTarget(presetCode: string, nameIndex: Map<string, string>, codes: Set<string>): string | null {
  const preset = PRESET_BY_CODE.get(presetCode)
  if (preset) {
    const byName = nameIndex.get(normAccountName(preset.name))
    if (byName) return byName
    return null // 有預期名稱但科目表中不存在同名科目 → 規則暫時失效（避免記錯位置）
  }
  return codes.has(presetCode) ? presetCode : null
}

/** 關鍵字 → 非現金腳科目。最具體者放前面（子字串比對，先命中者勝）。 */
export interface KeywordRule {
  match: string
  account: string
  /** 命中但仍需人工確認（先入帳、標記待分類） */
  review?: boolean
  /** 僅在指定收支方向時適用（未指定＝不分方向） */
  direction?: 'in' | 'out'
}

// 注意順序：實體專屬規則在通用規則之前（如 Jeff個人帳戶 需在 代墊款 之前、
// 客人現金款存入 在 現金款存入 之前、直客收入 在 蝦皮 之前）。
// 目標編號兩種形式：建議科目表編號（先認名稱解析，使用者改碼自動跟上），
// 或使用者確認的自訂編號（112/212/402/521/531/501/609/610/611/6021/6022，直接認編號）。
export const KEYWORD_RULES: KeywordRule[] = [
  // 關係人／股東往來（實體專屬）
  { match: 'Jeff個人帳戶', account: '2302' },
  { match: 'Jeff帳戶', account: '2302' },
  { match: '娛樂公司購買', account: '4999', review: true }, // 關係人銷貨：使用者要求逐筆確認
  { match: '向貿易公司購買', account: '5104' },
  { match: '週轉金', account: '2301' },
  { match: '周轉金', account: '2301' },
  // 酒商成本 → 521 營業成本-酒
  { match: '代付酒貨款', account: '521' },
  { match: 'Austin個人帳戶', account: '521' },
  { match: '酒貨款', account: '521' },
  { match: '國貿公司', account: '521', direction: 'out' },
  // 借款（台企銀/玉山/和潤 皆併入 212）
  { match: '企貸還款', account: '212' },
  { match: '台企銀', account: '212' },
  { match: '玉山', account: '212' },
  { match: '和潤', account: '212' },
  // 收入
  { match: 'KP店', account: '4107', direction: 'in' },
  { match: '客人現金款存入', account: '4104', direction: 'in' },
  { match: '信用卡帳款', account: '4101', direction: 'in' },
  { match: '信用卡收單', account: '4101', direction: 'in' },
  { match: '美國運通', account: '4102', direction: 'in' },
  { match: '運通帳款', account: '4102', direction: 'in' },
  { match: 'iCash', account: '4103', direction: 'in' },
  { match: 'iPass', account: '4103', direction: 'in' },
  { match: '直客收入', account: '4109', direction: 'in' },
  { match: '蝦皮', account: '402', direction: 'in' },
  { match: '綠界', account: '402', direction: 'in' },
  { match: '平台收入', account: '402', direction: 'in' },
  { match: '賣貨便', account: '402', direction: 'in' },
  { match: '租金', account: '4111', direction: 'in' },
  { match: '存款利息', account: '4201', direction: 'in' },
  { match: '存款息', account: '4201', direction: 'in' },
  { match: '退稅代墊返還', account: '4999', review: true },
  { match: '現金款存入', account: '4999', review: true },
  { match: '高雄費用', account: '4999', review: true },
  // 車隊（收入/成本依方向；成本 → 501 營業成本-車資）
  { match: '舉牌', account: '501', direction: 'out' },
  { match: '車資', account: '4105', direction: 'in' },
  { match: '車資', account: '501', direction: 'out' },
  { match: '包車', account: '4105', direction: 'in' },
  { match: '張維中', account: '4105', direction: 'in' },
  { match: '張維中', account: '501', direction: 'out' },
  // 電商／門市成本
  { match: '國際物流', account: '5201', direction: 'out' },
  { match: '物流費', account: '5201', direction: 'out' },
  { match: '進口稅', account: '5202', direction: 'out' },
  { match: '貨款', account: '531', direction: 'out' }, // 531 營業成本-商品
  // 費用
  { match: '勞工退休金', account: '6022' },
  { match: '勞退', account: '6022' },
  { match: '健保費', account: '6021' },
  { match: '勞保費', account: '6021' },
  { match: '薪資', account: '6101', direction: 'out' },
  { match: '加班費', account: '6101', direction: 'out' },
  { match: '獎金', account: '6101', direction: 'out' },
  { match: '內江街', account: '609', direction: 'out' },
  { match: '房租', account: '609', direction: 'out' },
  { match: '租金', account: '609', direction: 'out' }, // 支出方向（收入方向在上）
  { match: '外送費用', account: '6107', direction: 'out' },
  { match: '手續費', account: '6105' },
  { match: '北水', account: '611' },
  { match: '水費', account: '611' },
  { match: '電費', account: '611' },
  { match: '中華電信', account: '610' },
  { match: '電信', account: '610' },
  { match: '網路費', account: '610' },
  { match: '電話', account: '610' },
  { match: '清潔', account: '6199' },
  { match: '禮金', account: '6108' },
  { match: '帳務服務費', account: '6109' },
  { match: '會計', account: '6109' },
  { match: '律師', account: '6109' },
  { match: '法顧', account: '6109' },
  { match: '簽證', account: '6109' },
  { match: '記帳', account: '6109' },
  { match: '諮詢', account: '6109' },
  { match: '各類所得扣繳稅款', account: '2140', review: true },
  { match: '營業稅', account: '6110', direction: 'out' },
  { match: '牌照稅', account: '6110' },
  { match: '燃料', account: '6110' },
  { match: '公路養管費', account: '6110' },
  { match: '違規', account: '6111', direction: 'out' },
  { match: '罰鍰', account: '6111', direction: 'out' },
  { match: '罰單', account: '6111', direction: 'out' },
  { match: '強制險', account: '6112' },
  { match: '任意險', account: '6112' },
  { match: '保險', account: '6112' },
  { match: '雜支', account: '6199', direction: 'out' },
  // 資產／轉帳 → 112 現金/零用金
  { match: '大同分行提領', account: '112' },
  { match: '自行提款', account: '112' },
  { match: '零用金', account: '112' },
  { match: '提領', account: '112' },
  // 通用（最後才落到這些）
  { match: '代墊款', account: '6199', review: true, direction: 'out' },
]

/** 期初餘額列（如「114/12/31餘額」）：依使用者設定不入帳，匯入時整列略過。 */
export function isOpeningBalanceRow(desc: string): boolean {
  return /餘額/.test(String(desc))
}

/** 以內容關鍵字配科目；目標科目「先認名稱、再認編號」（使用者改過編號也能跟上）。未命中回 null。 */
export function matchByDescription(
  desc: string,
  accounts: Account[],
  direction?: 'in' | 'out',
): { account: string; review: boolean } | null {
  const codes = new Set(accounts.map((a) => a.code))
  const nameIndex = new Map(accounts.map((a) => [normAccountName(a.name), a.code]))
  for (const r of KEYWORD_RULES) {
    if (r.direction && direction && r.direction !== direction) continue
    if (!desc.includes(r.match)) continue
    const target = resolveRuleTarget(r.account, nameIndex, codes)
    if (target) return { account: target, review: !!r.review }
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

export type PeriodHit = { kind: 'month'; year: number; month: number } | { kind: 'range' }

/**
 * 擴充期別解析（相對付款年月）：
 *  1. YYMM 四位數 token（開頭或內文獨立出現，如「月結-2512租車公司車資」）
 *  2. 區間「1-4月」「11、12月」→ range（不自動拆，標待確認）
 *  3. 單月「12月」「月結-2月」→ 月份==付款月不拆；月份>付款月視為前一年
 * 僅回傳「早於付款月」的期別；同月/未來月回 null（照現金入帳）。
 */
export function parsePeriodEx(desc: string, payYear: number, payMonth: number): PeriodHit | null {
  const t = String(desc).trim()
  const tok = t.match(/(?:^|\D)(\d{2})(\d{2})(?=\D|$)/)
  if (tok) {
    const yy = Number(tok[1])
    const mm = Number(tok[2])
    if (yy >= 20 && yy <= 40 && mm >= 1 && mm <= 12) {
      const y = 2000 + yy
      if (y < payYear || (y === payYear && mm < payMonth)) return { kind: 'month', year: y, month: mm }
      return null
    }
  }
  if (/\d{1,2}\s*[-–~、,，]\s*\d{1,2}\s*月/.test(t)) return { kind: 'range' }
  const m = t.match(/(\d{1,2})\s*月/)
  if (m) {
    const mm = Number(m[1])
    if (mm >= 1 && mm <= 12 && mm !== payMonth) {
      const y = mm > payMonth ? payYear - 1 : payYear
      return { kind: 'month', year: y, month: mm }
    }
  }
  return null
}

/** 科目是否為損益（收入/費用/成本），可作跨期應計。資產/負債/權益不應計。 */
export function isPnL(accountCode: string, accounts: Account[]): boolean {
  const a = accounts.find((x) => x.code === accountCode)
  return !!a && (a.category === 'revenue' || a.category === 'expense')
}

/**
 * 動態解析應收/應付控制科目（編號可能被使用者改過，如 1141→1123）：
 * 優先「isOpenItem 旗標 + 對應類別」，其次名稱含 應收/應付 的同類別科目。
 */
export function resolveControlAccount(direction: 'in' | 'out', accounts: Account[]): string | null {
  const cat = direction === 'in' ? 'asset' : 'liability'
  const kw = direction === 'in' ? '應收' : '應付'
  const flagged = accounts.find((a) => a.isOpenItem && a.category === cat)
  if (flagged) return flagged.code
  const byName = accounts.find((a) => a.category === cat && a.name.includes(kw))
  return byName?.code ?? null
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
  /** 類別文字子字串配對的最終 fallback（沿用既有 matchCategory 傳入結果） */
  matchCategory?: (catText: string, accounts: Account[]) => string | null
}

export interface Classified {
  account: string
  review: boolean
  source: 'keyword' | 'category' | 'fallback'
}

/**
 * 決定非現金腳科目。順序：
 * 類別覆寫 → 類別精確對應科目名 → 內容關鍵字 → 類別前綴唯一對應 → 類別子字串 → 待確認。
 * 另做方向合理性檢查：費用科目卻是收款（退費/退稅）或收入科目卻是付款 → 標待確認。
 */
export function classifyRow(row: RowInput, accounts: Account[], opts: ClassifyOpts = {}): Classified {
  const codes = new Set(accounts.map((a) => a.code))
  const cat = (row.catText ?? '').trim()

  let account: string | null = null
  let review = false
  let source: Classified['source'] = 'fallback'

  const ov = cat ? opts.catOverride?.[cat] : undefined
  if (ov && codes.has(ov)) {
    account = ov; source = 'category'
  }
  if (!account && cat) {
    // 類別精確等於科目名（股東往來-娛樂、股東往來-菸酒…這類類別標得很準）
    const exact = accounts.find((a) => !a.isCash && a.name === cat)
    if (exact) { account = exact.code; source = 'category' }
  }
  if (!account) {
    const kw = matchByDescription(row.description, accounts, row.direction)
    if (kw) { account = kw.account; review = kw.review; source = 'keyword' }
  }
  if (!account && cat.length >= 2) {
    // 類別為科目名前綴且唯一（如 類別「長期借款」→ 科目「長期借款-和潤」）
    const pref = accounts.filter((a) => !a.isCash && a.name.startsWith(cat))
    if (pref.length === 1) { account = pref[0].code; source = 'category' }
  }
  if (!account && cat) {
    const auto = opts.matchCategory?.(cat, accounts) ?? null
    if (auto && codes.has(auto)) { account = auto; source = 'category' }
  }
  if (!account) {
    account = row.direction === 'in' ? '4999' : '6999'
    review = true; source = 'fallback'
  }

  // 方向合理性：費用科目＋收款（退費/退稅類）或收入科目＋付款 → 需人工確認
  const acc = accounts.find((a) => a.code === account)
  if (acc && ((acc.category === 'expense' && row.direction === 'in') || (acc.category === 'revenue' && row.direction === 'out'))) {
    review = true
  }

  return { account, review, source }
}

export interface BuildOpts extends ClassifyOpts {
  /** 全域是否啟用跨期自動拆應計（預設 true） */
  accrualOn?: boolean
  /** 應付控制科目（費用/成本應計用），預設 2101 */
  apAccount?: string
  /** 應收控制科目（收入應計用），預設 1141 */
  arAccount?: string
}

function resolvePlan(row: RowInput, accounts: Account[], opts: BuildOpts) {
  const accrualOn = opts.accrualOn !== false
  const codes = new Set(accounts.map((a) => a.code))
  const cls = classifyRow(row, accounts, opts)
  const [payY, payM] = row.date.split('-').map(Number)
  const period = parsePeriodEx(row.description, payY, payM)
  const isRange = period?.kind === 'range'
  const review = cls.review || isRange
  const control = (row.direction === 'in' ? opts.arAccount : opts.apAccount)
    ?? resolveControlAccount(row.direction, accounts)
    ?? (row.direction === 'in' ? '1141' : '2101')
  const canAccrue = accrualOn && period?.kind === 'month' && cls.source !== 'fallback' && !review
    && isPnL(cls.account, accounts) && codes.has(control)
  return { cls, review, control, canAccrue, period }
}

/**
 * 單列 → 一或兩張傳票。
 *  - 一般：單張現金分錄（銀行 vs 非銀行科目）。
 *  - 跨期（期別 < 付款月、且為損益科目、科目確定）：應計(月底) + 沖銷(付款日)。
 */
export function rowToEntries(
  row: RowInput,
  bankCode: string,
  accounts: Account[],
  opts: BuildOpts = {},
): JournalEntry[] {
  const { cls, review, control, canAccrue, period } = resolvePlan(row, accounts, opts)
  const amount = row.amount
  const common = {
    company: row.company,
    counterpartyAccount: row.counterpartyAccount,
    branch: row.branch,
    voucherNo: row.voucherNo,
  }

  if (canAccrue && period?.kind === 'month') {
    const accrualDate = monthEndISO(period.year, period.month)
    if (row.direction === 'in') {
      // 收入應計：借 應收 / 貸 收入；收款沖銷：借 銀行 / 貸 應收
      const accrual = buildEntry({
        ...common, date: accrualDate, description: row.description, source: 'accrual', settled: false,
        lines: [
          { accountCode: control, debit: amount, credit: 0 },
          { accountCode: cls.account, debit: 0, credit: amount },
        ],
      })
      const settlement = buildEntry({
        company: row.company, date: row.date, description: `收款沖銷：${row.description}`, source: 'settlement', settles: accrual.id,
        lines: [
          { accountCode: bankCode, debit: amount, credit: 0 },
          { accountCode: control, debit: 0, credit: amount },
        ],
      })
      return [accrual, settlement]
    } else {
      // 費用/成本應計：借 費用 / 貸 應付；付款沖銷：借 應付 / 貸 銀行
      const accrual = buildEntry({
        ...common, date: accrualDate, description: row.description, source: 'accrual', settled: false,
        lines: [
          { accountCode: cls.account, debit: amount, credit: 0 },
          { accountCode: control, debit: 0, credit: amount },
        ],
      })
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
  const entry = buildEntry({ ...common, date: row.date, description: row.description, source: 'cash', settled: true, needsReview: review, lines })
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
  const { cls, review, canAccrue, period } = resolvePlan(row, accounts, opts)
  const debitCode = row.direction === 'in' ? bankCode : cls.account
  const creditCode = row.direction === 'in' ? cls.account : bankCode
  return {
    debitCode, creditCode, account: cls.account, review,
    accrual: canAccrue,
    accrualDate: canAccrue && period?.kind === 'month' ? monthEndISO(period.year, period.month) : undefined,
  }
}

// ── 重複偵測（次數式）────────────────────────────────────────────────────────

/** 摘要正規化：去除所有空白（「2604健保費」與「2604 健保費」視為相同）。 */
export function normalizeDesc(s: string): string {
  return String(s).replace(/\s+/g, '')
}

export function dupKey(date: string, amount: number, description: string, company?: string): string {
  return `${company ?? ''}|${date}|${amount}|${normalizeDesc(description)}`
}

/**
 * 由系統既有分錄建立「銀行流水列」鍵值 → 出現次數。
 *  - 現金/手動分錄：以自身日期+摘要。
 *  - 沖銷分錄：以沖銷日 + 原應計摘要（等同檔案裡的付款列）。
 *  - 應計分錄本身不代表銀行流水，略過。
 */
export function existingDupKeys(entries: JournalEntry[]): Map<string, number> {
  const byId = new Map(entries.map((e) => [e.id, e]))
  const map = new Map<string, number>()
  const add = (k: string) => map.set(k, (map.get(k) ?? 0) + 1)
  for (const e of entries) {
    const amount = e.lines.find((l) => l.debit > 0)?.debit ?? 0
    if (e.source === 'accrual') continue
    if (e.source === 'settlement') {
      const orig = e.settles ? byId.get(e.settles) : undefined
      const desc = orig?.description ?? e.description.replace(/^(付款沖銷|收款沖銷)：/, '')
      add(dupKey(e.date, amount, desc, e.company))
    } else {
      add(dupKey(e.date, amount, e.description, e.company))
    }
  }
  return map
}

/** 依剩餘次數判斷此列是否為重複（是則扣減次數並回 true）。 */
export function consumeDup(
  remaining: Map<string, number>,
  date: string,
  amount: number,
  description: string,
  company?: string,
): boolean {
  const k = dupKey(date, amount, description, company)
  const n = remaining.get(k) ?? 0
  if (n > 0) {
    remaining.set(k, n - 1)
    return true
  }
  return false
}
