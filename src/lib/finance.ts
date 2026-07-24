// 자산 요약 집계 — 계좌 스냅샷에서 예금/외화/대출(부채)/순현금 계산
import { FinAccount } from "./db";

export type FinSummary = { checking: number; fx: number; loan: number; net: number };

export function finSummary(accounts: FinAccount[]): FinSummary {
  let checking = 0, fx = 0, loan = 0;
  for (const a of accounts) {
    const krw = Number(a.krw_balance) || 0;
    if (a.acct_type === "LOAN") loan += krw;
    else if (a.acct_type === "FX") fx += krw;
    else checking += krw;
  }
  return { checking, fx, loan, net: checking + fx - loan };
}
