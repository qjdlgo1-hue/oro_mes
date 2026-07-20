// ---------------------------------------------------------------------------
// 저장 계층 - 두 가지 모드를 지원합니다.
//   "cloud" 모드: Supabase(서버 DB)에 저장 → 팀원 모두가 같은 데이터를 봄. 로그인 필요.
//   "local" 모드: 브라우저 localStorage에 저장 → 이 브라우저에서만 보임. 로그인 불필요.
// App.jsx는 이 파일의 함수만 부르면 되고, 어디에 저장되는지는 몰라도 됩니다.
// ---------------------------------------------------------------------------
import { supabase } from "./supabase";

// 앱(camelCase) ↔ DB(snake_case) 컬럼 이름 변환표
const TABLES = {
  companies: {
    table: "crm_companies",
    toRow: (c) => ({ id: c.id, name: c.name, domain: c.domain, tier: c.tier, country: c.country, product: c.product, memo: c.memo }),
    toApp: (r) => ({ id: r.id, name: r.name, domain: r.domain || "", tier: r.tier || "일반", country: r.country || "", product: r.product || "", memo: r.memo || "" }),
  },
  contacts: {
    table: "crm_contacts",
    toRow: (c) => ({ id: c.id, company_id: c.companyId, name: c.name, role: c.role, contact: c.contact }),
    toApp: (r) => ({ id: r.id, companyId: r.company_id, name: r.name, role: r.role || "", contact: r.contact || "" }),
  },
  deals: {
    table: "crm_deals",
    toRow: (d) => ({ id: d.id, company_id: d.companyId, title: d.title, spec: d.spec, stage: d.stage, value: d.value, value_num: d.valueNum }),
    toApp: (r) => ({ id: r.id, companyId: r.company_id, title: r.title, spec: r.spec || "", stage: r.stage || "inquiry", value: r.value || "", valueNum: r.value_num != null ? Number(r.value_num) : null }),
  },
  activities: {
    table: "crm_activities",
    toRow: (a) => ({ id: a.id, company_id: a.companyId, channel: a.channel, direction: a.direction, person: a.person, title: a.title, body: a.body, deal_id: a.dealId || null, date: a.date }),
    // attachments는 수집기만 기록 — 앱에서는 읽기 전용(toRow에 없으므로 수정 시에도 덮어쓰지 않음)
    toApp: (r) => ({ id: r.id, companyId: r.company_id, channel: r.channel || "memo", direction: r.direction || "received", person: r.person || "", title: r.title, body: r.body || "", dealId: r.deal_id || "", date: r.date || "", attachments: r.attachments || null }),
  },
};

// ----- cloud 모드: Supabase -----

// 서버에서 한 종류만 불러오기 (삭제된 것 제외)
export async function cloudLoadOne(kind) {
  const def = TABLES[kind];
  const { data, error } = await supabase
    .from(def.table).select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`${def.table} 불러오기 실패: ${error.message}`);
  return (data || []).map(def.toApp);
}

// 서버에서 전체 데이터 불러오기
export async function cloudLoadAll() {
  const out = {};
  for (const kind of Object.keys(TABLES)) {
    out[kind] = await cloudLoadOne(kind);
  }
  return out;
}

// 서버에 한 건 추가
export async function cloudInsert(kind, item) {
  const def = TABLES[kind];
  const { error } = await supabase.from(def.table).insert(def.toRow(item));
  if (error) throw new Error(`저장 실패: ${error.message}`);
}

// 서버의 한 건 수정 (예: 딜 단계 이동)
export async function cloudUpdate(kind, id, patchApp) {
  const def = TABLES[kind];
  const row = def.toRow({ id, ...patchApp });
  // patch에 없는 필드(undefined)는 보내지 않음
  const patch = {};
  for (const [k, v] of Object.entries(row)) if (v !== undefined) patch[k] = v;
  delete patch.id;
  const { error } = await supabase.from(def.table).update(patch).eq("id", id);
  if (error) throw new Error(`수정 실패: ${error.message}`);
}

// 서버의 한 건 삭제 — 실제로 지우지 않고 deleted_at만 찍음 (실수해도 복구 가능)
export async function cloudDelete(kind, id) {
  const def = TABLES[kind];
  const { error } = await supabase.from(def.table).update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`삭제 실패: ${error.message}`);
}

// 거래처 삭제: 소속 담당자/딜/대화기록도 함께 삭제 표시
export async function cloudDeleteCompanyCascade(companyId) {
  const now = new Date().toISOString();
  for (const table of ["crm_contacts", "crm_deals", "crm_activities"]) {
    const { error } = await supabase.from(table).update({ deleted_at: now }).eq("company_id", companyId);
    if (error) throw new Error(`삭제 실패(${table}): ${error.message}`);
  }
  const { error } = await supabase.from("crm_companies").update({ deleted_at: now }).eq("id", companyId);
  if (error) throw new Error(`삭제 실패: ${error.message}`);
}

// ----- 메일 자동 수집 계정 (설정 화면 전용, 클라우드 모드에서만 사용) -----

export async function mailAccountsList() {
  const { data, error } = await supabase.from("crm_mail_accounts").select("*").order("created_at", { ascending: true });
  if (error) throw new Error(`메일 계정 불러오기 실패: ${error.message}`);
  return data || [];
}

export async function mailAccountSave(acc) {
  const { error } = await supabase.from("crm_mail_accounts").upsert(acc);
  if (error) throw new Error(`메일 계정 저장 실패: ${error.message}`);
}

export async function mailAccountDelete(id) {
  const { error } = await supabase.from("crm_mail_accounts").delete().eq("id", id);
  if (error) throw new Error(`메일 계정 삭제 실패: ${error.message}`);
}

// ----- 견적 (PGC/AgCN 월별 가격 + 거래처별 품목, 클라우드 모드 전용) -----

export async function pgcPricesList() {
  const { data, error } = await supabase.from("crm_pgc_prices").select("*").order("ym", { ascending: false });
  if (error) throw new Error(`PGC 가격 불러오기 실패: ${error.message}`);
  return data || [];
}

export async function pgcPriceSave(row) {
  const { error } = await supabase.from("crm_pgc_prices").upsert(row);
  if (error) throw new Error(`PGC 가격 저장 실패: ${error.message}`);
}

export async function quoteItemsList(companyId) {
  let query = supabase
    .from("crm_quote_items").select("*")
    .is("deleted_at", null)
    .order("sort", { ascending: true });
  if (companyId) query = query.eq("company_id", companyId); // 없으면 전체 품목 (검색용)
  const { data, error } = await query;
  if (error) throw new Error(`견적 품목 불러오기 실패: ${error.message}`);
  return data || [];
}

export async function quoteItemSave(item) {
  const { error } = await supabase.from("crm_quote_items").upsert(item);
  if (error) throw new Error(`견적 품목 저장 실패: ${error.message}`);
}

export async function quoteItemDelete(id) {
  const { error } = await supabase.from("crm_quote_items").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`견적 품목 삭제 실패: ${error.message}`);
}

// ----- 견적 발행 이력 (재다운로드용 스냅샷 포함) -----

export async function quoteIssuesList(limit = 30) {
  const { data, error } = await supabase
    .from("crm_quote_issues").select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`발행 이력 불러오기 실패: ${error.message}`);
  return data || [];
}

export async function quoteIssueSave(row) {
  const { error } = await supabase.from("crm_quote_issues").insert(row);
  if (error) throw new Error(`발행 이력 저장 실패: ${error.message}`);
}

// ----- 일별 금시세 (신한은행 + PGC·청화은 수동 입력) -----

export async function goldPricesList(limit = 120) {
  const { data, error } = await supabase
    .from("crm_gold_prices").select("*")
    .order("date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`금시세 불러오기 실패: ${error.message}`);
  return data || [];
}

// 붙여넣기 일괄 저장 — 같은 날짜는 시세만 갱신하고 PGC·청화은 입력값은 보존
// (rows에 pgc/agcn 키가 없으므로 upsert가 해당 컬럼을 건드리지 않도록 개별 병합)
export async function goldPricesUpsert(rows) {
  const { error } = await supabase.from("crm_gold_prices").upsert(rows, { onConflict: "date" });
  if (error) throw new Error(`금시세 저장 실패: ${error.message}`);
}

export async function goldPriceSave(row) {
  const { error } = await supabase.from("crm_gold_prices").upsert(row, { onConflict: "date" });
  if (error) throw new Error(`금시세 저장 실패: ${error.message}`);
}

export async function goldPriceDelete(date) {
  const { error } = await supabase.from("crm_gold_prices").delete().eq("date", date);
  if (error) throw new Error(`금시세 삭제 실패: ${error.message}`);
}

// ----- local 모드: 브라우저 localStorage -----

const LOCAL_KEYS = {
  companies: "oro_companies",
  contacts: "oro_contacts",
  deals: "oro_deals",
  activities: "oro_activities",
};

export function localLoad(kind, fallback) {
  try {
    const raw = localStorage.getItem(LOCAL_KEYS[kind]);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

export function localSave(kind, value) {
  try {
    localStorage.setItem(LOCAL_KEYS[kind], JSON.stringify(value));
  } catch (e) {
    console.error("저장 실패:", e);
  }
}

// ----- 모드 기억 (마지막에 선택한 모드를 브라우저에 저장) -----

export function getSavedMode() {
  return localStorage.getItem("oro_crm_mode") || "cloud";
}

export function saveMode(mode) {
  localStorage.setItem("oro_crm_mode", mode);
}
