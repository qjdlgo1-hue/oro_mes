import { InoutKind, InoutRow, inoutSig } from "./db";

const splitCells = (l: string) => (l.includes("\t") ? l.split("\t") : l.split(/\s{2,}/)).map(s => s.trim());
const toNum = (s: string) => { const v = parseFloat((s || "").replace(/,/g, "")); return isNaN(v) ? 0 : v; };
const uid = () => ((crypto as any).randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2) + Date.now());

function parseDate(v: string): { iso: string; ym: string } | null {
  const m = String(v || "").trim().match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!m) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return { iso: `${m[1]}-${p(+m[2])}-${p(+m[3])}`, ym: `${m[1]}-${p(+m[2])}` };
}

// 이카운트 화면/엑셀 붙여넣기(헤더 포함) → InoutRow[].
// 헤더에서 일자/품목코드/품목명/규격/수량(+판매: 거래처명·공급가액) 열을 자동 인식.
export function parseInout(kind: InoutKind, text: string): InoutRow[] {
  const lines = text.split(/\r?\n/).map(l => l.replace(/ /g, " ")).filter(l => l.trim());
  if (!lines.length) return [];

  let hi = -1, di = -1, ci = -1, ni = -1, si = -1, qi = -1, ai = -1, ui = -1, ti = -1;
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const c = splitCells(lines[i]);
    const f = (kw: string) => c.findIndex(x => x.replace(/\s/g, "").includes(kw));
    const code = f("품목코드"), qty = c.findIndex(x => x.includes("수량"));
    if (code > -1 || qty > -1) {
      hi = i; ci = code; ni = f("품목명"); si = f("규격"); qi = qty;
      di = c.findIndex(x => x.includes("일자"));
      ai = f("공급가액");
      ui = f("거래처명");          // 판매현황: 첫 번째 거래처명
      ti = c.findIndex(x => x.replace(/[\s.]/g, "").includes("내외자"));   // 내.외자구분
      break;
    }
  }

  const out: InoutRow[] = [];
  for (let i = (hi >= 0 ? hi + 1 : 0); i < lines.length; i++) {
    const c = splitCells(lines[i]);
    if (!c.length) continue;
    if ((c[0] || "").includes("계")) continue;                  // 소계/합계 줄 제외
    let code = ci >= 0 ? (c[ci] || "") : "";
    if (!code) { const k = c.find(x => /^[A-Za-z]\d{3,}$/.test(x)); code = k || ""; }   // 코드 패턴 보조
    const name = ni >= 0 ? (c[ni] || "") : "";
    if ((!code && !name) || code === "품목코드") continue;

    let dt = di >= 0 ? parseDate(c[di]) : null;
    if (!dt) { for (const cell of c) { const d = parseDate(cell); if (d) { dt = d; break; } } }
    if (!dt) continue;                                          // 날짜 없으면(헤더/소계) 제외

    const qty = qi >= 0 ? toNum(c[qi]) : 0;
    const spec = si >= 0 ? (c[si] || "") : "";
    const amount = (kind === "out" && ai >= 0) ? toNum(c[ai]) : null;
    const customer = (kind === "out" && ui >= 0) ? (c[ui] || "") : "";
    const trade_type = (kind === "out" && ti >= 0) ? (c[ti] || "") : "";
    const base = { kind, ym: dt.ym, idate: dt.iso, item_code: code, name, spec, qty, amount, customer, trade_type, note: "" };
    out.push({ ...base, id: uid(), sig: inoutSig(base) });
  }
  return out;
}
