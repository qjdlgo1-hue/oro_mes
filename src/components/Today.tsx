import { errMsg } from "../lib/errmsg";
import { todayIso } from "../lib/fmt";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Order, PlanEntry, CocData } from "../lib/types";
import { listPlans, listCocs, upsertPlan, logAudit } from "../lib/db";
import { completionDate } from "../lib/plan";
import { can } from "../lib/perm";
import { toast } from "../lib/toast";
import { LabelOpts, loadLabelOpts, saveLabelOpts, printProductionLabel } from "../lib/label";

const p = (n: number) => String(n).padStart(2, "0");

export default function Today({ orders }: { orders: Order[] }) {
  const [plans, setPlans] = useState<Record<string, PlanEntry>>({});
  const [cocs, setCocs] = useState<Record<string, CocData>>({});
  const [tick, setTick] = useState(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncFail, setSyncFail] = useState(false);

  const load = useCallback(async () => {
    setSyncing(true);
    try {
      const [pl, co] = await Promise.all([listPlans(), listCocs()]);
      setPlans(pl); setCocs(co); setLastSync(new Date()); setSyncFail(false);
    } catch { setSyncFail(true); /* 다음 주기에 재시도 — 배지로 실패 표시 */ }
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

  // ---- 생산 라벨 (EPSON TM-C3500 등 라벨 프린터) ----
  const [labelOpts, setLabelOpts] = useState<LabelOpts>(loadLabelOpts);
  const [labelCfgOpen, setLabelCfgOpen] = useState(false);
  const setLabel = (patch: Partial<LabelOpts>) => setLabelOpts(o => { const n = { ...o, ...patch }; saveLabelOpts(n); return n; });
  async function printLabel(o: Order, pl?: PlanEntry, win?: Window | null) {
    const date = (pl && completionDate(pl)) || T;
    try { await printProductionLabel(o, pl, date, labelOpts, win); }
    catch (e: any) { toast.error("라벨 인쇄 실패: " + errMsg(e)); }
  }

  async function markDone(pl: PlanEntry) {
    // 자동 라벨: 팝업 차단을 피하려고 클릭 직후(저장 전) 창을 먼저 열어둔다
    const labelWin = labelOpts.auto ? window.open("", "_blank", "width=520,height=420") : null;
    const np = { ...pl, done: true };
    setPlans(prev => ({ ...prev, [pl.order_id]: np })); setTick(t => t + 1);
    try {
      await upsertPlan(np);
      const o = oMap[pl.order_id]; logAudit("생산 완료", "plan", pl.order_id, { name: o?.name });
      toast.success(`완료 처리됨: ${oMap[pl.order_id]?.name || ""}${labelOpts.auto && labelWin ? " — 라벨 인쇄" : ""}`);
      if (labelOpts.auto && o) await printLabel(o, np, labelWin);
      else labelWin?.close();
    } catch (e: any) {
      labelWin?.close();
      setPlans(prev => ({ ...prev, [pl.order_id]: pl })); setTick(t => t + 1);
      toast.error("완료 저장 실패 — 다시 시도하세요: " + errMsg(e));
    }
  }

  const Row = ({ o, end, start, pl, late }: { o: Order; end: string; start: string; pl: PlanEntry; late?: boolean }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderBottom: "1px solid #f0f3f7" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700 }}>{o.name} <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 12 }}>· {o.spec}</span></div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>{o.customer} · {(pl.qty != null ? Number(pl.qty) : o.qty).toLocaleString()}g · 생산 {start.slice(5)}~{end.slice(5)}{late ? ` · 완료예정 ${end} 지남` : ""}</div>
      </div>
      <button className="btn ghost" style={{ fontSize: 12, padding: "5px 8px" }} title="생산 라벨 인쇄" onClick={() => printLabel(o, pl)}>🏷</button>
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
      <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, color: "var(--muted)" }}>
        <span><b style={{ color: "var(--accent)", fontSize: 16 }}>POP</b> <span style={{ fontSize: 12 }}>(현장 생산 현황)</span> · 오늘 <b style={{ color: "var(--accent)" }}>{T}</b> · 생산계획 일정 기준 (자동 갱신)</span>
        <button className="btn ghost" style={{ marginLeft: "auto", padding: "4px 12px", fontSize: 12 }} onClick={() => setLabelCfgOpen(v => !v)}>🏷 라벨 설정</button>
        <button className="btn ghost" style={{ padding: "4px 12px", fontSize: 12 }} onClick={load} disabled={syncing}>{syncing ? "갱신 중…" : "🔄 새로고침"}</button>
        {lastSync && <span style={{ fontSize: 11 }}>갱신 {lastSync.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · 30초마다 자동</span>}
        {syncFail && <span style={{ fontSize: 11, color: "#c0392b", fontWeight: 700 }}>⚠ 갱신 실패 — 최신 데이터가 아닐 수 있음</span>}
      </div>

      {labelCfgOpen && (() => {
        const ni: React.CSSProperties = { width: 56, padding: 5, border: "1px solid var(--line)", borderRadius: 5 };
        return (
        <div className="card" style={{ gridColumn: "1 / -1", padding: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
            <b>🏷 생산 라벨 설정</b>
            <div className="seg">
              <button className={labelOpts.mode === "sheet" ? "on" : ""} onClick={() => setLabel({ mode: "sheet" })}>A4 라벨지 21칸</button>
              <button className={labelOpts.mode === "roll" ? "on" : ""} onClick={() => setLabel({ mode: "roll" })}>롤 라벨</button>
            </div>
            {labelOpts.mode === "sheet" ? <>
              <label>시작 칸(1~21) <input type="number" min={1} max={21} value={labelOpts.start} onChange={e => setLabel({ start: Math.max(1, Math.min(21, Number(e.target.value) || 1)) })} style={ni} /></label>
              <label>장수 <input type="number" min={1} max={200} value={labelOpts.copies} onChange={e => setLabel({ copies: Math.max(1, Math.min(200, Number(e.target.value) || 1)) })} style={ni} /></label>
              <label>보정 ↔(mm) <input type="number" step={0.5} value={labelOpts.offX} onChange={e => setLabel({ offX: Number(e.target.value) || 0 })} style={ni} /></label>
              <label>보정 ↕(mm) <input type="number" step={0.5} value={labelOpts.offY} onChange={e => setLabel({ offY: Number(e.target.value) || 0 })} style={ni} /></label>
            </> : <>
              <label>폭(mm) <input type="number" value={labelOpts.w} onChange={e => setLabel({ w: Number(e.target.value) || 100 })} style={ni} /></label>
              <label>높이(mm) <input type="number" value={labelOpts.h} onChange={e => setLabel({ h: Number(e.target.value) || 60 })} style={ni} /></label>
              <label>장수 <input type="number" min={1} max={50} value={labelOpts.copies} onChange={e => setLabel({ copies: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} style={ni} /></label>
            </>}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={labelOpts.qr} onChange={e => setLabel({ qr: e.target.checked })} /> QR 코드</label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={labelOpts.auto} onChange={e => setLabel({ auto: e.target.checked })} /> <b>완료 처리 시 자동 인쇄</b></label>
          </div>
          <p className="muted" style={{ fontSize: 11.5, margin: "8px 0 0", lineHeight: 1.7 }}>
            {labelOpts.mode === "sheet"
              ? <>A4 21칸 라벨지(프린텍 V3330, 63.5×38.1mm — Avery L7160 호환) 기준입니다. 쓰다 만 라벨지는 <b>시작 칸</b>으로 빈 칸부터 이어 인쇄하세요. 인쇄 시 <b>배율 100%(실제 크기)</b>로 설정해야 칸이 정확히 맞습니다. 위치가 밀리면 보정(mm)으로 조절.</>
              : <>롤 라벨 프린터(예: EPSON TM-C3500)의 용지 크기에 폭·높이를 맞추세요.</>}
            {" "}각 행의 🏷 버튼으로 언제든 다시 인쇄할 수 있습니다.<br />
            💡 <b>다이얼로그 없이 완전 자동 출력</b>: 현장 PC 크롬 바로가기에 <code>--kiosk-printing</code> 옵션 + 기본 프린터 지정 → 완료 버튼만 눌러도 라벨이 바로 나옵니다.
          </p>
        </div>
        );
      })()}

      <Section title="🔴 지연 (완료일 지났는데 미완료)" color="#c0392b" count={groups.late.length}>
        {groups.late.map(g => <Row key={g.o.id} {...g} pl={g.p} late />)}
      </Section>

      <Section title="🔵 오늘 생산" color="var(--accent)" count={groups.today.length}>
        {groups.today.map(g => <Row key={g.o.id} {...g} pl={g.p} />)}
      </Section>

      <Section title="🟢 COC 발행 필요 (생산완료 · 성적서 미발행)" color="var(--ok)" count={groups.cocNeeded.length}>
        {groups.cocNeeded.map(o => (
          <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderBottom: "1px solid #f0f3f7" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{o.name} <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 12 }}>· {o.spec}</span></div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{o.customer} · {o.qty.toLocaleString()}g</div>
            </div>
            <button className="btn ghost" style={{ fontSize: 12, padding: "5px 8px" }} title="생산 라벨 인쇄" onClick={() => printLabel(o, plans[o.id])}>🏷</button>
            <button className="btn ghost" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => { window.location.hash = "coc/" + o.id; }}>📄 발행하기 →</button>
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
