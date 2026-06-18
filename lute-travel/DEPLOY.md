# 上線部署指南（Netlify + Supabase）

整套系統上雲的完整步驟。架構：

```
使用者瀏覽器
   │
   ├── 前端網站  → Netlify（代管 lute-travel 的 Vite 靜態網站，免費可商用）
   │
   └── 資料層    → Supabase（Postgres 資料庫 + Auth 登入 + Storage 檔案儲存，免費可商用）
```

兩者都有免費方案，日後可各自升級（Supabase Pro $25/月、Netlify Pro $19/月）。

---

## 第 1 步：建立 Supabase（資料庫 + 儲存空間）

1. 到 https://supabase.com 用 Google 註冊 → **New project**。
2. 區域（Region）選 **Tokyo (ap-northeast-1)** 或 **Singapore**（離台灣近）。
3. 設定 Database password（自己保管）。專案建立約需 1~2 分鐘。
4. 套用資料表與過帳函式：左側 **SQL Editor** → New query，依序貼上並 Run：
   1. `supabase/migrations/0001_accounting_schema.sql`
   2. `supabase/migrations/0002_post_settlement_fn.sql`
   3. `supabase/migrations/0003_post_entry_recognition_fn.sql`
   4. `supabase/migrations/0004_rls.sql` ← 開啟資料保護（RLS）
   5. `supabase/seed/accounts_seed.sql`
   （細節見 `supabase/README.md`）
5. 記下兩個值：**Project Settings → API**
   - `Project URL`（即 `VITE_SUPABASE_URL`）
   - `anon public` key（即 `VITE_SUPABASE_ANON_KEY`）
6. **建立登入帳號**：左側 **Authentication → Users → Add user**，輸入 email + 密碼
   （勾選 Auto Confirm User）。每位記帳人員建一個帳號。

> 檔案儲存（例如日後存發票/憑證掃描）：Supabase → Storage → 建 bucket 即可，免費 1GB。

## 第 2 步：把程式碼放上 GitHub

本專案已在 GitHub repo，分支 `claude/accounting-settlement-system-v52c33`。
正式上線建議先把此分支合併到主分支（或讓 Netlify 直接部署此分支）。

## 第 3 步：建立 Netlify 網站

1. 到 https://netlify.com 用 GitHub 登入 → **Add new site → Import an existing project**。
2. 授權並選擇你的 GitHub repo。
3. 部署設定**會自動讀取 repo 根目錄的 `netlify.toml`**，無需手動填（base=lute-travel、build=npm run build、publish=dist 都已設好）。
   - 若被問到 branch，選你要部署的分支。
4. **設定環境變數**：Site configuration → Environment variables → 新增：
   ```
   VITE_SUPABASE_URL       = <第 1 步的 Project URL>
   VITE_SUPABASE_ANON_KEY  = <第 1 步的 anon public key>
   ```
5. **Deploy site**。完成後會給你一個網址，例如 `https://your-site.netlify.app`。

## 第 4 步：驗證

1. 打開 Netlify 給的網址 → 用第 1 步建立的 **email + 密碼**登入（接上 Supabase 後不再用 `routor2026`）。
2. 進「💰 會計沖銷」→ 右上角**不該**再出現「示範模式」標籤（代表已連上 Supabase）。
3. 在「未沖明細／帳齡」按「認列掛帳」建一筆 → 到「沖銷工作台」沖掉 → 看報表/對帳同步。
4. 重新整理 `/accounting` 頁不會 404（SPA 轉址已設定）。

## 第 5 步（可選）：自訂網域

Netlify → Domain management → Add a domain，可綁你自己的網域（如 `acc.routortravel.com`），免費附 SSL。

---

## 升級路徑（之後流量/資料變大時）

| 服務 | 免費 | 何時升級 | 升級後 |
|------|------|---------|--------|
| Supabase | 500MB DB、1GB 儲存、閒置 7 天暫停 | 要 24h 不暫停、需每日備份/時光回溯 | Pro $25/月：8GB、不暫停、PITR |
| Netlify | 100GB 流量/月、300 建置分鐘 | 流量/協作者變多 | Pro $19/月 |

## 安全機制（已完成，里程碑 6 簡化版）

- **RLS 已開啟**（`0004_rls.sql`）：會計資料表只有「已登入者」能讀寫，未登入（僅持 anon key）一律被資料庫拒絕。
- **登入改用 Supabase Auth**：帳號由你在 Supabase → Authentication → Users 建立；前端登入頁變成 email + 密碼。
- `anon` key 可公開沒關係 —— 真正的閘門是「必須登入」。
- 目前是**單一角色**（登入即有完整讀寫權）。若日後要分 `bookkeeper`（可記帳）/ `viewer`（唯讀），
  可再加一張 `user_roles` 表與依角色判斷的 policy；本階段先求簡單。
- 變更密碼：登入後側欄「🔑 變更密碼」會直接改你的 Supabase 帳號密碼。
