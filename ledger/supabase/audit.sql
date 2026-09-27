-- =============================================================================
-- 操作軌跡（稽核）：在 Supabase SQL Editor 執行一次。
-- 資料庫層觸發器記錄 entries/accounts/companies/rules 的每一次
-- 新增/修改/刪除：誰（登入者 email 或服務金鑰）、何時、改了什麼
-- （完整前後內容）。前端與機器人都繞不過；軌跡表僅可讀與追加，不可改刪。
-- 額外收穫：被刪除資料的完整內容保存在 old_data，可由系統介面一鍵還原。
-- =============================================================================

create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text,
  table_name text not null,
  op text not null, -- INSERT / UPDATE / DELETE
  row_id text,
  old_data jsonb,
  new_data jsonb
);
create index if not exists idx_audit_at on audit_log (id desc);
create index if not exists idx_audit_row on audit_log (table_name, row_id);

create or replace function audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor text;
  v_row_id text;
begin
  -- 操作者：登入者 email；服務金鑰（機器人/維運腳本）顯示 service_role
  v_actor := coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb->>'email', ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb->>'role', ''),
    'unknown'
  );
  v_row_id := coalesce(
    case when TG_OP = 'DELETE' then null else (to_jsonb(NEW)->>'id') end,
    case when TG_OP = 'DELETE' then (to_jsonb(OLD)->>'id') else null end,
    case when TG_OP = 'DELETE' then (to_jsonb(OLD)->>'code') else (to_jsonb(NEW)->>'code') end,
    case when TG_OP = 'DELETE' then (to_jsonb(OLD)->>'name') else (to_jsonb(NEW)->>'name') end
  );
  insert into audit_log (actor, table_name, op, row_id, old_data, new_data)
  values (
    v_actor, TG_TABLE_NAME, TG_OP, v_row_id,
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(OLD) end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(NEW) end
  );
  return coalesce(NEW, OLD);
end $$;

do $$
declare t text;
begin
  foreach t in array array['entries','accounts','companies','rules']
  loop
    execute format('drop trigger if exists trg_audit on %I', t);
    execute format('create trigger trg_audit after insert or update or delete on %I
      for each row execute function audit_row_change()', t);
  end loop;
end $$;

-- 軌跡表權限：登入者可讀、不可改不可刪（追加只經由觸發器）
alter table audit_log enable row level security;
drop policy if exists audit_read on audit_log;
create policy audit_read on audit_log for select to authenticated using (true);
grant select on audit_log to authenticated;
grant usage on sequence audit_log_id_seq to authenticated;
