import { describe, it, expect } from "vitest";
import { ecountItemToItem, ecountSafeQty, erpBalanceMap, PROD_TYPE_GUBUN, buildProdBulk, buildPurchaseBulk } from "../ecount";

describe("ecountItemToItem — 이카운트 품목 응답 → MES Item", () => {
  it("필드 매핑 + 품목구분 코드 변환", () => {
    const it0 = ecountItemToItem({ PROD_CD: "A0011", PROD_DES: "PGC", SIZE_DES: "500g", UNIT: "g", PROD_TYPE: "0" })!;
    expect(it0).toMatchObject({ code: "A0011", name: "PGC", spec: "500g", gubun: "원재료", unit: "g", active: true });
    expect(PROD_TYPE_GUBUN["2"]).toBe("반제품");
  });
  it("기본값 — 단위 없으면 g, 구분 없으면 제품, 이름 없으면 코드", () => {
    const it1 = ecountItemToItem({ PROD_CD: "C0002" })!;
    expect(it1).toMatchObject({ code: "C0002", name: "C0002", gubun: "제품", unit: "g", spec: "" });
  });
  it("사용중단(DEL_GUBUN=Y)은 비활성, 코드·이름 둘 다 없으면 null", () => {
    expect(ecountItemToItem({ PROD_CD: "X1", PROD_DES: "중단품", DEL_GUBUN: "Y" })!.active).toBe(false);
    expect(ecountItemToItem({ SIZE_DES: "규격만" })).toBeNull();
  });
  it("안전재고 — 콤마 문자열 허용, 없으면 0", () => {
    expect(ecountSafeQty({ SAFE_QTY: "1,500" })).toBe(1500);
    expect(ecountSafeQty({})).toBe(0);
  });
});

describe("erpBalanceMap — 재고현황 응답 → 코드별 잔량", () => {
  it("같은 코드(창고별 복수 행)는 합산, 코드 없는 행은 무시", () => {
    const m = erpBalanceMap([
      { PROD_CD: "A0011", BAL_QTY: "1,000" },
      { PROD_CD: "A0011", BAL_QTY: 250.5 },
      { PROD_CD: "C0002", BAL_QTY: "30" },
      { PROD_CD: "", BAL_QTY: "999" },
    ]);
    expect(m.get("A0011")).toBe(1250.5);
    expect(m.get("C0002")).toBe(30);
    expect(m.size).toBe(2);
  });
});

describe("전표 전송 페이로드 빌더", () => {
  it("생산입고 — 행별 개별 전표번호 + YYYYMMDD 날짜", () => {
    const b = buildProdBulk([
      { code: "C0002", qty: 500, date: "2026-07-20" },
      { code: "B0013", qty: 55, date: "2026-07-21" },
    ]);
    expect(b[0]).toEqual({ UPLOAD_SER_NO: "1", PROD_CD: "C0002", QTY: "500", IO_DATE: "20260720" });
    expect(b[1].UPLOAD_SER_NO).toBe("2");
  });
  it("구매입력 — 공급가액 있으면 그대로 + 부가세 10% 자동, 거래처코드 선택", () => {
    const [d] = buildPurchaseBulk([{ code: "A0011", qty: 1000, date: "2026-07-20", supply: 150000, cust: "00015" }]);
    expect(d).toMatchObject({ PROD_CD: "A0011", QTY: "1000", IO_DATE: "20260720", SUPPLY_AMT: "150000", VAT_AMT: "15000", CUST: "00015" });
    expect(d.PRICE).toBeUndefined();
  });
  it("구매입력 — 단가만 있으면 공급가액=수량×단가 반올림, 금액 정보 없으면 금액 필드 생략", () => {
    const [a] = buildPurchaseBulk([{ code: "A0011", qty: 3, date: "2026-07-20", price: 333.4 }]);
    expect(a.SUPPLY_AMT).toBe("1000"); // 3 × 333.4 = 1000.2 → 반올림
    expect(a.VAT_AMT).toBe("100");
    const [b] = buildPurchaseBulk([{ code: "A0011", qty: 3, date: "2026-07-20" }]);
    expect(b.SUPPLY_AMT).toBeUndefined();
    expect(b.VAT_AMT).toBeUndefined();
    expect(b.CUST).toBeUndefined();
  });
});
