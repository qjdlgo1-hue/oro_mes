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
