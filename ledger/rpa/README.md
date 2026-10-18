# 銀行餘額機器人（UiPath）— 規格與交接

每天自動到國泰世華 Global MyB2B 查各公司台幣帳戶的餘額，呼叫系統 API 寫入
「報表 → 每日餘額核對」，並把核對結果（相符 / 不符）通知財務。

```
既有 UiPath 登入流程 ─► 本機器人：逐帳戶查餘額 ─► POST /.netlify/functions/bank-balance ─► 系統（Supabase）
                                                  ◄─ 回傳每個帳戶 match / mismatch / diff ─► 寄信或通知
```

## 1. 網銀操作步驟（依錄影整理）

登入（沿用既有 UiPath 流程）後，在 `globalmyb2b.com/GEBANK/Index.aspx`：

1. 上方選單 **帳戶查詢** → 左側 **帳戶餘額查詢**
2. 表單：
   | 欄位 | 動作 |
   |---|---|
   | 國別/地區 | 選 `TW` |
   | 歸戶號碼 | 選公司，例如 `00077257 路特娛樂有限公司` |
   | 帳號 | 選帳戶，例如 `大同分行-062035010608-一般活期-路特娛樂有限公司`（**外匯帳戶不查**） |
   | 日期 | 輸入 `YYYY/MM/DD`（可查歷史日期） |
3. 按綠色 **查詢**（表單上那顆；下方「僅供查詢當日餘額」的查詢鈕不要用）
4. 結果表格欄位：國別/地區、歸戶號碼、戶名、分行別、帳號、幣別、**帳戶餘額**、當日交換票、圈存金額、透支額度、**可用餘額**
   - 上方另有「查詢時間」與「帳務日期」

> 提示：網銀的「常用帳號設定」可以一次查多個帳號，若設好可以一次查詢取回整張表，比逐一選下拉更快更穩。

## 2. 要查的帳戶

只查**新台幣**帳戶（結果「幣別」≠ 新台幣的列略過）。系統以**帳號**自動對應科目，
規則是科目名稱括號內的帳號：

| 系統科目 | 科目名稱 | 網銀帳號 |
|---|---|---|
| 1102 | 銀行存款-國泰(001035016976) | 001035016976 |
| 1111 | 銀行存款-國泰旅行社(031-006012) | 031035006012 |
| 1112 | 銀行存款-國泰租車(031-007663) | 031035007663（推測，以網銀顯示為準） |
| 1113 | 銀行存款-國泰貿易(115-006712) | 115035006712（推測，以網銀顯示為準） |
| 1114 | 銀行存款-國泰娛樂(062-010608) | 062035010608 |

`分行3碼-末6碼` 的簡寫可以直接對應完整 12 碼帳號，不需另外設定。
新增帳戶時，只要在系統科目名稱括號內寫上帳號即可。公司由系統自動判斷（該科目分錄最常出現的公司）。

建議機器人用一份設定檔（`Config/Accounts.xlsx`：歸戶號碼、帳號、是否啟用）列出要查的帳戶，
並在下拉選單出現**設定檔沒有的台幣帳戶**時發出提醒，避免漏查新開的帳戶。

## 3. 查哪一天

- **每日排程**：每天早上（建議 08:30 以後）查**前一天**的日期 → 那天的日終餘額。
  網銀註記：非營業日/非營業時間查詢，餘額可能因批次處理而變動，所以不要查「今天」。
- **不需要補登歷史**：2026/1/1 起算餘額由財務提供、固定在 `netlify/shared/openingBalances.mjs`，
  系統用「起算餘額＋之後的銀行流水」算出最新餘額，只跟機器人抓的同一天餘額比對。
  （機器人若有空檔漏跑，之後補跑那幾天即可，逐日明細會更完整，但不是必要。）

## 4. 寫入系統的 API

```
POST https://<你的 Netlify 網址>/.netlify/functions/bank-balance
Authorization: Bearer <Supabase access token>
Content-Type: application/json

{
  "dryRun": false,
  "rows": [
    { "date": "2026-10-14", "accountNo": "062035010608", "holderName": "路特娛樂有限公司",
      "balance": "878,803.00", "available": "878,803.00" }
  ]
}
```

| 欄位 | 說明 |
|---|---|
| `date` | 餘額日期（2026-10-14、2026/10/14、115/10/14 皆可） |
| `accountNo` | 網銀帳號，可含連字號 |
| `holderName` | 戶名（選填；系統無法由分錄判斷公司時用來比對） |
| `balance` | **帳戶餘額**（核對用），可直接傳網銀顯示的字串 |
| `available` | 可用餘額（選填，僅記錄） |
| `company` / `accountCode` | 選填，強制指定公司或科目 |
| `dryRun` | `true` 只檢查不寫入（第一次上線先用這個） |

一次最多 500 筆；同一帳戶同一天重送會覆寫，可放心重跑。

**驗證方式**：機器人用自己的 Supabase 帳號（與交易明細上傳同一個）登入
`POST https://<專案代號>.supabase.co/auth/v1/token?grant_type=password` 取得 `access_token`，
再放進 `Authorization: Bearer <access_token>` 呼叫本 API。
允許的機器人帳號列在 Netlify 環境變數 `ROBOT_EMAILS`（逗號分隔，預設 `rpateachtaiwan@gmail.com`）。

回應：

```json
{
  "ok": true, "dryRun": false, "written": 1, "errors": [],
  "results": [
    { "date": "2026-10-14", "accountNo": "062035010608", "accountCode": "1114", "company": "娛樂",
      "balance": 878803, "status": "mismatch", "computed": 879103, "diff": 300 }
  ]
}
```

`status`：`match` 相符、`mismatch` 不符（`diff` = 系統推算 − 銀行）、`no_anchor` 該帳戶尚未設定 1/1 起算餘額、`before_anchor` 查詢日期在起算日當天或之前。
系統推算 = 起算餘額 + 起算日後所有分錄在該銀行科目的淨變動（不分公司欄位）。
`errors` 有內容（如帳號對不到科目）時 `ok` 為 false，但其他列仍會寫入。
HTTP 401 = 憑證無效或已過期；403 = 該帳號不在 `ROBOT_EMAILS` 白名單；501 = 伺服器未設定 `SUPABASE_SERVICE_ROLE_KEY`。

### 用 PowerShell 先手動測一次

```powershell
# 1) 用機器人的 Supabase 帳號登入，取得 access_token
$login = Invoke-RestMethod -Method Post `
  -Uri 'https://<專案代號>.supabase.co/auth/v1/token?grant_type=password' `
  -Headers @{ apikey = '<SUPABASE_ANON_KEY>' } -ContentType 'application/json' `
  -Body (@{ email = '<機器人帳號email>'; password = '<密碼>' } | ConvertTo-Json)

# 2) 帶 access_token 呼叫 API
$body = @{ dryRun = $true; rows = @(@{ date = '2026-10-14'; accountNo = '062035010608'; balance = '878,803.00' }) } | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri 'https://<你的網址>/.netlify/functions/bank-balance' `
  -Headers @{ Authorization = "Bearer $($login.access_token)" } -ContentType 'application/json; charset=utf-8' `
  -Body ([Text.Encoding]::UTF8.GetBytes($body))
```

## 5. 機器人流程設計（UiPath）

```
Main.xaml
 ├─ 讀 Config（Orchestrator Asset：ApiUrl、機器人 Supabase 帳密[Credential]、通知收件人）
 ├─ Invoke 既有登入流程
 ├─ 決定日期（昨天；漏跑時可傳入補跑區間）
 ├─ For Each 帳戶 × 日期
 │    ├─ 進入「帳戶查詢 → 帳戶餘額查詢」
 │    ├─ Select Item 國別/地區=TW、歸戶號碼、帳號（依帳號文字比對選項）
 │    ├─ Type Into 日期（先清空）
 │    ├─ Click 查詢 → 等結果表出現，且結果「帳號」= 目標帳號、「帳務日期」= 目標日期（防止讀到上一次結果）
 │    ├─ Extract Table → 取 帳號、幣別、帳戶餘額、可用餘額；幣別≠新台幣則略過
 │    └─ 加入 rows；失敗重試 2 次，仍失敗記錄錯誤並繼續下一個
 ├─ HTTP POST rows（每 200 筆一批）到 bank-balance API
 ├─ 依回應組通知：不符的帳戶（日期、差額）、errors、查詢失敗的帳戶
 └─ 登出網銀
```

穩定性要點：
- 選擇器用欄位標籤/name 屬性錨定，不要用座標；每個步驟都等元素出現（Check App State），不要用固定 Delay。
- 每次查詢後驗證結果表的帳號與帳務日期，對不上就重查。
- 網銀有倒數登出計時（畫面右上「倒數時間」），補跑多天時每批之間回首頁或重新登入。
- 金鑰與網銀帳密只放 Orchestrator Asset/Credential，不寫在流程或 Excel。
