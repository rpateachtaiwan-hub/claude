# 會計沖銷系統（accounting）

小型旅行社用的雙分錄會計核心：**應收／應付未沖項管理**，支援「一次沖多筆／部分沖銷」。
依規格書里程碑，**先建資料模型與沖銷引擎並附測試，UI 之後**。

## 目前完成（Milestone 1–3 的核心）

| 里程碑 | 內容 | 狀態 |
|--------|------|------|
| 1 | DB schema + migrations + 科目 seed | ✅ |
| 2 | 沖銷引擎 + 過帳服務 + 單元測試 | ✅ |
| 3 | 報表查詢（損益 / 試算表 / 帳齡 / 對帳） | ✅（純函式 + 測試） |
| 4 | UI（沖銷工作台 / 傳票輸入 / 未沖帳齡 / 報表 / 科目） | ✅ |
| 5 | Google Sheets 匯入腳本 | ⬜ **執行前須與你確認** |
| 6 | Auth + 角色權限 | ⬜ 待辦 |

### UI（里程碑 4）

導覽列新增「💰 會計沖銷」(`/accounting`)，內含 5 個分頁：

- **沖銷工作台**（核心）：選 AR/AP → 勾選未沖清單並改每筆套用金額 → 設定日期/銀行/手續費 → 即時預覽自動產生的平衡傳票 → 確認過帳。
- **傳票輸入**：多行借貸，即時顯示是否平衡，不平衡無法送出。
- **未沖明細 / 帳齡**：依 0-30/31-60/61-90/90+ 分桶，並可「認列掛帳」建立應收/應付。
- **報表**：損益表 / 試算表 / 對帳檢核。
- **科目主檔**：科目清單檢視。

未設定 `VITE_SUPABASE_*` 時自動進入**示範模式**（種子科目 + 幾筆未沖項，資料存 localStorage），
沖銷流程完全可操作；設定後則讀 DB 並透過 `post_settlement` RPC 過帳。

## 檔案

```
supabase/
  migrations/0001_accounting_schema.sql   # 資料表、enum、檢查約束、平衡 trigger、未沖餘額 view
  migrations/0002_post_settlement_fn.sql   # post_settlement(payload) 單一交易過帳函式
  seed/accounts_seed.sql                   # 科目主檔 seed
src/accounting/
  types.ts      # 領域型別（camelCase）
  money.ts      # 整數元工具 + 千分位顯示
  engine.ts     # 沖銷引擎（純函式，可測試）
  reports.ts    # 損益 / 試算表 / 帳齡 / 對帳（純函式）
  service.ts    # Supabase 讀取 + 呼叫 post_settlement RPC
  *.test.ts     # 驗收測試（vitest）
```

## 設計重點

- **金額一律整數元（TWD 無小數）**：DB 用 `BIGINT`，TS 用 `number` 並由 `money.ts` 驗證為整數，絕不浮點。
- **傳票不變條件 Σ借 = Σ貸**：DB 端以 *deferred constraint trigger* 於 commit 時驗證；TS 端 `assertBalanced` 同步把關。
- **沖銷引擎兩個實作必須一致**：
  - `engine.ts`（純 TS）負責邏輯與驗收測試；
  - `0002_post_settlement_fn.sql`（plpgsql）負責真正的單一交易過帳與併發鎖定（`SELECT … FOR UPDATE`）。
- **沖銷不影響損益**：損益與試算表只看 account + 借貸金額，與 open_item 無關。

### 分錄產生規則

- **付款沖應付（payment/AP）**：借 應付(各 amount, 連 open_item) + 借 手續費(fee) + 貸 銀行(total+fee)
- **收款沖應收（receipt/AR）**：貸 應收(各 amount, 連 open_item) + 借 手續費(fee) + 借 銀行(total−fee)

## 執行測試

```bash
cd lute-travel
npm install      # 首次需安裝 vitest
npm test         # vitest run
```

驗收測試對應規格書 §8：傳票平衡、全額沖、一次沖多筆、部分沖銷、收款方向、帳齡與試算表對帳、整數元。

## 套用到 Supabase

```bash
# 依序執行（或用 supabase db push / SQL Editor 貼上）
psql "$DATABASE_URL" -f supabase/migrations/0001_accounting_schema.sql
psql "$DATABASE_URL" -f supabase/migrations/0002_post_settlement_fn.sql
psql "$DATABASE_URL" -f supabase/seed/accounts_seed.sql
```

## 下一步

- Milestone 5：Google Sheets 匯入 —— **依規格書要求，動真實資料前會先產出歸併草稿給你人工檢視，不自動定案。**
- Milestone 6：Supabase Auth 角色（bookkeeper / viewer）+ RLS；屆時開放科目維護、手動傳票/掛帳的 DB 寫入（目前 Supabase 模式僅沖銷工作台已接 RPC）。
