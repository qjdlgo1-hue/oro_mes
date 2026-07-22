// 원가·마진 계산 — 대시보드 '원가·마진' 뷰가 쓰는 순수 함수 모음.
// 재료원가 = BOM 전개(반제품 → 말단 원재료까지 재귀, lib/bom.ts) × 원재료별 구매 평균 단가.
// 판매액 = 판매현황 공급가액(amount). 인건비·경비는 포함하지 않는 '재료원가 기준' 마진이다.
import { InoutRow } from "./db";
import { BomIndex, explode } from "./bom";

// 구매 데이터에서 품목별 가중평균 단가(원/단위) — Σ공급가액 ÷ Σ수량 (금액·수량 있는 행만)
export function avgPurchasePrice(purchases: InoutRow[]): Record<string, { price: number; qty: number; amount: number }> {
  const m: Record<string, { qty: number; amount: number }> = {};
  purchases.forEach(r => {
    const qty = Number(r.qty) || 0, amt = Number(r.amount) || 0;
    if (qty <= 0 || amt <= 0) return;
    const k = ((r.item_code || "").trim() || (r.name || "").trim());
    if (!k) return;
    const e = m[k] || (m[k] = { qty: 0, amount: 0 });
    e.qty += qty; e.amount += amt;
  });
  const out: Record<string, { price: number; qty: number; amount: number }> = {};
  for (const [k, e] of Object.entries(m)) out[k] = { price: e.amount / e.qty, qty: e.qty, amount: e.amount };
  return out;
}

// 원재료 1종의 평균 매입 단가 — ① 품목코드 정확 일치 우선 ② 폴백: 품목명 포함 매칭(대소문자 무시)
export function matPriceFor(purchases: InoutRow[], mat: { code?: string; name: string }): number {
  const code = (mat.code || "").trim().toLowerCase();
  let qty = 0, amount = 0;
  if (code) {
    purchases.forEach(r => {
      if ((r.item_code || "").trim().toLowerCase() !== code) return;
      const q = Number(r.qty) || 0, a = Number(r.amount) || 0;
      if (q > 0 && a > 0) { qty += q; amount += a; }
    });
    if (qty > 0) return amount / qty;
  }
  const kw = (mat.name || "").trim().toLowerCase();
  if (!kw) return 0;
  qty = 0; amount = 0;
  purchases.forEach(r => {
    const name = `${r.item_code || ""} ${r.name || ""}`.toLowerCase();
    if (!name.includes(kw)) return;
    const q = Number(r.qty) || 0, a = Number(r.amount) || 0;
    if (q > 0 && a > 0) { qty += q; amount += a; }
  });
  return qty > 0 ? amount / qty : 0;
}

// 제품 1g당 재료원가 — BOM 전개 결과 × 원재료 단가.
// BOM 미등록이면 null. 사용하는 원재료 중 하나라도 단가가 없으면 null (원가 과소평가 방지).
export function costPerG(idx: BomIndex, prodName: string, priceOf: (mat: { code: string; name: string }) => number): number | null {
  const mats = explode(idx, prodName, 1); // 1g 생산 기준 전개
  if (!mats.length) return null;
  let cost = 0;
  for (const m of mats) {
    if (m.qty <= 0) continue;
    const p = priceOf({ code: m.code, name: m.name });
    if (p <= 0) return null;
    cost += m.qty * p;
  }
  return cost > 0 ? cost : null;
}

export type MarginRow = {
  name: string;            // 제품명
  qty: number;             // 판매량(g)
  sales: number;           // 판매액(공급가액)
  cost: number | null;     // 재료원가 (null = BOM 미등록/단가 없음)
  margin: number | null;   // 마진액
  rate: number | null;     // 마진율(0~1)
};

// 품목별 판매액·재료원가·마진 집계 — 판매(kind='out') 행을 제품명으로 묶는다 (BOM 생산품목명과 매칭)
export function marginByItem(sales: InoutRow[], idx: BomIndex, priceOf: (mat: { code: string; name: string }) => number): MarginRow[] {
  const m = new Map<string, { qty: number; sales: number }>();
  sales.forEach(r => {
    const name = (r.name || "").trim() || (r.item_code || "").trim();
    if (!name) return;
    const e = m.get(name) || { qty: 0, sales: 0 };
    e.qty += Number(r.qty) || 0;
    e.sales += Number(r.amount) || 0;
    m.set(name, e);
  });
  const rows: MarginRow[] = [];
  for (const [name, e] of m) {
    const cpg = costPerG(idx, name, priceOf);
    const cost = cpg != null ? cpg * e.qty : null;
    const margin = cost != null ? e.sales - cost : null;
    rows.push({ name, qty: e.qty, sales: e.sales, cost, margin, rate: margin != null && e.sales > 0 ? margin / e.sales : null });
  }
  return rows.sort((a, b) => b.sales - a.sales);
}

// 원재료 월별 평균 매입 단가 추이 — matPriceFor와 같은 매칭 규칙(코드 우선, 이름 폴백)
export function priceTrend(purchases: InoutRow[], mat: { code?: string; name: string }): { ym: string; price: number }[] {
  const code = (mat.code || "").trim().toLowerCase();
  const kw = (mat.name || "").trim().toLowerCase();
  const codeHit = !!code && purchases.some(r => (r.item_code || "").trim().toLowerCase() === code && (Number(r.qty) || 0) > 0 && (Number(r.amount) || 0) > 0);
  const match = (r: InoutRow) => codeHit
    ? (r.item_code || "").trim().toLowerCase() === code
    : !!kw && `${r.item_code || ""} ${r.name || ""}`.toLowerCase().includes(kw);
  const m = new Map<string, { qty: number; amount: number }>();
  purchases.forEach(r => {
    if (!match(r)) return;
    const q = Number(r.qty) || 0, a = Number(r.amount) || 0;
    if (q <= 0 || a <= 0) return;
    const e = m.get(r.ym) || { qty: 0, amount: 0 };
    e.qty += q; e.amount += a; m.set(r.ym, e);
  });
  return [...m.entries()].map(([ym, e]) => ({ ym, price: e.amount / e.qty })).sort((a, b) => a.ym < b.ym ? -1 : 1);
}
