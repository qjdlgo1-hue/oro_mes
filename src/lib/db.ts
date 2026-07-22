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
  try {
    const raw = localStorage.getItem(k);
    if (raw == null) return def; // 키 없음 — 파싱 시도 없이 기본값
    return JSON.parse(raw) as T;
  } catch { return def; }
}
function lsSet(k: string, v: unknown) {
  // 용량 초과(QuotaExceededError) 등으로 실패해도 앱이 죽지 않게 — 로컬 폴백 저장은 best-effort
  try { localStorage.setItem(k, JSON.stringify(v)); }
  catch (e) { console.warn("localStorage 저장 실패:", k, e); }
}

// ---------- public API (auto-selects backend) ----------
export const backendName = hasSupabase ? "Supabase(클라우드)" : "로컬(브라우저)";

export async function listOrders(): Promise<Order[]> {
  if (supabase) {
    const { data, error } = await supabase.from("orders").select("*").is("deleted_at", null).order("order_date");
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

// ===== 생산입고('in') / 판매현황('out') / 구매입고('purchase') 누적 데이터 =====
export type InoutKind = "in" | "out" | "purchase";
export type InoutRow = {
  id?: string; kind: InoutKind; ym: string; idate: string;
  item_code: string; name: string; spec?: string; qty: number;
  amount?: number | null; customer?: string; trade_type?: string; gubun?: string; cust_code?: string; vat?: number | null; total?: number | null; currency?: string; fx_rate?: number | null; note?: string; sig: string;
};
// 중복 판별 키(같은 행 재붙여넣기 방지)
export function inoutSig(r: Omit<InoutRow, "sig">): string {
  return [r.kind, r.idate, r.item_code, r.name, r.spec || "", r.qty, r.amount ?? "", r.customer || "", r.trade_type || "", r.gubun || ""].join("|");
}
const lsKeyOf = (k: InoutKind) => (k === "in" ? LS.inout_in : k === "purchase" ? "oro_inout_purchase" : LS.inout_out);

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

// ===== 품목 마스터 (items) =====
// 이카운트 품목등록 대응 — 코드/명/규격/구분/단위. 자동 수집·붙여넣기 가져오기·수동 등록.
export type Item = {
  id?: string; code: string; name: string; spec: string;
  gubun: string;   // 제품/반제품/원재료/부재료/상품/무형상품
  unit: string; note?: string; active: boolean; created_at?: string;
};
const LS_ITEMS = "oro_items";
export async function listItems(): Promise<Item[]> {
  if (supabase) {
    const { data, error } = await supabase.from("items").select("*").order("code");
    if (error) throw error;
    return (data || []) as Item[];
  }
  return lsGet<Item[]>(LS_ITEMS, []);
}
export async function upsertItems(rows: Item[]): Promise<void> {
  if (!rows.length) return;
  if (supabase) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from("items").upsert(rows.slice(i, i + 500), { onConflict: "code,name" });
      if (error) throw error;
    }
    return;
  }
  const all = lsGet<Item[]>(LS_ITEMS, []);
  const key = (r: Item) => `${r.code}|${r.name}`;
  const m = new Map(all.map(r => [key(r), r]));
  rows.forEach(r => m.set(key(r), { ...m.get(key(r)), ...r, id: m.get(key(r))?.id || "it-" + Date.now() + Math.random().toString(36).slice(2) }));
  lsSet(LS_ITEMS, [...m.values()]);
}
export async function updateItem(id: string, patch: Partial<Item>): Promise<void> {
  if (supabase) { const { error } = await supabase.from("items").update(patch).eq("id", id); if (error) throw error; return; }
  lsSet(LS_ITEMS, lsGet<Item[]>(LS_ITEMS, []).map(r => r.id === id ? { ...r, ...patch } : r));
}
export async function deleteItem(id: string): Promise<void> {
  if (supabase) { const { error } = await supabase.from("items").delete().eq("id", id); if (error) throw error; return; }
  lsSet(LS_ITEMS, lsGet<Item[]>(LS_ITEMS, []).filter(r => r.id !== id));
}

// ===== 재고: 기초재고('base') / 실사 조정('adj') / 안전재고('min') =====
// base = 기준일(bdate) 시작 시점 잔량을 qty로 설정 — 그 이전 입출고는 무시 (재실사 시 새 base 추가)
// adj  = ±증감(실사 차이 보정 등), note에 사유
// min  = 안전재고(발주점) 하한선 — 잔량 계산에는 안 들어가고 경고 기준으로만 사용 (품목별 최신 bdate 값)
export type StockBase = {
  id?: string; kind: "base" | "adj" | "min"; cat: "product" | "material";
  item_code: string; name: string; spec?: string;
  bdate: string; qty: number; note?: string; created_at?: string;
};
const LS_STOCK_BASE = "oro_stock_base";
export async function listStockBase(): Promise<StockBase[]> {
  if (supabase) {
    const { data, error } = await supabase.from("stock_base").select("*").order("bdate");
    if (error) throw error;
    return (data || []) as StockBase[];
  }
  return lsGet<StockBase[]>(LS_STOCK_BASE, []);
}
export async function addStockBase(row: StockBase): Promise<void> {
  if (supabase) { const { error } = await supabase.from("stock_base").insert(row); if (error) throw error; return; }
  const all = lsGet<StockBase[]>(LS_STOCK_BASE, []);
  lsSet(LS_STOCK_BASE, [...all, { ...row, id: row.id || "sb-" + Date.now() + Math.random().toString(36).slice(2) }]);
}
export async function deleteStockBase(id: string): Promise<void> {
  if (supabase) { const { error } = await supabase.from("stock_base").delete().eq("id", id); if (error) throw error; return; }
  lsSet(LS_STOCK_BASE, lsGet<StockBase[]>(LS_STOCK_BASE, []).filter(r => r.id !== id));
}

// ---- 생산 라벨: 거래처별 포장단위(New wt, g) ----
// 라벨 인쇄 매수 자동계산(수량 ÷ 포장단위 올림)에 사용. 여러 PC에서 공유되도록 app_settings에 저장.
const LS_LABEL_PACKS = "oro_label_packs";
export async function getLabelPacks(): Promise<Record<string, number>> {
  if (supabase) {
    const { data, error } = await supabase.from("app_settings").select("label_packs").eq("id", 1).maybeSingle();
    if (error) throw error;
    return ((data as any)?.label_packs as Record<string, number>) || {};
  }
  return lsGet<Record<string, number>>(LS_LABEL_PACKS, {});
}
export async function saveLabelPacks(p: Record<string, number>): Promise<void> {
  if (supabase) { const { error } = await supabase.from("app_settings").upsert({ id: 1, label_packs: p }, { onConflict: "id" }); if (error) throw error; return; }
  lsSet(LS_LABEL_PACKS, p);
}

// ---- 주문 수정/삭제 ----
export async function updateOrder(id: string, patch: Partial<Order>): Promise<void> {
  if (supabase) { const { error } = await supabase.from("orders").update(patch).eq("id", id); if (error) throw error; return; }
  const all = lsGet<Order[]>(LS.orders, []); const i = all.findIndex(o => o.id === id);
  if (i >= 0) { all[i] = { ...all[i], ...patch }; lsSet(LS.orders, all); }
}
// 소프트 삭제: 휴지통(관리자)에서 복구/영구삭제 가능. 로컬 모드는 즉시 삭제.
export async function deleteOrder(id: string): Promise<void> {
  if (supabase) { const { error } = await supabase.from("orders").update({ deleted_at: new Date().toISOString() }).eq("id", id); if (error) throw error; return; }
  lsSet(LS.orders, lsGet<Order[]>(LS.orders, []).filter(o => o.id !== id));
  const pl = lsGet<Record<string, any>>(LS.plans, {}); delete pl[id]; lsSet(LS.plans, pl);
  const cc = lsGet<Record<string, any>>(LS.cocs, {}); delete cc[id]; lsSet(LS.cocs, cc);
}

// ---- 휴지통 ----
export async function listTrash(): Promise<{ orders: Order[]; receipts: Receipt[] }> {
  if (!supabase) return { orders: [], receipts: [] };
  const [{ data: os, error: oe }, { data: rs, error: re }] = await Promise.all([
    supabase.from("orders").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
    supabase.from("receipts").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
  ]);
  if (oe) throw oe; if (re) throw re;
  return { orders: (os || []) as Order[], receipts: (rs || []) as Receipt[] };
}
export async function restoreOrder(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("orders").update({ deleted_at: null }).eq("id", id); if (error) throw error;
}
export async function restoreReceipt(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("receipts").update({ deleted_at: null }).eq("id", id); if (error) throw error;
}
export async function purgeOrder(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("orders").delete().eq("id", id); if (error) throw error; // plans/cocs cascade
}
export async function purgeReceipt(id: string, paths?: (string | null)[] | null): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("receipts").delete().eq("id", id); if (error) throw error;
  const ps = (paths || []).filter(Boolean) as string[];
  if (ps.length) { await supabase.storage.from("receipts").remove(ps); }
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
    const { data, error } = await supabase.from("receipts").select("*").is("deleted_at", null).order("rdate", { ascending: false });
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
// 소프트 삭제: 원본 이미지는 휴지통에서 '영구 삭제'할 때까지 보존. 로컬 모드는 즉시 삭제.
export async function deleteReceipt(id: string, _paths?: (string | null)[] | null): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from("receipts").update({ deleted_at: new Date().toISOString() }).eq("id", id); if (error) throw error;
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
// Edge Function 호출 공통 — FunctionsHttpError의 본문 {error}를 언랩해 사람이 읽을 메시지로 throw
export async function invokeFn<T = any>(name: string, body: Record<string, any>, offlineMsg: string): Promise<T> {
  if (!supabase) throw new Error(offlineMsg);
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error; } catch { /* */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function readReceiptAI(imageBase64: string, mediaType: string): Promise<any> {
  const data = await invokeFn<any>("read-receipt", { imageBase64, mediaType }, "AI 인식은 클라우드 연결에서만 됩니다.");
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
// base64 대신 blob URL — 대용량 사진을 문자열로 메모리에 들고 있지 않아 모바일에서 훨씬 가벼움
export async function storageObjectUrl(bucket: string, path: string): Promise<string | null> {
  const b = await storageBlob(bucket, path); if (!b) return null;
  return URL.createObjectURL(b);
}
// 업로드 전 사진 축소(긴 변 maxW, JPEG) — 폰 원본(수 MB)을 그대로 올리지 않게
export async function downscaleImage(file: File, maxW = 1600, quality = 0.85): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    URL.revokeObjectURL(url);
    const sc = Math.min(1, maxW / Math.max(img.width, img.height));
    if (sc >= 1 && file.size < 700 * 1024) return file; // 이미 작으면 그대로
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>(res => c.toBlob(res, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch { return file; }
}

// ---- 원재료(BOM) ----
// ===== BOM 정규화 (bom_rows — 이카운트 BOM(소요량)현황 행 단위) =====
// 완제품 1개 → 원재료 N행. 소모품목이 다른 행의 생산품목이면 반제품(다단계) — 전개는 lib/bom.ts.
export type BomRow = {
  id?: string;
  prod_code: string; prod_name: string;
  process: string;                 // 생산공정명 (시빙/도금)
  version?: string;                // BOM버전 (현재 '기본'만)
  mat_code: string; mat_name: string;
  batch_qty: number;               // 생산수량(기준수량)
  qty: number;                     // 소요량(기준수량당)
  created_at?: string;
};
const LS_BOM_ROWS = "oro_bom_rows";
export async function listBomRows(): Promise<BomRow[]> {
  if (supabase) {
    const { data, error } = await supabase.from("bom_rows").select("*").order("prod_code");
    if (error) throw error;
    return (data || []) as BomRow[];
  }
  return lsGet<BomRow[]>(LS_BOM_ROWS, []);
}
// 가져오기 = 전체 교체 (이카운트가 원본이므로 마스터 성격 — 호출부에서 확인 모달 필수)
export async function replaceBomRows(rows: BomRow[]): Promise<void> {
  if (supabase) {
    const { error: de } = await supabase.from("bom_rows").delete().neq("prod_name", "");
    if (de) throw de;
    // 대량 insert는 500행씩 분할
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from("bom_rows").insert(rows.slice(i, i + 500));
      if (error) throw error;
    }
    return;
  }
  lsSet(LS_BOM_ROWS, rows);
}
export async function upsertBomRow(row: BomRow): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from("bom_rows").upsert(row, { onConflict: "prod_code,prod_name,mat_code,mat_name" });
    if (error) throw error;
    return;
  }
  const all = lsGet<BomRow[]>(LS_BOM_ROWS, []);
  const key = (r: BomRow) => `${r.prod_code}|${r.prod_name}|${r.mat_code}|${r.mat_name}`;
  const i = all.findIndex(r => key(r) === key(row));
  if (i >= 0) all[i] = { ...all[i], ...row }; else all.push({ ...row, id: "br-" + Date.now() + Math.random().toString(36).slice(2) });
  lsSet(LS_BOM_ROWS, all);
}
export async function deleteBomRow(id: string): Promise<void> {
  if (supabase) { const { error } = await supabase.from("bom_rows").delete().eq("id", id); if (error) throw error; return; }
  lsSet(LS_BOM_ROWS, lsGet<BomRow[]>(LS_BOM_ROWS, []).filter(r => r.id !== id));
}

// (구) AgCN/PGC 2열 고정 BOM — bom_rows로 대체됨. 테이블·데이터는 보존하되 화면에서는 사용 안 함.
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

// ===== 경영분석보고서 이력 =====
export type BizReport = {
  id?: string; period_type: string; period_key: string; title: string;
  content_md: string; kpis?: any; ai: boolean; model?: string | null; created_at?: string;
};
const LS_BIZ = "oro_biz_reports";
export async function listBizReports(): Promise<BizReport[]> {
  if (supabase) {
    const { data, error } = await supabase.from("biz_reports").select("id,period_type,period_key,title,ai,model,created_at").order("created_at", { ascending: false }).limit(100);
    if (error) throw error; return (data || []) as BizReport[];
  }
  return lsGet<BizReport[]>(LS_BIZ, []).map(({ content_md: _c, kpis: _k, ...rest }) => rest as BizReport).reverse();
}
export async function getBizReport(id: string): Promise<BizReport | null> {
  if (supabase) {
    const { data, error } = await supabase.from("biz_reports").select("*").eq("id", id).maybeSingle();
    if (error) throw error; return (data as BizReport) || null;
  }
  return lsGet<BizReport[]>(LS_BIZ, []).find(r => r.id === id) || null;
}
export async function saveBizReport(r: BizReport): Promise<BizReport> {
  if (supabase) {
    const { data, error } = await supabase.from("biz_reports").insert(r).select().single();
    if (error) throw error; return data as BizReport;
  }
  const all = lsGet<BizReport[]>(LS_BIZ, []); const nr = { ...r, id: "b-" + Date.now(), created_at: new Date().toISOString() };
  lsSet(LS_BIZ, [...all, nr]); return nr;
}
export async function deleteBizReport(id: string): Promise<void> {
  if (supabase) { const { error } = await supabase.from("biz_reports").delete().eq("id", id); if (error) throw error; return; }
  lsSet(LS_BIZ, lsGet<BizReport[]>(LS_BIZ, []).filter(r => r.id !== id));
}
// AI 보고서 생성 — Edge Function 호출 (키 미설정/실패 시 throw, 호출측에서 규칙 기반 폴백)
export async function aiBizReport(payload: { periodLabel: string; kpis: unknown }): Promise<{ md: string; model: string }> {
  return invokeFn<{ md: string; model: string }>("biz-report", payload, "로컬 모드에서는 AI 분석을 사용할 수 없습니다.");
}

// AI 문장 다듬기 — 서류 칸의 짧은 초안을 공식 문체로 확장 (Edge Function 'grant-write')
export async function aiGrantWrite(payload: { field: string; draft: string; context: Record<string, any> }): Promise<string> {
  const data = await invokeFn<any>("grant-write", payload, "로컬 모드에서는 AI 다듬기를 사용할 수 없습니다.");
  return String(data?.text || "");
}

// 거래명세서/세금계산서 AI 인식 — PDF·이미지에서 품목/금액/거래처 추출 (Edge Function 'grant-doc-read')
export type GrantReadResult = {
  vendor?: string | null; bizno?: string | null; date?: string | null;
  items?: { name?: string | null; spec?: string | null; qty?: number | null; unitPrice?: number | null; amount?: number | null }[] | null;
  supplyTotal?: number | null; vat?: number | null; total?: number | null;
};
export async function aiGrantRead(payload: { fileBase64: string; mediaType: string }): Promise<GrantReadResult> {
  const data = await invokeFn<any>("grant-doc-read", payload, "로컬 모드에서는 거래명세서 AI 인식을 사용할 수 없습니다.");
  return (data?.data || {}) as GrantReadResult;
}

// ===== 지원사업 서류 자동작성 (공고별: cud=창업중심대학, td=기술닥터 상용화지원) =====
export type GrantPhoto = { path: string; name?: string; qty?: string };
export type GrantDoc = {
  id?: string; title: string; expense_item?: string; program?: string; // 'cud' | 'td'
  forms: string[]; data: Record<string, any>; photos: GrantPhoto[]; created_at?: string;
};
export type GrantProfile = {
  company?: string; ceo?: string; bizno?: string; project?: string; projectNo?: string;
  bank?: string; holder?: string; account?: string; manager?: string; address?: string; corpNo?: string;
  budgets?: Record<string, string>; // 지출항목별 예산(원) — 정산 현황의 집행률/잔액 계산용 (cud·td)
  budgetsBy?: Record<string, Record<string, string>>; // 공고별 비목 예산 — cud·td와 비목명이 겹치는 ysc/gsa용 ({ysc:{재료비:..}, gsa:{..}})
  signPath?: string; // 서명(도장) PNG — storage 경로 또는 data: URL(로컬 모드). 모든 서식의 (인) 위에 표시
  // 기술닥터사업 상용화지원 전용 정보 (과제·협약 사업비 — 서식 공통 반영)
  td?: {
    project?: string; periodFrom?: string; periodTo?: string; doctor?: string; support?: string; share?: string; docNo?: string;
    doctorOrg?: string; doctorTitle?: string; // 기술닥터 소속·직위 (결과보고서)
    mgrName?: string; mgrEmail?: string; mgrDept?: string; mgrTitle?: string; mgrTel?: string; mgrPhone?: string; // 실무담당자
  };
  // 창업성공패키지(창업사관학교) 공고별 과제 정보 — key: 'ysc' | 'gsa'
  ssp?: Record<string, {
    trainee?: string;      // 입교자명 (보통 대표자와 동일)
    taskName?: string;     // 사업화 과제명
    taskOutline?: string;  // 과제개요 (월간 활동보고서)
    periodFrom?: string; periodTo?: string; // 협약(사업) 기간
    govFund?: string; ownCash?: string; ownInkind?: string; // 정부지원금 / 부담금(현금) / 현물
  }>;
};
const LS_GRANT = "oro_grant_docs", LS_GPROF = "oro_grant_profile";
export async function listGrantDocs(program = "cud"): Promise<GrantDoc[]> {
  if (supabase) {
    const { data, error } = await supabase.from("grant_docs").select("id,title,expense_item,program,forms,created_at").eq("program", program).order("created_at", { ascending: false }).limit(200);
    if (error) throw error; return (data || []) as GrantDoc[];
  }
  return lsGet<GrantDoc[]>(LS_GRANT, []).filter(r => (r.program || "cud") === program).map(({ data: _d, photos: _p, ...r }) => ({ ...r, data: {}, photos: [] })).reverse();
}
// 정산 현황용 목록 — 금액 계산에 필요한 data 포함(사진 제외)
export async function listGrantSettle(program = "cud"): Promise<GrantDoc[]> {
  if (supabase) {
    const { data, error } = await supabase.from("grant_docs").select("id,title,expense_item,program,forms,data,created_at").eq("program", program).order("created_at", { ascending: false }).limit(500);
    if (error) throw error; return (data || []).map(r => ({ ...r, photos: [] })) as GrantDoc[];
  }
  return lsGet<GrantDoc[]>(LS_GRANT, []).filter(r => (r.program || "cud") === program).map(({ photos: _p, ...r }) => ({ ...r, photos: [] })).reverse();
}
export async function getGrantDoc(id: string): Promise<GrantDoc | null> {
  if (supabase) {
    const { data, error } = await supabase.from("grant_docs").select("*").eq("id", id).maybeSingle();
    if (error) throw error; return (data as GrantDoc) || null;
  }
  return lsGet<GrantDoc[]>(LS_GRANT, []).find(r => r.id === id) || null;
}
export async function saveGrantDoc(d: GrantDoc): Promise<GrantDoc> {
  if (supabase) {
    const { id, ...rest } = d;
    const { data, error } = id
      ? await supabase.from("grant_docs").update(rest).eq("id", id).select().single()
      : await supabase.from("grant_docs").insert(rest).select().single();
    if (error) throw error; return data as GrantDoc;
  }
  const all = lsGet<GrantDoc[]>(LS_GRANT, []);
  if (d.id) { const n = all.map(r => r.id === d.id ? { ...d } : r); lsSet(LS_GRANT, n); return d; }
  const nd = { ...d, id: "g-" + Date.now(), created_at: new Date().toISOString() };
  lsSet(LS_GRANT, [...all, nd]); return nd;
}
export async function deleteGrantDoc(id: string): Promise<void> {
  if (supabase) { const { error } = await supabase.from("grant_docs").delete().eq("id", id); if (error) throw error; return; }
  lsSet(LS_GRANT, lsGet<GrantDoc[]>(LS_GRANT, []).filter(r => r.id !== id));
}
export async function getGrantProfile(): Promise<GrantProfile> {
  if (supabase) {
    const { data, error } = await supabase.from("app_settings").select("grant_profile").eq("id", 1).maybeSingle();
    if (error) throw error; return ((data as any)?.grant_profile as GrantProfile) || {};
  }
  return lsGet<GrantProfile>(LS_GPROF, {});
}
export async function saveGrantProfile(p: GrantProfile): Promise<void> {
  if (supabase) { const { error } = await supabase.from("app_settings").upsert({ id: 1, grant_profile: p }, { onConflict: "id" }); if (error) throw error; return; }
  lsSet(LS_GPROF, p);
}
