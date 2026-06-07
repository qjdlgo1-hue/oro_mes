import { useMemo, useRef, useState, useEffect } from "react";
import { Order, PlanEntry } from "../lib/types";
import { listPlans, upsertPlan } from "../lib/db";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const TODAY = new Date();

function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); }
function dayOf(iso: string) { return parseInt(iso.slice(8, 10), 10); }
function isoFor(y: number, m: number, d: number) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${y}-${p(m)}-${p(d)}`;
}
function weekBuckets(y: number, m: number, anchor: "mon" | "first") {
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

export default function ProductionPlan({ orders }: { orders: Order[] }) {
  const [cur, setCur] = useState(() => {
    const months = [...new Set(orders.map(o => o.ym))].sort();
    const last = months[months.length - 1] || `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, "0")}`;
    return { y: +last.slice(0, 4), m: +last.slice(5, 7) };
  });
  const [filter, setFilter] = useState("제품+무형상품");
  const [plans, setPlans] = useState<Record<string, PlanEntry>>({});
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<"day" | "week">("day");
  const [anchor, setAnchor] = useState<"mon" | "first">("mon");
  const [dayw, setDayw] = useState(30);

  useEffect(() => { listPlans().then(setPlans); }, []);

  const ym = `${cur.y}-${String(cur.m).padStart(2, "0")}`;
  const rows = useMemo(() => {
    let r = orders.filter(o => o.ym === ym);
    if (filter === "제품") r = r.filter(o => o.gubun === "제품");
    else if (filter === "제품+무형상품") r = r.filter(o => o.gubun === "제품" || o.gubun === "무형상품");
    return r.sort((a, b) => a.order_date < b.order_date ? -1 : 1);
  }, [orders, ym, filter, tick]);

  const nDays = daysInMonth(cur.y, cur.m);
  const DAYW = dayw;
  const buckets = useMemo(() => weekBuckets(cur.y, cur.m, anchor), [cur, anchor]);

  function planOf(o: Order): PlanEntry {
    return plans[o.id] || { order_id: o.id, start_date: o.order_date, span: 1, done: false };
  }
  async function commit(p: PlanEntry) {
    setPlans(prev => ({ ...prev, [p.order_id]: p })); setTick(t => t + 1);
    await upsertPlan(p);
  }
  function prevM() { setCur(c => c.m === 1 ? { y: c.y - 1, m: 12 } : { y: c.y, m: c.m - 1 }); }
  function nextM() { setCur(c => c.m === 12 ? { y: c.y + 1, m: 1 } : { y: c.y, m: c.m + 1 }); }

  function dayQty(o: Order, p: PlanEntry, day: number) {
    const sd = dayOf(p.start_date), ed = sd + p.span - 1;
    return (day >= sd && day <= ed) ? o.qty / p.span : 0;
  }

  // --- drag (day view) ---
  function startMove(e: React.PointerEvent, o: Order, barEl: HTMLDivElement) {
    e.preventDefault();
    const p = planOf(o); const startX = e.clientX; const origLeft = (dayOf(p.start_date) - 1) * DAYW;
    function mv(ev: PointerEvent) { let nl = origLeft + (ev.clientX - startX); nl = Math.max(0, Math.min(nl, (nDays - p.span) * DAYW)); barEl.style.left = nl + "px"; }
    function up() {
      document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up);
      let day = Math.round(parseFloat(barEl.style.left) / DAYW) + 1; day = Math.max(1, Math.min(day, nDays - p.span + 1));
      commit({ ...p, start_date: isoFor(cur.y, cur.m, day) });
    }
    document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up);
  }
  function startResize(e: React.PointerEvent, o: Order, barEl: HTMLDivElement) {
    e.preventDefault(); e.stopPropagation();
    const p = planOf(o); const startX = e.clientX; const origSpan = p.span;
    function mv(ev: PointerEvent) { let span = origSpan + Math.round((ev.clientX - startX) / DAYW); span = Math.max(1, Math.min(span, nDays - dayOf(p.start_date) + 1)); barEl.style.width = (span * DAYW - 3) + "px"; }
    function up() {
      document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up);
      let span = Math.round((parseFloat(barEl.style.width) + 3) / DAYW); span = Math.max(1, Math.min(span, nDays - dayOf(p.start_date) + 1));
      commit({ ...p, span });
    }
    document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up);
  }

  // totals
  const dayTot = new Array(nDays + 1).fill(0);
  rows.forEach(o => { const p = planOf(o); if (p.done) return; for (let d = 1; d <= nDays; d++) dayTot[d] += dayQty(o, p, d); });
  const weekTot = buckets.map(b => { let s = 0; rows.forEach(o => { const p = planOf(o); if (p.done) return; for (let d = b.s; d <= b.e; d++) s += dayQty(o, p, d); }); return s; });

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <div className="monthnav"><button onClick={prevM}>◀</button><b>{cur.y}년 {cur.m}월</b><button onClick={nextM}>▶</button></div>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: 6, borderRadius: 6 }}>
          <option>제품+무형상품</option><option>제품</option><option value="전체">전체(원재료 포함)</option>
        </select>
        {/* 일별/주별 토글 */}
        <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
          <button className="btn" style={{ borderRadius: 0, background: view === "day" ? "#2f6cb0" : "#cdd8e6", color: view === "day" ? "#fff" : "#333" }} onClick={() => setView("day")}>일별</button>
          <button className="btn" style={{ borderRadius: 0, background: view === "week" ? "#2f6cb0" : "#cdd8e6", color: view === "week" ? "#fff" : "#333" }} onClick={() => setView("week")}>주별</button>
        </div>
        {view === "week" &&
          <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
            <button className="btn ghost" style={{ borderRadius: 0, fontSize: 12, background: anchor === "mon" ? "#6b7f96" : "#e3e8f0", color: anchor === "mon" ? "#fff" : "#333" }} onClick={() => setAnchor("mon")}>월요일 시작</button>
            <button className="btn ghost" style={{ borderRadius: 0, fontSize: 12, background: anchor === "first" ? "#6b7f96" : "#e3e8f0", color: anchor === "first" ? "#fff" : "#333" }} onClick={() => setAnchor("first")}>1일 기준</button>
          </div>}
        {view === "day" &&
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>열너비</span>
            <button className="btn ghost" style={{ padding: "4px 10px" }} onClick={() => setDayw(w => Math.max(18, w - 4))}>－</button>
            <button className="btn ghost" style={{ padding: "4px 10px" }} onClick={() => setDayw(w => Math.min(48, w + 4))}>＋</button>
          </div>}
        <span className="muted">· {rows.length}개 주문 {view === "day" ? "· 막대 드래그=이동 / 오른쪽끝=기간 / 더블클릭=완료" : "· 주별은 합계 보기(편집은 일별에서)"}</span>
      </div>

      {rows.length === 0 ? <div className="card nodata">이 달에는 주문이 없습니다. '주문 가져오기' 탭에서 데이터를 넣으세요.</div> :
        <div className="board">
          <table className="grid">
            <thead>
              <tr>
                <th className="fixcol c-no">NO</th>
                <th className="fixcol c-name" style={{ left: 34 }}>품목</th>
                <th className="fixcol c-spec" style={{ left: 184 }}>규격</th>
                <th className="fixcol c-cust" style={{ left: 344 }}>거래처</th>
                <th className="fixcol c-qty" style={{ left: 464 }}>수량</th>
                {view === "day"
                  ? Array.from({ length: nDays }, (_, i) => {
                    const d = i + 1; const wd = new Date(cur.y, cur.m - 1, d).getDay();
                    return <th key={d} className="day" style={{ width: DAYW, minWidth: DAYW }}><div className="dn">{d}</div><div className="wd">{WD[wd]}</div></th>;
                  })
                  : buckets.map((b, i) => <th key={i} className="day" style={{ width: 70, minWidth: 70 }}><div className="dn">{b.label}</div><div className="wd">{cur.m}월</div></th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((o, idx) => {
                const p = planOf(o);
                return (
                  <tr key={o.id}>
                    <td className="fixcol c-no">{idx + 1}</td>
                    <td className="fixcol c-name" title={o.name}>{o.name}</td>
                    <td className="fixcol c-spec" title={o.spec}>{o.spec}</td>
                    <td className="fixcol c-cust" title={o.customer}>{o.customer}</td>
                    <td className="fixcol c-qty">{o.qty.toLocaleString()}</td>
                    {view === "day" ? (
                      <td className="barcell" colSpan={nDays}>
                        <div className="track" style={{ width: nDays * DAYW }}>
                          {Array.from({ length: nDays }, (_, i) => {
                            const d = i + 1; const wd = new Date(cur.y, cur.m - 1, d).getDay();
                            const today = cur.y === TODAY.getFullYear() && cur.m === TODAY.getMonth() + 1 && d === TODAY.getDate();
                            const bg = today ? "var(--today)" : (wd === 0 || wd === 6 ? "var(--wknd)" : "#fff");
                            return <div key={d} style={{ position: "absolute", left: i * DAYW, top: 0, width: DAYW, height: 30, background: bg, borderRight: "1px solid var(--line2)" }} />;
                          })}
                          <div className="ordermark" style={{ left: (dayOf(o.order_date) - 1) * DAYW }} title="주문일" />
                          <PlanBar o={o} p={p} left={(dayOf(p.start_date) - 1) * DAYW} w={p.span * DAYW - 3} per={Math.round(o.qty / p.span)}
                            onMove={startMove} onResize={startResize} onToggle={() => commit({ ...p, done: !p.done })} />
                        </div>
                      </td>
                    ) : (
                      buckets.map((b, i) => {
                        let s = 0; for (let d = b.s; d <= b.e; d++) s += dayQty(o, p, d);
                        return <td key={i} className="day" style={{ width: 70, minWidth: 70, background: p.done ? "#eee" : (s ? "#eaf3ea" : "#fff"), color: p.done ? "#999" : "#1f4e78", fontWeight: s ? 700 : 400, textDecoration: p.done ? "line-through" : "none" }}>{s ? Math.round(s).toLocaleString() : ""}</td>;
                      })
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="fixcol c-no" /><td className="fixcol c-name" style={{ left: 34 }} />
                <td className="fixcol c-spec" style={{ left: 184 }} /><td className="fixcol c-cust" style={{ left: 344 }} />
                <td className="fixcol c-qty" style={{ left: 464 }}>{view === "day" ? "일계(g)" : "주계(g)"}</td>
                {view === "day"
                  ? Array.from({ length: nDays }, (_, i) => <td key={i} className="day" style={{ width: DAYW, minWidth: DAYW }}>{dayTot[i + 1] ? Math.round(dayTot[i + 1]).toLocaleString() : ""}</td>)
                  : weekTot.map((t, i) => <td key={i} className="day" style={{ width: 70, minWidth: 70 }}>{t ? Math.round(t).toLocaleString() : ""}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>}
    </div>
  );
}

function PlanBar({ o, p, left, w, per, onMove, onResize, onToggle }: {
  o: Order; p: PlanEntry; left: number; w: number; per: number;
  onMove: (e: React.PointerEvent, o: Order, el: HTMLDivElement) => void;
  onResize: (e: React.PointerEvent, o: Order, el: HTMLDivElement) => void;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className={"bar" + (p.done ? " done" : "")} style={{ left, width: w }}
      title={`${o.name} · ${o.qty}g`}
      onPointerDown={e => { if ((e.target as HTMLElement).classList.contains("handle")) return; onMove(e, o, ref.current!); }}
      onDoubleClick={onToggle}>
      <span className="qh">{o.qty.toLocaleString()}g</span>
      {p.span > 1 && <span style={{ opacity: .85 }}>({per}/일)</span>}
      <span className="handle" onPointerDown={e => onResize(e, o, ref.current!)} />
    </div>
  );
}
