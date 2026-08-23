-- =============================================================================
-- Row Level Security（里程碑 6，簡化版）
--
-- 策略：最簡單但有效 —— 「已登入者(authenticated) 全權存取，未登入(anon) 一律拒絕」。
-- 因前端用的是公開 anon key，唯有靠 RLS + 真正登入才能保護資料。
-- （bookkeeper/viewer 角色細分可日後再加；此處先單一角色。）
-- =============================================================================

do $$
declare
  t text;
  tables text[] := array[
    'accounts','journal_entries','journal_lines','open_items',
    'settlements','settlement_allocations','opening_balances'
  ];
begin
  foreach t in array tables
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists app_authenticated_all on %I', t);
    -- 已登入者可讀寫；未登入者沒有任何 policy = 一律拒絕
    execute format(
      'create policy app_authenticated_all on %I for all to authenticated using (true) with check (true)', t);
    execute format('grant all on table %I to authenticated', t);
  end loop;
end $$;

grant usage on schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- view 以「查詢者」身分執行，才會套用底層資料表的 RLS
alter view open_items_with_remaining set (security_invoker = on);

-- 過帳函式為 SECURITY INVOKER（預設），以呼叫者權限執行，RLS 照樣生效
grant execute on function post_settlement(jsonb) to authenticated;
grant execute on function post_journal_entry(jsonb) to authenticated;
grant execute on function post_recognition(jsonb) to authenticated;

-- 提醒：套用後，未登入（僅 anon key）將無法讀寫上述資料表。
-- 前端必須以 Supabase Auth 登入；請先在 Supabase → Authentication → Users 建立使用者。
