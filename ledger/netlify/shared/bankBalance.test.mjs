import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('./openingBalances.mjs', () => ({
  ANCHOR_DATE: '2026-01-01',
  CASH_ACCOUNT_CODE: '112',
  BANK_ACCOUNTS: {
    '062035010608': { company: '娛樂', opening: 1000 },
    '001035016976': { company: '菸酒', opening: 500 },
  },
}))
import { checkOn, normalizeRow, resolveCompany } from './bankBalance.mjs'
import { handler } from '../functions/bank-balance.mjs'

const ACCOUNTS = [
  { code: '111', name: '庫存現金', isCash: true },
  { code: '112', name: '銀行現金', isCash: true },
  { code: '4101', name: '銷貨收入', isCash: false },
]

describe('公司名稱對照', () => {
  it('完全相同優先；前綴差異唯一命中；模糊回 null', () => {
    expect(resolveCompany('娛樂', ['路特娛樂', '路特菸酒'])).toBe('路特娛樂')
    expect(resolveCompany('路特菸酒', ['路特菸酒'])).toBe('路特菸酒')
    expect(resolveCompany('路特', ['路特娛樂', '路特菸酒'])).toBeNull()
  })
})

describe('資料正規化與核對', () => {
  it('字串金額、民國日期；缺帳號回錯誤', () => {
    expect(normalizeRow({ date: '115/10/14', accountNo: '062-035-010608', balance: '878,803.00', available: '878,803.00' }, 0).row)
      .toMatchObject({ date: '2026-10-14', accountNo: '062035010608', balance: 878803, available: 878803 })
    expect(normalizeRow({ date: 'x', accountNo: '1', balance: 1 }, 0).error).toMatch(/日期/)
    expect(normalizeRow({ date: '2026-10-14', balance: 1 }, 0).error).toMatch(/accountNo/)
  })
  it('期初餘額 + 起算日後（不含 1/1）該公司 112 流水 vs 同日銀行', () => {
    const ent = (date, d, c) => ({ date, lines: [{ accountCode: '112', debit: d, credit: c }, { accountCode: '4101', debit: c, credit: d }] })
    const entries = [ent('2026-01-01', 7, 0), ent('2026-01-05', 500, 0), ent('2026-01-06', 0, 100)]
    expect(checkOn(1000, entries, '112', '2026-01-06', 1400)).toMatchObject({ status: 'match', computed: 1400, diff: 0 })
    expect(checkOn(1000, entries, '112', '2026-01-06', 1300)).toMatchObject({ status: 'mismatch', diff: 100 })
    expect(checkOn(undefined, entries, '112', '2026-01-06', 1).status).toBe('no_anchor')
    expect(checkOn(1000, entries, '112', '2026-01-01', 1).status).toBe('before_anchor')
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
      if (table === 'accounts') rows = (state.accounts ?? ACCOUNTS).map((data) => ({ data }))
      else if (table === 'companies') rows = state.companies.map((name) => ({ name }))
      else if (table === 'entries') {
        const filter = JSON.parse(q.match(/data=cs\.(\{.*\})/)[1])
        const code = filter.lines[0].accountCode
        const hit = state.entries.filter((e) => e.lines.some((l) => l.accountCode === code) && (!filter.company || e.company === filter.company))
        rows = hit.map((data) => ({ data }))
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
  const entry = (date, amt, company = '路特娛樂') => ({ date, company, lines: [{ accountCode: '112', debit: amt, credit: 0 }, { accountCode: '4101', debit: 0, credit: amt }] })

  it('憑證無效 → 401；非機器人帳號 → 403；未設定 → 501', async () => {
    expect((await call({ rows: [] })).statusCode).toBe(501)
    env(); fakeSupabase({ rules: [], entries: [], companies: [] })
    expect((await call({ rows: [{}] }, 'nope')).statusCode).toBe(401)
    expect((await call({ rows: [{}] }, 'user-jwt')).statusCode).toBe(403)
  })

  it('寫入：帳號→設定的公司（容忍前綴：娛樂→路特娛樂）；推算只計該公司的 112 分錄', async () => {
    env()
    const state = {
      companies: ['路特娛樂', '路特菸酒'],
      entries: [entry('2025-12-31', 999), entry('2026-01-05', 300), entry('2026-01-05', 50, '路特菸酒')],
      rules: [],
    }
    fakeSupabase(state)
    const res = await call({ rows: [{ date: '2026/01/06', accountNo: '062035010608', balance: '1,250.00', available: '1,250.00' }] })
    const out = JSON.parse(res.body)
    expect(res.statusCode).toBe(200)
    // 1000(期初) + 300(路特娛樂 1/5) = 1300；1/1 前與他公司（路特菸酒 +50）不計
    expect(out.results[0]).toMatchObject({ accountCode: '112', company: '路特娛樂', status: 'mismatch', computed: 1300, diff: 50 })
    expect(state.rules[0].id).toBe('DB|路特娛樂|112|2026-01-06')
    expect(state.rules[0].data).toMatchObject({ kind: 'daily_bal', accountCode: '112', company: '路特娛樂', balance: 1250, available: 1250, source: 'rpa' })
  })

  it('dryRun 不寫入；未設定的帳號回報「未設定對應公司」但不影響其他列', async () => {
    env()
    const state = { companies: ['路特娛樂'], entries: [entry('2026-01-05', 300)], rules: [] }
    fakeSupabase(state)
    const res = await call({ dryRun: true, rows: [
      { date: '2026-01-05', accountNo: '062035010608', balance: 1300 },
      { date: '2026-01-05', accountNo: '031087072820', balance: 5 },
    ] })
    const out = JSON.parse(res.body)
    expect(res.statusCode).toBe(200)
    expect(out.ok).toBe(false)
    expect(out.written).toBe(0)
    expect(out.results).toHaveLength(1)
    expect(out.results[0]).toMatchObject({ status: 'match', computed: 1300 })
    expect(out.errors[0]).toMatch(/031087072820.*未設定對應公司/)
    expect(state.rules).toHaveLength(0)
  })

  it('科目表沒有 112 → 500 設定錯誤', async () => {
    env()
    fakeSupabase({ companies: ['路特娛樂'], entries: [], rules: [], accounts: [{ code: '1102', name: '銀行存款', isCash: true }] })
    const res = await call({ rows: [{ date: '2026-01-05', accountNo: '062035010608', balance: 1 }] })
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body).error).toMatch(/112/)
  })
})
