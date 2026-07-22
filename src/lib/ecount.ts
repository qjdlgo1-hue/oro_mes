// 이카운트(ERP) OpenAPI 연동 — 클라이언트 측.
// 모든 호출은 Edge Function 'ecount'를 경유한다 (인증키는 서버에만 보관, 브라우저에 내려오지 않음).
// 이 파일의 순수 함수(응답 매핑)는 vitest로 검증한다.
import { supabase } from "./supabase";
import { invokeFn, Item } from "./db";

// ---- 이카운트 응답 매핑 (순수 함수) ----

// 품목구분 코드 → MES 구분 라벨 (이카운트: 0원재료·1제품·2반제품·3상품·4부재료·7무형상품)
export const PROD_TYPE_GUBUN: Record<string, string> = {
  "0": "원재료", "1": "제품", "2": "반제품", "3": "상품", "4": "부재료", "7": "무형상품",
};

export type EcountItemRow = Record<string, any>; // ViewBasicProduct Result 행 (필드 구성은 회사 설정에 따라 다름)

const s = (v: any) => (v == null ? "" : String(v)).trim();
const n = (v: any) => { const x = Number(String(v ?? "").replace(/,/g, "")); return isNaN(x) ? 0 : x; };

// ViewBasicProduct 행 → MES Item (없는 필드는 안전한 기본값)
export function ecountItemToItem(r: EcountItemRow): Item | null {
  const code = s(r.PROD_CD);
  const name = s(r.PROD_DES) || code;
  if (!code && !name) return null;
  return {
    code, name,
    spec: s(r.SIZE_DES),
    gubun: PROD_TYPE_GUBUN[s(r.PROD_TYPE)] || "제품",
    unit: s(r.UNIT) || "g",
    active: s(r.DEL_GUBUN ?? "").toUpperCase() !== "Y", // 사용중단(DEL_GUBUN=Y)이면 비활성
  };
}

export function ecountSafeQty(r: EcountItemRow): number { return n(r.SAFE_QTY); }

// ViewInventoryBalanceStatus Result[] → 품목코드별 잔량 합계 (같은 코드 창고별 복수 행 합산)
export function erpBalanceMap(rows: Record<string, any>[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows || []) {
    const code = s(r.PROD_CD);
    if (!code) continue;
    m.set(code, (m.get(code) || 0) + n(r.BAL_QTY));
  }
  return m;
}

// ---- Edge Function 호출 ----

const OFFLINE = "이카운트 연동은 클라우드 연결에서만 사용할 수 있습니다.";
const call = <T = any>(action: string, body: Record<string, any> = {}) =>
  invokeFn<T>("ecount", { action, ...body }, OFFLINE);

export type EcountConfigView = {
  com_code: string; user_id: string; use_test: boolean; zone: string;
  has_key: boolean; session_at: string | null;
};
export const getEcountConfig = () => call<EcountConfigView>("get_config");
export const saveEcountConfig = (c: { com_code: string; user_id: string; api_cert_key?: string; use_test: boolean }) =>
  call<{ ok: boolean }>("save_config", c);
export const testEcount = () => call<{ ok: boolean; zone: string; use_test: boolean }>("test");
export const fetchEcountItems = (codes?: string[]) => call<{ rows: EcountItemRow[] }>("items", { codes });
export const fetchEcountStock = (baseDate?: string) =>
  call<{ rows: Record<string, any>[]; base_date: string }>("stock", baseDate ? { base_date: baseDate } : {});

export type EcountLog = { id: string; at: string; action: string; ok: boolean; detail: any };
export async function listEcountLogs(limit = 15): Promise<EcountLog[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("ecount_log").select("*").order("at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []) as EcountLog[];
}
