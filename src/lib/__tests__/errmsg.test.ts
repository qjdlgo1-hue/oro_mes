import { describe, it, expect } from "vitest";
import { errMsg } from "../errmsg";

describe("errMsg", () => {
  it("네트워크 오류를 한국어로 변환", () => {
    expect(errMsg(new TypeError("Failed to fetch"))).toContain("네트워크 오류");
  });
  it("RLS/권한 오류를 안내", () => {
    expect(errMsg({ message: 'new row violates row-level security policy for table "orders"' })).toContain("권한이 없습니다");
  });
  it("세션 만료를 안내", () => {
    expect(errMsg({ message: "JWT expired" })).toContain("세션이 만료");
  });
  it("중복 키를 안내", () => {
    expect(errMsg({ message: 'duplicate key value violates unique constraint "orders_pkey"' })).toContain("중복");
  });
  it("알 수 없는 오류는 원문을 짧게 포함", () => {
    const m = errMsg({ message: "weird custom failure" });
    expect(m).toContain("weird custom failure");
    expect(m).toContain("관리자");
  });
  it("문자열/빈 값도 처리", () => {
    expect(errMsg("timeout while connecting")).toContain("시간이 초과");
    expect(typeof errMsg(undefined)).toBe("string");
  });
});
