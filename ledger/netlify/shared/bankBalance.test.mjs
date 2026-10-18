import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('./openingBalances.mjs', () => ({ ANCHOR_DATE: '2026-01-01', OPENING_BALANCES: { '1114': 1000 } }))
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
  it('零用金等非銀行科目即使名稱含帳號也不對應', () => {
    expect(matchAccountByNo([{ code: '1101', name: '零用金(062-010608)', isCash: true }], '062035010608').error).toMatch(/找不到/)
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
  it('起算餘額 + 起算日後流水 vs 同日銀行', () => {
    const ent = (date, d, c, company) => ({ date, company, lines: [{ accountCode: '1114', debit: d, credit: c }, { accountCode: '4101', debit: c, credit: d }] })
    const entries = [ent('2026-01-01', 7, 0, 'A'), ent('2026-01-05', 500, 0, 'A'), ent('2026-01-06', 0, 100, 'B')]
    expect(checkOn(1000, entries, '1114', '2026-01-06', 1400)).toMatchObject({ status: 'match', computed: 1400, diff: 0 })
    expect(checkOn(1000, entries, '1114', '2026-01-06', 1300)).toMatchObject({ status: 'mismatch', diff: 100 })
    expect(checkOn(undefined, entries, '1114', '2026-01-06', 1).status).toBe('no_anchor')
    expect(checkOn(1000, entries, '1114', '2026-01-01', 1).status).toBe('before_anchor')
  })
})

// ── 端到端：以假的 Supabase REST 驗證整支 API ───────────────────────────────
describe('bank-balance API', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  function fakeSupabase(state) {
    const calls = []
    vi.stubGlobal('fetch', async (u, init = {}) => {
      const url = new URL(u)
      // GoTrue 驗證：robot-jwt = 機器人帳號、user-jwt = 一般使用者、其他 = 無效憑證
      if (url.pathname.endsWith('/auth/v1/user')) {
        const tok = (init.headers?.Authorization || '').replace(/^Bearer\s+/i, '')
        if (tok === 'robot-jwt') return new Response(JSON.stringify({ email: 'rpateachtaiwan@gmail.com' }), { status: 200 })
        if (tok === 'user-jwt') return new Response(JSON.stringify({ email: 'someone@else.com' }), { status: 200 })
        return new Response('{}', { status: 401 })
      }
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
  const call = (body, token = 'robot-jwt') => handler({ httpMethod: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  const env = () => {
    vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'svc')
  }
  const entry = (date, amt) => ({ date, company: '娛樂', lines: [{ accountCode: '1114', debit: amt, credit: 0 }, { accountCode: '4101', debit: 0, credit: amt }] })

  it('憑證無效 → 401；非機器人帳號 → 403；未設定 → 501', async () => {
    expect((await call({ rows: [] })).statusCode).toBe(501)
    env(); fakeSupabase({ rules: [], entries: [], companies: [] })
    expect((await call({ rows: [{}] }, 'nope')).statusCode).toBe(401)
    expect((await call({ rows: [{}] }, 'user-jwt')).statusCode).toBe(403)
  })

  it('寫入：帳號自動對科目、公司由分錄推斷；推算 = 設定的起算餘額 + 流水（不分公司），與同日銀行比對', async () => {
    env()
    const other = { ...entry('2026-01-06', 20), company: '旅行社' } // 公司標錯的分錄仍計入同一銀行帳戶
    const state = { companies: ['娛樂', '旅行社'], entries: [entry('2025-12-31', 999), entry('2026-01-05', 300), entry('2026-01-05', 1), other], rules: [] }
    fakeSupabase(state)
    const res = await call({ rows: [{ date: '2026/01/06', accountNo: '062035010608', balance: '1,250.00', available: '1,250.00' }] })
    const out = JSON.parse(res.body)
    expect(res.statusCode).toBe(200)
    expect(out.results[0]).toMatchObject({ accountCode: '1114', company: '娛樂', status: 'mismatch', computed: 1321, diff: 71 })
    expect(state.rules[0].id).toBe('DB|娛樂|1114|2026-01-06')
    expect(state.rules[0].data).toMatchObject({ kind: 'daily_bal', balance: 1250, available: 1250, source: 'rpa' })
  })

  it('dryRun 不寫入；無法對應的帳號回報錯誤但不影響其他列', async () => {
    env()
    const state = { companies: ['娛樂'], entries: [entry('2026-01-05', 300)], rules: [] }
    fakeSupabase(state)
    const res = await call({ dryRun: true, rows: [
      { date: '2026-01-05', accountNo: '062035010608', balance: 1301 },
      { date: '2026-01-05', accountNo: '031087072820', balance: 5 },
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
