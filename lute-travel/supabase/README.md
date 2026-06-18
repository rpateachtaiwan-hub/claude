# Supabase 套用指南（會計沖銷系統）

把 schema 與過帳函式套到你的 Supabase，前端即從「示範模式」切換成真正讀寫資料庫。

## 1. 套用 SQL（依序）

**方法 A — Supabase 控制台（最簡單）**
1. 進 Supabase 專案 → 左側 **SQL Editor** → New query。
2. 依序貼上並執行下列檔案內容：
   1. `migrations/0001_accounting_schema.sql` — 資料表、enum、約束、平衡 trigger、未沖餘額 view
   2. `migrations/0002_post_settlement_fn.sql` — `post_settlement()` 沖銷過帳
   3. `migrations/0003_post_entry_recognition_fn.sql` — `post_journal_entry()`、`post_recognition()`
   4. `seed/accounts_seed.sql` — 科目主檔

**方法 B — psql / Supabase CLI**
```bash
# DATABASE_URL 取自 Supabase → Project Settings → Database → Connection string
psql "$DATABASE_URL" -f supabase/migrations/0001_accounting_schema.sql
psql "$DATABASE_URL" -f supabase/migrations/0002_post_settlement_fn.sql
psql "$DATABASE_URL" -f supabase/migrations/0003_post_entry_recognition_fn.sql
psql "$DATABASE_URL" -f supabase/seed/accounts_seed.sql
```

## 2. 設定前端環境變數

在 `lute-travel/.env.local`（可從 `.env.local.example` 複製）：
```
VITE_SUPABASE_URL=https://<你的專案>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```
取得位置：Supabase → Project Settings → API。

## 3. 驗證

```bash
cd lute-travel
npm run dev
```
- 進 `/accounting`，右上角的「示範模式」標籤應消失（代表已連上 DB 並讀到科目）。
- 在「未沖明細／帳齡」按「認列掛帳」建立一筆應付 → 應出現在清單。
- 到「沖銷工作台」沖掉它 → 傳票過帳、`open_items.status` 更新、報表/對帳同步。

## 已接線的 DB 寫入

| 功能 | RPC / 操作 | 交易保證 |
|------|-----------|----------|
| 沖銷過帳（收/付款）| `post_settlement` | ✅ 單一交易 + `FOR UPDATE` 鎖定 |
| 手動傳票 | `post_journal_entry` | ✅ 平衡由 deferred trigger 驗證 |
| 認列掛帳（建未沖項）| `post_recognition` | ✅ 單一交易 |
| 科目維護 | `accounts` upsert（onConflict=code）| 單列操作 |

## 備份與還原（規格 §9）

- Supabase 內建每日自動備份（Pro 方案含 PITR 時光回溯）。確認位置：Project → Database → Backups。
- 還原：於 Backups 頁選還原點；重大操作前可先用 `pg_dump "$DATABASE_URL" > backup.sql` 手動備份。

## 尚未處理（後續里程碑）

- **里程碑 5**：Google Sheets 匯入 —— 動真實資料前會先產歸併草稿給你人工檢視。
- **里程碑 6**：Auth 角色（bookkeeper / viewer）+ Row Level Security。目前 RPC 以呼叫端權限執行，尚未加 RLS 政策；上線多人前務必補上。
