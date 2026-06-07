import { PlanEntry } from "./types";

const p = (n: number) => String(n).padStart(2, "0");

export function addDays(iso: string, n: number): string {
  const d = new Date(iso); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 생산완료일 = 생산계획 막대의 마지막 날 (시작일 + 기간 - 1)
export function completionDate(plan?: PlanEntry): string | null {
  if (!plan || !plan.start_date) return null;
  return addDays(plan.start_date, Math.max(0, (plan.span || 1) - 1));
}

export function daysInMonth(y: number, m: number): number { return new Date(y, m, 0).getDate(); }

export function weekBuckets(y: number, m: number, anchor: "mon" | "first") {
  const n = daysInMonth(y, m); const out: { s: number; e: number; label: string }[] = [];
  if (anchor === "first") {
    for (let s = 1; s <= n; s += 7) { const e = Math.min(s + 6, n); out.push({ s, e, label: `${s}~${e}` }); }
  } else {
    let s = 1;
    while (s <= n) {
      const dow = new Date(y, m - 1, s).getDay();
      let e = dow === 0 ? s : s + (7 - dow);
      e = Math.min(e, n);
      out.push({ s, e, label: `${s}~${e}` });
      s = e + 1;
    }
  }
  return out;
}
