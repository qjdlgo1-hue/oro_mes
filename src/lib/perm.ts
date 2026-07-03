import { useEffect, useState } from "react";
import { supabase, hasSupabase } from "./supabase";

export const MENUS: { key: string; label: string }[] = [
  { key: "menu.pop", label: "POP" },
  { key: "menu.import", label: "주문 가져오기" },
  { key: "menu.plan", label: "생산계획" },
  { key: "menu.coc", label: "COC 발행" },
  { key: "menu.delivery", label: "배송 스케줄" },
  { key: "menu.prodin", label: "생산 가져오기" },
  { key: "menu.sales", label: "판매 가져오기" },
  { key: "menu.dash", label: "대시보드" },
  { key: "menu.report", label: "리포트" },
  { key: "menu.audit", label: "기록" },
  { key: "menu.receipt", label: "증빙(영수증)" },
  { key: "menu.bom", label: "원재료(BOM)" },
];

export const CAPS: { key: string; label: string }[] = [
  { key: "order.import", label: "주문 가져오기/동기화" },
  { key: "order.edit", label: "주문 수정" },
  { key: "order.delete", label: "주문 삭제" },
  { key: "plan.edit", label: "생산계획 편집" },
  { key: "coc.issue", label: "COC 발행/설정" },
  { key: "report.view", label: "리포트 보기" },
  { key: "audit.view", label: "기록 보기" },
  { key: "receipt.edit", label: "증빙 입력/삭제" },
  { key: "bom.edit", label: "원재료(BOM) 수정" },
];

let _role = "user";
let _caps: Record<string, boolean> = {};
let _loaded = false;
let subs: (() => void)[] = [];
const emit = () => subs.forEach(f => f());

export async function loadPerms(): Promise<void> {
  if (!hasSupabase || !supabase) {
    _role = "master"; _caps = Object.fromEntries(CAPS.map(c => [c.key, true])); _loaded = true; emit(); return;
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { _role = "user"; _caps = {}; _loaded = true; emit(); return; }
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  _role = (prof as any)?.role || "user";
  if (_role === "master") _caps = Object.fromEntries(CAPS.map(c => [c.key, true]));
  else {
    const { data } = await supabase.from("role_permissions").select("capability,allowed").eq("role", _role);
    _caps = {}; (data || []).forEach((r: any) => { _caps[r.capability] = r.allowed; });
  }
  _loaded = true; emit();
}
export function can(cap: string) { return _role === "master" || !!_caps[cap]; }
export function myRole() { return _role; }
export function useCaps() {
  const [, setN] = useState(0);
  useEffect(() => { const f = () => setN(n => n + 1); subs.push(f); return () => { subs = subs.filter(x => x !== f); }; }, []);
  return { can, role: _role, loaded: _loaded };
}

// ---- 관리자 작업 ----
export async function listProfiles() {
  const { data, error } = await supabase!.from("profiles").select("id,email,role").order("role");
  if (error) throw error; return data || [];
}
export async function setRole(id: string, role: string) {
  const { error } = await supabase!.from("profiles").update({ role }).eq("id", id); if (error) throw error;
}
export async function getMatrix() {
  const { data, error } = await supabase!.from("role_permissions").select("role,capability,allowed");
  if (error) throw error; return data || [];
}
export async function setPermission(role: string, capability: string, allowed: boolean) {
  const { error } = await supabase!.from("role_permissions").upsert({ role, capability, allowed }); if (error) throw error;
}
async function invoke(body: any) {
  const { data, error } = await supabase!.functions.invoke("manage-users", { body });
  if (error) {
    let msg = error.message;
    try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error; } catch { /* */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
export async function adminCreateUser(email: string, password: string, role: string) { return invoke({ action: "create", email, password, role }); }
export async function adminResetPassword(userId: string, password: string) { return invoke({ action: "reset", userId, password }); }
