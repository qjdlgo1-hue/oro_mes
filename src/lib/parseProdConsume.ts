import { ProdConsume, pcSig } from "./db";

const toNum = (x: any) => { const n = parseFloat(String(x ?? "").replace(/,/g, "").trim()); return isNaN(n) ? 0 : n; };
const uid = () => ((crypto as any).randomUUID ? crypto.randomUUID() : "pc-" + Math.random().toString(36).slice(2) + Date.now());
function pDate(v: any): { iso: string; ym: string } | null {
  if (v instanceof Date && !isNaN(v.getTime())) { const p = (n: number) => String(n).padStart(2, "0"); return { iso: `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`, ym: `${v.getFullYear()}-${p(v.getMonth() + 1)}` }; }
  const m = String(v ?? "").trim().match(/(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})/);
  if (!m) return null; const p = (n: number) => String(n).padStart(2, "0");
  return { iso: `${m[1]}-${p(+m[2])}-${p(+m[3])}`, ym: `${m[1]}-${p(+m[2])}` };
}

// 이카운트 "생산입고/소모현황 I" 엑셀(header:1 배열) → ProdConsume[]
export function parseProdConsume(rows: any[][]): ProdConsume[] {
  const want: Record<string, string> = { date: "일자", pc: "생산품목코드", pn: "생산품목명", mc: "소모품목코드", mn: "소모품목명", pq: "생산수량", std: "표준소모수량", act: "실제소모수량", mp: "소모품목단가", diff: "차이", amt: "금액" };
  let h = -1; const col: Record<string, number> = {};
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const r = (rows[i] || []).map((x: any) => String(x ?? "").trim());
    if (r.indexOf("생산품목코드") > -1 || r.indexOf("실제소모수량") > -1) {
      h = i;
      for (const k of Object.keys(want)) { const label = want[k].replace(/\s/g, ""); col[k] = r.findIndex(c => c.replace(/\s/g, "") === label); }
      break;
    }
  }
  if (h < 0) return [];
  const out: ProdConsume[] = [];
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] || []; const g = (k: string) => (col[k] >= 0 ? r[col[k]] : undefined);
    const dt = pDate(g("date")); const pc = String(g("pc") ?? "").trim();
    if (!dt || !pc) continue;
    const mc = String(g("mc") ?? "").trim();
    const base = { ym: dt.ym, idate: dt.iso, prod_code: pc, prod_name: String(g("pn") ?? "").trim(), mat_code: mc || undefined, mat_name: String(g("mn") ?? "").trim() || undefined, prod_qty: toNum(g("pq")), std_qty: toNum(g("std")), act_qty: toNum(g("act")), mat_price: toNum(g("mp")), diff: toNum(g("diff")), amount: toNum(g("amt")) };
    out.push({ ...base, id: uid(), sig: pcSig(base) });
  }
  return out;
}
