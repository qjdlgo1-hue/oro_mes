import { describe, it, expect } from "vitest";
import { aggregateKpis, ruleReport, periodYms, prevPeriodKey, yoyPeriodKey, periodLabel } from "../bizreport";
import { InoutRow } from "../db";
import { Order, PlanEntry, Receipt } from "../types";

const out = (ym: string, amount: number, customer = "A사", trade = "", name = "P1"): InoutRow =>
  ({ kind: "out", ym, idate: `${ym}-15`, item_code: name, name, qty: 100, amount, customer, trade_type: trade, sig: `${ym}${amount}${customer}${name}` });

describe("bizreport 기간 계산", () => {
  it("월/분기/반기/연 기간의 ym 목록", () => {
    expect(periodYms("month", "2026-06")).toEqual(["2026-06"]);
    expect(periodYms("quarter", "2026-Q2")).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(periodYms("half", "2026-H2")).toEqual(["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]);
    expect(periodYms("year", "2026")).toHaveLength(12);
  });
  it("직전/전년동기 키", () => {
    expect(prevPeriodKey("month", "2026-01")).toBe("2025-12");
    expect(prevPeriodKey("quarter", "2026-Q1")).toBe("2025-Q4");
    expect(yoyPeriodKey("month", "2026-06")).toBe("2025-06");
    expect(yoyPeriodKey("year", "2026")).toBe("2025");
  });
  it("기간 라벨", () => {
    expect(periodLabel("month", "2026-06")).toBe("2026년 6월");
    expect(periodLabel("half", "2026-H1")).toBe("2026년 상반기");
  });
});

describe("aggregateKpis", () => {
  const orders: Order[] = [
    { id: "o1", order_no: "1", order_date: "2026-06-01", ym: "2026-06", item_code: "P1", gubun: "제품", name: "P1", spec: "", qty: 500, customer: "A사", note: "" },
    { id: "o2", order_no: "2", order_date: "2026-06-05", ym: "2026-06", item_code: "P2", gubun: "제품", name: "P2", spec: "", qty: 300, customer: "B사", note: "" },
  ];
  const plans: Record<string, PlanEntry> = {
    o1: { order_id: "o1", start_date: "2026-06-02", span: 2, done: true },
    o2: { order_id: "o2", start_date: "2026-06-03", span: 1, done: false }, // 완료예정 6/3 < today → 지연
  };
  const receipts: Receipt[] = [
    { rdate: "2026-06-10", vendor: "V", bizno: "", supply: 10000, vat: 1000, total: 11000, rtype: "", account: "소모품비", memo: "" },
  ];
  const base = {
    periodType: "month" as const, periodKey: "2026-06",
    out: [out("2026-06", 1000000), out("2026-06", 500000, "B사", "외자"), out("2026-05", 800000)],
    inn: [] as InoutRow[], orders, plans, receipts, prodcon: [], today: "2026-07-01",
  };
  const k = aggregateKpis(base);

  it("판매 합계·내외자·전기 대비", () => {
    expect(k.sales.total).toBe(1500000);
    expect(k.sales.domestic).toBe(1000000);
    expect(k.sales.foreign).toBe(500000);
    expect(k.sales.prevTotal).toBe(800000);
    expect(k.sales.yoyTotal).toBeNull(); // 전년 데이터 없음
    expect(k.sales.topCustomers[0]).toEqual({ name: "A사", value: 1000000 });
  });
  it("주문·계획·지연 집계", () => {
    expect(k.orders.count).toBe(2);
    expect(k.orders.planned).toBe(2);
    expect(k.orders.done).toBe(1);
    expect(k.orders.late).toBe(1);
  });
  it("지출·데이터 공백", () => {
    expect(k.spend.total).toBe(11000);
    expect(k.spend.byAccount[0].name).toBe("소모품비");
    expect(k.gaps.some(g => g.includes("생산입고"))).toBe(true);
  });
});

describe("ruleReport", () => {
  it("핵심 수치가 마크다운에 포함", () => {
    const k = aggregateKpis({
      periodType: "month", periodKey: "2026-06",
      out: [out("2026-06", 1234567)], inn: [], orders: [], plans: {}, receipts: [], prodcon: [], today: "2026-07-01",
    });
    const md = ruleReport(k);
    expect(md).toContain("2026년 6월 경영분석보고서");
    expect(md).toContain("1,234,567");
    expect(md).toContain("규칙 기반");
  });
});
