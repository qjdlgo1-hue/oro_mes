import { Order, PlanEntry, CocData } from "./types";
import { supabase, hasSupabase } from "./supabase";

// ---------- localStorage backend ----------
const LS = {
  orders: "oro_orders",
  plans: "oro_plans",
  cocs: "oro_cocs",
  inout_in: "oro_inout_in",
  inout_out: "oro_inout_out",
};
function lsGet<T>(k: string, def: T): T {
  try { return JSON.parse(localStorage.getItem(k) || "") as T; } catch { return def; }
}
function lsSet(k: string, v: unknown) { localStorage.setItem(k, JSON.stringify(v)); }

// ---------- public API (auto-selects backend) ----------
export const backendName = hasSupabase ? "Supabase(클라우드)" : "로컬(브라우저)";

export async function listOrders(): Promise<Order[]> {
  if (supabase) {
    const { data, error } = await supabase.from("orders").select("*").order("order_date");
    if (error) throw error;
    return (data || []) as Order[];
  }
  return lsGet<Order[]>(LS.orders, []);
}

export async function replaceMonth(ym: string, orders: Order[]): Promise<void> {
  if (supabase) {
    await supabase.from("orders").delete().eq("ym", ym);
    if (orders.length) {
      const { error } = await supabase.from("orders").insert(orders);
      if (error) throw error;
    }
    return;
  }
  const all = lsGet<Order[]>(LS.orders, []).filter(o => o.ym !== ym);
  lsSet(LS.orders, [...all, ...orders]);
}

export async function listPlans(): Promise<Record<string, PlanEntry>> {
  if (supabase) {
    const { data, error } = await supabase.from("plans").select("*");
    if (error) throw error;
    const m: Record<string, PlanEntry> = {};
    (data || []).forEach((p: any) => { m[p.order_id] = p; });
    return m;
  }
  return lsGet<Record<string, PlanEntry>>(LS.plans, {});
}

export async function upsertPlan(p: PlanEntry): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from("plans").upsert(p, { onConflict: "order_id" });
    if (error) throw error;
    return;
  }
  const m = lsGet<Record<string, PlanEntry>>(LS.plans, {});
  m[p.order_id] = p; lsSet(LS.plans, m);
}

export async function listCocs(): Promise<Record<string, CocData>> {
  if (supabase) {
    const { data, error } = await supabase.from("cocs").select("*");
    if (error) throw error;
    const m: Record<string, CocData> = {};
    (data || []).forEach((c: any) => { m[c.order_id] = c; });
    return m;
  }
  return lsGet<Record<string, CocData>>(LS.cocs, {});
}

export async function upsertCoc(c: CocData): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from("cocs").upsert(c, { onConflict: "order_id" });
    if (error) throw error;
    return;
  }
  const m = lsGet<Record<string, CocData>>(LS.cocs, {});
  m[c.order_id] = c; lsSet(LS.cocs, m);
}

import { Settings } from "./types";

// 중복 판별 키: 일자|품목명|규격|수량|거래처
export function dupKey(o: Order): string {
  return [o.order_date, o.name, o.spec, o.qty, o.customer].join("|");
}

// 기존과 겹치지 않는 주문만 추가
export async function appendOrders(orders: Order[]): Promise<void> {
  if (!orders.length) return;
  if (supabase) {
    const { error } = await supabase.from("orders").insert(orders);
    if (error) throw error;
    return;
  }
  const all = lsGet<Order[]>(LS.orders, []);
  lsSet(LS.orders, [...all, ...orders]);
}

// ===== 생산입고('in') / 판매현황('out') 누적 데이터 =====
export type InoutKind = "in" | "out";
export type InoutRow = {
  id?: string; kind: InoutKind; ym: string; idate: string;
  item_code: string; name: string; spec?: string; qty: number;
  amount?: number | null; customer?: string; trade_type?: string; gubun?: string; cust_code?: string; vat?: number | null; total?: number | null; currency?: string; fx_rate?: number | null; note?: string; sig: string;
};
// 중복 판별 키(같은 행 재붙여넣기 방지)
export function inoutSig(r: Omit<InoutRow, "sig">): string {
  return [r.kind, r.idate, r.item_code, r.name, r.spec || "", r.qty, r.amount ?? "", r.customer || "", r.trade_type || "", r.gubun || ""].join("|");
}
const lsKeyOf = (k: InoutKind) => (k === "in" ? LS.inout_in : LS.inout_out);

export async function listInout(kind: InoutKind): Promise<InoutRow[]> {
  if (supabase) {
    const { data, error } = await supabase.from("inout_rows").select("*").eq("kind", kind).order("idate");
    if (error) throw error;
    return (data || []) as InoutRow[];
  }
  return lsGet<InoutRow[]>(lsKeyOf(kind), []);
}

// 신규(중복 아님)만 누적 추가
export async function appendInout(rows: InoutRow[]): Promise<void> {
  if (!rows.length) return;
  if (supabase) {
    const { error } = await supabase.from("inout_rows").upsert(rows, { onConflict: "kind,sig", ignoreDuplicates: true });
    if (error) throw error;
    return;
  }
  const k = rows[0].kind;
  const all = lsGet<InoutRow[]>(lsKeyOf(k), []);
  const seen = new Set(all.map(r => r.sig));
  lsSet(lsKeyOf(k), [...all, ...rows.filter(r => !seen.has(r.sig))]);
}

export async function deleteInoutMonth(kind: InoutKind, ym: string): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from("inout_rows").delete().eq("kind", kind).eq("ym", ym);
    if (error) throw error;
    return;
  }
  const all = lsGet<InoutRow[]>(lsKeyOf(kind), []).filter(r => r.ym !== ym);
  lsSet(lsKeyOf(kind), all);
}

const LS_SETTINGS = "oro_settings";
export async function getSettings(): Promise<Settings> {
  if (supabase) {
    const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw error;
    return (data || {}) as Settings;
  }
  return lsGet<Settings>(LS_SETTINGS, {});
}
export async function saveSettings(s: Settings): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from("app_settings").upsert({ id: 1, ...s }, { onConflict: "id" });
    if (error) throw error;
    return;
  }
  lsSet(LS_SETTINGS, s);
}

// ---- 주문 수정/삭제 ----
export async function updateOrder(id: string, patch: Partial<Order>): Promise<void> {
  if (supabase) { const { error } = await supabase.from("orders").update(patch).eq("id", id); if (error) throw error; return; }
  const all = lsGet<Order[]>(LS.orders, []); const i = all.findIndex(o => o.id === id);
  if (i >= 0) { all[i] = { ...all[i], ...patch }; lsSet(LS.orders, all); }
}
export async function deleteOrder(id: string): Promise<void> {
  if (supabase) { const { error } = await supabase.from("orders").delete().eq("id", id); if (error) throw error; return; }
  lsSet(LS.orders, lsGet<Order[]>(LS.orders, []).filter(o => o.id !== id));
  const pl = lsGet<Record<string, any>>(LS.plans, {}); delete pl[id]; lsSet(LS.plans, pl);
  const cc = lsGet<Record<string, any>>(LS.cocs, {}); delete cc[id]; lsSet(LS.cocs, cc);
}

// ---- 역할 ----
export async function getMyRole(): Promise<string> {
  if (!supabase) return "admin";
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id; if (!uid) return "user";
  const { data } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
  return (data as any)?.role || "user";
}

// ---- 감사 로그 ----
export async function logAudit(action: string, entity: string, entity_id: string, detail?: any): Promise<void> {
  if (!supabase) return;
  try {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("audit_log").insert({ user_email: u.user?.email, action, entity, entity_id, detail });
  } catch { /* best-effort */ }
}
export async function listAudit(limit = 200): Promise<any[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(limit);
  if (error) throw error; return data || [];
}

import { Receipt } from "./types";
const LS_RCPT = "oro_receipts";
export async function listReceipts(): Promise<Receipt[]> {
  if (supabase) {
    const { data, error } = await supabase.from("receipts").select("*").order("rdate", { ascending: false });
    if (error) throw error; return (data || []) as Receipt[];
  }
  return lsGet<Receipt[]>(LS_RCPT, []);
}
export async function addReceipt(r: Receipt, file?: File): Promise<void> {
  // DB 컬럼이 아닌 필드 제거(file, 빈 id 등)
  const { file: _drop, id: _id, ...clean } = r as any;
  if (supabase) {
    let image_path = (clean.image_path as string | null) || null;
    if (file) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${(crypto as any).randomUUID?.() || Date.now()}.${ext}`;
      const { error: ue } = await supabase.storage.from("receipts").upload(path, file, { contentType: file.type || "image/jpeg" });
      if (ue) throw ue;
      image_path = path;
    }
    const { data: u } = await supabase.auth.getUser();
    const image_paths = image_path ? [image_path] : (clean.image_paths || null);
    const { error } = await supabase.from("receipts").insert({ ...clean, image_path, image_paths, created_by: u.user?.email });
    if (error) throw error; return;
  }
  const all = lsGet<Receipt[]>(LS_RCPT, []); all.unshift({ ...clean, id: (crypto as any).randomUUID?.() || String(Date.now()) }); lsSet(LS_RCPT, all);
}
export async function deleteReceipt(id: string, paths?: (string | null)[] | null): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from("receipts").delete().eq("id", id); if (error) throw error;
    const ps = (paths || []).filter(Boolean) as string[];
    if (ps.length) { await supabase.storage.from("receipts").remove(ps); }
    return;
  }
  lsSet(LS_RCPT, lsGet<Receipt[]>(LS_RCPT, []).filter(r => r.id !== id));
}
export async function setReceiptImages(id: string, paths: string[]): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("receipts").update({ image_paths: paths, image_path: paths[0] || null }).eq("id", id);
  if (error) throw error;
}
export async function receiptSignedUrl(path: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 600);
  if (error) throw error; return data?.signedUrl || null;
}
export async function receiptImageBlob(path: string): Promise<Blob | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from("receipts").download(path);
  if (error) throw error; return data;
}
export async function readReceiptAI(imageBase64: string, mediaType: string): Promise<any> {
  if (!supabase) throw new Error("AI 인식은 클라우드 연결에서만 됩니다.");
  const { data, error } = await supabase.functions.invoke("read-receipt", { body: { imageBase64, mediaType } });
  if (error) {
    let msg = error.message;
    try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error; } catch { /* */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data.rec;
}

// ---- 범용 Storage ----
export async function storageUpload(bucket: string, file: File): Promise<string> {
  if (!supabase) throw new Error("클라우드 연결이 필요합니다.");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${(crypto as any).randomUUID?.() || Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type || "image/jpeg" });
  if (error) throw error; return path;
}
export async function storageBlob(bucket: string, path: string): Promise<Blob | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw error; return data;
}
export async function storageBlobToDataUrl(bucket: string, path: string): Promise<string | null> {
  const b = await storageBlob(bucket, path); if (!b) return null;
  return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(b); });
}

// ---- 원재료(BOM) ----
export type BomMap = Record<string, { agcn: number; pgc: number; note?: string }>;
const LS_BOM = "oro_bom";
export async function listBom(): Promise<BomMap> {
  if (supabase) {
    const { data, error } = await supabase.from("bom").select("*"); if (error) throw error;
    const m: BomMap = {}; (data || []).forEach((b: any) => { m[b.product] = { agcn: Number(b.agcn) || 0, pgc: Number(b.pgc) || 0, note: b.note || "" }; }); return m;
  }
  return lsGet<BomMap>(LS_BOM, {});
}
export async function upsertBom(product: string, patch: { agcn?: number; pgc?: number; note?: string }): Promise<void> {
  if (supabase) { const { error } = await supabase.from("bom").upsert({ product, ...patch, updated_at: new Date().toISOString() }, { onConflict: "product" }); if (error) throw error; return; }
  const m = lsGet<BomMap>(LS_BOM, {}); const prev = m[product] || { agcn: 0, pgc: 0 }; m[product] = { ...prev, ...patch } as any; lsSet(LS_BOM, m);
}

// ---- 메뉴 표시 순서 ----
export async function getMenuOrder(): Promise<string[]> {
  if (supabase) { const { data, error } = await supabase.from("app_settings").select("menu_order").eq("id", 1).maybeSingle(); if (error) throw error; return ((data as any)?.menu_order as string[]) || []; }
  try { return JSON.parse(localStorage.getItem("oro_menu_order") || "[]"); } catch { return []; }
}
export async function setMenuOrder(arr: string[]): Promise<void> {
  if (supabase) { const { error } = await supabase.from("app_settings").upsert({ id: 1, menu_order: arr }, { onConflict: "id" }); if (error) throw error; return; }
  localStorage.setItem("oro_menu_order", JSON.stringify(arr));
}

// ---- 메뉴 그룹/배치 ----
export type MenuGroupRow = { id: string; name: string; sort: number };
export type MenuPlacement = Record<string, { group_id: string | null; sort: number }>;
export async function getMenuConfig(): Promise<{ groups: MenuGroupRow[]; placement: MenuPlacement }> {
  if (!supabase) return { groups: [], placement: {} };
  const [{ data: gs, error: ge }, { data: ps, error: pe }] = await Promise.all([
    supabase.from("menu_groups").select("*").order("sort"),
    supabase.from("menu_placement").select("*"),
  ]);
  if (ge) throw ge; if (pe) throw pe;
  const placement: MenuPlacement = {};
  (ps || []).forEach((p: any) => { placement[p.item_key] = { group_id: p.group_id, sort: p.sort }; });
  return { groups: (gs || []) as MenuGroupRow[], placement };
}
export async function saveMenuConfig(groups: MenuGroupRow[], placements: { item_key: string; group_id: string | null; sort: number }[]): Promise<void> {
  if (!supabase) return;
  if (groups.length) { const { error } = await supabase.from("menu_groups").upsert(groups); if (error) throw error; }
  if (placements.length) { const { error } = await supabase.from("menu_placement").upsert(placements, { onConflict: "item_key" }); if (error) throw error; }
}
export async function deleteMenuGroup(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("menu_groups").delete().eq("id", id); if (error) throw error;
  const { error: pe } = await supabase.from("menu_placement").update({ group_id: null }).eq("group_id", id); if (pe) throw pe;
}


// ===== 지원사업 과제 / 검수조서 =====
export type Project = { id?: string; name: string; announce?: string; company?: string; vendor?: string; period_from?: string; period_to?: string; note?: string; created_at?: string };
export type InspItem = { name?: string; spec?: string; unit?: string; qty?: number; price?: number; amount?: number; note?: string };
export type Photo = { path: string; caption?: string };
export type Inspection = { id?: string; project_id: string; insp_no?: string; deliver_place?: string; vendor?: string; inspect_date?: string; inspector?: string; sign_path?: string; items?: InspItem[]; photos?: Photo[]; created_at?: string };

export async function listProjects(): Promise<Project[]> {
  if (supabase) { const { data, error } = await supabase.from("projects").select("*").order("created_at"); if (error) throw error; return (data || []) as Project[]; }
  return lsGet<Project[]>("oro_projects", []);
}
export async function upsertProject(p: Project): Promise<Project> {
  if (supabase) { const { data, error } = await supabase.from("projects").upsert(p).select().single(); if (error) throw error; return data as Project; }
  const all = lsGet<Project[]>("oro_projects", []); const id = p.id || ("p-" + Date.now()); const np = { ...p, id };
  const i = all.findIndex(x => x.id === id); if (i >= 0) all[i] = np; else all.push(np); lsSet("oro_projects", all); return np;
}
export async function deleteProject(id: string): Promise<void> {
  if (supabase) { const { error } = await supabase.from("projects").delete().eq("id", id); if (error) throw error; return; }
  lsSet("oro_projects", lsGet<Project[]>("oro_projects", []).filter(x => x.id !== id));
  lsSet("oro_inspections", lsGet<Inspection[]>("oro_inspections", []).filter(x => x.project_id !== id));
}
export async function listInspections(): Promise<Inspection[]> {
  if (supabase) { const { data, error } = await supabase.from("inspections").select("*").order("created_at", { ascending: false }); if (error) throw error; return (data || []) as Inspection[]; }
  return lsGet<Inspection[]>("oro_inspections", []);
}
export async function upsertInspection(i: Inspection): Promise<Inspection> {
  if (supabase) { const { data, error } = await supabase.from("inspections").upsert(i).select().single(); if (error) throw error; return data as Inspection; }
  const all = lsGet<Inspection[]>("oro_inspections", []); const id = i.id || ("i-" + Date.now()); const ni = { ...i, id };
  const k = all.findIndex(x => x.id === id); if (k >= 0) all[k] = ni; else all.unshift(ni); lsSet("oro_inspections", all); return ni;
}
export async function deleteInspection(id: string): Promise<void> {
  if (supabase) { const { error } = await supabase.from("inspections").delete().eq("id", id); if (error) throw error; return; }
  lsSet("oro_inspections", lsGet<Inspection[]>("oro_inspections", []).filter(x => x.id !== id));
}


// ===== 생산·소모 (생산입고/소모현황) =====
export type ProdConsume = { id?: string; ym: string; idate?: string | null; prod_code: string; prod_name: string; mat_code?: string; mat_name?: string; prod_qty?: number; std_qty?: number; act_qty?: number; mat_price?: number; diff?: number; amount?: number; sig: string; created_at?: string };
export function pcSig(r: Omit<ProdConsume, "sig" | "id">): string {
  return [r.idate ?? "", r.prod_code, r.mat_code || "", r.prod_qty ?? "", r.std_qty ?? "", r.act_qty ?? "", r.amount ?? ""].join("|");
}
export async function listProdConsume(): Promise<ProdConsume[]> {
  if (supabase) {
    const all: ProdConsume[] = []; const size = 1000;
    for (let from = 0; ; from += size) {
      const { data, error } = await supabase.from("prod_consume").select("*").order("idate").range(from, from + size - 1);
      if (error) throw error;
      const batch = (data || []) as ProdConsume[];
      all.push(...batch);
      if (batch.length < size) break;
    }
    return all;
  }
  return lsGet<ProdConsume[]>("oro_prodconsume", []);
}
export async function appendProdConsume(rows: ProdConsume[]): Promise<void> {
  if (!rows.length) return;
  if (supabase) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from("prod_consume").upsert(rows.slice(i, i + 500), { onConflict: "sig", ignoreDuplicates: true });
      if (error) throw error;
    }
    return;
  }
  const all = lsGet<ProdConsume[]>("oro_prodconsume", []); const seen = new Set(all.map(r => r.sig)); lsSet("oro_prodconsume", [...all, ...rows.filter(r => !seen.has(r.sig))]);
}
export async function clearProdConsume(): Promise<void> {
  if (supabase) { const { error } = await supabase.from("prod_consume").delete().neq("id", "00000000-0000-0000-0000-000000000000"); if (error) throw error; return; }
  lsSet("oro_prodconsume", []);
}
