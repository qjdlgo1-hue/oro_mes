import { Order } from "./types";

const uid = () =>
  (crypto as any).randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2) + Date.now();

function toNum(s: any): number {
  if (typeof s === "number") return s;
  const n = parseFloat(String(s ?? "").replace(/,/g, "").trim());
  return isNaN(n) ? 0 : n;
}

// 일자 -> {iso, ym}. 지원: "2026/01/05", "2026-01-05", Date, Excel serial(number)
function parseDate(v: any): { iso: string; ym: string } | null {
  if (v == null || v === "") return null;
  let d: Date | null = null;
  if (v instanceof Date) d = v;
  else if (typeof v === "number") d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
  else {
    const m = String(v).trim().match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
    if (m) d = new Date(+m[1], +m[2] - 1, +m[3]);
  }
  if (!d || isNaN(d.getTime())) return null;
  const y = d.getFullYear(), mo = d.getMonth() + 1, da = d.getDate();
  const p = (n: number) => String(n).padStart(2, "0");
  return { iso: `${y}-${p(mo)}-${p(da)}`, ym: `${y}-${p(mo)}` };
}

// 11개 컬럼: 일자-No. | 일자 | 품목코드 | 품목구분 | 품목명 | 규격 | 수량 | 단가 | 공급가액 | 거래처명 | 적요
function rowToOrder(c: any[]): Order | null {
  const dt = parseDate(c[1]);
  if (!dt) return null;                          // 날짜 없으면(소계/헤더) 제외
  if (String(c[0]).includes("계")) return null;  // 소계 줄 제외
  const name = String(c[4] ?? "").trim();
  const qty = toNum(c[6]);
  if (!name && !qty) return null;
  return {
    id: uid(),
    order_no: String(c[0] ?? "").trim(),
    order_date: dt.iso,
    ym: dt.ym,
    item_code: String(c[2] ?? "").trim(),
    gubun: String(c[3] ?? "").trim() || "제품",
    name,
    spec: String(c[5] ?? "").trim(),
    qty,
    customer: String(c[9] ?? "").trim(),
    note: String(c[10] ?? "").trim(),
  };
}

// 화면 복사-붙여넣기(탭 또는 2칸+ 공백 구분)
export function parsePaste(text: string): Order[] {
  const out: Order[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let cells = line.includes("\t") ? line.split("\t") : line.split(/\s{2,}/);
    cells = cells.map(s => s.trim());
    if (cells[0] === "일자-No.") continue;
    const o = rowToOrder(cells);
    if (o) out.push(o);
  }
  return out;
}

// 엑셀(SheetJS sheet_to_json header:1) 행 배열
export function parseRows(rows: any[][]): Order[] {
  const out: Order[] = [];
  for (const r of rows) {
    if (!r || !r.length) continue;
    if (String(r[0]).trim() === "일자-No.") continue;
    const o = rowToOrder(r);
    if (o) out.push(o);
  }
  return out;
}
