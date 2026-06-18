-- =============================================================================
-- 過帳函式（補齊）：手動傳票 + 認列掛帳（里程碑「第 0 步」）
-- 與 src/accounting/engine.ts 同一套規則；DB 端負責單一交易與不變條件。
-- =============================================================================

-- ── 通用手動傳票過帳 ─────────────────────────────────────────────────────────
-- payload:
-- {
--   "entry_date":"2020-01-31","summary":"1月薪資","source":"manual",
--   "batch_no":null,"created_by":"uid",
--   "lines":[{"account_id":15,"debit":80000,"credit":0,"memo":"..."},
--            {"account_id":1,"debit":0,"credit":80000}]
-- }
-- 平衡由 deferred constraint trigger 於 commit 時驗證（不平衡整筆 rollback）。
create or replace function post_journal_entry(payload jsonb)
returns integer as $$
declare
  v_date  date    := (payload->>'entry_date')::date;
  v_entry integer;
  ln      jsonb;
begin
  insert into journal_entries (entry_date, period, summary, batch_no, source, created_by)
  values (
    v_date, to_char(v_date,'YYYY-MM'),
    payload->>'summary',
    nullif(payload->>'batch_no',''),
    coalesce(nullif(payload->>'source','')::entry_source, 'manual'),
    payload->>'created_by'
  )
  returning id into v_entry;

  for ln in select * from jsonb_array_elements(payload->'lines')
  loop
    insert into journal_lines (entry_id, account_id, debit, credit, memo, open_item_id)
    values (
      v_entry,
      (ln->>'account_id')::integer,
      coalesce((ln->>'debit')::bigint, 0),
      coalesce((ln->>'credit')::bigint, 0),
      ln->>'memo',
      nullif(ln->>'open_item_id','')::integer
    );
  end loop;

  return v_entry;
end;
$$ language plpgsql;

-- ── 認列掛帳（建立未沖項 + 對應傳票）────────────────────────────────────────
-- payload:
-- {
--   "kind":"cost"|"revenue","entry_date":"2020-01-05","amount":200000,
--   "counterparty":"阿明遊覽車","description":"1月包車費",
--   "control_account_id":5,"pnl_account_id":12,"created_by":"uid"
-- }
--   認列收入：借 應收(control) + 貸 收入(pnl)，建 open_item(AR)。
--   認列成本：借 成本(pnl) + 貸 應付(control)，建 open_item(AP)。
create or replace function post_recognition(payload jsonb)
returns integer as $$
declare
  v_kind    text    := payload->>'kind';
  v_date    date    := (payload->>'entry_date')::date;
  v_amount  bigint  := (payload->>'amount')::bigint;
  v_control integer := (payload->>'control_account_id')::integer;
  v_pnl     integer := (payload->>'pnl_account_id')::integer;
  v_type    open_item_type;
  v_entry   integer;
  v_open    integer;
  v_seq     integer;
  v_code    text;
begin
  if v_amount <= 0 then raise exception '認列金額必須大於 0'; end if;
  v_type := case when v_kind = 'revenue' then 'AR' else 'AP' end;

  -- 傳票表頭
  insert into journal_entries (entry_date, period, summary, source, created_by)
  values (v_date, to_char(v_date,'YYYY-MM'), payload->>'description', 'manual', payload->>'created_by')
  returning id into v_entry;

  -- 產生 open_item 代號 TYPE-YYYYMM-seq
  select count(*) + 1 into v_seq from open_items where type = v_type;
  v_code := v_type || '-' || to_char(v_date,'YYYYMM') || '-' || lpad(v_seq::text, 3, '0');

  insert into open_items (code, type, account_id, counterparty, description,
                          original_amount, origin_entry_id, origin_date, status)
  values (v_code, v_type, v_control, payload->>'counterparty', payload->>'description',
          v_amount, v_entry, v_date, 'open')
  returning id into v_open;

  if v_kind = 'revenue' then
    -- 借 應收(control, 連 open_item) + 貸 收入(pnl)
    insert into journal_lines (entry_id, account_id, debit, credit, memo, open_item_id)
    values (v_entry, v_control, v_amount, 0, payload->>'description', v_open);
    insert into journal_lines (entry_id, account_id, debit, credit, memo)
    values (v_entry, v_pnl, 0, v_amount, payload->>'description');
  else
    -- 借 成本(pnl) + 貸 應付(control, 連 open_item)
    insert into journal_lines (entry_id, account_id, debit, credit, memo)
    values (v_entry, v_pnl, v_amount, 0, payload->>'description');
    insert into journal_lines (entry_id, account_id, debit, credit, memo, open_item_id)
    values (v_entry, v_control, 0, v_amount, payload->>'description', v_open);
  end if;

  return v_open;
end;
$$ language plpgsql;
