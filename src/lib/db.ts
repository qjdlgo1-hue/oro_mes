import { Order, PlanEntry, CocData } from "./types";
import { supabase, hasSupabase } from "./supabase";

// ---------- localStorage backend ----------
const LS = {
  orders: "oro_orders",
  plans: "oro_plans",
  cocs: "oro_cocs",
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
export async function addReceipt(r: Receipt): Promise<void> {
  if (supabase) {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("receipts").insert({ ...r, created_by: u.user?.email });
    if (error) throw error; return;
  }
  const all = lsGet<Receipt[]>(LS_RCPT, []); all.unshift({ ...r, id: (crypto as any).randomUUID?.() || String(Date.now()) }); lsSet(LS_RCPT, all);
}
export async function deleteReceipt(id: string): Promise<void> {
  if (supabase) { const { error } = await supabase.from("receipts").delete().eq("id", id); if (error) throw error; return; }
  lsSet(LS_RCPT, lsGet<Receipt[]>(LS_RCPT, []).filter(r => r.id !== id));
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
