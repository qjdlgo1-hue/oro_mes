// 이카운트 [BOM(소요량)현황] 붙여넣기/엑셀 → BomRow[].
// 열: 생산품목코드 | 생산품목명 | 생산공정명 | BOM버전 | 소모품목코드 | 소모품목명 | 생산수량 | 소요량
// 헤더에서 열 위치를 자동 인식한다 (parseInout/parseProdConsume과 같은 방식).
import { BomRow } from "./db";

const splitCells = (l: string) => (l.includes("\t") ? l.split("\t") : l.split(/\s{2,}/)).map(s => s.trim());
const toNum = (s: any) => { const v = parseFloat(String(s ?? "").replace(/,/g, "")); return isNaN(v) ? 0 : v; };

// 셀 배열(엑셀 시트 or 붙여넣기 분해 결과) → BomRow[]
export function parseBomCells(rows: any[][]): BomRow[] {
  // 헤더 행 찾기: "생산품목"과 "소요량"이 함께 있는 행 (앞의 "회사명 :" 줄 등은 건너뜀)
  let hi = -1, pc = -1, pn = -1, pr = -1, vr = -1, mc = -1, mn = -1, bq = -1, qi = -1;
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const c = rows[i].map(x => String(x ?? "").replace(/\s/g, ""));
    const f = (kw: string) => c.findIndex(x => x.includes(kw));
    if (f("생산품목") > -1 && f("소요량") > -1) {
      hi = i;
      pc = f("생산품목코드"); pn = f("생산품목명");
      pr = f("공정"); vr = f("버전");
      mc = f("소모품목코드"); mn = f("소모품목명");
      bq = f("생산수량"); qi = f("소요량");
      break;
    }
  }
  if (hi < 0 || pn < 0 || mn < 0 || qi < 0) return [];
  const out: BomRow[] = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const c = rows[i];
    const prodName = String(c[pn] ?? "").trim();
    const matName = String(c[mn] ?? "").trim();
    if (!prodName || !matName) continue;                 // 빈 줄·소계 제외
    if (prodName.includes("품목명")) continue;           // 반복 헤더 제외
    out.push({
      prod_code: pc >= 0 ? String(c[pc] ?? "").trim() : "",
      prod_name: prodName,
      process: pr >= 0 ? String(c[pr] ?? "").trim() : "",
      version: vr >= 0 ? (String(c[vr] ?? "").trim() || "기본") : "기본",
      mat_code: mc >= 0 ? String(c[mc] ?? "").trim() : "",
      mat_name: matName,
      batch_qty: bq >= 0 ? (toNum(c[bq]) || 1) : 50,
      qty: toNum(c[qi]),
    });
  }
  // 같은 (제품, 원재료) 중복 행은 마지막 값 유지 (unique 제약과 일치)
  const seen = new Map<string, BomRow>();
  out.forEach(r => seen.set(`${r.prod_code}|${r.prod_name}|${r.mat_code}|${r.mat_name}`, r));
  return [...seen.values()];
}

// 텍스트 붙여넣기 → BomRow[]
export function parseBomText(text: string): BomRow[] {
  const lines = text.split(/\r?\n/).map(l => l.replace(/ /g, " ")).filter(l => l.trim());
  return parseBomCells(lines.map(splitCells));
}
