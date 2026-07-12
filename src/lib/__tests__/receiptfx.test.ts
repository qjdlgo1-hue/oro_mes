import { describe, it, expect } from "vitest";
import { fxToKrw, isOversea, OVERSEA_ACCOUNT, OVERSEA_RTYPE, TRIP_SUBCATS, TRIP_CHECKLIST } from "../receiptfx";

describe("receiptfx (해외출장 증빙)", () => {
  it("외화×환율 원화 환산 (원 단위 반올림)", () => {
    expect(fxToKrw(120.5, 1390)).toBe(167495);
    expect(fxToKrw("1,000", "9.15")).toBe(9150); // JPY 100엔당이 아닌 1엔 기준 입력
    expect(fxToKrw(0, 1390)).toBeNull();
    expect(fxToKrw(100, 0)).toBeNull();
    expect(fxToKrw("", "")).toBeNull();
  });
  it("해외 여부 판정: 계정 또는 증빙유형", () => {
    expect(isOversea({ account: OVERSEA_ACCOUNT, rtype: "카드" })).toBe(true);
    expect(isOversea({ account: "여비교통비", rtype: OVERSEA_RTYPE })).toBe(true);
    expect(isOversea({ account: "여비교통비", rtype: "카드" })).toBe(false);
  });
  it("세부항목·체크리스트 정의", () => {
    expect(TRIP_SUBCATS).toContain("항공료");
    expect(TRIP_SUBCATS).toContain("일비");
    expect(TRIP_CHECKLIST.length).toBeGreaterThanOrEqual(6);
  });
});
