import { errMsg } from "../lib/errmsg";
import { useMemo, useRef, useState, useEffect } from "react";
import { Order, PlanEntry } from "../lib/types";
import { listPlans, upsertPlan, updateOrder, logAudit } from "../lib/db";
import { daysInMonth, weekBuckets, completionDate } from "../lib/plan";
import { can } from "../lib/perm";
import { useIsMobile } from "../lib/useIsMobile";
import { toast } from "../lib/toast";
import { confirmDialog } from "../lib/confirm";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const TODAY = new Date();

function dayOf(iso: string) { return parseInt(iso.slice(8, 10), 10); }
function isoFor(y: number, m: number, d: number) { const p = (n: number) => String(n).padStart(2, "0"); return `${y}-${p(m)}-${p(d)}`; }

export default function ProductionPlan({ orders, onChange }: { orders: Order[]; onChange?: () => void }) {
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
  const [mview, setMview] = useState<"cal" | "list">("cal");
  const [selDay, setSelDay] = useState<number | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState("");
  const [startDraft, setStartDraft] = useState("");
  const [spanDraft, setSpanDraft] = useState(1);
  const [syncOrder, setSyncOrder] = useState(false);
  const [sortBy, setSortBy] = useState<{ key: "seq" | "name"; dir: 1 | -1 }>({ key: "seq", dir: 1 });
  const canEdit = can("plan.edit");
  const isMobile = useIsMobile();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { listPlans().then(setPlans).finally(() => setLoaded(true)); }, []);
  useEffect(() => {
    if (!editId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setEditId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editId]);

  const ym = `${cur.y}-${String(cur.m).padStart(2, "0")}`;
  const rows = useMemo(() => {
    let r = orders.filter(o => o.ym === ym);
    if (filter === "제품") r = r.filter(o => o.gubun === "제품");
    else if (filter === "제품+무형상품") r = r.filter(o => o.gubun === "제품" || o.gubun === "무형상품");
    const dir = sortBy.dir;
    return r.sort((a, b) => {
      if (sortBy.key === "name") { const c = a.name < b.name ? -1 : a.name > b.name ? 1 : (a.order_date < b.order_date ? -1 : 1); return c * dir; }
      const c = a.order_date < b.order_date ? -1 : a.order_date > b.order_date ? 1 : 0; return c * dir;
    });
  }, [orders, ym, filter, tick, sortBy]);

  const nDays = daysInMonth(cur.y, cur.m);
  const DAYW = dayw;
  const buckets = useMemo(() => weekBuckets(cur.y, cur.m, anchor), [cur, anchor]);

  function planOf(o: Order): PlanEntry { return plans[o.id] || { order_id: o.id, start_date: o.order_date, span: 1, done: false }; }
  async function commit(p: PlanEntry) {
    const prev = plans;
    setPlans(cur => ({ ...cur, [p.order_id]: p })); setTick(t => t + 1);
    try { await upsertPlan(p); }
    catch (e: any) { setPlans(prev); setTick(t => t + 1); toast.error("일정 저장 실패(권한/네트워크 확인): " + errMsg(e)); }
  }
  function prevM() { setSelDay(null); setCur(c => c.m === 1 ? { y: c.y - 1, m: 12 } : { y: c.y, m: c.m - 1 }); }
  function nextM() { setSelDay(null); setCur(c => c.m === 12 ? { y: c.y + 1, m: 1 } : { y: c.y, m: c.m + 1 }); }
  const pqty = (o: Order, p: PlanEntry) => (p.qty != null ? Number(p.qty) : o.qty);
  function dayQty(o: Order, p: PlanEntry, day: number) { const sd = dayOf(p.start_date), ed = sd + p.span - 1; return (day >= sd && day <= ed) ? pqty(o, p) / p.span : 0; }
  function toggleDone(o: Order, p: PlanEntry) { if (!canEdit) return; const nd = !p.done; commit({ ...p, done: nd }); logAudit(nd ? "생산 완료" : "완료 해제", "plan", o.id, { name: o.name }); }
  function openQty(o: Order) { if (!canEdit) return; const p = planOf(o); setQtyDraft(String(pqty(o, p))); setStartDraft(p.start_date); setSpanDraft(p.span); setSyncOrder(false); setEditId(o.id); }
  async function saveQty() {
    const o = orders.find(x => x.id === editId); if (!o) return;
    const v = Number(qtyDraft);
    if (qtyDraft.trim() === "" || isNaN(v) || v < 0) { toast.error("생산수량(0 이상)을 입력하세요."); return; }
    if (syncOrder) {
      const zero = v === 0;
      const ok = await confirmDialog({
        title: zero ? "⚠ 주문 취소(수량 0)" : "주문 수량 변경",
        message: zero
          ? `주문(수주) 수량을 0으로 변경합니다.\n사실상 수주 취소이며 COC·리포트에도 반영됩니다.\n되돌리려면 수량을 다시 입력해야 합니다.`
          : `주문(수주) 수량도 ${v.toLocaleString()}g 으로 변경됩니다.\n주문·COC·리포트에 모두 반영됩니다. 계속할까요?`,
        danger: zero, confirmLabel: zero ? "0으로 변경" : "변경",
      });
      if (!ok) return;
    } else if (v === 0) {
      if (!(await confirmDialog({ title: "생산수량 0 저장", message: "생산수량을 0으로 저장합니다. 계속할까요?" }))) return;
    }
    const base = { ...planOf(o), start_date: startDraft || planOf(o).start_date, span: Math.max(1, Number(spanDraft) || 1) };
    try {
      if (syncOrder) { await updateOrder(o.id, { qty: v }); await commit({ ...base, qty: null }); logAudit("주문+생산수량 변경", "order", o.id, { qty: v }); onChange?.(); }
      else { await commit({ ...base, qty: v }); logAudit("생산수량 변경", "plan", o.id, { qty: v }); }
      toast.success(`저장 완료 (${v.toLocaleString()}g${syncOrder ? ", 주문 반영" : ""})`);
    } catch (e: any) { toast.error("저장 실패: " + errMsg(e)); }
    setEditId(null); setSyncOrder(false);
  }
  async function resetQty() { const o = orders.find(x => x.id === editId); if (!o) return; await commit({ ...planOf(o), qty: null }); logAudit("생산수량 초기화", "plan", o.id, {}); setEditId(null); }
  const qModal = editId ? (() => {
    const o = orders.find(x => x.id === editId); if (!o) return null; const p = planOf(o);
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setEditId(null)}>
        <div style={{ background: "#fff", borderRadius: 12, padding: 20, width: 340, maxWidth: "92vw" }} onClick={e => e.stopPropagation()}>
          <h3 style={{ marginTop: 0 }}>생산수량 변경</h3>
          <div style={{ fontWeight: 700 }}>{o.name}</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{o.spec}</div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>수주량: <b>{o.qty.toLocaleString()}</b> g{p.qty != null && Number(p.qty) !== o.qty ? " (생산수량 별도 지정됨)" : ""}</div>
          <label style={{ fontSize: 13, fontWeight: 700 }}>생산수량(g)
            <input type="number" inputMode="numeric" value={qtyDraft} onChange={e => setQtyDraft(e.target.value)} autoFocus style={{ display: "block", width: "100%", padding: 9, border: "1px solid var(--line)", borderRadius: 6, marginTop: 4, fontSize: 16 }} />
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>시작일
              <input type="date" value={startDraft} onChange={e => { if (e.target.value) setStartDraft(e.target.value); }} style={{ display: "block", width: "100%", padding: 8, border: "1px solid var(--line)", borderRadius: 6, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 13, fontWeight: 700, width: 90 }}>기간(일)
              <input type="number" inputMode="numeric" min={1} value={spanDraft} onChange={e => setSpanDraft(Math.max(1, Number(e.target.value) || 1))} style={{ display: "block", width: "100%", padding: 8, border: "1px solid var(--line)", borderRadius: 6, marginTop: 4 }} />
            </label>
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>드래그 없이 정확한 날짜를 지정할 수 있어요. 완료일 = 시작일 + 기간 − 1일.</div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginTop: 12 }}>
            <input type="checkbox" checked={syncOrder} onChange={e => setSyncOrder(e.target.checked)} />
            주문(수주) 수량에도 반영 <span className="muted" style={{ fontSize: 11 }}>(주문·COC·리포트 반영)</span>
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button className="btn green" onClick={saveQty}>저장</button>
            <button className="btn ghost" onClick={resetQty}>수주량으로</button>
            <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={() => setEditId(null)}>취소</button>
          </div>
        </div>
      </div>
    );
  })() : null;

  // ---- drag (day view) ----
  function startMove(e: React.PointerEvent, o: Order, barEl: HTMLDivElement) {
    if (!canEdit) return; e.preventDefault();
    const p = planOf(o); const startX = e.clientX; const origLeft = (dayOf(p.start_date) - 1) * DAYW;
    function mv(ev: PointerEvent) { let nl = origLeft + (ev.clientX - startX); nl = Math.max(0, Math.min(nl, (nDays - p.span) * DAYW)); barEl.style.left = nl + "px"; }
    function up() { document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); let day = Math.round(parseFloat(barEl.style.left) / DAYW) + 1; day = Math.max(1, Math.min(day, nDays - p.span + 1)); commit({ ...p, start_date: isoFor(cur.y, cur.m, day) }); }
    document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up);
  }
  function startResize(e: React.PointerEvent, o: Order, barEl: HTMLDivElement) {
    if (!canEdit) return; e.preventDefault(); e.stopPropagation();
    const p = planOf(o); const startX = e.clientX; const origSpan = p.span;
    function mv(ev: PointerEvent) { let span = origSpan + Math.round((ev.clientX - startX) / DAYW); span = Math.max(1, Math.min(span, nDays - dayOf(p.start_date) + 1)); barEl.style.width = (span * DAYW - 3) + "px"; }
    function up() { document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); let span = Math.round((parseFloat(barEl.style.width) + 3) / DAYW); span = Math.max(1, Math.min(span, nDays - dayOf(p.start_date) + 1)); commit({ ...p, span }); }
    document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up);
  }

  const dayTot = new Array(nDays + 1).fill(0);
  rows.forEach(o => { const p = planOf(o); if (p.done) return; for (let d = 1; d <= nDays; d++) dayTot[d] += dayQty(o, p, d); });
  const weekTot = buckets.map(b => { let s = 0; rows.forEach(o => { const p = planOf(o); if (p.done) return; for (let d = b.s; d <= b.e; d++) s += dayQty(o, p, d); }); return s; });

  const MonthNav = () => <div className="monthnav"><button onClick={prevM} aria-label="이전 달">◀</button><b>{cur.y}년 {cur.m}월</b><button onClick={nextM} aria-label="다음 달">▶</button><button style={{ fontSize: 12 }} onClick={() => { setSelDay(null); setCur({ y: TODAY.getFullYear(), m: TODAY.getMonth() + 1 }); }}>오늘</button></div>;
  const FilterSel = () => <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: 8, borderRadius: 6 }}><option>제품+무형상품</option><option>제품</option><option value="전체">전체(원재료 포함)</option></select>;
  function toggleSort(key: "seq" | "name") { setSortBy(sb => sb.key === key ? { key, dir: (sb.dir === 1 ? -1 : 1) } : { key, dir: 1 }); }
  const arrow = (key: "seq" | "name") => sortBy.key === key ? (sortBy.dir === 1 ? " ▲" : " ▼") : "";
  const SortSel = () => (
    <div className="seg sub" style={{ alignItems: "center" }}>
      <span style={{ fontSize: 12, color: "var(--muted)", padding: "6px 8px", background: "#f5f7fa" }}>정렬</span>
      <button className={sortBy.key === "seq" ? "on" : ""} style={{ fontSize: 12 }} onClick={() => toggleSort("seq")}>번호순{arrow("seq")}</button>
      <button className={sortBy.key === "name" ? "on" : ""} style={{ fontSize: 12 }} onClick={() => toggleSort("name")}>품목순{arrow("name")}</button>
    </div>
  );

  // ================= 모바일 =================
  if (isMobile) {
    // 캘린더용 일별 합계(완료 포함)
    const calTot = new Array(nDays + 1).fill(0);
    rows.forEach(o => { const p = planOf(o); for (let d = 1; d <= nDays; d++) calTot[d] += dayQty(o, p, d); });
    const maxCal = Math.max(1, ...calTot.slice(1));
    const firstDow = new Date(cur.y, cur.m - 1, 1).getDay();
    const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: nDays }, (_, i) => i + 1)];
    const dayItems = selDay ? rows.filter(o => dayQty(o, planOf(o), selDay!) > 0) : [];

    return (
      <div>
        {qModal}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <MonthNav />
          <div className="seg">
            <button className={mview === "cal" ? "on" : ""} onClick={() => setMview("cal")}>캘린더</button>
            <button className={mview === "list" ? "on" : ""} onClick={() => setMview("list")}>목록</button>
          </div>
          <FilterSel />
          <SortSel />
        </div>

        {rows.length === 0 ? <div className="card nodata">{loaded ? "이 달 주문이 없습니다." : "불러오는 중…"}</div> :
          mview === "cal" ? (
            <div className="card" style={{ padding: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 4 }}>
                {WD.map((w, i) => <div key={w} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: i === 0 ? "#c0392b" : i === 6 ? "var(--accent)" : "var(--muted)" }}>{w}</div>)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
                {cells.map((d, i) => {
                  if (d === null) return <div key={"b" + i} />;
                  const t = calTot[d]; const intensity = t / maxCal;
                  const isToday = cur.y === TODAY.getFullYear() && cur.m === TODAY.getMonth() + 1 && d === TODAY.getDate();
                  const dow = new Date(cur.y, cur.m - 1, d).getDay();
                  return (
                    <button key={d} onClick={() => setSelDay(d)} style={{
                      aspectRatio: "1/1", border: selDay === d ? "2px solid var(--accent)" : "1px solid var(--line)", borderRadius: 8,
                      background: t > 0 ? `rgba(26,162,96,${0.15 + 0.55 * intensity})` : (isToday ? "#fff7e6" : "#fff"),
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 2, cursor: "pointer"
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: dow === 0 ? "#c0392b" : dow === 6 ? "var(--accent)" : "#1c2128" }}>{d}</span>
                      {t > 0 && <span style={{ fontSize: 9, color: intensity > 0.5 ? "#fff" : "#15663f", fontWeight: 700 }}>{Math.round(t).toLocaleString()}</span>}
                    </button>
                  );
                })}
              </div>
              <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>색이 진할수록 그날 생산량(g)이 많습니다. 날짜를 누르면 그날 품목이 나와요.</p>

              {selDay &&
                <div style={{ marginTop: 10, borderTop: "2px solid var(--navy)", paddingTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <b>{cur.m}월 {selDay}일 · 합계 {Math.round(calTot[selDay]).toLocaleString()}g</b>
                    <button className="btn ghost" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setSelDay(null)}>닫기</button>
                  </div>
                  {dayItems.length === 0 ? <p className="muted">이 날 생산 일정이 없습니다.</p> :
                    dayItems.map(o => { const p = planOf(o); return (
                      <div key={o.id} className="mcard" style={{ opacity: p.done ? 0.6 : 1, marginBottom: 8 }}>
                        <div className="mrow"><span className="k">{o.name}{p.done ? " ✅" : ""}</span><span className="v">{Math.round(dayQty(o, p, selDay!)).toLocaleString()}g/일</span></div>
                        <div className="mrow"><span className="k" style={{ fontSize: 12 }}>{o.customer}</span><span className="v" style={{ fontWeight: 400, fontSize: 12 }}>생산 {pqty(o, p).toLocaleString()}g · 완료일 {completionDate(p)}</span></div>
                        {canEdit && <div style={{ display: "flex", gap: 6, marginTop: 6 }}><button className="btn ghost" style={{ flex: 1 }} onClick={() => openQty(o)}>수량</button><button className={"btn " + (p.done ? "ghost" : "green")} style={{ flex: 2 }} onClick={() => toggleDone(o, p)}>{p.done ? "완료 해제" : "생산 완료"}</button></div>}
                      </div>
                    ); })}
                </div>}
            </div>
          ) : (
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{rows.length}개 · 시작일/기간을 정하면 생산완료일이 자동 계산됩니다.</div>
              {rows.map((o, idx) => { const p = planOf(o); const cp = completionDate(p); return (
                <div className="mcard" key={o.id} style={{ opacity: p.done ? 0.6 : 1 }}>
                  <div className="mrow"><span className="k">{idx + 1}. 품목</span><span className="v">{o.name}{p.done ? " ✅" : ""}</span></div>
                  <div className="mrow"><span className="k">규격</span><span className="v" style={{ fontWeight: 400 }}>{o.spec}</span></div>
                  <div className="mrow"><span className="k">거래처 / 생산수량</span><span className="v" style={{ fontWeight: 400 }}>{o.customer} · {pqty(o, p).toLocaleString()}g {canEdit && <button className="btn ghost" style={{ padding: "1px 8px", fontSize: 11, marginLeft: 4 }} onClick={() => openQty(o)}>변경</button>}</span></div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <label style={{ fontSize: 12, color: "var(--muted)" }}>시작일<input type="date" disabled={!canEdit} value={p.start_date} onChange={e => commit({ ...p, start_date: e.target.value })} style={{ display: "block", padding: 8, border: "1px solid var(--line)", borderRadius: 6 }} /></label>
                    <label style={{ fontSize: 12, color: "var(--muted)" }}>기간(일)<input type="number" inputMode="numeric" min={1} disabled={!canEdit} value={p.span} onChange={e => commit({ ...p, span: Math.max(1, Number(e.target.value) || 1) })} style={{ display: "block", width: 80, padding: 8, border: "1px solid var(--line)", borderRadius: 6 }} /></label>
                    <div style={{ fontSize: 12, color: "var(--accent)" }}>완료일<br /><b>{cp}</b></div>
                  </div>
                  {canEdit && <button className={"btn " + (p.done ? "ghost" : "green")} style={{ marginTop: 10, width: "100%" }} onClick={() => toggleDone(o, p)}>{p.done ? "완료 해제" : "생산 완료 처리"}</button>}
                </div>
              ); })}
            </div>
          )}
      </div>
    );
  }

  // ================= 데스크탑 =================
  return (
    <div>
      {qModal}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <MonthNav />
        <FilterSel />
        <SortSel />
        <div className="seg">
          <button className={view === "day" ? "on" : ""} onClick={() => setView("day")}>일별</button>
          <button className={view === "week" ? "on" : ""} onClick={() => setView("week")}>주별</button>
        </div>
        {view === "week" &&
          <div className="seg sub">
            <button className={anchor === "mon" ? "on" : ""} style={{ fontSize: 12 }} onClick={() => setAnchor("mon")}>월요일 시작</button>
            <button className={anchor === "first" ? "on" : ""} style={{ fontSize: 12 }} onClick={() => setAnchor("first")}>1일 기준</button>
          </div>}
        {view === "day" &&
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>열너비</span>
            <button className="btn ghost" style={{ padding: "4px 10px" }} aria-label="열너비 줄이기" onClick={() => setDayw(w => Math.max(18, w - 4))}>－</button>
            <button className="btn ghost" style={{ padding: "4px 10px" }} aria-label="열너비 늘리기" onClick={() => setDayw(w => Math.min(48, w + 4))}>＋</button>
          </div>}
        <span className="muted">· {rows.length}개 주문 {view === "day" ? "· 막대 드래그=이동 / 오른쪽끝=기간 / 더블클릭=완료" : "· 주별은 합계 보기(편집은 일별에서)"}{!canEdit ? " · 보기 전용(편집 권한 없음)" : ""}</span>
      </div>

      {rows.length === 0 ? <div className="card nodata">{loaded ? "이 달에는 주문이 없습니다. '주문 가져오기' 탭에서 데이터를 넣으세요." : "불러오는 중…"}</div> :
        <div className="board">
          <table className="grid">
            <thead>
              <tr>
                <th className="fixcol c-no" style={{ cursor: "pointer" }} title="번호순 정렬" onClick={() => toggleSort("seq")}>NO{arrow("seq")}</th>
                <th className="fixcol c-name" style={{ left: 34, cursor: "pointer" }} title="품목순 정렬" onClick={() => toggleSort("name")}>품목{arrow("name")}</th>
                <th className="fixcol c-spec" style={{ left: 184 }}>규격</th>
                <th className="fixcol c-cust" style={{ left: 344 }}>거래처</th>
                <th className="fixcol c-qty" style={{ left: 464 }}>수량</th>
                {view === "day"
                  ? Array.from({ length: nDays }, (_, i) => { const d = i + 1; const wd = new Date(cur.y, cur.m - 1, d).getDay(); return <th key={d} className="day" style={{ width: DAYW, minWidth: DAYW }}><div className="dn">{d}</div><div className="wd">{WD[wd]}</div></th>; })
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
                    <td className="fixcol c-qty" style={{ cursor: canEdit ? "pointer" : "default" }} title={canEdit ? `클릭: 생산수량 변경 (수주량 ${o.qty.toLocaleString()}g)` : ""} onClick={() => openQty(o)}>{pqty(o, p).toLocaleString()}{p.qty != null && Number(p.qty) !== o.qty ? <span style={{ color: "#f59e0b", fontSize: 11 }}> ✎</span> : null}</td>
                    {view === "day" ? (
                      <td className="barcell" colSpan={nDays}>
                        <div className="track" style={{ width: nDays * DAYW }}>
                          {Array.from({ length: nDays }, (_, i) => { const d = i + 1; const wd = new Date(cur.y, cur.m - 1, d).getDay(); const today = cur.y === TODAY.getFullYear() && cur.m === TODAY.getMonth() + 1 && d === TODAY.getDate(); const bg = today ? "var(--today)" : (wd === 0 || wd === 6 ? "var(--wknd)" : "#fff"); return <div key={d} style={{ position: "absolute", left: i * DAYW, top: 0, width: DAYW, height: 30, background: bg, borderRight: "1px solid var(--line2)" }} />; })}
                          <div className="ordermark" style={{ left: (dayOf(o.order_date) - 1) * DAYW }} title="주문일" />
                          <PlanBar o={o} p={p} left={(dayOf(p.start_date) - 1) * DAYW} w={p.span * DAYW - 3} qty={pqty(o, p)} per={Math.round(pqty(o, p) / p.span)} onMove={startMove} onResize={startResize} onToggle={() => toggleDone(o, p)} />
                        </div>
                      </td>
                    ) : (
                      buckets.map((b, i) => { let s = 0; for (let d = b.s; d <= b.e; d++) s += dayQty(o, p, d); return <td key={i} className="day" style={{ width: 70, minWidth: 70, background: p.done ? "#eee" : (s ? "#eaf3ea" : "#fff"), color: p.done ? "#999" : "var(--accent)", fontWeight: s ? 700 : 400, textDecoration: p.done ? "line-through" : "none" }}>{s ? Math.round(s).toLocaleString() : ""}</td>; })
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="fixcol c-no" /><td className="fixcol c-name" style={{ left: 34 }} /><td className="fixcol c-spec" style={{ left: 184 }} /><td className="fixcol c-cust" style={{ left: 344 }} />
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

function PlanBar({ o, p, left, w, per, qty, onMove, onResize, onToggle }: {
  o: Order; p: PlanEntry; left: number; w: number; per: number; qty: number;
  onMove: (e: React.PointerEvent, o: Order, el: HTMLDivElement) => void;
  onResize: (e: React.PointerEvent, o: Order, el: HTMLDivElement) => void;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className={"bar" + (p.done ? " done" : "")} style={{ left, width: w }} title={`${o.name} · ${qty}g`}
      onPointerDown={e => { if ((e.target as HTMLElement).classList.contains("handle")) return; onMove(e, o, ref.current!); }} onDoubleClick={onToggle}>
      <span className="qh">{qty.toLocaleString()}g</span>
      {p.span > 1 && <span style={{ opacity: .85 }}>({per}/일)</span>}
      <span className="handle" onPointerDown={e => onResize(e, o, ref.current!)} />
    </div>
  );
}
