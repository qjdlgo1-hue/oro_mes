import { describe, it, expect } from "vitest";
import { parseEcountLedger } from "../parseLedger";

// 실제 이카운트 재고수불부 구조 축소판
const AOA: any[][] = [
  ["회사명 : 오알오 (주) / 2022-01-01  ~ 2026-07-30  / 재고수불부 / ACA1625 [MSL_1625] (A0001)"],
  ["일자", "품목코드", "품목명", "규격", "거래처명", "적요", "입고수량", "출고수량", "재고수량", "입고단가", "입고금액", "출고단가", "출고금액"],
  ["2022-03-02 ", "A0001", "ACA1625", "MSL_1625", "", "", 563, "", 563, "", "", "", ""],
  ["2022-03-02 ", "A0001", "ACA1625", "MSL_1625", "[소모II]  - 도금공정", "ACC1625-G20A", "", 50, 513, "", "", "", ""],
  ["2022-03  계", "", "", "", "", "", 563, 50, 513, "", "", "", ""],
  ["2022-05-09 ", "A0001", "ACA1625", "MSL_1625", "삼전순약공업(주)", "", 1000, "", 1513, 100, "100,000", "", ""],
  ["2022-06-01 ", "A0001", "ACA1625", "MSL_1625", "[조정] 실사", "", "", 13, 1500, "", "", "", ""],
  ["회사명 : 오알오 (주) / 2022-01-01  ~ 2026-07-30  / 재고수불부 / ACC1625-G20A [16-25um] (C0001)"],
  ["일자", "품목코드", "품목명", "규격", "거래처명", "적요", "입고수량", "출고수량", "재고수량", "입고단가", "입고금액", "출고단가", "출고금액"],
  ["2022-03-05 ", "C0001", "ACC1625-G20A", "16-25um", "[생산II]  - 도금공정", "", 45, "", 45, "", "", "", ""],
  ["2022-03-10 ", "C0001", "ACC1625-G20A", "16-25um", "주식회사 테스트", "", "", 30, 15, "", "", 5000, "150,000"],
  ["2022-03  계", "", "", "", "", "", 45, 30, 15, "", "", "", ""],
  ["2026-07-27 ", "C0001", "ACC1625-G20A", "16-25um", "[자가] 샘플", "", "", 5, 10, "", "", "", ""],
];

describe("parseEcountLedger — 이카운트 재고수불부 분류", () => {
  const p = parseEcountLedger(AOA);
  it("월계/합계·헤더 행 스킵, 유형별 분류", () => {
    expect(p.inout.filter(r => r.kind === "in")).toHaveLength(1);      // [생산II]
    expect(p.inout.filter(r => r.kind === "purchase")).toHaveLength(1); // 삼전순약공업
    expect(p.inout.filter(r => r.kind === "out")).toHaveLength(1);      // 주식회사 테스트
    expect(p.consumes).toHaveLength(1);                                 // [소모II]
    expect(p.adjs).toHaveLength(3);                                     // 적요없음 입고 + [조정] + [자가]
    expect(p.skipped).toBe(0);
  });
  it("소모 행: 자재=현재 품목, 소비 제품명=적요열", () => {
    expect(p.consumes[0]).toMatchObject({ mat_code: "A0001", mat_name: "ACA1625", act_qty: 50, prod_name: "ACC1625-G20A", ym: "2022-03" });
  });
  it("구매/판매: 거래처·금액, 생산입고: gubun 추정", () => {
    const pur = p.inout.find(r => r.kind === "purchase")!;
    expect(pur).toMatchObject({ customer: "삼전순약공업(주)", qty: 1000, amount: 100000 });
    const out = p.inout.find(r => r.kind === "out")!;
    expect(out).toMatchObject({ customer: "주식회사 테스트", qty: 30, amount: 150000, ym: "2022-03" });
    expect(p.inout.find(r => r.kind === "in")!.gubun).toBe("제품"); // C접두
  });
  it("조정 부호와 사유: 적요없음 입고=+이월, [조정]/[자가]=−출고", () => {
    const byNote = (kw: string) => p.adjs.find(a => (a.note || "").includes(kw))!;
    expect(byNote("이월").qty).toBe(563);
    expect(byNote("조정").qty).toBe(-13);
    expect(byNote("자가").qty).toBe(-5);
    expect(byNote("자가").bdate).toBe("2026-07-27");
  });
  it("연도별 집계 + sig 부여", () => {
    expect(p.years["2022"]).toBe(6);
    expect(p.years["2026"]).toBe(1);
    expect(p.inout.every(r => r.sig.length > 0)).toBe(true);
  });
});
