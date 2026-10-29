-- =============================================================================
-- 允許銀行明細暫存區（bank_transactions）的狀態為 'dismissed'
-- 用途：匯入頁「不匯入」的銀行明細可從待入帳清單刪除（標記 dismissed，原始資料保留可追溯）。
--
-- 在 Supabase → SQL Editor 貼上整段執行一次即可；可重複執行（已允許時不會再改）。
-- 會保留原本允許的所有狀態（例如 unmatched / matched），只多加 'dismissed'。
-- 若任何一步失敗，整段自動復原，不會影響既有資料。
-- =============================================================================
do $$
declare
  def text;
  new_def text;
begin
  select pg_get_constraintdef(oid) into def
    from pg_constraint
   where conname = 'bank_transactions_status_check'
     and conrelid = 'public.bank_transactions'::regclass;

  if def is null then
    raise exception '找不到約束 bank_transactions_status_check，未做任何修改';
  end if;
  if def like '%''dismissed''%' then
    raise notice '已允許 dismissed，不需修改：%', def;
    return;
  end if;
  if def not like '%ARRAY[%' then
    raise exception '約束格式與預期不同，未做任何修改，請把這段貼給工程協助：%', def;
  end if;

  new_def := replace(def, 'ARRAY[', 'ARRAY[''dismissed''::text, ');
  execute 'alter table public.bank_transactions drop constraint bank_transactions_status_check';
  execute 'alter table public.bank_transactions add constraint bank_transactions_status_check ' || new_def;
  raise notice '已更新：% → %', def, new_def;
end $$;
