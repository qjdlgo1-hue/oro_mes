import { describe, it, expect } from "vitest";
import { finSummary } from "../finance";
import { FinAccount } from "../db";

const acc = (p: Partial<FinAccount>): FinAccount =>
  ({ id: "1", bank_code: "003", name: "보통예금", alias: "", acct_type: "CHECKING", currency: "KRW", balance: 0, krw_balance: 0, ...p });

describe("자산 요약(finSummary)", () => {
  it("예금/외화/대출을 나눠 합산하고 순현금 = 예금+외화−대출", () => {
    const s = finSummary([
      acc({ id: "a", krw_balance: 100 }),
      acc({ id: "b", krw_balance: 50 }),
      acc({ id: "c", acct_type: "FX", currency: "USD", balance: 10, krw_balance: 30 }),
      acc({ id: "d", acct_type: "LOAN", krw_balance: 120 }),
    ]);
    expect(s).toEqual({ checking: 150, fx: 30, loan: 120, net: 60 });
  });
  it("빈 목록·잘못된 값은 0 처리", () => {
    expect(finSummary([])).toEqual({ checking: 0, fx: 0, loan: 0, net: 0 });
    expect(finSummary([acc({ krw_balance: NaN as any })]).checking).toBe(0);
  });
});
