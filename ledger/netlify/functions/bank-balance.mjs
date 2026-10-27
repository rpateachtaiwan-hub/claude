// Netlify serverless：銀行餘額機器人 API（UiPath 等 RPA 每日抓到網銀餘額後呼叫，直接寫入「每日餘額核對」）。
//
// POST /.netlify/functions/bank-balance
//   Header：Authorization: Bearer <Supabase access token>
//           （機器人用 Supabase 帳號登入 /auth/v1/token?grant_type=password 取得，與交易明細上傳同一帳號）
//   Body：{ "dryRun": false, "rows": [ { "date": "2026-10-14", "accountNo": "062035010608",
//           "balance": 878803, "available": 878803 } ] }
//   - accountNo 以 netlify/shared/openingBalances.mjs 的 BANK_ACCOUNTS 對應公司（每家公司一個台幣帳戶），
//     科目固定為 112 銀行現金；不在清單內的帳號回報「未設定對應公司」錯誤
//   - balance = 網銀「帳戶餘額」（用於核對）；available = 「可用餘額」（僅記錄）
//   - dryRun: true 只檢查格式與帳號對應，不寫入
// 回應：{ ok, dryRun, written, results: [{ date, accountNo, accountCode, company, balance, available }], errors }
//
// 本函式只負責「寫入」，不做核對（不讀分錄，分錄再多也不會變慢）。
// 核對（期初餘額 + 112 銀行現金流水 vs 銀行餘額）在記帳系統「報表 → 每日餘額核對」開啟時即時計算。
//
// 金鑰：SUPABASE_SERVICE_ROLE_KEY 只存在伺服器端環境變數。
// 機器人帳號白名單：ROBOT_EMAILS（Netlify 環境變數，逗號分隔；預設 rpateachtaiwan@gmail.com）。
// 401 = 憑證無效/過期；403 = 登入者不在 ROBOT_EMAILS；501 = 未設定 SUPABASE_SERVICE_ROLE_KEY。

import {
  BANK_ACCOUNTS, CASH_ACCOUNT_CODE, dailyBalanceId, normalizeRow, resolveCompany,
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
  if (!accounts.some((a) => a.code === CASH_ACCOUNT_CODE)) {
    return json(500, { error: `科目表中找不到代號 ${CASH_ACCOUNT_CODE}（銀行現金）科目，無法核對` })
  }
  const companies = (await rest.all('companies?select=name')).map((r) => r.name)

  const errors = []
  const resolved = []
  for (const [i, raw] of body.rows.entries()) {
    const n = normalizeRow(raw, i)
    if (n.error) { errors.push(n.error); continue }
    const r = n.row
    const cfg = BANK_ACCOUNTS[r.accountNo]
    if (!cfg) { errors.push(`第 ${i + 1} 筆：帳號 ${r.accountNo} 未設定對應公司（請在 openingBalances.mjs 的 BANK_ACCOUNTS 設定）`); continue }
    const company = resolveCompany(cfg.company, companies)
    if (!company) { errors.push(`第 ${i + 1} 筆：設定的公司「${cfg.company}」對不到系統公司清單（現有：${companies.join('、') || '無'}）`); continue }
    resolved.push({ ...r, accountCode: CASH_ACCOUNT_CODE, company })
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

  const results = resolved.map((r) => ({
    date: r.date, accountNo: r.accountNo, accountCode: r.accountCode, company: r.company,
    balance: r.balance, available: r.available,
  }))

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

const clean = (s) => (s ? String(s).trim() : '')
function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) }
}
