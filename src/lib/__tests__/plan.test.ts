import { describe, it, expect } from "vitest";
import { addDays, completionDate, daysInMonth, weekBuckets } from "../plan";

describe("plan 날짜 계산", () => {
  it("addDays 월 경계", () => {
    expect(addDays("2026-06-29", 4)).toBe("2026-07-03");
    expect(addDays("2026-01-01", 0)).toBe("2026-01-01");
  });
  it("생산완료일 = 시작일+기간-1", () => {
    expect(completionDate({ order_id: "x", start_date: "2026-06-10", span: 3, done: false })).toBe("2026-06-12");
    expect(completionDate({ order_id: "x", start_date: "2026-06-04", span: 1, done: false })).toBe("2026-06-04");
    expect(completionDate(undefined)).toBeNull();
  });
  it("daysInMonth", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 6)).toBe(30);
  });
  it("weekBuckets 월요일 기준(부분주 처리)", () => {
    expect(weekBuckets(2026, 1, "mon").map(b => b.label)).toEqual(["1~4", "5~11", "12~18", "19~25", "26~31"]);
    expect(weekBuckets(2026, 2, "mon")[0].label).toBe("1~1"); // 2/1=일요일
  });
  it("weekBuckets 1일 기준", () => {
    expect(weekBuckets(2026, 1, "first").map(b => b.label)).toEqual(["1~7", "8~14", "15~21", "22~28", "29~31"]);
  });
});
