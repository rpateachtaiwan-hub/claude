// =============================================================================
// 銀行餘額機器人 API 的純邏輯（無 I/O，供 netlify/functions/bank-balance.mjs 使用並可單元測試）。
// 與前端 src/core/dailyBalance.ts 共用相同規則：id = DB|公司|科目|日期、餘額為日終、
// 推算餘額 = 起算日(含)後最早一筆餘額為錨點 + 錨點後至當日的銀行科目淨變動。
// =============================================================================

export const ANCHOR_DATE = '2026-01-01'

export const dailyBalanceId = (company, accountCode, date) => `DB|${company}|${accountCode}|${date}`

const digits = (s) => String(s ?? '').replace(/\D/g, '')

/**
 * 以銀行帳號找系統的銀行科目：比對科目名稱括號內的帳號。
 * 支援完整帳號（001035016976）與國泰簡寫「分行3碼-末6碼」（062-010608 ↔ 062035010608）。
 * 回傳 { code } 或 { error }。
 */
export function matchAccountByNo(accounts, accountNo) {
  const no = digits(accountNo)
  if (no.length < 6) return { error: `帳號「${accountNo}」格式不正確` }
  const hits = []
  for (const a of accounts) {
    if (!a || !a.isCash) continue
    const groups = String(a.name ?? '').match(/\d[\d-]{4,}\d/g) ?? []
    const ok = groups.some((g) => {
      const parts = g.split('-')
      if (parts.length === 2 && parts[0].length === 3 && parts[1].length === 6) {
        return no.length >= 9 && no.startsWith(parts[0]) && no.endsWith(parts[1])
      }
      return digits(g) === no
    })
    if (ok) hits.push(a.code)
  }
  if (hits.length === 1) return { code: hits[0] }
  if (hits.length === 0) return { error: `找不到帳號 ${accountNo} 對應的銀行科目（請在科目名稱括號內註明帳號）` }
  return { error: `帳號 ${accountNo} 對到多個科目：${hits.join('、')}` }
}

/** 由分錄推斷某銀行科目屬於哪家公司：取使用該科目最多次的公司。 */
export function dominantCompany(companiesOfEntries) {
  const count = new Map()
  for (const c of companiesOfEntries) {
    const k = c ?? ''
    count.set(k, (count.get(k) ?? 0) + 1)
  }
  let best = null, n = 0
  for (const [k, v] of count) if (v > n) { best = k; n = v }
  return best
}

/** 以戶名比對公司清單（如「路特娛樂有限公司」↔「娛樂」或「路特娛樂」）；唯一命中才回傳。 */
export function companyByHolderName(companies, holderName) {
  const h = String(holderName ?? '').trim()
  if (!h) return null
  const exact = companies.find((c) => c === h)
  if (exact) return exact
  const hits = companies.filter((c) => c && (h.includes(c) || c.includes(h)))
  return hits.length === 1 ? hits[0] : null
}

/** 金額：接受數字或「878,803.00」字串，四捨五入為整數元。 */
export function toAmount(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v)
  const t = String(v ?? '').replace(/[,\s]|NT\$|\$|元/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  return Math.round(Number(t))
}

/** 日期：2026-10-14、2026/10/14、115/10/14 → YYYY-MM-DD。 */
export function toDate(s) {
  const m = String(s ?? '').trim().match(/^(\d{2,4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (!m) return null
  let y = Number(m[1])
  if (y < 1911) y += 1911
  const mo = Number(m[2]), d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** 驗證並正規化一列機器人送來的資料；回傳 { row } 或 { error }。 */
export function normalizeRow(r, i) {
  const at = `第 ${i + 1} 筆`
  const date = toDate(r?.date)
  if (!date) return { error: `${at}：日期「${r?.date}」無法辨識` }
  const balance = toAmount(r?.balance)
  if (balance === null) return { error: `${at}：帳戶餘額「${r?.balance}」不是數字` }
  const available = r?.available === undefined || r?.available === '' ? undefined : toAmount(r.available)
  if (available === null) return { error: `${at}：可用餘額「${r?.available}」不是數字` }
  if (!r?.accountNo && !r?.accountCode) return { error: `${at}：缺少帳號 accountNo` }
  return {
    row: {
      date, balance, available,
      accountNo: r.accountNo ? digits(r.accountNo) : undefined,
      accountCode: r.accountCode ? String(r.accountCode) : undefined,
      company: typeof r.company === 'string' ? r.company : undefined,
      holderName: r.holderName ? String(r.holderName) : undefined,
    },
  }
}

/** 某分錄對某銀行科目的淨變動（借 − 貸）。 */
export function netOf(entry, accountCode) {
  let n = 0
  for (const l of entry?.lines ?? []) if (l.accountCode === accountCode) n += (l.debit || 0) - (l.credit || 0)
  return n
}

/**
 * 推算某日日終餘額並與銀行比對。
 * balances：該（公司, 科目）所有每日餘額（含本次寫入）；entries：該公司含此科目的分錄。
 */
export function checkOn(balances, entries, accountCode, date, anchorDate = ANCHOR_DATE) {
  const sorted = balances.filter((b) => b.date >= anchorDate).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const anchor = sorted[0]
  if (!anchor) return { status: 'no_anchor' }
  if (anchor.date === date) return { status: 'anchor', anchorDate: anchor.date, computed: anchor.balance, diff: 0 }
  if (date < anchor.date) return { status: 'before_anchor', anchorDate: anchor.date }
  let computed = anchor.balance
  for (const e of entries) if (e.date > anchor.date && e.date <= date) computed += netOf(e, accountCode)
  const bank = sorted.find((b) => b.date === date)?.balance
  const diff = bank === undefined ? undefined : computed - bank
  return { status: diff === 0 ? 'match' : 'mismatch', anchorDate: anchor.date, computed, diff }
}
