import { useEffect, useMemo, useState, useCallback } from "react";
import { Order, PlanEntry, CocData } from "../lib/types";
import { listPlans, listCocs, upsertPlan, logAudit } from "../lib/db";
import { completionDate } from "../lib/plan";
import { can } from "../lib/perm";

const p = (n: number) => String(n).padStart(2, "0");
function todayIso() { const t = new Date(); return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`; }

export default function Today({ orders }: { orders: Order[] }) {
  const [plans, setPlans] = useState<Record<string, PlanEntry>>({});
  const [cocs, setCocs] = useState<Record<string, CocData>>({});
  const [tick, setTick] = useState(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setSyncing(true);
    try {
      const [pl, co] = await Promise.all([listPlans(), listCocs()]);
      setPlans(pl); setCocs(co); setLastSync(new Date());
    } catch { /* 네트워크 일시 오류는 다음 주기에 재시도 */ }
    setSyncing(false);
  }, []);

  // 마운트 시 + 30초마다 자동 + 화면을 다시 볼 때 자동 갱신 (현장 모니터에 띄워둬도 최신 유지)
  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    const onFocus = () => load();
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(iv); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  const canEdit = can("plan.edit");
  const T = todayIso();
  const oMap = useMemo(() => { const m: Record<string, Order> = {}; orders.forEach(o => m[o.id] = o); return m; }, [orders]);

  const groups = useMemo(() => {
    const today: { o: Order; p: PlanEntry; start: string; end: string }[] = [];
    const late: typeof today = [];
    const upcoming: typeof today = [];
    Object.values(plans).forEach(pl => {
      const o = oMap[pl.order_id]; if (!o || pl.done) return;
      const start = pl.start_date; const end = completionDate(pl)!;
      if (end < T) late.push({ o, p: pl, start, end });
      else if (start <= T && T <= end) today.push({ o, p: pl, start, end });
      else if (start > T && start <= addDays(T, 7)) upcoming.push({ o, p: pl, start, end });
    });
    const sort = (a: any, b: any) => a.end < b.end ? -1 : 1;
    today.sort(sort); late.sort(sort); upcoming.sort((a, b) => a.start < b.start ? -1 : 1);
    // COC 발행 필요: 생산 완료(done)인데 COC 미발행
    const cocNeeded = Object.values(plans).filter(pl => pl.done && oMap[pl.order_id] && !cocs[pl.order_id])
      .map(pl => oMap[pl.order_id]);
    return { today, late, upcoming, cocNeeded };
  }, [plans, cocs, oMap, T, tick]);

  async function markDone(pl: PlanEntry) {
    const np = { ...pl, done: true };
    setPlans(prev => ({ ...prev, [pl.order_id]: np })); setTick(t => t + 1);
    await upsertPlan(np);
    const o = oMap[pl.order_id]; logAudit("생산 완료", "plan", pl.order_id, { name: o?.name });
  }

  const Row = ({ o, end, start, pl, late }: { o: Order; end: string; start: string; pl: PlanEntry; late?: boolean }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderBottom: "1px solid #f0f3f7" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700 }}>{o.name} <span style={{ fontWeight: 400, color: "#6b7280", fontSize: 12 }}>· {o.spec}</span></div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>{o.customer} · {(pl.qty != null ? Number(pl.qty) : o.qty).toLocaleString()}g · 생산 {start.slice(5)}~{end.slice(5)}{late ? ` · 완료예정 ${end} 지남` : ""}</div>
      </div>
      {canEdit && <button className="btn green" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => markDone(pl)}>완료</button>}
    </div>
  );

  const Section = ({ title, color, count, children }: any) => (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ background: color, color: "#fff", padding: "8px 12px", fontWeight: 700, fontSize: 14 }}>{title} · {count}건</div>
      {count === 0 ? <div className="muted" style={{ padding: 14 }}>없음 👍</div> : children}
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 1040, gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))" }}>
      <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, color: "#6b7280" }}>
        <span><b style={{ color: "#1f4e78", fontSize: 16 }}>POP</b> <span style={{ fontSize: 12 }}>(현장 생산 현황)</span> · 오늘 <b style={{ color: "#1f4e78" }}>{T}</b> · 생산계획 일정 기준 (자동 갱신)</span>
        <button className="btn ghost" style={{ marginLeft: "auto", padding: "4px 12px", fontSize: 12 }} onClick={load} disabled={syncing}>{syncing ? "갱신 중…" : "🔄 새로고침"}</button>
        {lastSync && <span style={{ fontSize: 11 }}>갱신 {lastSync.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · 30초마다 자동</span>}
      </div>

      <Section title="🔴 지연 (완료일 지났는데 미완료)" color="#c0392b" count={groups.late.length}>
        {groups.late.map(g => <Row key={g.o.id} {...g} pl={g.p} late />)}
      </Section>

      <Section title="🔵 오늘 생산" color="#2f6cb0" count={groups.today.length}>
        {groups.today.map(g => <Row key={g.o.id} {...g} pl={g.p} />)}
      </Section>

      <Section title="🟢 COC 발행 필요 (생산완료 · 성적서 미발행)" color="#1aa260" count={groups.cocNeeded.length}>
        {groups.cocNeeded.map(o => (
          <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderBottom: "1px solid #f0f3f7" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{o.name} <span style={{ fontWeight: 400, color: "#6b7280", fontSize: 12 }}>· {o.spec}</span></div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{o.customer} · {o.qty.toLocaleString()}g</div>
            </div>
            <span className="muted" style={{ fontSize: 12 }}>→ [COC 발행] 탭에서 발행</span>
          </div>
        ))}
      </Section>

      <Section title="⚪ 다가오는 7일 생산 예정" color="#6b7f96" count={groups.upcoming.length}>
        {groups.upcoming.map(g => <Row key={g.o.id} {...g} pl={g.p} />)}
      </Section>
    </div>
  );
}

function addDays(iso: string, n: number) {
  const d = new Date(iso); d.setDate(d.getDate() + n);
  const pp = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pp(d.getMonth() + 1)}-${pp(d.getDate())}`;
}
