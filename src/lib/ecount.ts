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

// ---- 전표 전송 페이로드 (순수 함수, 쓰기 API) ----
// 이카운트 벌크 규칙: 같은 UPLOAD_SER_NO = 한 전표. 여기서는 행마다 다른 번호(행별 개별 전표)로
// 만들어 부분 실패 추적·재전송을 단순하게 유지한다. 날짜는 YYYYMMDD.
const ymd = (iso: string) => (iso || "").replace(/-/g, "").slice(0, 8);

export type ProdSlipRow = { code: string; qty: number; date: string };
export function buildProdBulk(rows: ProdSlipRow[]): Record<string, string>[] {
  return rows.map((r, i) => ({
    UPLOAD_SER_NO: String(i + 1),
    PROD_CD: r.code, QTY: String(r.qty), IO_DATE: ymd(r.date),
  }));
}

export type PurchaseSlipRow = {
  code: string; qty: number; date: string;
  price?: number | null; supply?: number | null; vat?: number | null; cust?: string;
};
// 구매입력은 금액·부가세가 자동 계산되지 않음 → MES에서 산출해 전송
// (공급가액 = 있으면 그대로, 없으면 수량×단가 반올림 / 부가세 = 있으면 그대로, 없으면 공급가액의 10% 반올림)
export function buildPurchaseBulk(rows: PurchaseSlipRow[]): Record<string, string>[] {
  return rows.map((r, i) => {
    const supply = r.supply != null ? Math.round(r.supply)
      : (r.price != null ? Math.round(r.qty * r.price) : null);
    const vat = r.vat != null ? Math.round(r.vat) : (supply != null ? Math.round(supply * 0.1) : null);
    const d: Record<string, string> = {
      UPLOAD_SER_NO: String(i + 1),
      PROD_CD: r.code, QTY: String(r.qty), IO_DATE: ymd(r.date),
    };
    if (r.price != null) d.PRICE = String(r.price);
    if (supply != null) d.SUPPLY_AMT = String(supply);
    if (vat != null) d.VAT_AMT = String(vat);
    if (r.cust) d.CUST = r.cust;
    return d;
  });
}

// ---- 전송 제한 가드 (Edge Function과 동일 로직 사본 — 테스트는 이쪽에서) ----
// 공식 기준: 실서버 Zone·로그인·조회 1회/10분, 저장 1회/10초, 테스트서버 1회/10초.
// ※ supabase/functions/ecount/index.ts의 cooldownLeftMs와 반드시 함께 수정할 것.
export function cooldownLeftMs(lastIso: string | null | undefined, action: string, useTest: boolean, now: number): number {
  const isSave = action === "save_prod" || action === "save_purchase";
  const min = useTest ? 10_000 : (isSave ? 10_000 : 10 * 60_000);
  if (!lastIso) return 0;
  const t = new Date(lastIso).getTime();
  if (isNaN(t)) return 0;
  return Math.max(0, t + min - now);
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
export const checkEcountIp = () => call<{ ip: string }>("my_ip"); // 이카운트 [IP등록]에 넣을 발신 IP
export const fetchEcountItems = (codes?: string[]) => call<{ rows: EcountItemRow[] }>("items", { codes });
export const fetchEcountStock = (baseDate?: string) =>
  call<{ rows: Record<string, any>[]; base_date: string }>("stock", baseDate ? { base_date: baseDate } : {});

export type EcountSaveResult = { success: number; fail: number; slip_nos: string[]; details: any[] };
export const sendEcountProd = (list: Record<string, string>[]) => call<EcountSaveResult>("save_prod", { list });
export const sendEcountPurchase = (list: Record<string, string>[]) => call<EcountSaveResult>("save_purchase", { list });

export type EcountLog = { id: string; at: string; action: string; ok: boolean; detail: any };
export async function listEcountLogs(limit = 15): Promise<EcountLog[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("ecount_log").select("*").order("at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []) as EcountLog[];
}
