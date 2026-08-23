-- =============================================================================
-- 角色權限（選用）：讓「檢視者(viewer)」真正唯讀。
-- 在 Supabase SQL Editor 執行一次即可。未執行前，viewer 只是標記、仍可寫入。
-- 角色存放於 auth.users.app_metadata.role（由系統「使用者與安全」介面設定）；
-- 未設定角色的帳號一律視為管理員（admin）。
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array['accounts','rules','entries','companies']
  loop
    -- 移除舊的「登入即可讀寫」單一政策
    execute format('drop policy if exists app_authenticated_all on %I', t);
    execute format('drop policy if exists app_read on %I', t);
    execute format('drop policy if exists app_insert on %I', t);
    execute format('drop policy if exists app_update on %I', t);
    execute format('drop policy if exists app_delete on %I', t);

    -- 讀取：所有登入者
    execute format('create policy app_read on %I for select to authenticated using (true)', t);
    -- 寫入：非 viewer（未設定角色視為 admin）
    execute format($p$create policy app_insert on %I for insert to authenticated
      with check (coalesce((auth.jwt()->'app_metadata'->>'role'),'admin') <> 'viewer')$p$, t);
    execute format($p$create policy app_update on %I for update to authenticated
      using (coalesce((auth.jwt()->'app_metadata'->>'role'),'admin') <> 'viewer')
      with check (coalesce((auth.jwt()->'app_metadata'->>'role'),'admin') <> 'viewer')$p$, t);
    execute format($p$create policy app_delete on %I for delete to authenticated
      using (coalesce((auth.jwt()->'app_metadata'->>'role'),'admin') <> 'viewer')$p$, t);
  end loop;
end $$;

-- 還原成「所有登入者皆可讀寫」（如不想要唯讀角色）：
-- do $$ declare t text; begin
--   foreach t in array array['accounts','rules','entries','companies'] loop
--     execute format('drop policy if exists app_read on %I', t);
--     execute format('drop policy if exists app_insert on %I', t);
--     execute format('drop policy if exists app_update on %I', t);
--     execute format('drop policy if exists app_delete on %I', t);
--     execute format('create policy app_authenticated_all on %I for all to authenticated using (true) with check (true)', t);
--   end loop;
-- end $$;
