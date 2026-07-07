// 경영분석보고서: 기간 KPI 집계 + 규칙 기반 보고서(AI 폴백용)
// AI 보고서는 Edge Function(biz-report)이 이 KPI JSON을 받아 Claude로 작성한다.
import { InoutRow, ProdConsume } from "./db";
import { Order, PlanEntry, Receipt } from "./types";
import { completionDate } from "./plan";
import { nf } from "./fmt";

export type PeriodType = "month" | "quarter" | "half" | "year";

export type TopRow = { name: string; value: number };
export type Kpis = {
  periodType: PeriodType; periodKey: string; label: string; yms: string[];
  sales: {
    hasData: boolean; total: number; domestic: number; foreign: number; count: number; custCount: number;
    prevTotal: number | null; yoyTotal: number | null;
    topCustomers: TopRow[]; topItems: TopRow[];
  };
  production: { hasData: boolean; totalQty: number; count: number; topItems: TopRow[]; prevQty: number | null };
  orders: { count: number; qty: number; planned: number; done: number; late: number };
  consume: { hasData: boolean; totalAct: number; topMats: { name: string; std: number; act: number; diff: number }[] };
  spend: { hasData: boolean; total: number; count: number; byAccount: TopRow[] };
  gaps: string[];
};

// ---- 기간 계산 ----
export function periodLabel(t: PeriodType, key: string): string {
  if (t === "month") return `${key.slice(0, 4)}년 ${Number(key.slice(5, 7))}월`;
  if (t === "quarter") return `${key.slice(0, 4)}년 ${key.slice(6)}분기`;
  if (t === "half") return `${key.slice(0, 4)}년 ${key.slice(6) === "1" ? "상반기" : "하반기"}`;
  return `${key}년`;
}
export function periodYms(t: PeriodType, key: string): string[] {
  const y = key.slice(0, 4);
  const mk = (m: number) => `${y}-${String(m).padStart(2, "0")}`;
  if (t === "month") return [key];
  if (t === "quarter") { const q = Number(key.slice(6)); return [1, 2, 3].map(i => mk((q - 1) * 3 + i)); }
  if (t === "half") { const h = Number(key.slice(6)); return Array.from({ length: 6 }, (_, i) => mk((h - 1) * 6 + i + 1)); }
  return Array.from({ length: 12 }, (_, i) => mk(i + 1));
}
// 직전 기간 키 (전월/전분기/전반기/전년)
export function prevPeriodKey(t: PeriodType, key: string): string {
  const y = Number(key.slice(0, 4));
  if (t === "month") { const m = Number(key.slice(5, 7)); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
  if (t === "quarter") { const q = Number(key.slice(6)); return q > 1 ? `${y}-Q${q - 1}` : `${y - 1}-Q4`; }
  if (t === "half") { const h = Number(key.slice(6)); return h > 1 ? `${y}-H1` : `${y - 1}-H2`; }
  return String(y - 1);
}
// 전년 동기 키
export function yoyPeriodKey(t: PeriodType, key: string): string {
  const y = Number(key.slice(0, 4));
  return t === "year" ? String(y - 1) : `${y - 1}${key.slice(4)}`;
}

const topN = (m: Map<string, number>, n = 5): TopRow[] =>
  [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, n);
const sumBy = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + (f(r) || 0), 0);

// ---- KPI 집계 ----
export function aggregateKpis(input: {
  periodType: PeriodType; periodKey: string;
  out: InoutRow[]; inn: InoutRow[]; orders: Order[]; plans: Record<string, PlanEntry>;
  receipts: Receipt[]; prodcon: ProdConsume[]; today: string;
}): Kpis {
  const { periodType: t, periodKey: key, out, inn, orders, plans, receipts, prodcon, today } = input;
  const yms = new Set(periodYms(t, key));
  const prevYms = new Set(periodYms(t, prevPeriodKey(t, key)));
  const yoyYms = new Set(periodYms(t, yoyPeriodKey(t, key)));
  const inYms = (ym: string) => yms.has(ym);

  // 판매(공급가액)
  const so = out.filter(r => inYms(r.ym));
  const amt = (r: InoutRow) => Number(r.amount) || 0;
  const cust = new Map<string, number>(), item = new Map<string, number>();
  so.forEach(r => {
    cust.set(r.customer || "(미상)", (cust.get(r.customer || "(미상)") || 0) + amt(r));
    const nm = r.name || r.item_code || "(미상)";
    item.set(nm, (item.get(nm) || 0) + amt(r));
  });
  const prevSales = sumBy(out.filter(r => prevYms.has(r.ym)), amt);
  const yoySales = sumBy(out.filter(r => yoyYms.has(r.ym)), amt);
  const hasPrevOut = out.some(r => prevYms.has(r.ym));
  const hasYoyOut = out.some(r => yoyYms.has(r.ym));

  // 생산(입고 수량 g)
  const si = inn.filter(r => inYms(r.ym));
  const prodItem = new Map<string, number>();
  si.forEach(r => { const nm = r.name || r.item_code || "(미상)"; prodItem.set(nm, (prodItem.get(nm) || 0) + (Number(r.qty) || 0)); });
  const hasPrevIn = inn.some(r => prevYms.has(r.ym));

  // 주문·생산계획 (기간 내 수주분 기준)
  const po = orders.filter(o => inYms(o.ym));
  let planned = 0, done = 0, late = 0;
  po.forEach(o => {
    const pl = plans[o.id]; if (!pl) return;
    planned++;
    if (pl.done) done++;
    else if ((completionDate(pl) || "9999") < today) late++;
  });

  // 원재료 소모
  const pc = prodcon.filter(r => inYms(r.ym));
  const mats = new Map<string, { std: number; act: number }>();
  pc.forEach(r => {
    const nm = r.mat_name || r.mat_code || "(미상)";
    const e = mats.get(nm) || { std: 0, act: 0 };
    e.std += Number(r.std_qty) || 0; e.act += Number(r.act_qty) || 0;
    mats.set(nm, e);
  });
  const topMats = [...mats.entries()].map(([name, v]) => ({ name, std: v.std, act: v.act, diff: v.act - v.std }))
    .sort((a, b) => b.act - a.act).slice(0, 5);

  // 지출(증빙, 총액)
  const rc = receipts.filter(r => inYms((r.rdate || "").slice(0, 7)));
  const acct = new Map<string, number>();
  rc.forEach(r => acct.set(r.account || "(미분류)", (acct.get(r.account || "(미분류)") || 0) + (Number(r.total) || 0)));

  const gaps: string[] = [];
  if (si.length === 0) gaps.push("생산입고 데이터 없음(생산 가져오기 미입력)");
  if (so.length === 0) gaps.push("판매 데이터 없음");
  if (pc.length === 0) gaps.push("생산·소모 데이터 없음");
  if (rc.length === 0) gaps.push("증빙(지출) 데이터 없음");

  return {
    periodType: t, periodKey: key, label: periodLabel(t, key), yms: [...yms],
    sales: {
      hasData: so.length > 0,
      total: sumBy(so, amt),
      domestic: sumBy(so.filter(r => (r.trade_type || "") !== "외자"), amt),
      foreign: sumBy(so.filter(r => (r.trade_type || "") === "외자"), amt),
      count: so.length, custCount: new Set(so.map(r => r.customer || "")).size,
      prevTotal: hasPrevOut ? prevSales : null,
      yoyTotal: hasYoyOut ? yoySales : null,
      topCustomers: topN(cust), topItems: topN(item),
    },
    production: {
      hasData: si.length > 0, totalQty: sumBy(si, r => Number(r.qty) || 0), count: si.length,
      topItems: topN(prodItem), prevQty: hasPrevIn ? sumBy(inn.filter(r => prevYms.has(r.ym)), r => Number(r.qty) || 0) : null,
    },
    orders: { count: po.length, qty: sumBy(po, o => Number(o.qty) || 0), planned, done, late },
    consume: { hasData: pc.length > 0, totalAct: sumBy(pc, r => Number(r.act_qty) || 0), topMats },
    spend: { hasData: rc.length > 0, total: sumBy(rc, r => Number(r.total) || 0), count: rc.length, byAccount: topN(acct, 8) },
    gaps,
  };
}

// ---- 규칙 기반 보고서(폴백) ----
const pct = (cur: number, base: number | null): string => {
  if (base == null) return "";
  if (base === 0) return cur > 0 ? " (신규 발생)" : "";
  const p = ((cur - base) / Math.abs(base)) * 100;
  return ` (${p >= 0 ? "+" : ""}${p.toFixed(1)}%)`;
};

export function ruleReport(k: Kpis): string {
  const L: string[] = [];
  L.push(`# ${k.label} 경영분석보고서`);
  L.push("");
  L.push("## 1. 핵심 요약");
  const sum: string[] = [];
  if (k.sales.hasData) sum.push(`- 매출(공급가액) **${nf(k.sales.total)}원**${pct(k.sales.total, k.sales.prevTotal)}${k.sales.yoyTotal != null ? `, 전년 동기 대비${pct(k.sales.total, k.sales.yoyTotal)}` : ""}`);
  if (k.production.hasData) sum.push(`- 생산량 **${nf(k.production.totalQty)}g**${pct(k.production.totalQty, k.production.prevQty)}`);
  sum.push(`- 수주 ${nf(k.orders.count)}건(${nf(k.orders.qty)}g) · 생산계획 ${nf(k.orders.planned)}건 중 완료 ${nf(k.orders.done)}건, 지연 ${nf(k.orders.late)}건`);
  if (k.spend.hasData) sum.push(`- 지출(증빙) **${nf(k.spend.total)}원** (${nf(k.spend.count)}건)`);
  if (sum.length === 0) sum.push("- 이 기간에 집계할 데이터가 없습니다.");
  L.push(...sum);
  L.push("");
  if (k.sales.hasData) {
    L.push("## 2. 매출 분석");
    L.push(`- 내자 ${nf(k.sales.domestic)}원 / 외자 ${nf(k.sales.foreign)}원 · 거래처 ${nf(k.sales.custCount)}곳 · ${nf(k.sales.count)}건`);
    if (k.sales.topCustomers.length) {
      L.push("", "| 상위 거래처 | 판매액(원) |", "|---|---:|");
      k.sales.topCustomers.forEach(r => L.push(`| ${r.name} | ${nf(r.value)} |`));
    }
    if (k.sales.topItems.length) {
      L.push("", "| 상위 품목 | 판매액(원) |", "|---|---:|");
      k.sales.topItems.forEach(r => L.push(`| ${r.name} | ${nf(r.value)} |`));
    }
    L.push("");
  }
  L.push("## 3. 생산·납기");
  if (k.production.hasData) {
    L.push(`- 생산입고 ${nf(k.production.totalQty)}g (${nf(k.production.count)}건)`);
    k.production.topItems.slice(0, 3).forEach(r => L.push(`  - ${r.name}: ${nf(r.value)}g`));
  }
  L.push(`- 수주 ${nf(k.orders.count)}건 / 계획 수립 ${nf(k.orders.planned)}건 / 완료 ${nf(k.orders.done)}건 / **지연 ${nf(k.orders.late)}건**`);
  if (k.orders.late > 0) L.push(`- ⚠️ 지연 ${nf(k.orders.late)}건은 생산계획 재조정 또는 고객 커뮤니케이션이 필요합니다.`);
  L.push("");
  if (k.consume.hasData) {
    L.push("## 4. 원재료 소모");
    L.push("", "| 원재료 | 표준소모 | 실제소모 | 차이 |", "|---|---:|---:|---:|");
    k.consume.topMats.forEach(r => L.push(`| ${r.name} | ${nf(r.std)} | ${nf(r.act)} | ${r.diff >= 0 ? "+" : ""}${nf(r.diff)} |`));
    const over = k.consume.topMats.filter(r => r.std > 0 && r.diff / r.std > 0.05);
    if (over.length) L.push("", `- ⚠️ 표준 대비 5% 초과 소모: ${over.map(r => r.name).join(", ")} — 공정 손실 점검 권장`);
    L.push("");
  }
  if (k.spend.hasData) {
    L.push("## 5. 지출");
    L.push("", "| 계정 | 금액(원) |", "|---|---:|");
    k.spend.byAccount.forEach(r => L.push(`| ${r.name} | ${nf(r.value)} |`));
    L.push("");
  }
  if (k.gaps.length) {
    L.push("## 6. 데이터 참고");
    k.gaps.forEach(g => L.push(`- ${g}`));
    L.push("");
  }
  L.push("---");
  L.push("*본 보고서는 규칙 기반으로 자동 생성되었습니다. AI 분석을 사용하려면 관리자에게 Anthropic API 키 등록을 요청하세요.*");
  return L.join("\n");
}
