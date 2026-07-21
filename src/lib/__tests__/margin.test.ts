import { describe, it, expect } from "vitest";
import { avgPurchasePrice, matPrice, costPerG, marginByItem, priceTrend } from "../margin";
import { stockMins, lowStock, buildStock } from "../stock";
import { InoutRow, StockBase, BomMap, inoutSig } from "../db";

const io = (kind: "in" | "out" | "purchase", idate: string, code: string, name: string, qty: number, amount: number | null = null): InoutRow => {
  const base = { kind, ym: idate.slice(0, 7), idate, item_code: code, name, spec: "", qty, amount, customer: "", trade_type: "", gubun: "", cust_code: "", vat: null, total: null, currency: "", fx_rate: null, note: "" };
  return { ...base, sig: inoutSig(base) };
};

describe("안전재고 (stockMins / lowStock)", () => {
  const bases: StockBase[] = [
    { kind: "min", cat: "material", item_code: "M1", name: "AgCN", bdate: "2026-07-01", qty: 100 },
    { kind: "min", cat: "material", item_code: "M1", name: "AgCN", bdate: "2026-07-15", qty: 400 }, // 최신 값 채택
    { kind: "min", cat: "product", item_code: "A1", name: "제품A", bdate: "2026-07-01", qty: 0 },   // 0 = 미설정
  ];
  it("품목별 최신 bdate 값 채택, 0은 미설정", () => {
    expect(stockMins(bases)).toEqual({ M1: 400 });
  });
  it("하한선 미달 품목만 경고 (잔량 계산에 min 행은 미포함)", () => {
    const items = buildStock([], [], [io("purchase", "2026-07-03", "M1", "AgCN", 380)], [], bases);
    const low = lowStock(items, stockMins(bases));
    expect(low).toHaveLength(1);
    expect(low[0].bal).toBe(380);
    expect(low[0].min).toBe(400);
  });
  it("하한선 이상이면 경고 없음", () => {
    const items = buildStock([], [], [io("purchase", "2026-07-03", "M1", "AgCN", 500)], [], bases);
    expect(lowStock(items, stockMins(bases))).toHaveLength(0);
  });
});

describe("원가·마진 (margin.ts)", () => {
  const purchases = [
    io("purchase", "2026-06-10", "M1", "AgCN", 100, 500_000),  // 5,000원/g
    io("purchase", "2026-07-10", "M1", "AgCN", 100, 700_000),  // 7,000원/g → 가중평균 6,000
    io("purchase", "2026-07-12", "M2", "PGC", 200, 200_000),   // 1,000원/g
  ];
  it("가중평균 매입 단가", () => {
    const p = avgPurchasePrice(purchases);
    expect(p.M1.price).toBe(6000);
    expect(p.M2.price).toBe(1000);
  });
  it("키워드 매칭 평균 단가 (대소문자 무시)", () => {
    expect(matPrice(purchases, "agcn")).toBe(6000);
    expect(matPrice(purchases, "pgc")).toBe(1000);
    expect(matPrice(purchases, "니켈")).toBe(0);
  });
  it("제품 1g당 재료원가 = (agcn×단가 + pgc×단가) ÷ 50", () => {
    // 50g 생산에 AgCN 2g + PGC 5g → (2×6000 + 5×1000) / 50 = 340원/g
    expect(costPerG({ agcn: 2, pgc: 5 }, 6000, 1000)).toBe(340);
    expect(costPerG(undefined, 6000, 1000)).toBeNull();          // BOM 미등록
    expect(costPerG({ agcn: 0, pgc: 0 }, 6000, 1000)).toBeNull(); // 사용량 없음
    expect(costPerG({ agcn: 2, pgc: 0 }, 0, 1000)).toBeNull();    // 필요한 단가 없음
  });
  it("품목별 마진 집계 — BOM 없는 품목은 원가 null", () => {
    const bom: BomMap = { 제품A: { agcn: 2, pgc: 5 } };
    const sales = [
      io("out", "2026-07-05", "A1", "제품A", 100, 100_000),  // 원가 340×100=34,000 → 마진 66,000 (66%)
      io("out", "2026-07-06", "B1", "제품B", 50, 50_000),    // BOM 없음
    ];
    const rows = marginByItem(sales, bom, 6000, 1000);
    const a = rows.find(r => r.name === "제품A")!, b = rows.find(r => r.name === "제품B")!;
    expect(a.cost).toBe(34000);
    expect(a.margin).toBe(66000);
    expect(a.rate).toBeCloseTo(0.66);
    expect(b.cost).toBeNull();
    expect(b.rate).toBeNull();
  });
  it("월별 단가 추이", () => {
    expect(priceTrend(purchases, "agcn")).toEqual([
      { ym: "2026-06", price: 5000 },
      { ym: "2026-07", price: 7000 },
    ]);
  });
});
