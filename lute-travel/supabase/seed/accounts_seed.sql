-- =============================================================================
-- 科目主檔 seed（小型旅行社用，繁體中文，幣別 TWD）
-- is_open_item = true 的科目需要未沖項追蹤（應收 1123 / 應收-關係企業 1224 / 應付 2121）。
-- code 為冪等鍵：重跑會更新名稱等屬性。
-- =============================================================================
insert into accounts (code, name, category, normal_balance, is_open_item, active) values
  -- 資產
  ('1112', '銀行存款',          'asset',     'debit',  false, true),
  ('1111', '現金',              'asset',     'debit',  false, true),
  ('1123', '應收帳款',          'asset',     'debit',  true,  true),
  ('1224', '應收帳款-關係企業',  'asset',     'debit',  true,  true),
  -- 負債
  ('2121', '應付帳款',          'liability', 'credit', true,  true),
  ('2171', '應付費用',          'liability', 'credit', false, true),
  ('2014', '銷項稅額',          'liability', 'credit', false, true),
  -- 權益
  ('3100', '資本',              'equity',    'credit', false, true),
  ('3200', '保留盈餘',          'equity',    'credit', false, true),
  -- 收入
  ('4111', '旅遊收入',          'revenue',   'credit', false, true),
  ('4112', '佣金收入',          'revenue',   'credit', false, true),
  -- 成本/費用
  ('5111', '旅遊成本',          'expense',   'debit',  false, true),
  ('5112', '導遊司機費',        'expense',   'debit',  false, true),
  ('5113', '車輛/保險成本',     'expense',   'debit',  false, true),
  ('6100', '薪資費用',          'expense',   'debit',  false, true),
  ('614',  '銀行手續費',        'expense',   'debit',  false, true),
  ('6200', '雜費',              'expense',   'debit',  false, true)
on conflict (code) do update set
  name           = excluded.name,
  category       = excluded.category,
  normal_balance = excluded.normal_balance,
  is_open_item   = excluded.is_open_item,
  active         = excluded.active;
