-- =============================================================================
-- 會計沖銷系統 — 資料模型 (Milestone 1)
-- 雙分錄會計 + 應收/應付未沖項管理 + 一次沖多筆/部分沖銷
--
-- 設計原則：
--   * 金額一律以「整數元」儲存 (BIGINT)，TWD 無小數，絕不使用浮點數。
--   * 同一傳票 Σ借 = Σ貸 (由 deferred constraint trigger 在交易結束時驗證)。
--   * 每條分錄明細恰好一邊有值：(debit = 0) <> (credit = 0)。
-- =============================================================================

-- ── Enums ────────────────────────────────────────────────────────────────────
do $$ begin
  create type account_category as enum ('asset','liability','equity','revenue','expense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type normal_balance as enum ('debit','credit');
exception when duplicate_object then null; end $$;

do $$ begin
  create type entry_source as enum ('manual','settlement','import');
exception when duplicate_object then null; end $$;

do $$ begin
  create type open_item_type as enum ('AR','AP');
exception when duplicate_object then null; end $$;

do $$ begin
  create type open_item_status as enum ('open','partial','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type settlement_type as enum ('receipt','payment');
exception when duplicate_object then null; end $$;

-- ── 2.1 accounts（科目主檔）─────────────────────────────────────────────────
create table if not exists accounts (
  id              serial primary key,
  code            text not null unique,
  name            text not null,
  category        account_category not null,
  normal_balance  normal_balance not null,
  is_open_item    boolean not null default false,
  active          boolean not null default true
);

-- ── 2.2 journal_entries（傳票表頭）────────────────────────────────────────────
create table if not exists journal_entries (
  id          serial primary key,
  entry_date  date not null,
  period      text not null,                    -- 'YYYY-MM'，由 entry_date 衍生
  summary     text,
  batch_no    text,                             -- 沖銷批次號
  source      entry_source not null default 'manual',
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_journal_entries_period on journal_entries (period);
create index if not exists idx_journal_entries_batch  on journal_entries (batch_no);

-- ── 2.4 open_items（未沖項）──────────────────────────────────────────────────
-- 先建立（journal_lines 會 FK 參照 open_items；open_items 也參照 journal_entries）
create table if not exists open_items (
  id              serial primary key,
  code            text not null unique,         -- 如 'AP-202001-017'
  type            open_item_type not null,
  account_id      integer not null references accounts(id),
  counterparty    text,
  description     text not null,
  original_amount bigint not null check (original_amount > 0),
  origin_entry_id integer references journal_entries(id),
  origin_date     date not null,
  status          open_item_status not null default 'open'
);
create index if not exists idx_open_items_type_status on open_items (type, status);
create index if not exists idx_open_items_origin_date on open_items (origin_date);

-- ── 2.3 journal_lines（分錄明細）─────────────────────────────────────────────
create table if not exists journal_lines (
  id           serial primary key,
  entry_id     integer not null references journal_entries(id) on delete cascade,
  account_id   integer not null references accounts(id),
  debit        bigint not null default 0 check (debit >= 0),
  credit       bigint not null default 0 check (credit >= 0),
  memo         text,
  open_item_id integer references open_items(id),
  -- 恰好一邊有值
  constraint chk_one_sided check ((debit = 0) <> (credit = 0))
);
create index if not exists idx_journal_lines_entry   on journal_lines (entry_id);
create index if not exists idx_journal_lines_account on journal_lines (account_id);
create index if not exists idx_journal_lines_openitem on journal_lines (open_item_id);

-- ── 2.5 settlements（沖銷事件表頭）──────────────────────────────────────────
create table if not exists settlements (
  id               serial primary key,
  settlement_date  date not null,
  type             settlement_type not null,
  bank_account_id  integer not null references accounts(id),
  fee_amount       bigint not null default 0 check (fee_amount >= 0),
  fee_account_id   integer references accounts(id),
  total_amount     bigint not null check (total_amount >= 0),
  journal_entry_id integer references journal_entries(id),
  batch_no         text not null,
  note             text,
  created_by       text,
  created_at       timestamptz not null default now(),
  -- 有手續費就必須指定手續費科目
  constraint chk_fee_account check (fee_amount = 0 or fee_account_id is not null)
);

-- ── 2.6 settlement_allocations（沖銷分配，多對一 + 部分沖銷的關鍵）───────────
create table if not exists settlement_allocations (
  id            serial primary key,
  settlement_id integer not null references settlements(id) on delete cascade,
  open_item_id  integer not null references open_items(id),
  amount        bigint not null check (amount > 0)
);
create index if not exists idx_alloc_settlement on settlement_allocations (settlement_id);
create index if not exists idx_alloc_open_item  on settlement_allocations (open_item_id);

-- ── 2.7 opening_balances（期初數）───────────────────────────────────────────
create table if not exists opening_balances (
  id         serial primary key,
  account_id integer not null references accounts(id),
  year       integer not null,
  amount     bigint not null check (amount >= 0),
  side       normal_balance not null,
  unique (account_id, year)
);

-- ── 不變條件：同一傳票 Σ借 = Σ貸 ─────────────────────────────────────────────
-- 以 deferred constraint trigger 在交易 commit 時驗證，允許交易中暫時不平衡。
create or replace function assert_entry_balanced() returns trigger as $$
declare
  v_entry_id integer;
  v_debit    bigint;
  v_credit   bigint;
  v_count    integer;
begin
  v_entry_id := coalesce(new.entry_id, old.entry_id);

  select coalesce(sum(debit),0), coalesce(sum(credit),0), count(*)
    into v_debit, v_credit, v_count
    from journal_lines where entry_id = v_entry_id;

  -- 傳票已被整張刪除則不檢查
  if v_count = 0 then
    return null;
  end if;

  if v_debit <> v_credit then
    raise exception '傳票不平衡 (entry_id=%): 借方=% 貸方=%', v_entry_id, v_debit, v_credit
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_assert_entry_balanced on journal_lines;
create constraint trigger trg_assert_entry_balanced
  after insert or update or delete on journal_lines
  deferrable initially deferred
  for each row execute function assert_entry_balanced();

-- ── view：未沖項含已沖額與餘額（供沖銷工作台/帳齡/對帳使用）─────────────────
create or replace view open_items_with_remaining as
select
  oi.*,
  coalesce(s.settled, 0)                       as settled,
  oi.original_amount - coalesce(s.settled, 0)  as remaining
from open_items oi
left join (
  select open_item_id, sum(amount) as settled
  from settlement_allocations
  group by open_item_id
) s on s.open_item_id = oi.id;
