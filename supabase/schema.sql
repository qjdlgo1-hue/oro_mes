-- ORO MES · Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN 하세요.

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_no text,
  order_date date,
  ym text,
  item_code text,
  gubun text,
  name text,
  spec text,
  qty numeric,
  customer text,
  note text,
  created_at timestamptz default now()
);
create index if not exists idx_orders_ym on orders(ym);

create table if not exists plans (
  order_id uuid primary key references orders(id) on delete cascade,
  start_date date,
  span int default 1,
  done boolean default false
);

create table if not exists cocs (
  order_id uuid primary key references orders(id) on delete cascade,
  data jsonb
);

-- 데모/사내용: 익명 키로 읽기/쓰기 허용 (보안 강화는 추후 로그인 도입 시)
alter table orders enable row level security;
alter table plans  enable row level security;
alter table cocs   enable row level security;
create policy "anon all orders" on orders for all using (true) with check (true);
create policy "anon all plans"  on plans  for all using (true) with check (true);
create policy "anon all cocs"   on cocs   for all using (true) with check (true);
