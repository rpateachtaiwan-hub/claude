# 輕記帳（qing-ledger）

一個**全新、獨立**的簡易帳務系統，與 lute-travel 完全分開。
記帳像記流水帳一樣簡單，背後是嚴謹的複式簿記，能產出三大報表。

## 特色

- **記一筆**：輸入金額 + 摘要 + 收/支，系統**即時自動建議借貸方向與科目**（改摘要會即時更新建議）；不對就改，系統會**學起來**，下次自動套用（規則式學習，可解釋、不靠黑盒）。
- **沖銷**：應收/應付未沖清單，可全額或部分沖銷（收/付款），沖完即從清單消失。
- **現金 + 應計**：平時記銀行收支（現金基礎）；勾「應收/應付」即產生應計分錄，之後再沖銷。
- **三大報表**：損益表、資產負債表、現金流量表（直接法），可<b>全部 / 依年 / 依月</b>檢視。
- **批次匯入**：貼上 Excel 資料即可匯入歷史交易；也可匯入既有會計科目（編號/科目）。
- **Excel 匯出**：交易明細、三大報表、科目表皆可一鍵匯出 CSV（Excel 可開）。
- **金額一律整數元**，複式分錄一律借貸平衡（自動驗證 + 20 項單元測試）。

## 專案結構

```
src/core/        純邏輯（無 UI 依賴）+ 測試
  types.ts       領域型別
  money.ts       整數元工具
  accounts.ts    預設科目表
  engine.ts      複式簿記引擎（借貸平衡驗證）
  suggest.ts     智慧建議 + 規則式學習  ← 核心
  reports.ts     損益表 / 資產負債表 / 現金流量表
  *.test.ts      vitest 測試（14 項）
src/store/useLedger.ts   狀態管理（示範 localStorage / Supabase）
src/components/          UI：記一筆 / 明細 / 報表 / 設定
supabase/schema.sql      雲端資料表 + RLS
```

## 在本機跑跑看

```bash
cd ledger
npm install
npm run dev
```
打開終端機顯示的網址（通常 http://localhost:5173）。未設定 Supabase 時為**示範模式**，資料存瀏覽器，可直接試用。

## 測試

```bash
npm test
```

## 部署（Netlify + Supabase）

1. **Netlify**：用 GitHub 匯入此 repo，**Base directory 設為 `ledger`**，其餘讀 `ledger/netlify.toml`。
2. **Supabase**（要雲端儲存才需要）：
   - SQL Editor 執行 `supabase/schema.sql`。
   - Netlify 環境變數設 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`。
3. 不想用指令、只想看畫面：下載 repo ZIP → 把 `ledger/dist` 資料夾拖到 https://app.netlify.com/drop。

## 待辦（下一步）

- **雲端登入**：`schema.sql` 已開 RLS（需登入才可讀寫）。雲端模式要正式用，需加一個 Supabase Auth 登入畫面（與示範模式相同的簡單做法）。目前示範模式（本機）已可完整操作。
