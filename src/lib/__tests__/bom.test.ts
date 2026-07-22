import { describe, it, expect } from "vitest";
import { BomRow } from "../db";
import { buildBomIndex, explode, explodeAll, resolveProd, explodeByItem } from "../bom";
import { parseBomText } from "../parseBom";

const br = (prod_code: string, prod_name: string, process: string, mat_code: string, mat_name: string, batch_qty: number, qty: number): BomRow =>
  ({ prod_code, prod_name, process, version: "기본", mat_code, mat_name, batch_qty, qty });

// 실데이터(이카운트 BOM(소요량)현황) 축소판:
// 시빙: ACA2532(B0013) ← Schultz 1:1 / 도금: ACC2532-G20A(C0002) ← PGC 11, KCN 50, HCl 30, ACA2532 50 (기준 55)
const ROWS: BomRow[] = [
  br("B0013", "ACA2532", "시빙", "A0016", "Schultz", 1, 1),
  br("C0002", "ACC2532-G20A", "도금", "A0011", "PGC", 55, 11),
  br("C0002", "ACC2532-G20A", "도금", "A0013", "KCN", 55, 50),
  br("C0002", "ACC2532-G20A", "도금", "A0015", "HCl", 55, 30),
  br("C0002", "ACC2532-G20A", "도금", "B0013", "ACA2532", 55, 50),
];

describe("explode — BOM 소요량 전개", () => {
  const idx = buildBomIndex(ROWS);
  it("단일 단계: 시빙품 100g → Schultz 100g (1:1)", () => {
    expect(explode(idx, "ACA2532", 100)).toEqual([{ key: "A0016", code: "A0016", name: "Schultz", qty: 100 }]);
  });
  it("다단계: 도금품 55g → 반제품(ACA2532 50g)이 원분말 Schultz 50g으로 전개", () => {
    const m = Object.fromEntries(explode(idx, "ACC2532-G20A", 55).map(x => [x.name, x.qty]));
    expect(m).toEqual({ PGC: 11, KCN: 50, HCl: 30, Schultz: 50 }); // ACA2532는 말단이 아니라 Schultz로
  });
  it("수량 비례: 도금품 110g(기준 55의 2배) → 전부 2배", () => {
    const m = Object.fromEntries(explode(idx, "ACC2532-G20A", 110).map(x => [x.name, x.qty]));
    expect(m.PGC).toBe(22);
    expect(m.Schultz).toBe(100);
  });
  it("BOM 미등록 제품 → 빈 배열", () => {
    expect(explode(idx, "없는제품", 100)).toEqual([]);
  });
  it("순환 참조가 있어도 무한루프 없이 종료", () => {
    const cyc = buildBomIndex([
      br("X1", "제품X", "공정", "Y1", "제품Y", 10, 5),
      br("Y1", "제품Y", "공정", "X1", "제품X", 10, 5),
      br("Y1", "제품Y", "공정", "A1", "재료A", 10, 2),
    ]);
    const m = explode(cyc, "제품X", 10);
    // X → Y(5) → [X는 순환이라 말단 취급, 재료A 1g]
    expect(m.find(x => x.name === "재료A")?.qty).toBe(1);
    expect(m.find(x => x.name === "제품X")?.qty).toBe(2.5); // 순환 지점은 말단으로 집계
  });
  it("explodeAll — 여러 제품 합산", () => {
    const tot = explodeAll(idx, [{ name: "ACA2532", qty: 50 }, { name: "ACC2532-G20A", qty: 55 }]);
    expect(tot.get("A0016")?.qty).toBe(100); // 50(직접) + 50(도금품 경유)
  });
});

describe("parseBomText — 이카운트 BOM(소요량)현황 붙여넣기", () => {
  const text = [
    "회사명 : 오알오 (주)",
    "생산품목코드\t생산품목명\t생산공정명\tBOM버전\t소모품목코드\t소모품목명\t생산수량\t소요량",
    "B0013\tACA2532\t시빙\t기본\tA0016\tSchultz\t1\t1",
    "C0002\tACC2532-G20A\t도금\t기본\tA0011\tPGC\t55\t11",
    "C0002\tACC2532-G20A\t도금\t기본\tB0013\tACA2532\t55\t50",
  ].join("\n");
  it("머리글 자동 인식 + 회사명 줄 무시", () => {
    const rows = parseBomText(text);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ prod_code: "B0013", prod_name: "ACA2532", process: "시빙", mat_code: "A0016", mat_name: "Schultz", batch_qty: 1, qty: 1 });
    expect(rows[1]).toMatchObject({ prod_name: "ACC2532-G20A", batch_qty: 55, qty: 11 });
  });
  it("같은 (제품, 원재료) 중복 행은 마지막 값 유지", () => {
    const dup = parseBomText(text + "\nC0002\tACC2532-G20A\t도금\t기본\tA0011\tPGC\t55\t99");
    const pgc = dup.filter(r => r.mat_name === "PGC");
    expect(pgc).toHaveLength(1);
    expect(pgc[0].qty).toBe(99);
  });
  it("머리글 없으면 빈 배열", () => {
    expect(parseBomText("아무 내용\t없음")).toEqual([]);
  });
});

describe("resolveProd / explodeByItem — 품목코드 우선 매칭", () => {
  const idx = buildBomIndex(ROWS);
  it("코드 정확 일치 우선 (이름이 달라도 연동)", () => {
    expect(resolveProd(idx, { code: "C0002", name: "표기다른이름" })).toBe("ACC2532-G20A");
  });
  it("코드 불일치 시 이름 폴백", () => {
    expect(resolveProd(idx, { code: "X9999", name: "ACA2532" })).toBe("ACA2532");
    expect(resolveProd(idx, { name: "ACA2532" })).toBe("ACA2532");
  });
  it("둘 다 불일치 → null / explodeByItem 빈 배열", () => {
    expect(resolveProd(idx, { code: "X9999", name: "없는제품" })).toBeNull();
    expect(explodeByItem(idx, { code: "X9999", name: "없는제품" }, 100)).toEqual([]);
  });
  it("explodeByItem 코드 진입 전개 = 이름 진입과 동일", () => {
    expect(explodeByItem(idx, { code: "C0002", name: "" }, 55)).toEqual(explode(idx, "ACC2532-G20A", 55));
  });
});
