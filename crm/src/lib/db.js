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
    toRow: (d) => ({ id: d.id, company_id: d.companyId, title: d.title, spec: d.spec, stage: d.stage, value: d.value }),
    toApp: (r) => ({ id: r.id, companyId: r.company_id, title: r.title, spec: r.spec || "", stage: r.stage || "inquiry", value: r.value || "" }),
  },
  activities: {
    table: "crm_activities",
    toRow: (a) => ({ id: a.id, company_id: a.companyId, channel: a.channel, direction: a.direction, person: a.person, title: a.title, body: a.body, deal_id: a.dealId || null, date: a.date }),
    toApp: (r) => ({ id: r.id, companyId: r.company_id, channel: r.channel || "memo", direction: r.direction || "received", person: r.person || "", title: r.title, body: r.body || "", dealId: r.deal_id || "", date: r.date || "" }),
  },
};

// ----- cloud 모드: Supabase -----

// 서버에서 전체 데이터 불러오기
export async function cloudLoadAll() {
  const out = {};
  for (const [kind, def] of Object.entries(TABLES)) {
    const { data, error } = await supabase.from(def.table).select("*").order("created_at", { ascending: true });
    if (error) throw new Error(`${def.table} 불러오기 실패: ${error.message}`);
    out[kind] = (data || []).map(def.toApp);
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
