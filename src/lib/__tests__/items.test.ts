import { describe, it, expect } from "vitest";
import { collectItemCandidates, parseItemsText } from "../items";
import { Order } from "../types";
import { InoutRow, BomRow, Item } from "../db";

const od = (item_code: string, name: string, spec: string, gubun: string): Order =>
  ({ id: "o", order_no: "", order_date: "2026-07-01", ym: "2026-07", item_code, gubun, name, spec, qty: 1, customer: "", note: "" });
const io = (item_code: string, name: string, gubun = ""): InoutRow =>
  ({ kind: "purchase", ym: "2026-07", idate: "2026-07-01", item_code, name, spec: "", qty: 1, gubun, sig: item_code + name } as InoutRow);
const br = (prod_code: string, prod_name: string, mat_code: string, mat_name: string): BomRow =>
  ({ prod_code, prod_name, process: "", version: "기본", mat_code, mat_name, batch_qty: 50, qty: 1 });

describe("collectItemCandidates — 미등록 품목 후보 수집", () => {
  it("소스 병합 + 구분 자동 추정 (B=반제품, 말단 소모품=원재료, gubun 우선)", () => {
    const cands = collectItemCandidates(
      [od("C0002", "ACC2532-G20A", "25-32um", "제품")],
      [], [], [io("A0011", "PGC", "")],
      [br("B0013", "ACA2532", "A0016", "Schultz"), br("C0002", "ACC2532-G20A", "B0013", "ACA2532")],
      [],
    );
    const g = Object.fromEntries(cands.map(c => [c.code, c.gubun]));
    expect(g["C0002"]).toBe("제품");     // 주문 gubun 우선
    expect(g["B0013"]).toBe("반제품");   // BOM 생산품목 B접두
    expect(g["A0016"]).toBe("원재료");   // 말단 소모품목
    expect(g["A0011"]).toBe("원재료");   // 구매 기본값
    // ACA2532는 B0013 하나로 병합(소모품목이자 생산품목) — 중복 없음
    expect(cands.filter(c => c.name === "ACA2532")).toHaveLength(1);
  });
  it("이미 등록된 품목(코드 일치)은 제외", () => {
    const existing: Item[] = [{ code: "C0002", name: "ACC2532-G20A", spec: "", gubun: "제품", unit: "g", active: true }];
    const cands = collectItemCandidates([od("C0002", "표기다른이름", "", "제품")], [], [], [], [], existing);
    expect(cands).toHaveLength(0); // 같은 코드는 이름이 달라도 등록된 것으로 간주
  });
  it("코드 없는 품목은 이름으로 병합·중복 제외", () => {
    const cands = collectItemCandidates([od("", "무코드품", "", "제품"), od("", "무코드품", "규격", "제품")], [], [], [], [], []);
    expect(cands).toHaveLength(1);
    expect(cands[0].spec).toBe("규격"); // 뒤 행의 규격 보강
  });
});

describe("parseItemsText — 이카운트 품목등록 리스트 붙여넣기", () => {
  it("헤더 자동 인식 + 구분 대괄호 제거", () => {
    const rows = parseItemsText([
      "품목코드\t품목명\t품목구분\t규격\t단위",
      "A0011\tPGC\t[원재료]\t500g\tg",
      "C0002\tACC2532-G20A\t[제품]\t25-32um\tg",
    ].join("\n"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ code: "A0011", name: "PGC", gubun: "원재료", spec: "500g", unit: "g" });
    expect(rows[1].gubun).toBe("제품");
  });
  it("머리글 없으면 빈 배열", () => {
    expect(parseItemsText("아무거나")).toEqual([]);
  });
});
