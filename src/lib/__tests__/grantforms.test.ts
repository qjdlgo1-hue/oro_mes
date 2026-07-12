import { describe, it, expect } from "vitest";
import {
  FORMS, FORM_PRESETS, EXPENSE_ITEMS, calcTotal, money, shortDate, korShortDate, dateParts, docAmount, settleSummary,
  PROGRAMS, TD_FORMS, TD_ITEMS, TD_PRESETS, TD_EVIDENCE, TD_ITEM_GROUP,
} from "../grantforms";

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
  it("건 집행액: 지급액 → 합계 → 단가×수량 → 용역금액 순", () => {
    expect(docAmount({ payAmount: "1,000,000", total: "900000" })).toBe(1000000);
    expect(docAmount({ total: "900,000" })).toBe(900000);
    expect(docAmount({ unitPrice: "300000", qty: "3" })).toBe(900000);
    expect(docAmount({ svcAmount: "5,500,000" })).toBe(5500000);
    expect(docAmount({})).toBe(0);
  });
  it("정산 집계: 항목별 건수·집행액·예산 합계", () => {
    const docs = [
      { expense_item: "기계장치비", data: { payAmount: "3,300,000" } },
      { expense_item: "기계장치비", data: { total: "700000" } },
      { expense_item: "외주용역비", data: { svcAmount: "5,000,000" } },
    ];
    const s = settleSummary(docs, { "기계장치비": "10,000,000" });
    expect(s.totalAmount).toBe(9000000);
    expect(s.totalBudget).toBe(10000000);
    const mach = s.lines.find(l => l.item === "기계장치비")!;
    expect(mach.count).toBe(2);
    expect(mach.amount).toBe(4000000);
    expect(mach.budget).toBe(10000000);
    // 예산만 입력된 항목도 표에 나타남
    const s2 = settleSummary([], { "재료비": "2000000" });
    expect(s2.lines.map(l => l.item)).toContain("재료비");
  });
  it("기술닥터: 세목 8종 모두 프리셋·증빙·비목그룹 보유, 프리셋 서식 키 유효", () => {
    expect(PROGRAMS.map(p => p.key)).toEqual(["cud", "td"]);
    const keys = new Set(TD_FORMS.map(f => f.key));
    expect(keys.size).toBe(TD_FORMS.length); // 서식 키 중복 없음
    expect(keys.has("t4")).toBe(true); // 결과보고서(제4호) 등록
    TD_ITEMS.forEach(it => {
      expect(TD_PRESETS[it]?.length).toBeGreaterThan(0);
      expect(TD_EVIDENCE[it]?.docs.length).toBeGreaterThan(0);
      expect(["인건비", "직접비", "기타"]).toContain(TD_ITEM_GROUP[it]);
    });
    Object.values(TD_PRESETS).flat().forEach(k => expect(keys.has(k)).toBe(true));
  });
  it("기술닥터: 원장(ledger) 합계로 집행액 산정 + 세목 순 집계", () => {
    const data = { ledger: [{ item: "(실험)재료비", amount: "1,000,000" }, { item: "외주용역비", amount: "2000000" }], tdTax: "30000" };
    expect(docAmount(data)).toBe(3030000);
    const s = settleSummary([{ expense_item: "(실험)재료비", data }], {}, TD_ITEMS);
    expect(s.totalAmount).toBe(3030000);
    expect(s.lines[0].item).toBe("(실험)재료비");
  });
});
