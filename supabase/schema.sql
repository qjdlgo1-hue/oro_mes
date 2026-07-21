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

-- ===== 누락 보완 (라이브 DB 기준 스냅샷 2026-07) =====
-- 아래 테이블들은 세션 중 마이그레이션으로 생성되었으나 이 파일에 빠져 있었음.
-- 이 파일만으로 새 DB를 재구축할 수 있도록 실제 스키마를 반영.

-- 생산계획 보강: 생산수량 오버라이드·배송일 수동지정
alter table plans add column if not exists qty numeric;
alter table plans add column if not exists deliver_date date;

-- 증빙(영수증)
create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  rdate date, vendor text, bizno text,
  supply numeric default 0, vat numeric default 0, total numeric default 0,
  rtype text, account text, memo text, company text, period text,
  created_at timestamptz default now(), created_by text,
  image_path text, image_paths jsonb
);

-- 생산/판매 실적 (이카운트 가져오기 — kind: in=생산, out=판매)
create table if not exists inout_rows (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('in','out')),
  ym text not null, idate date, item_code text, name text, spec text,
  qty numeric default 0, amount numeric, customer text, note text,
  sig text not null, created_at timestamptz default now(),
  trade_type text, gubun text, cust_code text, vat numeric, total numeric,
  currency text, fx_rate numeric
);
create unique index if not exists inout_rows_kind_sig on inout_rows(kind, sig); -- appendInout onConflict 근거

-- 생산·소모 (원재료 소모 분석)
create table if not exists prod_consume (
  id uuid primary key default gen_random_uuid(),
  ym text, idate date, prod_code text, prod_name text, mat_code text, mat_name text,
  prod_qty numeric, std_qty numeric, act_qty numeric, mat_price numeric, diff numeric, amount numeric,
  sig text not null unique, created_at timestamptz default now()
);

-- 제품별 원재료 사용량 (BOM)
create table if not exists bom (
  product text primary key, agcn numeric default 0, pgc numeric default 0,
  note text, updated_at timestamptz default now()
);

-- 지원사업 과제·검수조서
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null, company text default '오알오', vendor text,
  period_from date, period_to date, note text, created_at timestamptz default now(),
  announce text
);
create table if not exists inspections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  insp_no text, deliver_place text, vendor text, inspect_date date, inspector text,
  sign_path text, items jsonb default '[]', photos jsonb default '[]',
  created_at timestamptz default now()
);

-- 메뉴 구성 편집기
create table if not exists menu_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null, sort int default 0
);
create table if not exists menu_placement (
  item_key text primary key,
  group_id uuid references menu_groups(id) on delete set null,
  sort int default 0
);
alter table app_settings add column if not exists format jsonb;
alter table app_settings add column if not exists menu_order jsonb;

-- 역할별 권한 매트릭스
create table if not exists role_permissions (
  role text not null, capability text not null, allowed boolean not null default false,
  primary key (role, capability)
);

-- RLS: 사내 도구 표준 정책(authenticated 전체 허용) — 신규 테이블 일괄 적용
do $$ declare t text;
begin
  foreach t in array array['receipts','inout_rows','prod_consume','bom','projects','inspections','menu_groups','menu_placement','role_permissions'] loop
    execute format('alter table %I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_all') then
      execute format('create policy %I on %I for all to authenticated using (true) with check (true)', t||'_all', t);
    end if;
  end loop;
end $$;

-- ===== Edge Function: manage-users =====
-- supabase/functions/manage-users — master 전용 계정 생성/비밀번호 재설정 (Service Role 사용, 배포됨)

-- 참고: crm_* 테이블(companies/contacts/deals/activities/mail_accounts/pgc_prices/quote_items)은
-- 별도 CRM 앱(dist/crm) 세션에서 생성 — 정의는 해당 마이그레이션 이력 참조.

-- 소프트 삭제(휴지통): 관리자 휴지통에서 복구/영구삭제
alter table orders add column if not exists deleted_at timestamptz;
alter table receipts add column if not exists deleted_at timestamptz;
-- 해외출장비 증빙: 외화(통화/외화금액/적용환율 — 지출일 매매기준율), 출장명, 세부항목
-- 국외 지출은 법정지출증빙 수취의무 제외·부가세 매입세액공제 불가(vat=0) — 상세는 src/lib/receiptfx.ts
alter table receipts add column if not exists currency text;
alter table receipts add column if not exists fx_amount numeric;
alter table receipts add column if not exists fx_rate numeric;
alter table receipts add column if not exists trip text;
alter table receipts add column if not exists subcat text;
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

-- 공고(프로그램) 구분: 'cud'=2026 창업중심대학사업(성균관대), 'td'=2026 기술닥터사업 상용화지원(경기테크노파크)
-- td 비목·증빙 기준은 「기술닥터사업」 관리지침(2025.02.05) 제35·37·39조 — src/lib/grantforms.ts TD_EVIDENCE에 상수화
alter table grant_docs add column if not exists program text not null default 'cud';
create index if not exists grant_docs_program_idx on grant_docs (program, created_at desc);

-- ===== Edge Function: grant-doc-read =====
-- supabase/functions/grant-doc-read — 거래명세서/세금계산서 PDF·이미지를 Claude API로 판독해
-- 품목/금액/거래처 JSON 추출 → 건 자동 입력. ANTHROPIC_API_KEY secret 재사용(커밋 금지).

-- ===== Edge Function: grant-write =====
-- supabase/functions/grant-write — 서류 서술형 칸의 짧은 초안을 Claude API(claude-opus-4-8)로
-- 공식 서류 문체(보고체)로 확장. biz-report와 같은 ANTHROPIC_API_KEY secret 사용(커밋 금지).

-- ===== 생산 라벨 (POP · Conductive Powder 70×40mm) =====
-- 거래처별 포장단위(New wt, g) — Today(POP) 라벨 인쇄에서 매수 자동계산(수량 ÷ 포장단위 올림)에 사용.
-- 예: {"거래처A": 50, "거래처B": 100}
alter table app_settings add column if not exists label_packs jsonb;

-- ===== 재고 관리 (구매 입고 + 기초재고·실사 조정) =====
-- inout_rows.kind에 'purchase'(구매 입고 — 이카운트 [구매현황]) 추가.
-- 재고 계산: 제품 = 생산입고(in) − 판매(out), 원재료 = 구매(purchase) − 생산소모(prod_consume).
alter table inout_rows drop constraint if exists inout_rows_kind_check;
alter table inout_rows add constraint inout_rows_kind_check check (kind in ('in','out','purchase'));

-- 기초재고/실사 조정/안전재고 — 수불부의 시작 잔량·실물 보정·발주점 기록.
-- kind='base': 기준일(bdate) 시작 시점 잔량을 qty로 설정(그 이전 데이터는 무시, 재실사 시 새 base 추가)
-- kind='adj' : 실사 차이 등 ±증감(qty가 음수면 감소), note에 사유
-- kind='min' : 안전재고(발주점) — qty=하한선, 품목별 최신 bdate 값 사용 (잔량 계산에는 미포함)
create table if not exists stock_base (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('base','adj','min')),
  cat text not null default 'product' check (cat in ('product','material')),
  item_code text not null default '',
  name text not null default '',
  spec text,
  bdate date not null,
  qty numeric not null default 0,
  note text,
  created_at timestamptz not null default now()
);
alter table stock_base enable row level security;
drop policy if exists "stock_base_all" on stock_base;
create policy "stock_base_all" on stock_base for all to authenticated using (true) with check (true);
