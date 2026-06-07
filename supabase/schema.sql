-- ORO MES · Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN 하세요.

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_no text, order_date date, ym text,
  item_code text, gubun text, name text, spec text,
  qty numeric, customer text, note text,
  created_at timestamptz default now()
);
create index if not exists idx_orders_ym on orders(ym);

create table if not exists plans (
  order_id uuid primary key references orders(id) on delete cascade,
  start_date date, span int default 1, done boolean default false
);

create table if not exists cocs (
  order_id uuid primary key references orders(id) on delete cascade,
  data jsonb
);

create table if not exists app_settings (
  id int primary key default 1,
  logo text, stamp text, company text,
  updated_at timestamptz default now()
);
insert into app_settings (id) values (1) on conflict (id) do nothing;

alter table orders        enable row level security;
alter table plans         enable row level security;
alter table cocs          enable row level security;
alter table app_settings  enable row level security;

-- [보안] 로그인 사용자(authenticated)만 읽기/쓰기 허용.
-- (로그인 도입 전 임시로 익명 허용이 필요하면 to authenticated -> to anon, authenticated 로 변경)
create policy "auth orders"   on orders        for all to authenticated using (true) with check (true);
create policy "auth plans"    on plans         for all to authenticated using (true) with check (true);
create policy "auth cocs"     on cocs          for all to authenticated using (true) with check (true);
create policy "auth settings" on app_settings  for all to authenticated using (true) with check (true);
