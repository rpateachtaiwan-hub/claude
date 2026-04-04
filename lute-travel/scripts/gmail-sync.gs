// ═══════════════════════════════════════════════════════
//  路特旅行社 · Gmail → Supabase 自動訂單同步
//  設定區：填入你的 Supabase 資訊
// ═══════════════════════════════════════════════════════
const SUPABASE_URL = 'https://xxxxxxxxxxxx.supabase.co'       // ← 填入你的 Supabase URL
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6...' // ← 填入 service_role key

// 掃描最近幾天的信件（避免重複處理舊信）
const SCAN_DAYS = 1

// ═══════════════════════════════════════════════════════
//  主程式：掃描 Gmail 並寫入 Supabase
// ═══════════════════════════════════════════════════════
function syncKlookOrders() {
  const results = { scanned: 0, added: 0, skipped: 0, errors: [] }

  // 搜尋 Klook 訂單確認信（未讀 + 最近 N 天）
  const query = `from:(klook.com) subject:(Booking Confirmation OR 訂單確認 OR Order Confirmation) is:unread newer_than:${SCAN_DAYS}d`
  const threads = GmailApp.search(query, 0, 30)

  Logger.log(`找到 ${threads.length} 個信件串`)

  for (const thread of threads) {
    const messages = thread.getMessages()
    for (const msg of messages) {
      results.scanned++
      try {
        const body = msg.getPlainBody()
        const order = parseKlookEmail(body, msg.getDate())

        if (!order) {
          Logger.log('無法解析此信件，跳過')
          continue
        }

        // 檢查是否已存在
        if (orderExists(order.booking_ref)) {
          Logger.log(`訂單 ${order.booking_ref} 已存在，跳過`)
          results.skipped++
          msg.markRead()
          continue
        }

        // 寫入 Supabase
        insertOrder(order)
        Logger.log(`✅ 新增訂單：${order.booking_ref}`)
        results.added++
        msg.markRead()

      } catch (e) {
        results.errors.push(e.message)
        Logger.log(`❌ 錯誤：${e.message}`)
      }
    }
  }

  Logger.log(`完成！掃描 ${results.scanned} 封，新增 ${results.added} 筆，跳過 ${results.skipped} 筆`)
  if (results.errors.length > 0) {
    Logger.log('錯誤清單：' + results.errors.join(', '))
  }
}

// ═══════════════════════════════════════════════════════
//  解析 Klook 信件內容
// ═══════════════════════════════════════════════════════
function parseKlookEmail(body, emailDate) {
  // 訂單編號
  const refMatch = body.match(/(?:Booking(?:\s*No\.?|\s*Reference|Ref)?|Order(?:\s*No\.?|#)?)[:\s#]*([A-Z]{2,4}\d{5,12})/i)
    || body.match(/\b([A-Z]{2,4}\d{8,12})\b/)
  if (!refMatch) return null

  const bookingRef = refMatch[1].toUpperCase()

  // 出發日期
  const dateMatch = body.match(/(?:Activity Date|Tour Date|Travel Date|出發日期)[:\s]*(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/i)
    || body.match(/(?:Activity Date|Tour Date|Travel Date|出發日期)[:\s]*(\w+\s+\d{1,2},?\s+\d{4})/i)
  const tourDate = dateMatch ? normalizeDate(dateMatch[1]) : ''

  // 人數
  const adultsMatch = body.match(/(?:Adult|大人)[:\s×x*]*(\d+)/i)
  const infantsMatch = body.match(/(?:Infant|Baby|嬰兒)[:\s×x*]*(\d+)/i)
  const totalMatch = body.match(/(?:Total\s+(?:Travelers?|Guests?|Pax)|總人數)[:\s]*(\d+)/i)
  const adults = adultsMatch ? parseInt(adultsMatch[1]) : 1
  const infants = infantsMatch ? parseInt(infantsMatch[1]) : 0
  const totalPax = totalMatch ? parseInt(totalMatch[1]) : adults + infants

  // 聯絡資訊
  const nameMatch = body.match(/(?:Contact\s+Name|Lead\s+Traveler|Lead\s+Guest|聯絡人)[:\s]*([^\n\r]{2,40})/i)
  const emailMatch = body.match(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/g)
  const phoneMatch = body.match(/(?:Phone|Tel|Mobile|電話)[:\s]*([+\d\s()-]{8,20})/i)

  // 金額
  const priceMatch = body.match(/(?:Total\s+(?:Amount|Price)|Payment\s+Amount|總金額)[:\s]*(?:TWD|NT\$|NTD|USD|\$)?\s*([\d,]+(?:\.\d{2})?)/i)
    || body.match(/(?:TWD|NT\$|NTD)\s*([\d,]+)/i)
  const platformRevenue = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0

  // 行程名稱
  const activityMatch = body.match(/(?:Activity|Tour|Experience|行程)[:\s]*([^\n\r]{5,80})/i)
  const productCode = activityMatch ? activityMatch[1].trim().slice(0, 60) : '其他'

  // 語言判斷（依 email domain 或內文）
  const language = detectLanguage(body, emailMatch)

  return {
    id: Utilities.getUuid(),
    booking_ref: bookingRef,
    order_date: Utilities.formatDate(emailDate, 'Asia/Taipei', 'yyyy-MM-dd'),
    tour_date: tourDate,
    product_code: productCode,
    total_pax: totalPax,
    adults: adults,
    infants: infants,
    platform: 'KLOOK',
    platform_revenue: platformRevenue,
    cash_revenue: 0,
    language: language,
    status: 'pending',
    representative_name: nameMatch ? nameMatch[1].trim() : '',
    phone: phoneMatch ? phoneMatch[1].trim() : '',
    email: emailMatch ? emailMatch.find(e => !e.includes('klook')) || '' : '',
    drop_off_location: '',
  }
}

// ═══════════════════════════════════════════════════════
//  輔助函式
// ═══════════════════════════════════════════════════════
function normalizeDate(str) {
  if (!str) return ''
  // 已是 YYYY-MM-DD 或 YYYY/MM/DD
  const isoMatch = str.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2,'0')}-${isoMatch[3].padStart(2,'0')}`
  // "April 15, 2026" or "15 April 2026"
  try {
    const d = new Date(str)
    if (!isNaN(d)) return Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM-dd')
  } catch(e) {}
  return str
}

function detectLanguage(body, emails) {
  if (/한국|韓國|Korea/i.test(body)) return '韓文'
  if (/日本|Japan|Japanese/i.test(body)) return '日文'
  if (/越南|Vietnam|Viet/i.test(body)) return '越文'
  if (/中文|Chinese|Taiwan|台灣/i.test(body)) return '中文'
  return '英語'
}

function orderExists(bookingRef) {
  const url = `${SUPABASE_URL}/rest/v1/orders?booking_ref=eq.${encodeURIComponent(bookingRef)}&select=id`
  const res = UrlFetchApp.fetch(url, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    muteHttpExceptions: true,
  })
  if (res.getResponseCode() !== 200) return false
  const data = JSON.parse(res.getContentText())
  return data.length > 0
}

function insertOrder(order) {
  const url = `${SUPABASE_URL}/rest/v1/orders`
  const res = UrlFetchApp.fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    payload: JSON.stringify(order),
    muteHttpExceptions: true,
  })
  if (res.getResponseCode() >= 300) {
    throw new Error(`Supabase 寫入失敗 (${res.getResponseCode()}): ${res.getContentText()}`)
  }
}

// ═══════════════════════════════════════════════════════
//  手動測試用（在 Apps Script 編輯器直接執行這個）
// ═══════════════════════════════════════════════════════
function testConnection() {
  const url = `${SUPABASE_URL}/rest/v1/orders?select=id&limit=1`
  const res = UrlFetchApp.fetch(url, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    muteHttpExceptions: true,
  })
  Logger.log(`Supabase 連線狀態：${res.getResponseCode()}`)
  Logger.log(res.getContentText())
}
