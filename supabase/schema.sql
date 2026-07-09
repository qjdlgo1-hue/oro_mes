-- ORO MES · Supabase 스키마 (전체)
-- 대시보드 > SQL Editor 에 붙여넣고 RUN.

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_no text, order_date date, ym text,
  item_code text, gubun text, name text, spec text,
  qty numeric, customer text, note text, created_at timestamptz default now()
);
create index if not exists idx_orders_ym on orders(ym);

create table if not exists plans (
  order_id uuid primary key references orders(id) on delete cascade,
  start_date date, span int default 1, done boolean default false
);
create table if not exists cocs (
  order_id uuid primary key references orders(id) on delete cascade, data jsonb
);
create table if not exists app_settings (
  id int primary key default 1, logo text, stamp text, company text, updated_at timestamptz default now()
);
insert into app_settings (id) values (1) on conflict (id) do nothing;

-- 역할(프로필)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, role text not null default 'user', created_at timestamptz default now()
);
create or replace function is_admin() returns boolean language sql security definer stable as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin'); $$;
create or replace function handle_new_user() returns trigger language plpgsql security definer as $$
begin insert into profiles (id, email) values (new.id, new.email) on conflict (id) do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
insert into profiles (id, email) select id, email from auth.users on conflict (id) do nothing;
-- 관리자 지정 예: update profiles set role='admin' where email='dwlee@orocorp.kr';

-- 소프트 삭제(휴지통): 관리자 휴지통에서 복구/영구삭제
alter table orders add column if not exists deleted_at timestamptz;
alter table receipts add column if not exists deleted_at timestamptz;
create index if not exists idx_orders_deleted on orders(deleted_at) where deleted_at is not null;
create index if not exists idx_receipts_deleted on receipts(deleted_at) where deleted_at is not null;

-- 슬립 방지 핑 (GitHub Actions가 2일마다 rpc/ping_keep_alive 호출)
create table if not exists keep_alive (
  id bigint generated always as identity primary key,
  pinged_at timestamptz default now(), note text
);
alter table keep_alive enable row level security;
create or replace function ping_keep_alive() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare t timestamptz;
begin
  insert into keep_alive (note) values ('keep-alive ping') returning pinged_at into t;
  delete from keep_alive where pinged_at < now() - interval '30 days';
  return t;
end; $$;
grant execute on function ping_keep_alive() to anon, authenticated;

-- 주간 백업 (pg_cron: 매주 일 18:00 UTC = 월 03:00 KST, backup 스키마 스냅샷 60일 보관)
create extension if not exists pg_cron;
create schema if not exists backup;
create or replace function backup.snapshot() returns text
language plpgsql security definer set search_path = public as $$
declare t text; ts text := to_char(now(), 'YYYYMMDD'); n int := 0; r record;
begin
  foreach t in array array['orders','plans','cocs','receipts','inout_rows','prod_consume','bom',
    'projects','inspections','app_settings','role_permissions','menu_groups','menu_placement','profiles','audit_log'] loop
    execute format('drop table if exists backup.%I', t || '_' || ts);
    execute format('create table backup.%I as table public.%I', t || '_' || ts, t);
    n := n + 1;
  end loop;
  for r in select tablename from pg_tables where schemaname = 'backup' and tablename ~ '_[0-9]{8}$' loop
    if to_date(right(r.tablename, 8), 'YYYYMMDD') < current_date - 60 then
      execute format('drop table backup.%I', r.tablename);
    end if;
  end loop;
  return ts || ' snapshot: ' || n || ' tables';
end; $$;
-- select cron.schedule('weekly-backup', '0 18 * * 0', $$select backup.snapshot()$$);

-- 감사 로그
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  at timestamptz default now(), user_email text, action text, entity text, entity_id text, detail jsonb
);

-- RLS
alter table orders enable row level security;
alter table plans enable row level security;
alter table cocs enable row level security;
alter table app_settings enable row level security;
alter table profiles enable row level security;
alter table audit_log enable row level security;

-- 주문: 조회/추가/수정은 로그인 사용자, 삭제는 관리자만
create policy "orders sel" on orders for select to authenticated using (true);
create policy "orders ins" on orders for insert to authenticated with check (true);
create policy "orders upd" on orders for update to authenticated using (true) with check (true);
create policy "orders del" on orders for delete to authenticated using (is_admin());
-- 계획/COC/설정: 로그인 사용자 전체 허용 (계획/COC 삭제는 주문 삭제 시 cascade)
create policy "auth plans"    on plans        for all to authenticated using (true) with check (true);
create policy "auth cocs"     on cocs         for all to authenticated using (true) with check (true);
create policy "auth settings" on app_settings for all to authenticated using (true) with check (true);
-- 프로필: 모두 조회, 역할 변경은 관리자만
create policy "read profiles"  on profiles for select to authenticated using (true);
create policy "admin profiles" on profiles for all to authenticated using (is_admin()) with check (is_admin());
-- 감사로그: 조회/기록은 로그인 사용자
create policy "read audit"   on audit_log for select to authenticated using (true);
create policy "insert audit" on audit_log for insert to authenticated with check (true);

-- ===== 경영분석보고서 이력 (biz_reports) =====
-- 리포트 탭 '경영보고서'에서 생성한 보고서를 보관. content_md는 마크다운, kpis는 집계 원본.
-- ai=true면 Edge Function(biz-report)이 Claude API로 생성, false면 규칙 기반 요약.
create table if not exists biz_reports (
  id uuid primary key default gen_random_uuid(),
  period_type text not null,          -- 'month' | 'quarter' | 'half' | 'year'
  period_key text not null,           -- '2026-06' | '2026-Q2' | '2026-H1' | '2026'
  title text not null,
  content_md text not null,
  kpis jsonb,
  ai boolean not null default false,
  model text,
  created_at timestamptz not null default now()
);
alter table biz_reports enable row level security;
create policy "biz_reports_all" on biz_reports for all to authenticated using (true) with check (true);
create index if not exists biz_reports_period_idx on biz_reports (period_key, created_at desc);

-- ===== Edge Function: biz-report =====
-- supabase/functions/biz-report — KPI JSON을 받아 Claude API(claude-opus-4-8)로 경영분석 마크다운 생성.
-- 필요 secret: ANTHROPIC_API_KEY (대시보드 > Edge Functions > Secrets에서 등록. 리포지토리에 커밋 금지)

-- ===== 지원사업 서류 자동작성 (grant_docs) =====
-- 창업중심대학사업 집행 건: 한 건 입력으로 서식 세트(f1~f12) 자동 생성.
-- data(jsonb)에 서식 필드 전체 보관, forms는 선택된 서식 키.
-- 회사 프로필(기업명·대표자·계좌 등)은 app_settings.grant_profile(jsonb)에 1회 저장.
create table if not exists grant_docs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  expense_item text,
  forms text[] not null default '{}',
  data jsonb not null default '{}',
  photos jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table grant_docs enable row level security;
create policy "grant_docs_all" on grant_docs for all to authenticated using (true) with check (true);
alter table app_settings add column if not exists grant_profile jsonb;
