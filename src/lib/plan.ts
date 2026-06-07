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
