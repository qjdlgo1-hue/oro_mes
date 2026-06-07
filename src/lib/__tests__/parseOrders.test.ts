import { describe, it, expect } from "vitest";
import { parsePaste, parseRows } from "../parseOrders";

const TAB = [
  "일자-No.\t일자\t품목코드\t품목구분\t품목명\t규격\t수량\t단가\t공급가액\t거래처명\t적요",
  "2026/06/04 -2\t2026/06/04\tC0003\t제품\tACC3245-G20A\t32-45um : Ni+Au(0.2um)\t1,000.0\t38,200.00\t38,200,000.00\t주식회사 엠에스엘\t",
  "2026/06 계\t\t\t\t\t\t1,000.0\t\t52,900,000.00\t\t",
].join("\n");

describe("주문 파서", () => {
  it("붙여넣기: 헤더·소계 제외, 데이터만", () => {
    const r = parsePaste(TAB);
    expect(r.length).toBe(1);
    expect(r[0].name).toBe("ACC3245-G20A");
    expect(r[0].qty).toBe(1000);
    expect(r[0].order_date).toBe("2026-06-04");
    expect(r[0].ym).toBe("2026-06");
    expect(r[0].customer).toBe("주식회사 엠에스엘");
  });
  it("엑셀 행 배열", () => {
    const rows = [
      ["일자-No.", "일자", "품목코드", "품목구분", "품목명", "규격", "수량", "단가", "공급가액", "거래처명", "적요"],
      ["2026/06/06 -1", "2026/06/06", "C0064", "제품", "ACD3245-S150G10A", "MSL_32-45um", 700, 0, 0, "엠에스엘", "급함"],
    ];
    const r = parseRows(rows as any);
    expect(r.length).toBe(1);
    expect(r[0].qty).toBe(700);
    expect(r[0].note).toBe("급함");
  });
});
