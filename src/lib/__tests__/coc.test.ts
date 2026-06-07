import { describe, it, expect } from "vitest";
import { parseSpec, gravitySpec, addYear } from "../coc";

describe("COC 헬퍼", () => {
  it("규격 분해(콜론형)", () => {
    expect(parseSpec("25-32um : Ni+Au(0.2um)")).toEqual({ size: "25-32um", comp: "Ni+Au(0.2um)" });
    expect(parseSpec("MSL_16-25um : Ni+Ag(1.5um)+Au(0.1um)")).toEqual({ size: "16-25um", comp: "Ni+Ag(1.5um)+Au(0.1um)" });
  });
  it("비중 규격", () => {
    expect(gravitySpec("25-32um")).toBe("9.5 ± 0.05");
    expect(gravitySpec("32-45um")).toBe("9.3 ± 0.05");
  });
  it("유효기간 = 생산일+1년-1일", () => {
    expect(addYear("2026-05-30")).toBe("2027-05-29");
    expect(addYear("")).toBe("");
  });
});
