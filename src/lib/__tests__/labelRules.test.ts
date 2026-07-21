import { describe, it, expect } from "vitest";
import { parseModelCode, buildGrade, fmtDate, expiryDate } from "../labelRules";
import { calcCopies } from "../label";

// labelprintspec.md §5·§8의 예시 모델 2종 + 실제 주문 데이터에서 나온 변형들
describe("parseModelCode", () => {
  it("Ag 포함 모델: ACD3245-S150G10A", () => {
    expect(parseModelCode("ACD3245-S150G10A")).toEqual({ s1: 32, s2: 45, ag: 150, au: 10 });
  });
  it("Au 단독 모델: ACC2532-G20A", () => {
    expect(parseModelCode("ACC2532-G20A")).toEqual({ s1: 25, s2: 32, ag: 0, au: 20 });
  });
  it("하이픈 없는 모델(Ni 단독): ACA2532", () => {
    expect(parseModelCode("ACA2532")).toEqual({ s1: 25, s2: 32, ag: 0, au: 0 });
  });
  it("접두어가 붙은 모델: (과제)BCB3245-S100", () => {
    expect(parseModelCode("(과제)BCB3245-S100")).toEqual({ s1: 32, s2: 45, ag: 100, au: 0 });
  });
  it("사이즈가 0으로 시작: ACD0032-S50G20A", () => {
    expect(parseModelCode("ACD0032-S50G20A")).toEqual({ s1: 0, s2: 32, ag: 50, au: 20 });
  });
  it("소문자·공백 허용", () => {
    expect(parseModelCode("  acd3245-s150g10a ")).toEqual({ s1: 32, s2: 45, ag: 150, au: 10 });
  });
  it("파우더가 아닌 제품은 사이즈 null (MEMS PIN, PM-…)", () => {
    expect(parseModelCode("MEMS PIN 3Layer (Au Coated 1um)").s1).toBeNull();
    expect(parseModelCode("MT100 PIN 3Layer").s1).toBeNull();
    const pm = parseModelCode("PM-PD020-NGU");
    expect(pm.s1).toBeNull(); expect(pm.ag).toBe(0); expect(pm.au).toBe(0);
  });
  it("하이픈 뒤 도금 코드의 숫자를 사이즈로 오인하지 않음", () => {
    // 하이픈 앞에 사이즈가 없으면 S150G10의 숫자를 집지 않고 null
    expect(parseModelCode("ACD-S150G10A").s1).toBeNull();
  });
  it("빈 문자열", () => {
    expect(parseModelCode("")).toEqual({ s1: null, s2: null, ag: 0, au: 0 });
  });
});

describe("buildGrade", () => {
  it("Ag+Au: (150,10) → Ni+Ag(1.5um)+Au(0.1um)", () => {
    expect(buildGrade(150, 10)).toBe("Ni+Ag(1.5um)+Au(0.1um)");
  });
  it("Au 단독: (0,20) → Ni+Au(0.2um)", () => {
    expect(buildGrade(0, 20)).toBe("Ni+Au(0.2um)");
  });
  it("Ag 단독: (100,0) → Ni+Ag(1um)", () => {
    expect(buildGrade(100, 0)).toBe("Ni+Ag(1um)");
  });
  it("도금 없음 → Ni", () => {
    expect(buildGrade(0, 0)).toBe("Ni");
  });
});

describe("fmtDate / expiryDate", () => {
  it("라벨 날짜는 0 없이: 2026-07-09 → 2026-7-9", () => {
    expect(fmtDate("2026-07-09")).toBe("2026-7-9");
    expect(fmtDate("2026-12-31")).toBe("2026-12-31");
  });
  it("사용기한 = 제조일 +1년 −1일: 2026-7-9 → 2027-7-8", () => {
    expect(expiryDate("2026-07-09")).toBe("2027-07-08");
    expect(fmtDate(expiryDate("2026-07-09"))).toBe("2027-7-8");
  });
  it("월초 경계: 2026-03-01 → 2027-02-28", () => {
    expect(expiryDate("2026-03-01")).toBe("2027-02-28");
  });
});

describe("calcCopies (매수 = 수량÷포장단위 올림)", () => {
  it("100g ÷ 50g = 2장, 101g ÷ 50g = 3장", () => {
    expect(calcCopies(100, 50)).toBe(2);
    expect(calcCopies(101, 50)).toBe(3);
  });
  it("정확히 나누어떨어지면 그대로: 50÷50=1", () => {
    expect(calcCopies(50, 50)).toBe(1);
  });
  it("비정상 값은 1장", () => {
    expect(calcCopies(0, 50)).toBe(1);
    expect(calcCopies(100, 0)).toBe(1);
  });
});
