// Netlify serverless：銀行餘額機器人 API（UiPath 等 RPA 每日抓到網銀餘額後呼叫，直接寫入「每日餘額核對」）。
//
// POST /.netlify/functions/bank-balance
//   Header：Authorization: Bearer <ROBOT_TOKEN>（Netlify 環境變數，僅給機器人；與使用者登入無關）
//   Body：{ "dryRun": false, "rows": [ { "date": "2026-10-14", "accountNo": "062035010608",
//           "holderName": "路特娛樂有限公司", "balance": 878803, "available": 878803 } ] }
//   - accountNo 會自動對應到科目名稱括號內註明帳號的銀行科目（如「銀行存款-國泰娛樂(062-010608)」）
//   - 公司自動推斷（該科目分錄最常出現的公司；無分錄時以戶名比對）；也可直接給 company / accountCode
//   - balance = 網銀「帳戶餘額」（用於核對）；available = 「可用餘額」（僅記錄）
//   - dryRun: true 只檢查對應與核對結果，不寫入
// 回應：{ ok, written, results: [{ date, accountNo, accountCode, company, balance, status, computed, diff }], errors }
//   status：match 相符 / mismatch 不符 / anchor 起算日 / no_anchor 尚無起算餘額 / before_anchor
//
// 金鑰：SUPABASE_SERVICE_ROLE_KEY 與 ROBOT_TOKEN 只存在伺服器端環境變數。

import { timingSafeEqual } from 'node:crypto'
import {
  ANCHOR_DATE, checkOn, companyByHolderName, dailyBalanceId, dominantCompany, isBankAccount, matchAccountByNo, normalizeRow,
} from '../shared/bankBalance.mjs'

export async function handler(event) {
  try {
    return await route(event)
  } catch (e) {
    return json(500, { error: `函式錯誤：${e && e.message ? e.message : String(e)}` })
  }
}

async function route(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })

  const url = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  const robotToken = clean(process.env.ROBOT_TOKEN)
  if (!url || !serviceKey || !robotToken) return json(501, { error: 'NOT_CONFIGURED：需設定 SUPABASE_SERVICE_ROLE_KEY 與 ROBOT_TOKEN' })

  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '')
  if (!safeEqual(token, robotToken)) return json(401, { error: '機器人金鑰錯誤' })

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'bad json' }) }
  if (!Array.isArray(body.rows) || body.rows.length === 0) return json(400, { error: '缺少 rows' })
  if (body.rows.length > 500) return json(400, { error: '一次最多 500 筆' })
  const dryRun = body.dryRun === true

  const rest = makeRest(url, serviceKey)
  const accounts = (await rest.all('accounts?select=data')).map((r) => r.data)
  const companies = (await rest.all('companies?select=name')).map((r) => r.name)

  const errors = []
  const resolved = []
  const companyCache = new Map()
  for (const [i, raw] of body.rows.entries()) {
    const n = normalizeRow(raw, i)
    if (n.error) { errors.push(n.error); continue }
    const r = n.row
    let code = r.accountCode
    if (code) {
      if (!accounts.some((a) => a.code === code && isBankAccount(a))) { errors.push(`第 ${i + 1} 筆：科目 ${code} 不是銀行存款科目`); continue }
    } else {
      const m = matchAccountByNo(accounts, r.accountNo)
      if (m.error) { errors.push(`第 ${i + 1} 筆：${m.error}`); continue }
      code = m.code
    }
    let company = r.company
    if (company === undefined) {
      if (!companyCache.has(code)) {
        const used = await rest.all(`entries?select=company:data->>company&order=date.desc&data=cs.${enc(JSON.stringify({ lines: [{ accountCode: code }] }))}`, 500)
        companyCache.set(code, used.length ? dominantCompany(used.map((u) => u.company)) : null)
      }
      company = companyCache.get(code) ?? companyByHolderName(companies, r.holderName) ?? undefined
      if (company === undefined) { errors.push(`第 ${i + 1} 筆：無法判斷帳號 ${r.accountNo ?? code} 屬於哪家公司，請在 company 欄指定`); continue }
    } else if (company && !companies.includes(company)) {
      errors.push(`第 ${i + 1} 筆：公司「${company}」不存在`); continue
    }
    resolved.push({ ...r, accountCode: code, company })
  }

  const now = new Date().toISOString()
  const docs = resolved.map((r) => ({
    id: dailyBalanceId(r.company, r.accountCode, r.date),
    data: {
      id: dailyBalanceId(r.company, r.accountCode, r.date),
      kind: 'daily_bal', date: r.date, company: r.company, accountCode: r.accountCode,
      balance: r.balance, ...(r.available !== undefined ? { available: r.available } : {}),
      source: 'rpa', updatedAt: now,
    },
  }))
  if (!dryRun && docs.length) {
    for (let i = 0; i < docs.length; i += 200) await rest.upsert('rules', docs.slice(i, i + 200))
  }

  // 核對結果（dryRun 時把本次資料當作已寫入來計算）
  const results = []
  const pairCache = new Map()
  for (const [i, r] of resolved.entries()) {
    const key = `${r.company}\u0000${r.accountCode}`
    if (!pairCache.has(key)) {
      const prefix = `DB|${r.company}|${r.accountCode}|`
      const balances = (await rest.all(`rules?select=data&id=like.${enc(`"${prefix}*"`)}`)).map((x) => x.data)
      const filter = r.company ? { company: r.company, lines: [{ accountCode: r.accountCode }] } : { lines: [{ accountCode: r.accountCode }] }
      let entries = (await rest.all(`entries?select=data&date=gte.${ANCHOR_DATE}&data=cs.${enc(JSON.stringify(filter))}`)).map((x) => x.data)
      if (!r.company) entries = entries.filter((e) => !e.company)
      pairCache.set(key, { balances, entries })
    }
    const p = pairCache.get(key)
    const doc = docs[i].data
    p.balances = [...p.balances.filter((b) => b.id !== doc.id), doc]
    results.push({
      date: r.date, accountNo: r.accountNo, accountCode: r.accountCode, company: r.company,
      balance: r.balance, available: r.available,
      ...checkOn(p.balances, p.entries, r.accountCode, r.date),
    })
  }

  const status = resolved.length === 0 ? 400 : 200
  return json(status, { ok: resolved.length > 0 && errors.length === 0, dryRun, written: dryRun ? 0 : docs.length, results, errors })
}

function makeRest(url, key) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1/`
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  return {
    async all(path, max = Infinity) {
      const out = []
      for (let from = 0; out.length < max; from += 1000) {
        const to = Math.min(from + 999, max - 1)
        const res = await fetch(base + path, { headers: { ...headers, 'Range-Unit': 'items', Range: `${from}-${to}` } })
        if (!res.ok) throw new Error(`讀取 ${path.split('?')[0]} 失敗：HTTP ${res.status} ${await res.text().catch(() => '')}`)
        const page = await res.json()
        out.push(...page)
        if (page.length < to - from + 1) break
      }
      return out
    },
    async upsert(table, rows) {
      const res = await fetch(base + table, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      })
      if (!res.ok) throw new Error(`寫入 ${table} 失敗：HTTP ${res.status} ${await res.text().catch(() => '')}`)
    },
  }
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}
const enc = (s) => encodeURIComponent(s)
const clean = (s) => (s ? String(s).trim() : '')
function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) }
}
