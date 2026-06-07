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
