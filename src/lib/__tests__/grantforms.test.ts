import { describe, it, expect } from "vitest";
import { FORMS, FORM_PRESETS, EXPENSE_ITEMS, calcTotal, money, shortDate, korShortDate, dateParts } from "../grantforms";

describe("grantforms", () => {
  it("프리셋의 서식 키는 모두 레지스트리에 존재", () => {
    const keys = new Set(FORMS.map(f => f.key));
    Object.values(FORM_PRESETS).flat().forEach(k => expect(keys.has(k)).toBe(true));
  });
  it("지출항목 9종 모두 프리셋 보유", () => {
    EXPENSE_ITEMS.forEach(it => expect(FORM_PRESETS[it]?.length).toBeGreaterThan(0));
  });
  it("단가×수량 합계", () => {
    expect(calcTotal("1,500,000", "2")).toBe(3000000);
    expect(calcTotal("", "2")).toBeNull();
    expect(calcTotal("abc", "2")).toBeNull();
  });
  it("금액·날짜 표기", () => {
    expect(money(1234567)).toBe("1,234,567");
    expect(shortDate("2026-07-09")).toBe("26. 07. 09.");
    expect(korShortDate("2026-07-09")).toBe("26년 07월 09일");
    expect(dateParts("2026-07-09")).toEqual({ y: "2026", m: "7", d: "9" });
    expect(dateParts("")).toEqual({ y: "", m: "", d: "" });
  });
});
