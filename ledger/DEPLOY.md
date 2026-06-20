# 輕記帳 — 正式上線指南

架構：前端 Netlify（連 GitHub 自動部署）＋ 資料/登入 Supabase ＋ Gemini 由 Netlify 函式代理。

```
使用者瀏覽器
  ├─ 前端     → Netlify（base = ledger，自動部署）
  ├─ 資料/登入 → Supabase（Postgres + Auth + RLS）
  └─ Gemini   → Netlify Function /.netlify/functions/gemini（金鑰存伺服器）
```

## 1. 建立 Supabase（資料庫 + 登入）
1. https://supabase.com → New project，區域選 **Tokyo** 或 **Singapore**。
2. **SQL Editor** 執行 `ledger/supabase/schema.sql`（建立資料表 + 開啟 RLS）。
3. **Authentication → Users → Add user**：為每位同仁建 email + 密碼（勾 Auto Confirm）。
4. **Project Settings → API**：記下 `Project URL` 與 `anon public` key。

## 2. 建立 Netlify 站台（連 GitHub 自動部署）
1. https://netlify.com → Add new site → Import an existing project → 選此 repo。
2. **Base directory** 設 `ledger`（其餘讀 `ledger/netlify.toml`，含 functions 設定）。
3. **Environment variables** 新增：
   ```
   VITE_SUPABASE_URL       = <Supabase Project URL>
   VITE_SUPABASE_ANON_KEY  = <Supabase anon public key>
   GEMINI_API_KEY          = <你的 Gemini 金鑰>   # 僅伺服器端，不會外洩
   ```
4. Deploy。之後每次 push 會自動重新部署。

## 3. 驗證
- 打開網址 → 應出現**登入頁**（代表已連 Supabase）。用第 1 步建立的帳號登入。
- 記一筆 / 匯入 / 報表正常；資料存於 Supabase。
- 記一筆打字後若出現「✦ Gemini 建議」→ 代理運作正常。

## 安全機制
- **RLS**：未登入（僅持 anon key）無法讀寫，資料庫層級擋下。
- **每人帳號**：Supabase Auth；可在後台停用/重設密碼。日後要分「唯讀」角色可再加 `user_roles` 表 + policy。
- **Gemini 金鑰**：存 Netlify 環境變數，由 serverless 函式呼叫；前端與使用者都看不到。

## 升級 / 備份
- Supabase 免費版閒置 7 天會暫停（資料不滅，點一下恢復）；要 24h 穩定 + 每日備份 → Pro $25/月。
- Netlify 每次部署都保留，可在後台一鍵 **Rollback** 回上一版。

## 本機開發
- `npm run dev`（未設 Supabase env → 示範模式，免登入，資料存瀏覽器）。
- 本機要測 Gemini：在「設定」填自己的金鑰（備援直連），或用 `netlify dev` 跑函式。
