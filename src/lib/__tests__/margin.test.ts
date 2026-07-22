import { describe, it, expect } from "vitest";
import { avgPurchasePrice, matPriceFor, costPerG, marginByItem, priceTrend } from "../margin";
import { buildBomIndex } from "../bom";
import { stockMins, lowStock, buildStock } from "../stock";
import { InoutRow, StockBase, BomRow, inoutSig } from "../db";

const io = (kind: "in" | "out" | "purchase", idate: string, code: string, name: string, qty: number, amount: number | null = null): InoutRow => {
  const base = { kind, ym: idate.slice(0, 7), idate, item_code: code, name, spec: "", qty, amount, customer: "", trade_type: "", gubun: "", cust_code: "", vat: null, total: null, currency: "", fx_rate: null, note: "" };
  return { ...base, sig: inoutSig(base) };
};
const br = (prod_code: string, prod_name: string, mat_code: string, mat_name: string, batch_qty: number, qty: number): BomRow =>
  ({ prod_code, prod_name, process: "도금", version: "기본", mat_code, mat_name, batch_qty, qty });

describe("안전재고 (stockMins / lowStock)", () => {
  const bases: StockBase[] = [
    { kind: "min", cat: "material", item_code: "M1", name: "AgCN", bdate: "2026-07-01", qty: 100 },
    { kind: "min", cat: "material", item_code: "M1", name: "AgCN", bdate: "2026-07-15", qty: 400 },
    { kind: "min", cat: "product", item_code: "A1", name: "제품A", bdate: "2026-07-01", qty: 0 },
  ];
  it("품목별 최신 bdate 값 채택, 0은 미설정", () => {
    expect(stockMins(bases)).toEqual({ M1: 400 });
  });
  it("하한선 미달 품목만 경고", () => {
    const items = buildStock([], [], [io("purchase", "2026-07-03", "M1", "AgCN", 380)], [], bases);
    const low = lowStock(items, stockMins(bases));
    expect(low).toHaveLength(1);
    expect(low[0].bal).toBe(380);
    expect(low[0].min).toBe(400);
  });
});

describe("원가·마진 (margin.ts — BOM 전개 기반)", () => {
  const purchases = [
    io("purchase", "2026-06-10", "A0012", "AgCN", 100, 500_000),  // 5,000원/g
    io("purchase", "2026-07-10", "A0012", "AgCN", 100, 700_000),  // 7,000원/g → 가중평균 6,000
    io("purchase", "2026-07-12", "A0011", "PGC", 200, 200_000),   // 1,000원/g
    io("purchase", "2026-07-13", "", "슐츠 니켈분말", 100, 300_000), // 3,000원/g (코드 없음 — 이름 매칭)
  ];
  it("가중평균 매입 단가", () => {
    const p = avgPurchasePrice(purchases);
    expect(p.A0012.price).toBe(6000);
    expect(p.A0011.price).toBe(1000);
  });
  it("matPriceFor — 코드 정확 일치 우선, 이름 포함 폴백", () => {
    expect(matPriceFor(purchases, { code: "A0012", name: "AgCN" })).toBe(6000);
    expect(matPriceFor(purchases, { code: "A0016", name: "슐츠" })).toBe(3000); // 코드 불일치 → 이름 폴백
    expect(matPriceFor(purchases, { code: "", name: "없는재료" })).toBe(0);
  });
  it("costPerG — 단일 BOM: 50g당 AgCN 2g + PGC 5g → 1g당 340원", () => {
    const idx = buildBomIndex([br("C1", "제품A", "A0012", "AgCN", 50, 2), br("C1", "제품A", "A0011", "PGC", 50, 5)]);
    const priceOf = (m: { code: string; name: string }) => matPriceFor(purchases, m);
    expect(costPerG(idx, "제품A", priceOf)).toBeCloseTo(340);
    expect(costPerG(idx, "미등록제품", priceOf)).toBeNull();
  });
  it("costPerG — 다단계: 반제품 경유 원분말 단가까지 합산", () => {
    // 도금품 55g당: PGC 11 + 반제품 50 / 반제품(시빙) 1g당 슐츠 1g
    const idx = buildBomIndex([
      br("B1", "ACA2532", "A0016", "슐츠", 1, 1),
      br("C1", "도금품", "A0011", "PGC", 55, 11),
      br("C1", "도금품", "B1", "ACA2532", 55, 50),
    ]);
    const priceOf = (m: { code: string; name: string }) => matPriceFor(purchases, m);
    // 1g당: PGC 0.2g×1000 + 슐츠 (50/55)g×3000 ≈ 2,927원 (전개 결과는 소수 3자리 반올림)
    expect(costPerG(idx, "도금품", priceOf)).toBeCloseTo(200 + 50 / 55 * 3000, 0);
  });
  it("costPerG — 사용 원재료 중 단가 없는 게 있으면 null (과소평가 방지)", () => {
    const idx = buildBomIndex([br("C1", "제품A", "A0012", "AgCN", 50, 2), br("C1", "제품A", "", "미지재료", 50, 3)]);
    expect(costPerG(idx, "제품A", (m) => matPriceFor(purchases, m))).toBeNull();
  });
  it("marginByItem — BOM 없는 품목은 원가 null", () => {
    const idx = buildBomIndex([br("C1", "제품A", "A0012", "AgCN", 50, 2), br("C1", "제품A", "A0011", "PGC", 50, 5)]);
    const sales = [io("out", "2026-07-05", "C1", "제품A", 100, 100_000), io("out", "2026-07-06", "X1", "제품B", 50, 50_000)];
    const rows = marginByItem(sales, idx, (m) => matPriceFor(purchases, m));
    const a = rows.find(r => r.name === "제품A")!, b = rows.find(r => r.name === "제품B")!;
    expect(a.cost).toBeCloseTo(34000);
    expect(a.margin).toBeCloseTo(66000);
    expect(a.rate!).toBeCloseTo(0.66);
    expect(b.cost).toBeNull();
  });
  it("priceTrend — 코드 일치 기준 월별 단가", () => {
    expect(priceTrend(purchases, { code: "A0012", name: "AgCN" })).toEqual([
      { ym: "2026-06", price: 5000 },
      { ym: "2026-07", price: 7000 },
    ]);
  });
});
