import { describe, it, expect } from "vitest";
import { buildBomIndex } from "../bom";
import { BomRow, inoutSig, pcSig } from "../db";
import { expandReceiptConsumes, buildReceiptPayload } from "../receipt";

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
