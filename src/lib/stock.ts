// 재고 수불 계산 — 화면(재고 현황/수불부)이 공용으로 쓰는 순수 함수 모음.
// 데이터 소스와 부호:
//   제품   : 생산입고(inout kind='in') +  /  판매(kind='out') −
//   원재료 : 구매입고(kind='purchase') +  /  생산소모(prod_consume의 자재행 act_qty) −
//   공통   : 기초재고(stock_base kind='base') = 기준일 시작 잔량으로 리셋,
//            실사 조정(kind='adj') = ±증감
// 품목 식별키 = 품목코드(없으면 품목명). 분류는 흐름으로 자동 판정:
//   생산입고/판매가 있으면 제품, 아니면(구매/소모만 있으면) 원재료.
import { InoutRow, ProdConsume, StockBase } from "./db";

export type MoveSrc = "생산입고" | "판매출고" | "구매입고" | "생산소모" | "조정";
export type StockMove = { date: string; ym: string; src: MoveSrc; qty: number; note?: string };
export type ItemStock = {
  key: string;
  cat: "product" | "material";
  code: string; name: string; spec: string;
  base: { bdate: string; qty: number } | null; // 가장 최근 기초재고 (없으면 0부터 누적)
  moves: StockMove[];                          // 기초 이후만 (날짜 오름차순)
};

export const itemKey = (code?: string, name?: string) => (code || "").trim() || (name || "").trim();
const ymOf = (iso: string) => (iso || "").slice(0, 7);

// 소모행 날짜: idate가 없으면 해당 월 1일로 간주 (이카운트 소모현황이 월 단위인 경우)
const consumeDate = (r: ProdConsume) => r.idate || (r.ym ? `${r.ym}-01` : "");

// 모든 소스를 품목별 수불 데이터로 병합
export function buildStock(
  prodIn: InoutRow[], sales: InoutRow[], purchases: InoutRow[],
  consumes: ProdConsume[], bases: StockBase[],
): ItemStock[] {
  type Acc = {
    code: string; name: string; spec: string;
    hasProd: boolean; hasMat: boolean;
    all: StockMove[]; bases: StockBase[];
  };
  const m = new Map<string, Acc>();
  const acc = (code?: string, name?: string, spec?: string) => {
    const k = itemKey(code, name);
    if (!k) return null;
    let a = m.get(k);
    if (!a) { a = { code: (code || "").trim(), name: (name || "").trim(), spec: (spec || "").trim(), hasProd: false, hasMat: false, all: [], bases: [] }; m.set(k, a); }
    if (!a.code && code) a.code = code.trim();
    if (!a.name && name) a.name = name.trim();
    if (!a.spec && spec) a.spec = spec.trim();
    return a;
  };

  prodIn.forEach(r => { const a = acc(r.item_code, r.name, r.spec); if (!a) return; a.hasProd = true; a.all.push({ date: r.idate, ym: r.ym, src: "생산입고", qty: +r.qty || 0 }); });
  sales.forEach(r => { const a = acc(r.item_code, r.name, r.spec); if (!a) return; a.hasProd = true; a.all.push({ date: r.idate, ym: r.ym, src: "판매출고", qty: -(+r.qty || 0), note: r.customer || "" }); });
  purchases.forEach(r => { const a = acc(r.item_code, r.name, r.spec); if (!a) return; a.hasMat = true; a.all.push({ date: r.idate, ym: r.ym, src: "구매입고", qty: +r.qty || 0, note: r.customer || "" }); });
  consumes.forEach(r => {
    if (!r.mat_code && !r.mat_name) return; // 생산행(제품)은 생산입고와 중복이므로 제외
    const a = acc(r.mat_code, r.mat_name); if (!a) return;
    const d = consumeDate(r); if (!d) return;
    a.hasMat = true;
    a.all.push({ date: d, ym: ymOf(d), src: "생산소모", qty: -(+(r.act_qty ?? 0) || 0), note: r.prod_name || "" });
  });
  bases.forEach(b => {
    const a = acc(b.item_code, b.name, b.spec); if (!a) return;
    if (b.kind === "base") a.bases.push(b);
    else if (b.kind === "adj") a.all.push({ date: b.bdate, ym: ymOf(b.bdate), src: "조정", qty: +b.qty || 0, note: b.note || "" });
    // kind='min'(안전재고)은 잔량 계산에 넣지 않는다 — stockMins()로 별도 조회
    if (b.cat === "material") a.hasMat = true;
  });

  const out: ItemStock[] = [];
  for (const [key, a] of m) {
    // 가장 최근 기초재고를 채택 — 그 이전 이동은 잔량 계산에서 제외
    const base = a.bases.sort((x, y) => x.bdate < y.bdate ? -1 : 1).slice(-1)[0] || null;
    const moves = a.all
      .filter(mv => !base || mv.date >= base.bdate) // 기초재고는 기준일 '시작' 잔량 → 당일 이동부터 반영
      .sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : 0);
    out.push({
      key,
      cat: a.hasProd ? "product" : "material",
      code: a.code, name: a.name, spec: a.spec,
      base: base ? { bdate: base.bdate, qty: +base.qty || 0 } : null,
      moves,
    });
  }
  return out.sort((x, y) => (x.cat === y.cat ? (x.name || x.code).localeCompare(y.name || y.code, "ko") : x.cat === "product" ? -1 : 1));
}

// 현재(또는 특정 일자까지) 잔량 = 기초 + 이후 이동 합.
// 기초재고 기준일 이전 시점을 물으면 0 (그 이전은 추적 대상 아님).
export function balanceOf(it: ItemStock, until?: string): number {
  if (until && it.base && until < it.base.bdate) return 0;
  let b = it.base?.qty || 0;
  for (const mv of it.moves) { if (until && mv.date > until) break; b += mv.qty; }
  return Math.round(b * 1000) / 1000; // 부동소수 오차 정리(g 단위 소수 3자리)
}

// 월 수불: 이월(전월 말 잔량) + 입고 − 출고 ± 조정 = 기말.
// 기초재고 기준일이 해당 월이면 이월 = 기초 수량 (월중 기초 입력도 그 달의 시작값으로 본다).
export type MonthLedger = { open: number; inQty: number; outQty: number; adjQty: number; close: number; rows: StockMove[] };
export function monthLedger(it: ItemStock, ym: string): MonthLedger {
  const open = it.base && it.base.bdate.slice(0, 7) === ym ? it.base.qty : balanceOf(it, `${ym}-00`);
  const rows = it.moves.filter(mv => mv.ym === ym);
  let inQty = 0, outQty = 0, adjQty = 0;
  rows.forEach(mv => {
    if (mv.src === "조정") adjQty += mv.qty;
    else if (mv.qty >= 0) inQty += mv.qty;
    else outQty += -mv.qty;
  });
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return { open: r3(open), inQty: r3(inQty), outQty: r3(outQty), adjQty: r3(adjQty), close: r3(open + inQty - outQty + adjQty), rows };
}

// 안전재고(발주점) 맵: 품목키 → 하한선 (품목별 최신 bdate 행 채택, qty<=0은 미설정 취급)
export function stockMins(bases: StockBase[]): Record<string, number> {
  const latest = new Map<string, StockBase>();
  bases.filter(b => b.kind === "min").forEach(b => {
    const k = itemKey(b.item_code, b.name);
    if (!k) return;
    const cur = latest.get(k);
    if (!cur || cur.bdate <= b.bdate) latest.set(k, b);
  });
  const out: Record<string, number> = {};
  for (const [k, b] of latest) { const q = +b.qty || 0; if (q > 0) out[k] = q; }
  return out;
}

// 안전재고 미달 품목 목록 (하한선이 설정된 품목만 검사)
export function lowStock(items: ItemStock[], mins: Record<string, number>): { it: ItemStock; min: number; bal: number }[] {
  const out: { it: ItemStock; min: number; bal: number }[] = [];
  for (const it of items) {
    const min = mins[it.key];
    if (!min) continue;
    const bal = balanceOf(it);
    if (bal < min) out.push({ it, min, bal });
  }
  return out;
}

// 전체 데이터에서 수불부 월 목록 (최신순 아님 — 오름차순)
export function stockMonths(items: ItemStock[]): string[] {
  const s = new Set<string>();
  items.forEach(it => { if (it.base) s.add(ymOf(it.base.bdate)); it.moves.forEach(mv => s.add(mv.ym)); });
  return [...s].filter(Boolean).sort();
}
