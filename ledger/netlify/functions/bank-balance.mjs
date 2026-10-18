// Netlify serverless：銀行餘額機器人 API（UiPath 等 RPA 每日抓到網銀餘額後呼叫，直接寫入「每日餘額核對」）。
//
// POST /.netlify/functions/bank-balance
//   Header：Authorization: Bearer <Supabase access token>
//           （機器人用 Supabase 帳號登入 /auth/v1/token?grant_type=password 取得，與交易明細上傳同一帳號）
//   Body：{ "dryRun": false, "rows": [ { "date": "2026-10-14", "accountNo": "062035010608",
//           "holderName": "路特娛樂有限公司", "balance": 878803, "available": 878803 } ] }
//   - accountNo 會自動對應到科目名稱括號內註明帳號的銀行科目（如「銀行存款-國泰娛樂(062-010608)」）
//   - 公司自動推斷（該科目分錄最常出現的公司；無分錄時以戶名比對）；也可直接給 company / accountCode
//   - balance = 網銀「帳戶餘額」（用於核對）；available = 「可用餘額」（僅記錄）
//   - dryRun: true 只檢查對應與核對結果，不寫入
// 回應：{ ok, written, results: [{ date, accountNo, accountCode, company, balance, status, computed, diff }], errors }
//   status：match 相符 / mismatch 不符 / no_anchor 尚未設定起算餘額（netlify/shared/openingBalances.mjs）/ before_anchor 起算日當天或之前
//   推算 = 起算餘額 + 起算日後所有分錄在該銀行科目的淨變動（不分公司），與同日銀行帳戶餘額比對
//
// 金鑰：SUPABASE_SERVICE_ROLE_KEY 只存在伺服器端環境變數。
// 機器人帳號白名單：ROBOT_EMAILS（Netlify 環境變數，逗號分隔；預設 rpateachtaiwan@gmail.com）。
// 401 = 憑證無效/過期；403 = 登入者不在 ROBOT_EMAILS；501 = 未設定 SUPABASE_SERVICE_ROLE_KEY。

import {
  ANCHOR_DATE, OPENING_BALANCES, checkOn, companyByHolderName, dailyBalanceId, dominantCompany, isBankAccount, matchAccountByNo, normalizeRow,
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
  if (!url || !serviceKey) return json(501, { error: 'NOT_CONFIGURED：需設定 SUPABASE_SERVICE_ROLE_KEY' })

  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { error: '未登入' })
  const meRes = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: `Bearer ${token}` } })
  if (!meRes.ok) return json(401, { error: '登入已失效或憑證錯誤' })
  const caller = await meRes.json()
  const robotEmails = clean(process.env.ROBOT_EMAILS || 'rpateachtaiwan@gmail.com').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (!robotEmails.includes(String(caller?.email || '').toLowerCase())) return json(403, { error: '此帳號不是機器人帳號' })

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

  // 核對結果：該銀行科目（不分公司）起算日後的分錄
  const results = []
  const entryCache = new Map()
  for (const r of resolved) {
    if (!entryCache.has(r.accountCode)) {
      const filter = { lines: [{ accountCode: r.accountCode }] }
      entryCache.set(r.accountCode, (await rest.all(`entries?select=data&date=gt.${ANCHOR_DATE}&data=cs.${enc(JSON.stringify(filter))}`)).map((x) => x.data))
    }
    results.push({
      date: r.date, accountNo: r.accountNo, accountCode: r.accountCode, company: r.company,
      balance: r.balance, available: r.available,
      ...checkOn(OPENING_BALANCES[r.accountCode], entryCache.get(r.accountCode), r.accountCode, r.date, r.balance),
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

const enc = (s) => encodeURIComponent(s)
const clean = (s) => (s ? String(s).trim() : '')
function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) }
}
