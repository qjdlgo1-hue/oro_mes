import { describe, it, expect } from "vitest";
import { Order } from "../types";
import { mapItemGubun, buildManualOrders } from "../manualOrders";

const base: Order = { id: "", order_no: "수동입력", order_date: "2026-07-24", ym: "", item_code: "", gubun: "제품", name: "", spec: "", qty: 0, customer: "㈜테스트", note: "긴급" };

describe("주문 직접 추가 — 품목 선택 변환", () => {
  it("Item.gubun 6종 → Order.gubun 3종 매핑", () => {
    expect(mapItemGubun("원재료")).toBe("원재료");
    expect(mapItemGubun("무형상품")).toBe("무형상품");
    for (const g of ["제품", "반제품", "상품", "부재료"]) expect(mapItemGubun(g)).toBe("제품");
  });
  it("복수 선택 → 공통 필드(일자·거래처·적요) + 품목별 수량으로 주문 행 생성", () => {
    let n = 0;
    const rows = buildManualOrders(base, [
      { code: "C0002", name: "ACC2532-G20A", spec: "25-32um", gubun: "제품", qty: 100 },
      { code: "A0011", name: "PGC", spec: "", gubun: "원재료", qty: 500 },
    ], () => "id-" + ++n);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "id-1", order_no: "수동입력", ym: "2026-07", item_code: "C0002", name: "ACC2532-G20A", gubun: "제품", qty: 100, customer: "㈜테스트", note: "긴급" });
    expect(rows[1]).toMatchObject({ id: "id-2", item_code: "A0011", gubun: "원재료", qty: 500 });
  });
});
