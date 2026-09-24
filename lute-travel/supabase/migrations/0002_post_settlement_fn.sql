-- =============================================================================
-- 沖銷引擎 — 過帳函式 (Milestone 2，DB 端交易版)
--
-- post_settlement(payload jsonb) 在「單一資料庫交易」內：
--   1. 鎖定並驗證每筆 open_item（type 一致、amount <= remaining）。
--   2. 建立 journal_entries + journal_lines（依分錄產生規則）。
--   3. 建立 settlements + settlement_allocations。
--   4. 把每條應收/應付沖銷腳的 open_item_id 連回，並更新 open_item.status。
--   5. 任一步失敗則整筆 rollback（plpgsql 例外即 rollback 整個函式）。
--
-- payload 形如：
-- {
--   "settlement_date": "2020-01-31",
--   "type": "payment",                 -- 'receipt' | 'payment'
--   "bank_account_id": 5,
--   "fee_amount": 15,
--   "fee_account_id": 9,
--   "batch_no": "B-20200131-001",
--   "note": "...",
--   "created_by": "uid",
--   "allocations": [ { "open_item_id": 12, "amount": 200000 }, ... ]
-- }
--
-- 對應的純 TypeScript 引擎 (src/accounting/engine.ts) 是同一套規則的可測試實作，
-- 兩者必須保持一致；DB 函式負責真正的交易與併發鎖定。
-- =============================================================================

create or replace function post_settlement(payload jsonb)
returns integer as $$
declare
  v_type            settlement_type := (payload->>'type')::settlement_type;
  v_date            date            := (payload->>'settlement_date')::date;
  v_bank            integer         := (payload->>'bank_account_id')::integer;
  v_fee             bigint          := coalesce((payload->>'fee_amount')::bigint, 0);
  v_fee_account     integer         := nullif(payload->>'fee_account_id','')::integer;
  v_batch           text            := payload->>'batch_no';
  v_note            text            := payload->>'note';
  v_created_by      text            := payload->>'created_by';
  v_expected_type   open_item_type;
  v_total           bigint          := 0;
  v_entry_id        integer;
  v_settlement_id   integer;
  alloc             jsonb;
  v_open_id         integer;
  v_amount          bigint;
  v_remaining       bigint;
  v_settled         bigint;
  v_item            open_items%rowtype;
begin
  if v_fee < 0 then raise exception '手續費不可為負數'; end if;
  if v_fee > 0 and v_fee_account is null then
    raise exception '有手續費時必須指定手續費科目';
  end if;

  v_expected_type := case when v_type = 'receipt' then 'AR' else 'AP' end;

  -- 1. 驗證每筆分配並累計總額（鎖定 open_items 避免併發超沖）
  for alloc in select * from jsonb_array_elements(payload->'allocations')
  loop
    v_open_id := (alloc->>'open_item_id')::integer;
    v_amount  := (alloc->>'amount')::bigint;

    if v_amount <= 0 then raise exception '分配金額必須大於 0 (open_item_id=%)', v_open_id; end if;

    select * into v_item from open_items where id = v_open_id for update;
    if not found then raise exception '未沖項不存在 (open_item_id=%)', v_open_id; end if;
    if v_item.type <> v_expected_type then
      raise exception '未沖項類型 (%) 與沖銷類型 (%) 不符 (open_item_id=%)',
        v_item.type, v_type, v_open_id;
    end if;

    select coalesce(sum(sa.amount),0) into v_settled
      from settlement_allocations sa where sa.open_item_id = v_open_id;
    v_remaining := v_item.original_amount - v_settled;

    if v_amount > v_remaining then
      raise exception '分配金額 % 超過未沖餘額 % (open_item_id=%)', v_amount, v_remaining, v_open_id;
    end if;

    v_total := v_total + v_amount;
  end loop;

  if v_total <= 0 then raise exception '沖銷總額必須大於 0'; end if;
  if v_type = 'receipt' and v_fee > v_total then
    raise exception '收款手續費 % 不可超過收款總額 %', v_fee, v_total;
  end if;

  -- 2. 建立傳票表頭
  insert into journal_entries (entry_date, period, summary, batch_no, source, created_by)
  values (v_date, to_char(v_date,'YYYY-MM'),
          case when v_type='receipt' then '收款沖銷' else '付款沖銷' end,
          v_batch, 'settlement', v_created_by)
  returning id into v_entry_id;

  -- 3. 沖銷分配 + 對應分錄腳
  insert into settlements (settlement_date, type, bank_account_id, fee_amount, fee_account_id,
                           total_amount, journal_entry_id, batch_no, note, created_by)
  values (v_date, v_type, v_bank, v_fee, v_fee_account, v_total, v_entry_id, v_batch, v_note, v_created_by)
  returning id into v_settlement_id;

  for alloc in select * from jsonb_array_elements(payload->'allocations')
  loop
    v_open_id := (alloc->>'open_item_id')::integer;
    v_amount  := (alloc->>'amount')::bigint;
    select * into v_item from open_items where id = v_open_id;

    insert into settlement_allocations (settlement_id, open_item_id, amount)
    values (v_settlement_id, v_open_id, v_amount);

    if v_type = 'payment' then
      -- 借 應付帳款 = amount（連 open_item）
      insert into journal_lines (entry_id, account_id, debit, credit, memo, open_item_id)
      values (v_entry_id, v_item.account_id, v_amount, 0, v_item.description, v_open_id);
    else
      -- 貸 應收帳款 = amount（連 open_item）
      insert into journal_lines (entry_id, account_id, debit, credit, memo, open_item_id)
      values (v_entry_id, v_item.account_id, 0, v_amount, v_item.description, v_open_id);
    end if;

    -- 4. 更新狀態
    select coalesce(sum(sa.amount),0) into v_settled
      from settlement_allocations sa where sa.open_item_id = v_open_id;
    update open_items set status =
      case when v_settled >= original_amount then 'closed'
           when v_settled > 0 then 'partial'
           else 'open' end
      where id = v_open_id;
  end loop;

  -- 手續費腳
  if v_fee > 0 then
    insert into journal_lines (entry_id, account_id, debit, credit, memo)
    values (v_entry_id, v_fee_account, v_fee, 0, '銀行手續費');
  end if;

  -- 銀行現金腳
  if v_type = 'payment' then
    -- 貸 銀行現金 = total + fee
    insert into journal_lines (entry_id, account_id, debit, credit, memo)
    values (v_entry_id, v_bank, 0, v_total + v_fee, '銀行付款');
  else
    -- 借 銀行現金 = total - fee
    insert into journal_lines (entry_id, account_id, debit, credit, memo)
    values (v_entry_id, v_bank, v_total - v_fee, 0, '銀行收款');
  end if;

  -- 平衡由 deferred constraint trigger 在 commit 時驗證
  return v_settlement_id;
end;
$$ language plpgsql;
