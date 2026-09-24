-- =============================================================================
-- 輕記帳 — Supabase 資料表（雲端儲存）
-- 採「jsonb 整包儲存」設計：與前端型別完全對應，無欄位轉換。
-- =============================================================================

create table if not exists accounts (
  code text primary key,
  data jsonb not null
);

create table if not exists rules (
  id text primary key,
  data jsonb not null
);

create table if not exists entries (
  id text primary key,
  date text,
  data jsonb not null
);
create index if not exists idx_entries_date on entries (date);

create table if not exists companies (
  name text primary key
);

-- ── Row Level Security：已登入者可讀寫，未登入一律拒絕 ───────────────────────
do $$
declare t text;
begin
  foreach t in array array['accounts','rules','entries','companies']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists app_authenticated_all on %I', t);
    execute format('create policy app_authenticated_all on %I for all to authenticated using (true) with check (true)', t);
    execute format('grant all on table %I to authenticated', t);
  end loop;
end $$;

grant usage on schema public to authenticated;

-- 提醒：套用後，雲端模式需要「登入」才能讀寫（前端登入畫面待加，見 README）。
-- 在 Authentication → Users 先建立至少一個帳號。
