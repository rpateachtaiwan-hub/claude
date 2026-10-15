import { describe, it, expect, vi, afterEach } from 'vitest'
import { checkOn, companyByHolderName, dominantCompany, matchAccountByNo, normalizeRow } from './bankBalance.mjs'
import { handler } from '../functions/bank-balance.mjs'

const ACCOUNTS = [
  { code: '1101', name: '現金/零用金', isCash: true },
  { code: '1102', name: '銀行存款-國泰(001035016976)', isCash: true },
  { code: '1103', name: '銀行存款-台企銀', isCash: true },
  { code: '1111', name: '銀行存款-國泰旅行社(031-006012)', isCash: true },
  { code: '1114', name: '銀行存款-國泰娛樂(062-010608)', isCash: true },
  { code: '4101', name: '收入(062-010608)', isCash: false },
]

describe('帳號 → 銀行科目', () => {
  it('國泰簡寫 分行3碼-末6碼', () => {
    expect(matchAccountByNo(ACCOUNTS, '062035010608')).toEqual({ code: '1114' })
    expect(matchAccountByNo(ACCOUNTS, '031035006012')).toEqual({ code: '1111' })
  })
  it('完整帳號、含連字號輸入', () => {
    expect(matchAccountByNo(ACCOUNTS, '0010-3501-6976')).toEqual({ code: '1102' })
  })
  it('外匯或未登錄帳號 → 錯誤', () => {
    expect(matchAccountByNo(ACCOUNTS, '031087072820').error).toMatch(/找不到/)
  })
})

describe('公司推斷', () => {
  it('分錄最常見的公司', () => {
    expect(dominantCompany(['娛樂', '娛樂', '旅行社'])).toBe('娛樂')
  })
  it('戶名唯一命中', () => {
    expect(companyByHolderName(['旅行社', '娛樂', '租車'], '路特娛樂有限公司')).toBe('娛樂')
    expect(companyByHolderName(['路特', '娛樂'], '路特娛樂有限公司')).toBeNull()
  })
})

describe('資料正規化與核對', () => {
  it('字串金額、民國日期', () => {
    expect(normalizeRow({ date: '115/10/14', accountNo: '062-035-010608', balance: '878,803.00', available: '878,803.00' }, 0).row)
      .toMatchObject({ date: '2026-10-14', accountNo: '062035010608', balance: 878803, available: 878803 })
    expect(normalizeRow({ date: 'x', accountNo: '1', balance: 1 }, 0).error).toMatch(/日期/)
  })
  it('錨點 + 流水 vs 銀行', () => {
    const bal = (date, balance) => ({ id: date, date, balance })
    const ent = (date, d, c) => ({ date, lines: [{ accountCode: '1114', debit: d, credit: c }, { accountCode: '4101', debit: c, credit: d }] })
    const entries = [ent('2026-01-01', 7, 0), ent('2026-01-05', 500, 0), ent('2026-01-06', 0, 100)]
    expect(checkOn([bal('2026-01-01', 1000), bal('2026-01-06', 1400)], entries, '1114', '2026-01-06')).toMatchObject({ status: 'match', computed: 1400, diff: 0 })
    expect(checkOn([bal('2026-01-01', 1000), bal('2026-01-06', 1300)], entries, '1114', '2026-01-06')).toMatchObject({ status: 'mismatch', diff: 100 })
    expect(checkOn([], entries, '1114', '2026-01-06').status).toBe('no_anchor')
  })
})

// ── 端到端：以假的 Supabase REST 驗證整支 API ───────────────────────────────
describe('bank-balance API', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  function fakeSupabase(state) {
    const calls = []
    vi.stubGlobal('fetch', async (u, init = {}) => {
      const url = new URL(u)
      const table = url.pathname.split('/').pop()
      calls.push({ method: init.method ?? 'GET', table, search: decodeURIComponent(url.search) })
      if ((init.method ?? 'GET') === 'POST') {
        for (const r of JSON.parse(init.body)) state.rules = [...state.rules.filter((x) => x.id !== r.id), r]
        return new Response(null, { status: 201 })
      }
      const q = decodeURIComponent(url.search)
      let rows
      if (table === 'accounts') rows = ACCOUNTS.map((data) => ({ data }))
      else if (table === 'companies') rows = state.companies.map((name) => ({ name }))
      else if (table === 'rules') {
        const prefix = q.match(/id=like\."(.*)\*"/)[1]
        rows = state.rules.filter((r) => r.id.startsWith(prefix)).map((r) => ({ data: r.data }))
      } else if (table === 'entries') {
        const filter = JSON.parse(q.match(/data=cs\.(\{.*\})/)[1])
        const code = filter.lines[0].accountCode
        const hit = state.entries.filter((e) => e.lines.some((l) => l.accountCode === code) && (!filter.company || e.company === filter.company))
        rows = q.includes('select=company') ? hit.map((e) => ({ company: e.company })) : hit.map((data) => ({ data }))
      }
      return new Response(JSON.stringify(rows), { status: 200 })
    })
    return calls
  }
  const call = (body, token = 'secret') => handler({ httpMethod: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  const env = () => {
    vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'svc')
    vi.stubEnv('ROBOT_TOKEN', 'secret')
  }
  const entry = (date, amt) => ({ date, company: '娛樂', lines: [{ accountCode: '1114', debit: amt, credit: 0 }, { accountCode: '4101', debit: 0, credit: amt }] })

  it('金鑰錯誤 → 401；未設定 → 501', async () => {
    expect((await call({ rows: [] })).statusCode).toBe(501)
    env(); fakeSupabase({ rules: [], entries: [], companies: [] })
    expect((await call({ rows: [{}] }, 'nope')).statusCode).toBe(401)
  })

  it('寫入：帳號自動對科目、公司由分錄推斷，回傳核對結果', async () => {
    env()
    const state = { companies: ['娛樂', '旅行社'], entries: [entry('2026-01-05', 300)], rules: [] }
    fakeSupabase(state)
    let res = await call({ rows: [{ date: '2026-01-01', accountNo: '062035010608', balance: 1000 }] })
    let out = JSON.parse(res.body)
    expect(res.statusCode).toBe(200)
    expect(out.results[0]).toMatchObject({ accountCode: '1114', company: '娛樂', status: 'anchor' })
    expect(state.rules[0].id).toBe('DB|娛樂|1114|2026-01-01')
    expect(state.rules[0].data).toMatchObject({ kind: 'daily_bal', balance: 1000, source: 'rpa' })

    res = await call({ rows: [{ date: '2026/01/05', accountNo: '062035010608', balance: '1,250.00', available: '1,250.00' }] })
    out = JSON.parse(res.body)
    expect(out.results[0]).toMatchObject({ status: 'mismatch', computed: 1300, diff: 50 })
    expect(state.rules).toHaveLength(2)
  })

  it('dryRun 不寫入；無法對應的帳號回報錯誤但不影響其他列', async () => {
    env()
    const state = { companies: ['娛樂'], entries: [entry('2026-01-05', 300)], rules: [] }
    fakeSupabase(state)
    const res = await call({ dryRun: true, rows: [
      { date: '2026-01-01', accountNo: '062035010608', balance: 1000 },
      { date: '2026-01-01', accountNo: '031087072820', balance: 5 },
    ] })
    const out = JSON.parse(res.body)
    expect(res.statusCode).toBe(200)
    expect(out.ok).toBe(false)
    expect(out.written).toBe(0)
    expect(out.results).toHaveLength(1)
    expect(out.errors[0]).toMatch(/031087072820/)
    expect(state.rules).toHaveLength(0)
  })
})
