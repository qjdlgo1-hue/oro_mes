// 품목 마스터 유틸 — 기존 데이터(주문·생산/판매/구매·BOM)에서 미등록 품목 후보를 수집하고,
// 이카운트 [품목등록 리스트] 붙여넣기를 파싱한다.
import { Order } from "./types";
import { InoutRow, BomRow, Item } from "./db";

export const itemKeyOf = (code?: string, name?: string) => `${(code || "").trim()}|${(name || "").trim()}`;

// 후보 구분 자동 추정 우선순위:
//  1) 주문/입출 데이터의 gubun 값 그대로 (제품/무형상품/원재료 …)
//  2) BOM 생산품목 — 코드 B접두 = 반제품(시빙품), 그 외 = 제품
//  3) BOM 말단 소모품목(다른 BOM의 생산품목이 아닌 것) = 원재료
export function collectItemCandidates(
  orders: Order[], prodIn: InoutRow[], sales: InoutRow[], purchases: InoutRow[],
  bomRows: BomRow[], existing: Item[],
): Item[] {
  const seen = new Set<string>();
  existing.forEach(it => {
    seen.add(itemKeyOf(it.code, it.name));
    if (it.code) seen.add(`${it.code.trim()}|`);       // 같은 코드는 이름이 달라도 등록된 것으로 간주
    if (it.name) seen.add(`|${it.name.trim()}`);       // 코드 없는 기존 항목의 이름 매칭
  });
  const m = new Map<string, Item>();
  const put = (code: string, name: string, spec: string, gubun: string) => {
    const c = (code || "").trim(), n = (name || "").trim();
    if (!n) return;
    if (seen.has(itemKeyOf(c, n)) || (c && seen.has(`${c}|`)) || seen.has(`|${n}`)) return;
    const k = c || n; // 코드가 있으면 코드로, 없으면 이름으로 병합
    const e = m.get(k);
    if (e) { if (!e.code && c) e.code = c; if (!e.spec && spec) e.spec = spec.trim(); return; }
    m.set(k, { code: c, name: n, spec: (spec || "").trim(), gubun: gubun || "제품", unit: "g", active: true });
  };

  // 1) 주문·전표 (gubun 보유)
  orders.forEach(o => put(o.item_code, o.name, o.spec, o.gubun || "제품"));
  prodIn.forEach(r => put(r.item_code, r.name, r.spec || "", r.gubun || "제품"));
  sales.forEach(r => put(r.item_code, r.name, r.spec || "", r.gubun || "제품"));
  purchases.forEach(r => put(r.item_code, r.name, r.spec || "", r.gubun || "원재료"));

  // 2) BOM — 생산품목(B=반제품, 그 외 제품), 말단 소모품목 = 원재료
  const prodNames = new Set(bomRows.map(r => r.prod_name));
  const prodCodes = new Set(bomRows.map(r => r.prod_code).filter(Boolean));
  bomRows.forEach(r => put(r.prod_code, r.prod_name, "", r.prod_code.startsWith("B") ? "반제품" : "제품"));
  bomRows.forEach(r => {
    const isSub = prodNames.has(r.mat_name) || (r.mat_code && prodCodes.has(r.mat_code));
    if (!isSub) put(r.mat_code, r.mat_name, "", "원재료");
  });

  // 코드 없는 항목이 코드 있는 항목과 같은 이름이면 중복 — 코드 쪽으로 병합
  const byName = new Map<string, Item>();
  for (const it of m.values()) if (it.code) byName.set(it.name, it);
  for (const [k, it] of [...m.entries()]) {
    if (!it.code && byName.has(it.name)) {
      const coded = byName.get(it.name)!;
      if (!coded.spec && it.spec) coded.spec = it.spec;
      m.delete(k);
    }
  }
  return [...m.values()].sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name));
}

// 이카운트 [품목등록 리스트] 붙여넣기 → Item[] (헤더 자동 인식: 품목코드/품목명/품목구분/규격/단위)
export function parseItemsText(text: string): Item[] {
  const split = (l: string) => (l.includes("\t") ? l.split("\t") : l.split(/\s{2,}/)).map(s => s.trim());
  const lines = text.split(/\r?\n/).map(l => l.replace(/ /g, " ")).filter(l => l.trim());
  let hi = -1, ci = -1, ni = -1, gi = -1, si = -1, ui = -1;
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const c = split(lines[i]).map(x => x.replace(/\s/g, ""));
    const f = (kw: string) => c.findIndex(x => x.includes(kw));
    if (f("품목코드") > -1 && f("품목명") > -1) {
      hi = i; ci = f("품목코드"); ni = f("품목명"); gi = f("품목구분"); si = f("규격"); ui = f("단위");
      break;
    }
  }
  if (hi < 0) return [];
  const out = new Map<string, Item>();
  for (let i = hi + 1; i < lines.length; i++) {
    const c = split(lines[i]);
    const code = (c[ci] || "").trim(), name = (c[ni] || "").trim();
    if (!name || name.includes("품목명")) continue;
    const gubun = gi >= 0 ? (c[gi] || "").replace(/[\[\]\s]/g, "") : "";
    out.set(code || name, {
      code, name,
      spec: si >= 0 ? (c[si] || "").trim() : "",
      gubun: gubun || "제품",
      unit: ui >= 0 ? ((c[ui] || "").trim() || "g") : "g",
      active: true,
    });
  }
  return [...out.values()];
}
