// 원가·마진 계산 — 대시보드 '원가·마진' 뷰가 쓰는 순수 함수 모음.
// 재료원가 = BOM(제품별 AgCN·PGC 사용량, 50g 생산 기준) × 원재료 평균 매입 단가(구매 데이터 가중평균).
// 판매액 = 판매현황 공급가액(amount). 인건비·경비는 포함하지 않는 '재료원가 기준' 마진이다.
import { InoutRow, BomMap } from "./db";

const BATCH = 50; // BOM 사용량 기준 생산량(g) — MaterialBom.tsx와 동일

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

// 원재료 이름으로 평균 단가 찾기 — 품목명/코드에 키워드가 포함된 구매 품목들의 가중평균.
// (예: matPrice(purchases, "agcn") → 품목명에 AgCN이 들어간 매입 전체의 평균 단가)
export function matPrice(purchases: InoutRow[], keyword: string): number {
  const kw = keyword.toLowerCase();
  let qty = 0, amount = 0;
  purchases.forEach(r => {
    const name = `${r.item_code || ""} ${r.name || ""}`.toLowerCase();
    if (!name.includes(kw)) return;
    const q = Number(r.qty) || 0, a = Number(r.amount) || 0;
    if (q <= 0 || a <= 0) return;
    qty += q; amount += a;
  });
  return qty > 0 ? amount / qty : 0;
}

// 제품 1g당 재료원가 (BOM 미등록이거나 단가가 없으면 null → '원가 미상')
export function costPerG(bom: { agcn: number; pgc: number } | undefined, priceAgcn: number, pricePgc: number): number | null {
  if (!bom) return null;
  const agcn = Number(bom.agcn) || 0, pgc = Number(bom.pgc) || 0;
  if (agcn <= 0 && pgc <= 0) return null;
  // 사용하는 재료 중 하나라도 매입 단가가 없으면 계산 불가 (원가가 실제보다 작게 나오는 것 방지)
  if ((agcn > 0 && priceAgcn <= 0) || (pgc > 0 && pricePgc <= 0)) return null;
  return (agcn * priceAgcn + pgc * pricePgc) / BATCH;
}

export type MarginRow = {
  name: string;            // 제품명(BOM 키)
  qty: number;             // 판매량(g)
  sales: number;           // 판매액(공급가액)
  cost: number | null;     // 재료원가 (null = BOM 미등록/단가 없음)
  margin: number | null;   // 마진액
  rate: number | null;     // 마진율(0~1)
};

// 품목별 판매액·재료원가·마진 집계 — 판매(kind='out') 행을 제품명으로 묶는다 (BOM 키가 제품명이므로)
export function marginByItem(sales: InoutRow[], bomMap: BomMap, priceAgcn: number, pricePgc: number): MarginRow[] {
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
    const cpg = costPerG(bomMap[name], priceAgcn, pricePgc);
    const cost = cpg != null ? cpg * e.qty : null;
    const margin = cost != null ? e.sales - cost : null;
    rows.push({ name, qty: e.qty, sales: e.sales, cost, margin, rate: margin != null && e.sales > 0 ? margin / e.sales : null });
  }
  return rows.sort((a, b) => b.sales - a.sales);
}

// 원재료 월별 평균 매입 단가 추이 (품목명/코드에 키워드 포함 행 기준)
export function priceTrend(purchases: InoutRow[], keyword: string): { ym: string; price: number }[] {
  const kw = keyword.toLowerCase();
  const m = new Map<string, { qty: number; amount: number }>();
  purchases.forEach(r => {
    const name = `${r.item_code || ""} ${r.name || ""}`.toLowerCase();
    if (!name.includes(kw)) return;
    const q = Number(r.qty) || 0, a = Number(r.amount) || 0;
    if (q <= 0 || a <= 0) return;
    const e = m.get(r.ym) || { qty: 0, amount: 0 };
    e.qty += q; e.amount += a; m.set(r.ym, e);
  });
  return [...m.entries()].map(([ym, e]) => ({ ym, price: e.amount / e.qty })).sort((a, b) => a.ym < b.ym ? -1 : 1);
}
