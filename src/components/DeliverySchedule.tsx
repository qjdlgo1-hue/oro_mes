import { errMsg } from "../lib/errmsg";
import { thBase, tdBase } from "../lib/styles";
import { todayIso } from "../lib/fmt";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Order, PlanEntry } from "../lib/types";
import { listPlans, upsertPlan, logAudit } from "../lib/db";
import { completionDate } from "../lib/plan";
import { nextBusinessDay } from "../lib/holidays";
import { toast } from "../lib/toast";
import { can } from "../lib/perm";
import { confirmDialog } from "../lib/confirm";
import { useIsMobile } from "../lib/useIsMobile";

type Row = { o: Order; base: string; del: string; manual: boolean };
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const p2 = (n: number) => String(n).padStart(2, "0");

export default function DeliverySchedule({ orders }: { orders: Order[] }) {
  const [plans, setPlans] = useState<Record<string, PlanEntry>>({});
  const [view, setView] = useState<"list" | "cal">("list");
  const [fromYm, setFromYm] = useState("");
  const [toYm, setToYm] = useState("");
  const [cust, setCust] = useState("__all__");
  const [selDay, setSelDay] = useState<string | null>(null);
  const canEdit = can("plan.edit");
  const isMobile = useIsMobile();
  const [cal, setCal] = useState(() => {
    const ms = [...new Set(orders.map(o => o.ym))].sort(); const l = ms[ms.length - 1];
    if (l) return { y: +l.slice(0, 4), m: +l.slice(5, 7) };
    const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 };
  });
  const [calAuto, setCalAuto] = useState(true); // 사용자가 월을 직접 옮기기 전까지 배송일 기준 자동 선택
  const [loaded, setLoaded] = useState(false);
  const [asOf, setAsOf] = useState<Date | null>(null); // 계획 데이터 기준 시각
  const refetch = () => listPlans().then(p => { setPlans(p); setAsOf(new Date()); }).finally(() => setLoaded(true));
  useEffect(() => { refetch(); }, []);
  // 다른 창/기기에서 생산계획을 바꿔도 이 화면으로 돌아오면 즉시 최신 계획으로 갱신
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") refetch(); };
    window.addEventListener("focus", onVis);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("focus", onVis); document.removeEventListener("visibilitychange", onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const months = useMemo(() => [...new Set(orders.map(o => o.ym))].sort(), [orders]);
  const customers = useMemo(() => [...new Set(orders.map(o => o.customer || "(미상)"))].sort(), [orders]);
  const last = months[months.length - 1] || "";
  const f = fromYm || last, t = toYm || last;
  const lo = f <= t ? f : t, hi = f <= t ? t : f;

  const allRows = useMemo<Row[]>(() => orders
    .filter(o => cust === "__all__" || (o.customer || "(미상)") === cust)
    .map(o => { const p = plans[o.id]; const base = (p ? (completionDate(p) || o.order_date) : o.order_date); const ov = p?.deliver_date || ""; return { o, base, del: ov || nextBusinessDay(base), manual: !!ov }; }),
    [orders, plans, cust]);

  const listRows = useMemo(() => allRows.filter(r => r.o.ym >= lo && r.o.ym <= hi)
    .sort((a, b) => a.del < b.del ? -1 : a.del > b.del ? 1 : ((a.o.customer || "") < (b.o.customer || "") ? -1 : 1)), [allRows, lo, hi]);
  const groups = useMemo(() => {
    const g: Record<string, Row[]> = {};
    listRows.forEach(r => { const c = r.o.customer || "(미상)"; (g[c] || (g[c] = [])).push(r); });
    return Object.entries(g).sort((a, b) => a[0] < b[0] ? -1 : 1);
  }, [listRows]);

  // 캘린더 기본 월: 주문 월이 아니라 '배송일' 기준 — 오늘 이후 가장 가까운 배송일의 월(없으면 최신 배송월).
  // 계획을 다음 달로 밀면 캘린더가 그 달을 바로 보여준다. 사용자가 ◀▶로 옮기면 자동 선택 중단.
  useEffect(() => {
    if (!calAuto || !loaded || !allRows.length) return;
    const today = todayIso(); // 로컬(KST) 기준 — UTC 자정 오차 방지
    const dels = allRows.map(r => r.del).sort();
    const target = dels.find(d => d >= today) || dels[dels.length - 1];
    if (target) {
      const y = +target.slice(0, 4), m = +target.slice(5, 7);
      setCal(c => (c.y === y && c.m === m) ? c : { y, m });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, allRows, calAuto]);

  const calYm = `${cal.y}-${p2(cal.m)}`;
  const byDay = useMemo(() => {
    const m: Record<string, Row[]> = {};
    allRows.filter(r => r.del.slice(0, 7) === calYm).forEach(r => { (m[r.del] || (m[r.del] = [])).push(r); });
    return m;
  }, [allRows, calYm]);
  const nDays = new Date(cal.y, cal.m, 0).getDate();
  const days = Array.from({ length: nDays }, (_, i) => i + 1);
  const calRowsList = useMemo(() => allRows.filter(r => r.del.slice(0, 7) === calYm)
    .sort((a, b) => (a.o.customer || "") < (b.o.customer || "") ? -1 : (a.o.customer || "") > (b.o.customer || "") ? 1 : (a.del < b.del ? -1 : 1)), [allRows, calYm]);
  const prevM = () => { setSelDay(null); setCalAuto(false); setCal(c => c.m === 1 ? { y: c.y - 1, m: 12 } : { y: c.y, m: c.m - 1 }); };
  const nextM = () => { setSelDay(null); setCalAuto(false); setCal(c => c.m === 12 ? { y: c.y + 1, m: 1 } : { y: c.y, m: c.m + 1 }); };

  async function setDeliver(o: Order, iso: string | null) {
    if (!canEdit) { toast.error("배송일 변경 권한이 없습니다."); return; }
    const bp = plans[o.id] || { order_id: o.id, start_date: o.order_date, span: 1, done: false };
    const np = { ...bp, deliver_date: iso };
    setPlans(prev => ({ ...prev, [o.id]: np }));
    try { await upsertPlan(np); logAudit("배송일 변경", "plan", o.id, { deliver_date: iso }); toast.success(iso ? `배송일 → ${iso}` : "배송일 자동으로 복귀"); }
    catch (e: any) { toast.error("저장 실패: " + errMsg(e)); listPlans().then(setPlans).catch(() => {}); }
  }
  const periodLabel = lo === hi ? lo : `${lo} ~ ${hi}`;
  function exportXlsx() {
    const list = view === "cal" ? calRowsList : listRows;
    if (!list.length) { toast.error("내보낼 배송 건이 없습니다."); return; }
    const aoa: any[][] = [["고객사", "배송예정일", "품목", "규격", "수량(g)", "생산완료일", "지정"],
      ...list.map(r => [r.o.customer || "", r.del, r.o.name, r.o.spec, r.o.qty, r.base, r.manual ? "수동" : "자동"])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "배송스케줄");
    XLSX.writeFile(wb, `배송스케줄_${view === "cal" ? calYm : periodLabel.replace(/\s/g, "")}.xlsx`);
    toast.success("엑셀 저장 완료");
  }
  function copyText(title: string, list: Row[]) {
    const lines = list.map(r => `${r.del}  ${r.o.customer || ""}  ${r.o.name} (${r.o.spec})  ${r.o.qty.toLocaleString()}g`);
    const txt = [title, ...lines].join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => toast.success("복사됨"), () => toast.error("복사 실패"));
    else toast.error("이 브라우저에서 자동 복사 불가");
  }

  const th: React.CSSProperties = { ...thBase, textAlign: "left", position: "static" };
  const td: React.CSSProperties = { ...tdBase, textAlign: "left" };
  const tdR: React.CSSProperties = { ...td, textAlign: "right" };
  const selList = selDay ? (byDay[selDay] || []) : [];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>🚚 배송 스케줄</h3>
          <div className="seg">
            <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>목록형</button>
            <button className={view === "cal" ? "on" : ""} onClick={() => setView("cal")}>캘린더형</button>
          </div>
          <select value={cust} onChange={e => setCust(e.target.value)} style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6 }}>
            <option value="__all__">전체 고객사</option>
            {customers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {view === "list" ?
            <label style={{ fontSize: 13, color: "var(--muted)" }}>기간
              <select value={f} onChange={e => setFromYm(e.target.value)} style={{ marginLeft: 6, padding: 6, border: "1px solid var(--line)", borderRadius: 6 }}>{months.map(m => <option key={m} value={m}>{m}</option>)}</select>
              <span style={{ margin: "0 6px" }}>~</span>
              <select value={t} onChange={e => setToYm(e.target.value)} style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6 }}>{months.map(m => <option key={m} value={m}>{m}</option>)}</select>
            </label>
            :
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <button className="btn ghost" onClick={prevM} aria-label="이전 달">◀</button>
              <b>{cal.y}년 {cal.m}월</b>
              <button className="btn ghost" onClick={nextM} aria-label="다음 달">▶</button>
              <button className="btn ghost" style={{ fontSize: 12 }} onClick={() => { const d = new Date(); setSelDay(null); setCalAuto(false); setCal({ y: d.getFullYear(), m: d.getMonth() + 1 }); }}>오늘</button>
            </div>}
          <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={refetch} title="생산계획 다시 불러오기">🔄</button>
          {asOf && <span className="muted" style={{ fontSize: 11 }}>계획 기준 {asOf.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>}
          <button className="btn ghost" onClick={exportXlsx}>📊 엑셀</button>
          <button className="btn ghost" onClick={() => window.print()}>🖨 인쇄</button>
        </div>
        <p className="muted" style={{ fontSize: 11, margin: "8px 2px 0" }}>배송예정일 = 생산완료일의 다음 영업일(주말·공휴일 이월). {view === "cal" ? "날짜 칸을 클릭하면 배송일을 옮길 수 있어요(●파랑=자동, ◆주황=수동지정). 수동 칸 다시 클릭=자동복귀." : "고객사별로 묶여 표시. 배송예정일 칸에서 날짜를 직접 바꿀 수 있어요(◆주황=수동, 자동=되돌리기)."}</p>
      </div>

      {view === "list" ?
        (groups.length === 0 ? <div className="card"><p className="muted">{loaded ? "해당 기간의 배송 건이 없습니다." : "불러오는 중…"}</p></div> :
          groups.map(([c, list]) => (
            <div className="card" key={c}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <h4 style={{ margin: 0 }}>{c} <span className="muted" style={{ fontSize: 12 }}>· {list.length}건</span></h4>
                <button className="btn ghost" style={{ marginLeft: "auto", fontSize: 12, padding: "4px 10px" }} onClick={() => copyText(`[${c}] 배송 스케줄 (${periodLabel})`, list)}>📋 복사</button>
              </div>
              {isMobile ? (
                <div>
                  {list.map(r => (
                    <div className="mcard" key={r.o.id}>
                      <div className="mrow"><span className="k">품목</span><span className="v">{r.o.name}</span></div>
                      <div className="mrow"><span className="k">규격 / 수량</span><span className="v" style={{ fontWeight: 400 }}>{r.o.spec} · {r.o.qty.toLocaleString()}g</span></div>
                      <div className="mrow"><span className="k">주문일 / 생산완료일</span><span className="v" style={{ fontWeight: 400 }}>{r.o.order_date} / {r.base}</span></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>배송예정일{r.manual ? " ◆수동" : ""}</span>
                        {canEdit
                          ? <><input type="date" value={r.del} onChange={e => { if (e.target.value) setDeliver(r.o, e.target.value); }} style={{ padding: 8, border: "1px solid var(--line)", borderRadius: 6, fontSize: 16, flex: 1 }} />
                              {r.manual && <button className="btn ghost" onClick={() => setDeliver(r.o, null)}>자동</button>}</>
                          : <b style={{ color: r.manual ? "#f59e0b" : "var(--accent)" }}>{r.del}</b>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
              <div style={{ overflow: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead><tr><th style={th}>배송예정일</th><th style={th}>품목</th><th style={th}>규격</th><th style={{ ...th, textAlign: "right" }}>수량(g)</th><th style={th}>주문일</th><th style={th}>생산완료일</th></tr></thead>
                  <tbody>
                    {list.map(r => (
                      <tr key={r.o.id}>
                        <td style={{ ...td, fontWeight: 700, color: r.manual ? "#f59e0b" : "var(--accent)" }}>
                          {canEdit
                            ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <input type="date" value={r.del} aria-label="배송예정일" onChange={e => { if (e.target.value) setDeliver(r.o, e.target.value); }} style={{ padding: "4px 6px", border: "1px solid var(--line)", borderRadius: 4, fontSize: 13 }} />
                                {r.manual && <span title="수동 지정됨">◆</span>}
                                {r.manual && <button className="btn ghost" style={{ padding: "1px 6px", fontSize: 11 }} onClick={() => setDeliver(r.o, null)}>자동</button>}
                              </span>
                            : <>{r.del}{r.manual ? " ◆" : ""}</>}
                        </td>
                        <td style={td}>{r.o.name}</td>
                        <td style={td}>{r.o.spec}</td>
                        <td style={tdR}>{r.o.qty.toLocaleString()}</td>
                        <td style={{ ...td, color: "var(--muted)" }}>{r.o.order_date}</td>
                        <td style={td}>{r.base}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>)}
            </div>
          )))
        :
        <div className="card">
          <div className="board" style={{ maxHeight: "70vh" }}>
            <table className="grid">
              <thead>
                <tr>
                  <th className="fixcol c-no">NO</th>
                  <th className="fixcol c-name" style={{ left: 34 }}>고객사</th>
                  <th className="fixcol c-spec" style={{ left: 184 }}>품목</th>
                  <th className="fixcol c-cust" style={{ left: 344 }}>규격</th>
                  <th className="fixcol c-qty" style={{ left: 464 }}>수량</th>
                  {days.map(d => { const dow = new Date(cal.y, cal.m - 1, d).getDay(); return <th key={d} className={"day" + (dow === 0 ? " sun" : dow === 6 ? " sat" : "")} style={{ cursor: "pointer" }} onClick={() => setSelDay(`${calYm}-${p2(d)}`)}><div className="dn">{d}</div><div className="wd">{WD[dow]}</div></th>; })}
                </tr>
              </thead>
              <tbody>
                {calRowsList.length === 0 ? <tr><td className="fixcol c-no" /><td colSpan={4 + nDays} style={{ padding: 12, color: "var(--muted)" }}>이 달 배송 예정 건이 없습니다.</td></tr> :
                  calRowsList.map((r, idx) => {
                    const dd = +r.del.slice(8, 10);
                    return (
                      <tr key={r.o.id}>
                        <td className="fixcol c-no">{idx + 1}</td>
                        <td className="fixcol c-name" style={{ left: 34 }} title={r.o.customer}>{r.o.customer}</td>
                        <td className="fixcol c-spec" style={{ left: 184 }} title={r.o.name}>{r.o.name}</td>
                        <td className="fixcol c-cust" style={{ left: 344 }} title={r.o.spec}>{r.o.spec}</td>
                        <td className="fixcol c-qty" style={{ left: 464 }}>{r.o.qty.toLocaleString()}</td>
                        {days.map(d => { const dow = new Date(cal.y, cal.m - 1, d).getDay(); const iso = `${calYm}-${p2(d)}`; const isDel = d === dd; const dc = r.manual ? "#f59e0b" : "var(--accent)"; return <td key={d} className="day" style={{ background: isDel ? dc : (dow === 0 || dow === 6 ? "var(--wknd)" : "#fff"), color: "#fff", cursor: canEdit || isDel ? "pointer" : "default" }} title={isDel ? `${r.del} 배송 (${r.manual ? "수동" : "자동"})${canEdit ? " · 다시 클릭=자동복귀" : ""}` : (canEdit ? `${iso}로 옮기기` : "")} onClick={async () => { if (!canEdit) { if (isDel) setSelDay(r.del); return; } if (isDel) { if (r.manual) setDeliver(r.o, null); else setSelDay(r.del); } else { if (await confirmDialog({ title: "배송일 이동", message: `${r.o.customer} · ${r.o.name}\n배송일을 ${r.del} → ${iso} 로 옮길까요?`, confirmLabel: "이동" })) setDeliver(r.o, iso); } }}>{isDel ? (r.manual ? "◆" : "●") : ""}</td>; })}
                      </tr>
                    );
                  })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="fixcol c-no" /><td className="fixcol c-name" style={{ left: 34 }} /><td className="fixcol c-spec" style={{ left: 184 }} /><td className="fixcol c-cust" style={{ left: 344 }} />
                  <td className="fixcol c-qty" style={{ left: 464 }}>건수</td>
                  {days.map(d => { const c = (byDay[`${calYm}-${p2(d)}`] || []).length; return <td key={d} className="day" style={{ fontWeight: c ? 700 : 400, color: c ? "var(--accent)" : "#ccc" }}>{c || ""}</td>; })}
                </tr>
              </tfoot>
            </table>
          </div>
          {selDay &&
            <div style={{ marginTop: 12, borderTop: "2px solid var(--line)", paddingTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <b>{selDay} 배송 {selList.length}건</b>
                {selList.length > 0 && <button className="btn ghost" style={{ marginLeft: "auto", fontSize: 12, padding: "4px 10px" }} onClick={() => copyText(`${selDay} 배송`, selList)}>📋 복사</button>}
              </div>
              {selList.length === 0 ? <p className="muted">이 날 배송 건이 없습니다.</p> :
                <div style={{ overflow: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead><tr><th style={th}>고객사</th><th style={th}>품목</th><th style={th}>규격</th><th style={{ ...th, textAlign: "right" }}>수량(g)</th></tr></thead>
                    <tbody>{selList.map(r => <tr key={r.o.id}><td style={td}>{r.o.customer}</td><td style={td}>{r.o.name}</td><td style={td}>{r.o.spec}</td><td style={tdR}>{r.o.qty.toLocaleString()}</td></tr>)}</tbody>
                  </table>
                </div>}
            </div>}
        </div>}
    </div>
  );
}
