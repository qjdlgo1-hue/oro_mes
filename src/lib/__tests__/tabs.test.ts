import { describe, it, expect } from "vitest";
import { labelOf, TAB_DEFS } from "../tabs";

describe("메뉴 표시 이름(labelOf)", () => {
  it("사용자 지정 이름이 있으면 우선", () => {
    expect(labelOf("stock", { stock: { label: "재고관리" } })).toBe("재고관리");
  });
  it("지정 이름이 없거나 빈 값이면 기본 라벨", () => {
    expect(labelOf("stock")).toBe("재고");
    expect(labelOf("stock", {})).toBe("재고");
    expect(labelOf("stock", { stock: { label: "" } })).toBe("재고");
    expect(labelOf("stock", { stock: { label: null } })).toBe("재고");
  });
  it("모든 탭 키가 기본 라벨을 가진다", () => {
    TAB_DEFS.forEach(t => expect(labelOf(t.key)).toBe(t.label));
  });
});
