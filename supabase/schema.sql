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
  sort int default 0,
  label text -- 사용자 지정 메뉴 이름 (null = TAB_DEFS 기본 라벨)
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

-- ===== BOM 정규화 (이카운트 BOM(소요량)현황) =====
-- 완제품 → 원재료 N행 구조. 원재료 탭 'BOM 가져오기'로 이카운트 내보내기를 통째로 임포트.
-- 다단계 지원: 소모품목이 다른 행의 생산품목(반제품)이면 소요량 전개 시 재귀 계산 (src/lib/bom.ts).
-- 기존 bom(agcn/pgc 2열) 테이블은 사용 중단(데이터는 보존).
create table if not exists bom_rows (
  id uuid primary key default gen_random_uuid(),
  prod_code text not null default '',
  prod_name text not null,
  process text not null default '',      -- 생산공정명 (시빙/도금)
  version text not null default '기본',   -- BOM버전 (현재 전부 '기본', UI 미노출)
  mat_code text not null default '',
  mat_name text not null,
  batch_qty numeric not null default 50, -- 생산수량(기준수량)
  qty numeric not null default 0,        -- 소요량(기준수량당)
  created_at timestamptz not null default now(),
  unique (prod_code, prod_name, mat_code, mat_name)
);
alter table bom_rows enable row level security;
drop policy if exists "bom_rows_all" on bom_rows;
create policy "bom_rows_all" on bom_rows for all to authenticated using (true) with check (true);

-- ===== BOM 리비전 (bom_revs — 불변 스냅샷, Rev 1→2→3 이력 보존) =====
-- 원칙: 확정된 리비전은 수정하지 않고, 새 리비전을 발행(draft)해 편집 후 확정(active)한다.
-- 품목당 active 리비전은 부분 유니크 인덱스로 1개만 강제. 상세 행은 bom_rows.rev_id로 연결.
create table if not exists bom_revs (
  id uuid primary key default gen_random_uuid(),
  prod_code text default '',
  prod_name text not null,
  revision int not null,
  status text not null default 'draft' check (status in ('draft','active','obsolete')),
  description text,                       -- 변경 사유 / 메모
  effective_from date,                    -- 확정(적용 시작)일
  created_at timestamptz default now(),
  unique (prod_name, revision)
);
create unique index if not exists bom_revs_one_active on bom_revs(prod_name) where status = 'active';
alter table bom_revs enable row level security;
drop policy if exists bom_revs_all on bom_revs;
create policy bom_revs_all on bom_revs for all to authenticated using (true) with check (true);

alter table bom_rows add column if not exists rev_id uuid references bom_revs(id) on delete cascade;
-- 리비전 도입으로 4열 유니크 → (rev_id, mat_code, mat_name)로 재구성 (리비전별 같은 자재 1행)
alter table bom_rows drop constraint if exists bom_rows_prod_code_prod_name_mat_code_mat_name_key;
create unique index if not exists bom_rows_rev_mat_uniq on bom_rows(rev_id, mat_code, mat_name);
create index if not exists bom_rows_rev_idx on bom_rows(rev_id);

-- 활성 리비전 행 뷰 — listBomRows() 계약 유지용 (rev_id null은 승계 전 안전망)
create or replace view v_bom_active with (security_invoker = true) as
select r.* from bom_rows r
left join bom_revs v on v.id = r.rev_id
where r.rev_id is null or v.status = 'active';

-- 새 리비전 발행: active(없으면 최신) 복제 → draft Rev N+1 (원자)
create or replace function fn_bom_next_rev(p_code text, p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_src uuid; v_next int; v_new uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception '생산품목명이 필요합니다'; end if;
  select id into v_src from bom_revs where prod_name = p_name and status = 'active';
  if v_src is null then
    select id into v_src from bom_revs where prod_name = p_name order by revision desc limit 1;
  end if;
  select coalesce(max(revision), 0) + 1 into v_next from bom_revs where prod_name = p_name;
  insert into bom_revs (prod_code, prod_name, revision, status)
  values (coalesce(p_code, ''), p_name, v_next, 'draft')
  returning id into v_new;
  if v_src is not null then
    insert into bom_rows (prod_code, prod_name, process, version, mat_code, mat_name, batch_qty, qty, rev_id)
    select prod_code, prod_name, process, version, mat_code, mat_name, batch_qty, qty, v_new
    from bom_rows where rev_id = v_src;
  end if;
  return v_new;
end $$;
revoke all on function fn_bom_next_rev(text, text) from public;
revoke execute on function fn_bom_next_rev(text, text) from anon;
grant execute on function fn_bom_next_rev(text, text) to authenticated;

-- 리비전 확정: 기존 active → obsolete, draft → active (한 트랜잭션 — active 0개/2개인 순간이 없다)
create or replace function fn_bom_publish(p_rev uuid, p_desc text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_name text; v_status text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select prod_name, status into v_name, v_status from bom_revs where id = p_rev;
  if v_name is null then raise exception 'BOM 리비전을 찾을 수 없습니다'; end if;
  if v_status <> 'draft' then raise exception 'draft 리비전만 확정할 수 있습니다'; end if;
  update bom_revs set status = 'obsolete' where prod_name = v_name and status = 'active';
  update bom_revs set status = 'active', effective_from = current_date,
    description = coalesce(p_desc, description) where id = p_rev;
end $$;
revoke all on function fn_bom_publish(uuid, text) from public;
revoke execute on function fn_bom_publish(uuid, text) from anon;
grant execute on function fn_bom_publish(uuid, text) to authenticated;

-- 이카운트 가져오기: 파일에 포함된 제품마다 새 리비전 발행 후 즉시 active (전체 교체 대신 이력 보존)
create or replace function fn_bom_import(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare rec record; v_new uuid; v_next int; n_prod int := 0; n_rows int := 0; v_cnt int;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  for rec in (
    select x.prod_name, max(coalesce(x.prod_code, '')) as prod_code
    from jsonb_to_recordset(payload) as x(prod_code text, prod_name text)
    where x.prod_name is not null and btrim(x.prod_name) <> ''
    group by x.prod_name
  ) loop
    select coalesce(max(revision), 0) + 1 into v_next from bom_revs where prod_name = rec.prod_name;
    update bom_revs set status = 'obsolete' where prod_name = rec.prod_name and status = 'active';
    insert into bom_revs (prod_code, prod_name, revision, status, description, effective_from)
    values (rec.prod_code, rec.prod_name, v_next, 'active', '이카운트 가져오기', current_date)
    returning id into v_new;
    insert into bom_rows (prod_code, prod_name, process, version, mat_code, mat_name, batch_qty, qty, rev_id)
    select coalesce(y.prod_code, ''), y.prod_name, coalesce(y.process, ''), coalesce(y.version, '기본'),
           coalesce(y.mat_code, ''), y.mat_name, coalesce(y.batch_qty, 50), coalesce(y.qty, 0), v_new
    from jsonb_to_recordset(payload) as y(prod_code text, prod_name text, process text, version text, mat_code text, mat_name text, batch_qty numeric, qty numeric)
    where y.prod_name = rec.prod_name and y.mat_name is not null and btrim(y.mat_name) <> ''
    on conflict (rev_id, mat_code, mat_name) do update set qty = excluded.qty, batch_qty = excluded.batch_qty;
    get diagnostics v_cnt = row_count;
    n_rows := n_rows + v_cnt;
    n_prod := n_prod + 1;
  end loop;
  return jsonb_build_object('products', n_prod, 'rows', n_rows);
end $$;
revoke all on function fn_bom_import(jsonb) from public;
revoke execute on function fn_bom_import(jsonb) from anon;
grant execute on function fn_bom_import(jsonb) to authenticated;

-- ===== 품목 마스터 (items) =====
-- 이카운트 품목등록 대응 — 코드/명/규격/구분/단위. '품목' 탭에서 자동 수집·붙여넣기 가져오기·수동 등록.
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  code text not null default '',
  name text not null,
  spec text not null default '',
  gubun text not null default '제품',   -- 제품/반제품/원재료/부재료/상품/무형상품
  unit text not null default 'g',
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (code, name)
);
create unique index if not exists items_code_uniq on items (code) where code <> '';
alter table items enable row level security;
drop policy if exists "items_all" on items;
create policy "items_all" on items for all to authenticated using (true) with check (true);

-- ===== 이카운트(ERP) OpenAPI 연동 =====
-- Edge Function 'ecount'가 프록시 — 인증키는 ecount_config(service role 전용)에만 보관, 브라우저 미노출.
-- actions: get_config/save_config/test(master) · items(품목조회)/stock(재고현황). 세션ID는 12h 캐시.
create table if not exists ecount_config (
  id int primary key default 1 check (id = 1),
  com_code text not null default '',
  user_id text not null default '',
  api_cert_key text not null default '',
  use_test boolean not null default true,   -- 테스트존(sboapi) / 운영존(oapi)
  zone text not null default '',            -- Zone API로 자동 확인·캐시
  session_id text,
  session_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table ecount_config enable row level security;
-- 정책 없음(의도적): 클라이언트 직접 접근 전면 차단 — Edge Function(service role)만 접근

create table if not exists ecount_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  action text not null,
  ok boolean not null default false,
  detail jsonb
);
alter table ecount_log enable row level security;
drop policy if exists "ecount_log_read" on ecount_log;
create policy "ecount_log_read" on ecount_log for select to authenticated using (true);
create index if not exists ecount_log_at_idx on ecount_log (at desc);

-- 이카운트 전표 전송 표시 — 성공 즉시 전표번호를 기록해 중복 전송을 막는다.
-- plans.ecount_slip: 생산입고 I 전송(생산계획 완료 건), inout_rows.ecount_slip: 구매입력 전송(구매 행)
alter table plans add column if not exists ecount_slip text;
alter table inout_rows add column if not exists ecount_slip text;

-- 이카운트 전송 제한 보호 — 액션별 마지막 호출 시각. Edge Function이 공식 전송 기준
-- (실서버 조회·로그인 1회/10분, 저장 1회/10초, 테스트서버 1회/10초)에 맞춰 선제 차단에 사용.
alter table ecount_config add column if not exists last_calls jsonb not null default '{}'::jsonb;

-- ===== 생산입고 전표 (이카운트 생산입고II 대응) =====
-- 완제품 입고(+)와 BOM 전개 소모(−)를 전표 1건으로 묶고, 저장/취소는 RPC로 원자 처리.
-- 재고 행은 기존 inout_rows(kind 'in')/prod_consume에 기록 → 재고 현황·수불부·ERP 비교와 호환.
-- RPC: fn_save_production_receipt(payload jsonb) → uuid / fn_cancel_production_receipt(uuid)
--      (security definer, authenticated 전용 — 본문은 migrations 'production_receipts_rpc' 참고)
create table if not exists production_receipts (
  id uuid primary key default gen_random_uuid(),
  rdate date not null default current_date,
  note text,
  status text not null default 'CONFIRMED' check (status in ('CONFIRMED','CANCELED')),
  created_at timestamptz not null default now()
);
alter table production_receipts enable row level security;
drop policy if exists "prcpt_all" on production_receipts;
create policy "prcpt_all" on production_receipts for all to authenticated using (true) with check (true);
alter table inout_rows add column if not exists receipt_id uuid;
alter table prod_consume add column if not exists receipt_id uuid;
