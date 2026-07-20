-- ORO CRM · Supabase 스키마 (기록용)
-- 이미 oro-mes 프로젝트에 마이그레이션 "create_crm_tables"로 적용되어 있음.
-- 다른 프로젝트에 새로 설치할 때는 SQL Editor에 붙여넣고 RUN.

create table if not exists crm_companies (
  id text primary key,
  name text not null,
  domain text,
  tier text default '일반',
  country text,
  product text,
  memo text,
  created_at timestamptz default now()
);

create table if not exists crm_contacts (
  id text primary key,
  company_id text references crm_companies(id) on delete cascade,
  name text not null,
  role text,
  contact text,
  created_at timestamptz default now()
);

create table if not exists crm_deals (
  id text primary key,
  company_id text references crm_companies(id) on delete cascade,
  title text not null,
  spec text,
  stage text default 'inquiry',
  value text,
  created_at timestamptz default now()
);

create table if not exists crm_activities (
  id text primary key,
  company_id text references crm_companies(id) on delete cascade,
  channel text default 'memo',
  direction text default 'received',
  person text,
  title text not null,
  body text,
  deal_id text references crm_deals(id) on delete set null,
  date text,
  created_at timestamptz default now()
);

create index if not exists idx_crm_contacts_company on crm_contacts(company_id);
create index if not exists idx_crm_deals_company on crm_deals(company_id);
create index if not exists idx_crm_activities_company on crm_activities(company_id);
create index if not exists idx_crm_activities_deal on crm_activities(deal_id);

-- RLS: MES와 동일하게 로그인(authenticated) 사용자만 읽고 쓸 수 있음
alter table crm_companies enable row level security;
alter table crm_contacts enable row level security;
alter table crm_deals enable row level security;
alter table crm_activities enable row level security;

create policy "crm_companies_all" on crm_companies for all to authenticated using (true) with check (true);
create policy "crm_contacts_all" on crm_contacts for all to authenticated using (true) with check (true);
create policy "crm_deals_all" on crm_deals for all to authenticated using (true) with check (true);
create policy "crm_activities_all" on crm_activities for all to authenticated using (true) with check (true);

-- 소프트 삭제 (마이그레이션 "add_crm_soft_delete") — 삭제해도 DB에 남아 복구 가능
alter table crm_companies add column if not exists deleted_at timestamptz;
alter table crm_contacts add column if not exists deleted_at timestamptz;
alter table crm_deals add column if not exists deleted_at timestamptz;
alter table crm_activities add column if not exists deleted_at timestamptz;

-- 견적: 월별 PGC/AgCN 평균가 + 거래처별 품목
-- (마이그레이션 "create_crm_quotes", "add_agcn_to_quotes")
create table if not exists crm_pgc_prices (
  ym text primary key,
  price numeric not null,       -- PGC 원/g
  agcn_price numeric,           -- 청화은 원/g
  etc_cost numeric,             -- 재료비(기타) — 전 품목 공통 적용 (마이그레이션 "add_etc_cost_to_pgc_prices")
  created_at timestamptz default now()
);
create table if not exists crm_quote_items (
  id text primary key,
  company_id text references crm_companies(id) on delete cascade,
  gubun text,                   -- 사급/도급
  model text not null,
  spec text,
  pgc_grams numeric not null default 0,
  agcn_grams numeric not null default 0,
  material_ni numeric not null default 0,
  material_etc numeric not null default 0,
  yield_grams numeric not null default 50,
  margin_rate numeric not null default 0.35,
  note text,
  sort int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_crm_quote_items_company on crm_quote_items(company_id);
alter table crm_pgc_prices enable row level security;
alter table crm_quote_items enable row level security;
create policy "crm_pgc_prices_all" on crm_pgc_prices for all to authenticated using (true) with check (true);
create policy "crm_quote_items_all" on crm_quote_items for all to authenticated using (true) with check (true);

-- 메일 첨부파일 (마이그레이션 "add_activity_attachments_and_mail_files_bucket")
-- 수집기가 첨부를 비공개 버킷 crm-mail-files에 올리고 목록을 활동에 기록
-- attachments: [{name, path, size, type}]
alter table crm_activities add column if not exists attachments jsonb;
-- insert into storage.buckets (id, name, public) values ('crm-mail-files','crm-mail-files', false);
-- create policy "crm_mail_files_read" on storage.objects for select to authenticated using (bucket_id = 'crm-mail-files');

-- 견적 발행 이력 (마이그레이션 "create_crm_quote_issues")
-- 언제 어느 거래처에 어떤 기준으로 발행했는지 + 재다운로드용 품목·단가 스냅샷
create table if not exists crm_quote_issues (
  id text primary key,
  company_id text references crm_companies(id) on delete cascade,
  ym text not null,
  pgc_price numeric,
  agcn_price numeric,
  etc_cost numeric,
  item_count int not null default 0,
  kind text not null default 'single', -- single(개별) | bulk(일괄)
  rows jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_crm_quote_issues_company on crm_quote_issues(company_id);
create index if not exists idx_crm_quote_issues_created on crm_quote_issues(created_at desc);
alter table crm_quote_issues enable row level security;
create policy "crm_quote_issues_all" on crm_quote_issues for all to authenticated using (true) with check (true);

-- 일별 금시세 (마이그레이션 "create_crm_gold_prices")
-- 신한은행 금시세 붙여넣기 + 그날의 PGC·청화은 가격 수동 입력, 월 평균 → 견적 기준가 반영
create table if not exists crm_gold_prices (
  date text primary key,          -- 'YYYY-MM-DD'
  close numeric,                  -- 종가 (원/g)
  change numeric,                 -- 전일대비 (상승 +/하락 -)
  change_rate numeric,            -- 등락률 % (부호 포함)
  buy_physical numeric,
  sell_physical numeric,
  deposit numeric,
  withdraw numeric,
  pgc numeric,
  agcn numeric,
  created_at timestamptz default now()
);
alter table crm_gold_prices enable row level security;
create policy "crm_gold_prices_all" on crm_gold_prices for all to authenticated using (true) with check (true);

-- 메일 자동 수집 계정 (CRM 설정 화면에서 관리, 수집기가 매시간 읽음)
-- 마이그레이션 "create_crm_mail_accounts"로 적용되어 있음.
create table if not exists crm_mail_accounts (
  id text primary key,
  label text not null,
  username text not null,
  password text not null,
  imap_host text not null,
  imap_port int not null default 993,
  smtp_host text,
  smtp_port int default 465,
  enabled boolean not null default true,
  created_at timestamptz default now()
);
alter table crm_mail_accounts enable row level security;
create policy "crm_mail_accounts_all" on crm_mail_accounts for all to authenticated using (true) with check (true);
