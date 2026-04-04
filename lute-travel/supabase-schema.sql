-- 訂單主表
create table if not exists orders (
  id text primary key,
  booking_ref text not null unique,
  order_date text,
  tour_date text,
  product_code text,
  total_pax integer default 0,
  adults integer default 0,
  infants integer default 0,
  platform text,
  platform_revenue numeric default 0,
  cash_revenue numeric default 0,
  language text,
  status text default 'pending',
  status_note text,
  meeting_time text,
  guide_id text,
  representative_name text,
  phone text,
  email text,
  drop_off_location text,
  created_at timestamptz default now()
);

-- 旅客表
create table if not exists passengers (
  id text primary key,
  order_ref text references orders(booking_ref) on delete cascade,
  sequence_no integer,
  passport_name text,
  date_of_birth text,
  passport_no text,
  nationality text,
  kakao_id text,
  is_representative boolean default false
);

-- 排班表
create table if not exists daily_tour_slots (
  id text primary key,
  date text,
  product_code text,
  language text,
  pax integer default 0,
  adults integer default 0,
  infants integer default 0,
  guide_id text,
  driver_id text,
  vehicle_type text,
  guide_fee numeric default 0,
  driver_fee numeric default 0,
  insurance_cost numeric default 0,
  platform_revenue numeric default 0,
  cash_revenue numeric default 0,
  misc_expense numeric default 0,
  vehicle_note text,
  profit_loss numeric default 0
);

-- 導遊表
create table if not exists guides (
  id text primary key,
  name text,
  english_name text,
  phone text,
  preferred_languages text[],
  notes text,
  incompatible_drivers text[]
);

-- 司機表
create table if not exists drivers (
  id text primary key,
  name text,
  phone text,
  license_plate text,
  vehicle_type text
);

-- 開放 Realtime（讓前端即時收到新訂單）
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table passengers;
