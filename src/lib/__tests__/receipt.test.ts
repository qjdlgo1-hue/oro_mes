import { describe, it, expect } from "vitest";
import { buildBomIndex } from "../bom";
import { BomRow, InoutRow, inoutSig, pcSig } from "../db";
import { Order } from "../types";
import { expandReceiptConsumes, buildReceiptPayload, buildMonthCandidates } from "../receipt";

const BOM: BomRow[] = [
  { prod_code: "C0002", prod_name: "ACC2532-G20A", process: "도금", version: "기본", mat_code: "B0013", mat_name: "ACA2532", batch_qty: 50, qty: 55 },
  { prod_code: "B0013", prod_name: "ACA2532", process: "시빙", version: "기본", mat_code: "A0011", mat_name: "PGC", batch_qty: 50, qty: 10 },
];
const idx = buildBomIndex(BOM);

describe("생산입고 전표 — BOM풀기·페이로드", () => {
  it("다단계 전개(코드 우선) + 소수 3자리 반올림", () => {
    const cs = expandReceiptConsumes(idx, [{ item_code: "C0002", name: "ACC2532-G20A", qty: 100 }]);
    // C0002 100g → B0013 110g → A0011 22g (말단 원재료만)
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ prod_name: "ACC2532-G20A", mat_code: "A0011", mat_name: "PGC", prod_qty: 100, act_qty: 22 });
  });
  it("BOM 미등록·수량 0 라인은 전개 제외", () => {
    expect(expandReceiptConsumes(idx, [{ item_code: "X", name: "미등록품", qty: 10 }, { item_code: "C0002", name: "ACC2532-G20A", qty: 0 }])).toHaveLength(0);
  });
  it("페이로드 sig가 기존 규칙(inoutSig/pcSig)과 일치 — 자동기록과 중복 방지", () => {
    const p = buildReceiptPayload("2026-07-24", "메모", [{ item_code: "C0002", name: "ACC2532-G20A", spec: "25-32um", qty: 100 }],
      expandReceiptConsumes(idx, [{ item_code: "C0002", name: "ACC2532-G20A", qty: 100 }]));
    expect(p.prods[0].sig).toBe(inoutSig({ kind: "in", ym: "2026-07", idate: "2026-07-24", item_code: "C0002", name: "ACC2532-G20A", spec: "25-32um", qty: 100, gubun: "제품", note: "생산입고 전표" }));
    expect(p.consumes[0].sig).toBe(pcSig({ ym: "2026-07", idate: "2026-07-24", prod_code: "C0002", prod_name: "ACC2532-G20A", mat_code: "A0011", mat_name: "PGC", prod_qty: 100, act_qty: 22 }));
    expect(p.rdate).toBe("2026-07-24");
  });
  it("빈 이름·0 수량 라인은 페이로드에서 제외", () => {
    const p = buildReceiptPayload("2026-07-24", "", [{ item_code: "", name: "", qty: 5 }, { item_code: "C1", name: "OK", qty: 0 }], []);
    expect(p.prods).toHaveLength(0);
  });
});

const ord = (id: string, ym: string, code: string, name: string, qty: number, gubun = "제품"): Order =>
  ({ id, order_no: id, order_date: `${ym}-01`, ym, item_code: code, gubun, name, spec: "", qty, customer: "", note: "" });

describe("전표 월 품목 후보(buildMonthCandidates)", () => {
  it("생산계획 시작일 기준으로 그 달 품목만 + 수주 합산(계획수량 우선)", () => {
    const orders = [ord("o1", "2026-07", "C0002", "ACC2532-G20A", 100), ord("o2", "2026-07", "C0002", "ACC2532-G20A", 50), ord("o3", "2026-06", "C0009", "다른달", 30)];
    // o1은 계획수량 80으로 재정의, o2는 계획 없음 → 수주월 사용, o3는 계획이 7월로 이동
    const plans = {
      o1: { order_id: "o1", start_date: "2026-07-05", span: 2, done: false, qty: 80 },
      o3: { order_id: "o3", start_date: "2026-07-20", span: 1, done: false },
    };
    const cs = buildMonthCandidates("2026-07", orders, plans, []);
    expect(cs).toHaveLength(2);
    const acc = cs.find(c => c.item_code === "C0002")!;
    expect(acc.planQty).toBe(130); // 80(계획) + 50(수주)
    expect(cs.find(c => c.name === "다른달")!.planQty).toBe(30); // 계획이 7월로 잡힌 6월 수주
  });
  it("전표(receipt_id)로 입고된 품목은 done=true, 일반 입고는 produced만", () => {
    const inRows = [
      { kind: "in", ym: "2026-07", idate: "2026-07-10", item_code: "C0002", name: "ACC2532-G20A", qty: 100, sig: "s1", receipt_id: "r1" },
      { kind: "in", ym: "2026-07", idate: "2026-07-11", item_code: "C0005", name: "일반입고품", qty: 10, sig: "s2" },
      { kind: "in", ym: "2026-06", idate: "2026-06-11", item_code: "C0006", name: "지난달", qty: 10, sig: "s3", receipt_id: "r0" },
    ] as InoutRow[];
    const cs = buildMonthCandidates("2026-07", [ord("o1", "2026-07", "C0002", "ACC2532-G20A", 100)], {}, inRows);
    expect(cs.find(c => c.item_code === "C0002")).toMatchObject({ done: true, produced: true, planQty: 100 });
    expect(cs.find(c => c.item_code === "C0005")).toMatchObject({ done: false, produced: true, planQty: 0 });
    expect(cs.some(c => c.item_code === "C0006")).toBe(false);
  });
  it("무형상품 수주는 제외", () => {
    expect(buildMonthCandidates("2026-07", [ord("o1", "2026-07", "S1", "용역", 1, "무형상품")], {}, [])).toHaveLength(0);
  });
});
