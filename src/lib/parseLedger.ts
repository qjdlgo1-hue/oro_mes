// 이카운트 [재고수불부] 엑셀 파서 — 품목별 섹션(제목행 + 헤더 + 일자별 거래 + 월계/합계)을
// MES 데이터 4종으로 분류한다:
//   [생산I/II] 입고  → InoutRow kind 'in'   (생산입고)
//   [소모I/II] 출고  → ProdConsume          (mat=현재 품목, prod_name=적요열의 소비 제품명)
//   거래처명   입고  → InoutRow 'purchase'  / 거래처명 출고 → InoutRow 'out' (판매)
//   [조정]/[자가]/[불량]/적요없음 → StockBase 'adj' (부호 = 입고 − 출고)
// 열 구성(0-base): 0 일자 · 1 코드 · 2 품명 · 3 규격 · 4 거래처명/유형 · 5 적요 ·
//                  6 입고수량 · 7 출고수량 · 8 재고수량 · 10 입고금액 · 12 출고금액
import { InoutRow, ProdConsume, StockBase, inoutSig, pcSig } from "./db";

export type LedgerParsed = {
  inout: InoutRow[];                 // in / out / purchase 혼합
  consumes: ProdConsume[];
  adjs: StockBase[];
  summary: { kind: string; count: number; qty: number }[]; // 유형별 요약
  years: Record<string, number>;     // 연도별 행수
  skipped: number;                   // 해석 못한 거래 행 수
};

const num = (v: any) => { const x = Number(String(v ?? "").replace(/,/g, "")); return isNaN(x) ? 0 : x; };
const s = (v: any) => String(v ?? "").trim();

export function parseEcountLedger(aoa: any[][]): LedgerParsed {
  let cur = { code: "", name: "", spec: "" };
  const inout: InoutRow[] = [];
  const consumes: ProdConsume[] = [];
  const adjs: StockBase[] = [];
  const years: Record<string, number> = {};
  let skipped = 0;

  for (const r of aoa) {
    const c0 = s(r[0]);
    // 품목 섹션 제목: "... / 품명 [규격] (코드)"
    if (c0.startsWith("회사명")) {
      const m = c0.match(/\/\s*([^/\[\]]+?)\s*\[(.*?)\]\s*\((\S+)\)\s*$/);
      if (m) cur = { name: m[1].trim(), spec: m[2].trim(), code: m[3].trim() };
      continue;
    }
    if (c0 === "일자" || /계$/.test(c0)) continue;           // 헤더·월계·합계 행
    if (!/^\d{4}-\d{2}-\d{2}/.test(c0)) continue;             // 그 외 잡행
    const idate = c0.slice(0, 10);
    const ym = idate.slice(0, 7);
    const memo = s(r[4]);
    const detail = s(r[5]);
    const inQ = num(r[6]), outQ = num(r[7]);
    // 행의 품목: 거래 행에도 코드/품명이 있으면 우선, 없으면 섹션 값
    const code = s(r[1]) || cur.code, name = s(r[2]) || cur.name, spec = s(r[3]) || cur.spec;
    years[idate.slice(0, 4)] = (years[idate.slice(0, 4)] || 0) + 1;

    if (/^\[생산/.test(memo)) {
      const base = { kind: "in" as const, ym, idate, item_code: code, name, spec, qty: inQ, gubun: code.startsWith("B") ? "반제품" : "제품", note: "수불부" };
      inout.push({ ...base, sig: inoutSig(base) });
    } else if (/^\[소모/.test(memo)) {
      const base = { ym, idate, prod_code: "", prod_name: detail || "(미상)", mat_code: code, mat_name: name, act_qty: outQ };
      consumes.push({ ...base, sig: pcSig(base) });
    } else if (/^\[(조정|자가|불량)/.test(memo) || (!memo && (inQ || outQ))) {
      const label = memo ? memo.replace(/[\[\]]/g, "").split(" ")[0] : "이월/기초";
      adjs.push({
        kind: "adj", cat: code.startsWith("A") ? "material" : "product",
        item_code: code, name, spec, bdate: idate, qty: inQ - outQ,
        note: `${label}(수불부)${detail ? " " + detail : ""}`,
      });
    } else if (memo && inQ > 0) {
      const base = { kind: "purchase" as const, ym, idate, item_code: code, name, spec, qty: inQ, amount: num(r[10]) || null, customer: memo, gubun: "원재료", note: "수불부" };
      inout.push({ ...base, sig: inoutSig(base) });
    } else if (memo && outQ > 0) {
      const base = { kind: "out" as const, ym, idate, item_code: code, name, spec, qty: outQ, amount: num(r[12]) || null, customer: memo, note: "수불부" };
      inout.push({ ...base, sig: inoutSig(base) });
    } else {
      skipped++;
    }
  }

  const cnt = (k: string, list: { qty?: number; act_qty?: number }[]) =>
    ({ kind: k, count: list.length, qty: Math.round(list.reduce((t, x) => t + Math.abs(Number((x as any).qty ?? (x as any).act_qty) || 0), 0)) });
  const summary = [
    cnt("생산입고", inout.filter(r => r.kind === "in")),
    cnt("판매출고", inout.filter(r => r.kind === "out")),
    cnt("구매입고", inout.filter(r => r.kind === "purchase")),
    cnt("생산소모", consumes),
    cnt("조정/기초", adjs),
  ];
  return { inout, consumes, adjs, summary, years, skipped };
}
