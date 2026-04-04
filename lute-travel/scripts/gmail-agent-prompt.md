# Gmail → Supabase 訂單同步代理

## 任務
使用 Gmail MCP 工具掃描收件匣中未讀的 Klook 訂單確認信，將解析後的訂單資料寫入 Supabase。

## 環境變數（需設定）
- SUPABASE_URL: Supabase 專案 URL
- SUPABASE_SERVICE_KEY: Supabase service_role 金鑰（有寫入權限）

## 執行步驟

### Step 1：搜尋新的 Klook 訂單確認信
使用 Gmail MCP 搜尋：
- 寄件者：noreply@klook.com 或 booking@klook.com
- 主旨包含：Booking Confirmation 或 訂單確認
- 狀態：未讀（is:unread）
- 時間範圍：最近 24 小時

### Step 2：解析每封信件

從郵件內文提取以下欄位：
- **bookingRef**：訂單編號（格式如 AWB862233、KLK123456）
  - Regex: `/(?:Booking\s*(?:No\.?|Number|Ref\.?)|Order\s*(?:No\.?|#))[:\s]*([A-Z]{2,3}\d{6,})/i`
- **tourDate**：出發日期（YYYY-MM-DD 格式）
- **totalPax**：總人數
- **adults**：成人人數
- **infants**：嬰兒人數
- **representativeName**：代表旅客姓名
- **email**：聯絡 email
- **phone**：聯絡電話
- **productCode**：行程名稱
- **platform**：固定填 "KLOOK"
- **platformRevenue**：付款金額（TWD）
- **language**：依國籍/語言判斷（英語/日文/中文/越文/韓文）

旅客資料（Passengers）：
- 姓名（Passport Name）
- 護照號碼
- 生日
- 國籍

### Step 3：檢查重複
在寫入前，先用 bookingRef 查詢 Supabase orders 表，若已存在則跳過。

### Step 4：寫入 Supabase

```javascript
// 寫入 orders 表
const order = {
  id: crypto.randomUUID(),
  booking_ref: bookingRef,
  order_date: new Date().toISOString().slice(0, 10),
  tour_date: tourDate,
  product_code: productCode || '其他',
  total_pax: totalPax,
  adults: adults,
  infants: infants,
  platform: 'KLOOK',
  platform_revenue: platformRevenue || 0,
  cash_revenue: 0,
  language: language || '英語',
  status: 'pending',
  representative_name: representativeName,
  phone: phone,
  email: email,
}

// POST to Supabase REST API
fetch(`${SUPABASE_URL}/rest/v1/orders`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify(order)
})
```

### Step 5：標記信件為已讀
處理完成後，使用 Gmail MCP 將該信件標記為已讀。

### Step 6：回報結果
輸出處理摘要：
- 掃描信件數量
- 新增訂單數量  
- 跳過（重複）數量
- 錯誤列表（若有）
