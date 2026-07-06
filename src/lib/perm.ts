import { useEffect, useState } from "react";
import { supabase, hasSupabase } from "./supabase";

export const MENUS: { key: string; label: string }[] = [
  { key: "menu.pop", label: "POP" },
  { key: "menu.import", label: "주문 가져오기" },
  { key: "menu.plan", label: "생산계획" },
  { key: "menu.coc", label: "COC 발행" },
  { key: "menu.delivery", label: "배송 스케줄" },
  { key: "menu.support", label: "지원사업(검수조서)" },
  { key: "menu.prodin", label: "생산 가져오기" },
  { key: "menu.sales", label: "판매 가져오기" },
  { key: "menu.dash", label: "대시보드" },
  { key: "menu.prodcon", label: "생산·소모 분석" },
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
  { key: "support.edit", label: "검수조서 작성/과제관리" },
  { key: "report.view", label: "리포트 보기" },
  { key: "audit.view", label: "기록 보기" },
  { key: "receipt.edit", label: "증빙 입력/삭제" },
  { key: "bom.edit", label: "원재료(BOM) 수정" },
];

// 화면별 통합 권한표: view=보기 키(복수면 스위치 하나로 동시 토글), acts=그 화면의 작업, shared=다른 화면과 공유되는 권한 표기
export type ScreenAct = { k: string; label: string; shared?: string };
export type ScreenPerm = { name: string; group: string; view: string[]; acts: ScreenAct[] };
export const SCREEN_PERMS: ScreenPerm[] = [
  { name: "POP", group: "🏭 현장", view: ["menu.pop"], acts: [{ k: "plan.edit", label: "완료 처리", shared: "생산계획 편집" }] },
  { name: "생산계획", group: "🏭 현장", view: ["menu.plan"], acts: [{ k: "plan.edit", label: "편집" }] },
  { name: "배송 스케줄", group: "🏭 현장", view: ["menu.delivery"], acts: [{ k: "plan.edit", label: "배송일 변경", shared: "생산계획 편집" }] },
  { name: "COC 발행", group: "🏭 현장", view: ["menu.coc"], acts: [{ k: "coc.issue", label: "발행·설정" }] },
  { name: "원재료(BOM)", group: "🏭 현장", view: ["menu.bom"], acts: [{ k: "bom.edit", label: "수정" }] },
  { name: "주문 가져오기", group: "📥 데이터", view: ["menu.import"], acts: [{ k: "order.import", label: "가져오기" }, { k: "order.edit", label: "수정" }, { k: "order.delete", label: "삭제" }] },
  { name: "생산 가져오기", group: "📥 데이터", view: ["menu.prodin"], acts: [{ k: "order.import", label: "가져오기", shared: "주문 가져오기" }] },
  { name: "판매 가져오기", group: "📥 데이터", view: ["menu.sales"], acts: [{ k: "order.import", label: "가져오기", shared: "주문 가져오기" }] },
  { name: "생산·소모", group: "📥 데이터", view: ["menu.prodcon"], acts: [{ k: "order.import", label: "가져오기", shared: "주문 가져오기" }] },
  { name: "대시보드", group: "📊 분석", view: ["menu.dash"], acts: [] },
  { name: "리포트", group: "📊 분석", view: ["menu.report", "report.view"], acts: [] },
  { name: "증빙(영수증)", group: "📁 관리", view: ["menu.receipt"], acts: [{ k: "receipt.edit", label: "입력·삭제" }] },
  { name: "지원사업", group: "📁 관리", view: ["menu.support"], acts: [{ k: "support.edit", label: "작성·과제관리" }] },
  { name: "기록(감사)", group: "📁 관리", view: ["menu.audit", "audit.view"], acts: [] },
];
export const SCREEN_PERM_KEYS: string[] = [...new Set(SCREEN_PERMS.flatMap(s => [...s.view, ...s.acts.map(a => a.k)]))];

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
