import { describe, it, expect } from "vitest";
import { buildStock, balanceOf, monthLedger, stockMonths } from "../stock";
import { InoutRow, ProdConsume, StockBase, inoutSig } from "../db";
import { parseInout } from "../parseInout";

const io = (kind: "in" | "out" | "purchase", idate: string, code: string, name: string, qty: number, customer = ""): InoutRow => {
  const base = { kind, ym: idate.slice(0, 7), idate, item_code: code, name, spec: "", qty, amount: null, customer, trade_type: "", gubun: "", cust_code: "", vat: null, total: null, currency: "", fx_rate: null, note: "" };
  return { ...base, sig: inoutSig(base) };
};
const cons = (ym: string, mat: string, act: number, idate?: string): ProdConsume =>
  ({ ym, idate, prod_code: "P1", prod_name: "제품A", mat_code: mat, mat_name: mat, act_qty: act, sig: `${ym}|${mat}|${act}|${idate || ""}` } as ProdConsume);

describe("buildStock — 분류·병합", () => {
  it("생산입고/판매가 있으면 제품, 구매/소모만 있으면 원재료", () => {
    const items = buildStock(
      [io("in", "2026-07-05", "A1", "제품A", 100)],
      [io("out", "2026-07-10", "A1", "제품A", 60)],
      [io("purchase", "2026-07-03", "M1", "AgCN", 500)],
      [cons("2026-07", "M1", 120, "2026-07-08")],
      [],
    );
    const a = items.find(i => i.key === "A1")!, m = items.find(i => i.key === "M1")!;
    expect(a.cat).toBe("product");
    expect(m.cat).toBe("material");
    expect(balanceOf(a)).toBe(40);   // 100 − 60
    expect(balanceOf(m)).toBe(380);  // 500 − 120
  });
  it("품목코드가 없으면 품목명으로 병합", () => {
    const items = buildStock([io("in", "2026-07-01", "", "무코드품", 10)], [io("out", "2026-07-02", "", "무코드품", 3)], [], [], []);
    expect(items).toHaveLength(1);
    expect(balanceOf(items[0])).toBe(7);
  });
});

describe("기초재고·조정", () => {
  const bases: StockBase[] = [
    { kind: "base", cat: "product", item_code: "A1", name: "제품A", bdate: "2026-07-01", qty: 200 },
    { kind: "adj", cat: "product", item_code: "A1", name: "제품A", bdate: "2026-07-20", qty: -15, note: "실사 차이" },
  ];
  it("기초재고 이전 데이터는 무시, 이후만 누적 (+조정)", () => {
    const items = buildStock(
      [io("in", "2026-06-15", "A1", "제품A", 999), io("in", "2026-07-05", "A1", "제품A", 100)], // 6월 건은 무시
      [io("out", "2026-07-10", "A1", "제품A", 60)],
      [], [], bases,
    );
    expect(balanceOf(items[0])).toBe(225); // 200 + 100 − 60 − 15
  });
  it("기준일 이전 시점의 잔량은 0 (추적 대상 아님)", () => {
    const items = buildStock([], [], [], [], [bases[0]]);
    expect(balanceOf(items[0], "2026-06-30")).toBe(0);
    expect(balanceOf(items[0], "2026-07-01")).toBe(200);
  });
});

describe("monthLedger — 월 수불", () => {
  const items = buildStock(
    [io("in", "2026-07-05", "A1", "제품A", 100), io("in", "2026-08-02", "A1", "제품A", 50)],
    [io("out", "2026-07-10", "A1", "제품A", 60), io("out", "2026-08-20", "A1", "제품A", 30)],
    [], [],
    [{ kind: "base", cat: "product", item_code: "A1", name: "제품A", bdate: "2026-07-01", qty: 200 },
     { kind: "adj", cat: "product", item_code: "A1", name: "제품A", bdate: "2026-08-05", qty: -5, note: "실사" }],
  );
  it("기초 월: 이월=기초, 기말 = 기초+입고−출고", () => {
    const l = monthLedger(items[0], "2026-07");
    expect(l.open).toBe(200); expect(l.inQty).toBe(100); expect(l.outQty).toBe(60); expect(l.close).toBe(240);
  });
  it("다음 달: 이월 = 전월 기말, 조정 반영", () => {
    const l = monthLedger(items[0], "2026-08");
    expect(l.open).toBe(240); expect(l.inQty).toBe(50); expect(l.outQty).toBe(30); expect(l.adjQty).toBe(-5);
    expect(l.close).toBe(255);
  });
  it("stockMonths — 데이터 있는 달 목록", () => {
    expect(stockMonths(items)).toEqual(["2026-07", "2026-08"]);
  });
});

describe("parseInout purchase — 이카운트 [구매현황] 붙여넣기", () => {
  const text = [
    "일자-No.\t거래처코드\t거래처명\t품목코드\t품목명\t규격\t수량\t단가\t공급가액\t부가세\t합계",
    "2026/07/03-1\tV001\t대한케미칼\tM1\tAgCN\t1kg\t500\t100\t50,000\t5,000\t55,000",
    "2026/07/15-2\tV002\t한국약품\tM2\tPGC\t500g\t250\t80\t20,000\t2,000\t22,000",
  ].join("\n");
  it("수량·금액·거래처를 인식하고 kind=purchase로 저장", () => {
    const rows = parseInout("purchase", text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "purchase", idate: "2026-07-03", item_code: "M1", name: "AgCN", qty: 500, amount: 50000, customer: "대한케미칼", vat: 5000, total: 55000 });
    expect(rows[1].ym).toBe("2026-07");
  });
});
