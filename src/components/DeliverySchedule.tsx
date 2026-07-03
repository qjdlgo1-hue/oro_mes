import { useEffect, useMemo, useState } from "react";
import { Order, PlanEntry } from "../lib/types";
import { listPlans } from "../lib/db";
import { completionDate } from "../lib/plan";
import { nextBusinessDay } from "../lib/holidays";
import { toast } from "../lib/toast";

type Row = { o: Order; base: string; del: string };
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const p2 = (n: number) => String(n).padStart(2, "0");

export default function DeliverySchedule({ orders }: { orders: Order[] }) {
  const [plans, setPlans] = useState<Record<string, PlanEntry>>({});
  const [view, setView] = useState<"list" | "cal">("list");
  const [fromYm, setFromYm] = useState("");
  const [toYm, setToYm] = useState("");
  const [cust, setCust] = useState("__all__");
  const [selDay, setSelDay] = useState<string | null>(null);
  const [cal, setCal] = useState(() => {
    const ms = [...new Set(orders.map(o => o.ym))].sort(); const l = ms[ms.length - 1];
    if (l) return { y: +l.slice(0, 4), m: +l.slice(5, 7) };
    const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 };
  });
  useEffect(() => { listPlans().then(setPlans); }, []);

  const months = useMemo(() => [...new Set(orders.map(o => o.ym))].sort(), [orders]);
  const customers = useMemo(() => [...new Set(orders.map(o => o.customer || "(미상)"))].sort(), [orders]);
  const last = months[months.length - 1] || "";
  const f = fromYm || last, t = toYm || last;
  const lo = f <= t ? f : t, hi = f <= t ? t : f;

  const allRows = useMemo<Row[]>(() => orders
    .filter(o => cust === "__all__" || (o.customer || "(미상)") === cust)
    .map(o => { const p = plans[o.id]; const base = (p ? (completionDate(p) || o.order_date) : o.order_date); return { o, base, del: nextBusinessDay(base) }; }),
    [orders, plans, cust]);

  const listRows = useMemo(() => allRows.filter(r => r.o.ym >= lo && r.o.ym <= hi)
    .sort((a, b) => a.del < b.del ? -1 : a.del > b.del ? 1 : ((a.o.customer || "") < (b.o.customer || "") ? -1 : 1)), [allRows, lo, hi]);
  const groups = useMemo(() => {
    const g: Record<string, Row[]> = {};
    listRows.forEach(r => { const c = r.o.customer || "(미상)"; (g[c] || (g[c] = [])).push(r); });
    return Object.entries(g).sort((a, b) => a[0] < b[0] ? -1 : 1);
  }, [listRows]);

  const calYm = `${cal.y}-${p2(cal.m)}`;
  const byDay = useMemo(() => {
    const m: Record<string, Row[]> = {};
    allRows.filter(r => r.del.slice(0, 7) === calYm).forEach(r => { (m[r.del] || (m[r.del] = [])).push(r); });
    return m;
  }, [allRows, calYm]);
  const nDays = new Date(cal.y, cal.m, 0).getDate();
  const firstDow = new Date(cal.y, cal.m - 1, 1).getDay();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: nDays }, (_, i) => i + 1)];
  const maxCnt = Math.max(1, ...Object.values(byDay).map(a => a.length));
  const prevM = () => { setSelDay(null); setCal(c => c.m === 1 ? { y: c.y - 1, m: 12 } : { y: c.y, m: c.m - 1 }); };
  const nextM = () => { setSelDay(null); setCal(c => c.m === 12 ? { y: c.y + 1, m: 1 } : { y: c.y, m: c.m + 1 }); };

  const periodLabel = lo === hi ? lo : `${lo} ~ ${hi}`;
  function copyText(title: string, list: Row[]) {
    const lines = list.map(r => `${r.del}  ${r.o.customer || ""}  ${r.o.name} (${r.o.spec})  ${r.o.qty.toLocaleString()}g`);
    const txt = [title, ...lines].join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => toast.success("복사됨"), () => toast.error("복사 실패"));
    else toast.error("이 브라우저에서 자동 복사 불가");
  }

  const seg = (a: boolean): React.CSSProperties => ({ borderRadius: 0, fontSize: 13, background: a ? "#2563eb" : "#e7ebf1", color: a ? "#fff" : "#374151" });
  const th: React.CSSProperties = { background: "#f1f3f7", color: "#374151", fontSize: 12, fontWeight: 700, padding: "6px 8px", textAlign: "left" };
  const td: React.CSSProperties = { padding: "5px 8px", borderBottom: "1px solid var(--line2)", fontSize: 13 };
  const tdR: React.CSSProperties = { ...td, textAlign: "right" };
  const selList = selDay ? (byDay[selDay] || []) : [];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>🚚 배송 스케줄</h3>
          <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
            <button className="btn" style={seg(view === "list")} onClick={() => setView("list")}>목록형</button>
            <button className="btn" style={seg(view === "cal")} onClick={() => setView("cal")}>캘린더형</button>
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
              <button className="btn ghost" onClick={prevM}>◀</button>
              <b>{cal.y}년 {cal.m}월</b>
              <button className="btn ghost" onClick={nextM}>▶</button>
            </div>}
          <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={() => window.print()}>🖨 인쇄</button>
        </div>
        <p className="muted" style={{ fontSize: 11, margin: "8px 2px 0" }}>배송예정일 = 생산완료일의 다음 영업일(주말·공휴일 이월). {view === "cal" ? "날짜를 누르면 그 날 배송 건이 아래에 나옵니다." : "고객사별로 묶여 표시됩니다."}</p>
      </div>

      {view === "list" ?
        (groups.length === 0 ? <div className="card"><p className="muted">해당 기간의 배송 건이 없습니다.</p></div> :
          groups.map(([c, list]) => (
            <div className="card" key={c}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <h4 style={{ margin: 0 }}>{c} <span className="muted" style={{ fontSize: 12 }}>· {list.length}건</span></h4>
                <button className="btn ghost" style={{ marginLeft: "auto", fontSize: 12, padding: "4px 10px" }} onClick={() => copyText(`[${c}] 배송 스케줄 (${periodLabel})`, list)}>📋 복사</button>
              </div>
              <div style={{ overflow: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead><tr><th style={th}>배송예정일</th><th style={th}>품목</th><th style={th}>규격</th><th style={{ ...th, textAlign: "right" }}>수량(g)</th><th style={th}>생산완료일</th></tr></thead>
                  <tbody>
                    {list.map(r => (
                      <tr key={r.o.id}>
                        <td style={{ ...td, fontWeight: 700, color: "#2563eb" }}>{r.del}</td>
                        <td style={td}>{r.o.name}</td>
                        <td style={td}>{r.o.spec}</td>
                        <td style={tdR}>{r.o.qty.toLocaleString()}</td>
                        <td style={td}>{r.base}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )))
        :
        <div className="card">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
            {WD.map((w, i) => <div key={w} style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: i === 0 ? "#c0392b" : i === 6 ? "#2f6cb0" : "#6b7280" }}>{w}</div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
            {cells.map((d, i) => {
              if (d === null) return <div key={"b" + i} />;
              const iso = `${calYm}-${p2(d)}`; const items = byDay[iso] || []; const cnt = items.length;
              const dow = new Date(cal.y, cal.m - 1, d).getDay(); const inten = cnt / maxCnt;
              return (
                <button key={d} onClick={() => setSelDay(iso)} style={{
                  minHeight: 62, border: selDay === iso ? "2px solid #2563eb" : "1px solid var(--line)", borderRadius: 8,
                  background: cnt > 0 ? `rgba(37,99,235,${0.10 + 0.5 * inten})` : "#fff", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "flex-start", padding: 6, gap: 2
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: dow === 0 ? "#c0392b" : dow === 6 ? "#2f6cb0" : "#1c2128" }}>{d}</span>
                  {cnt > 0 && <span style={{ fontSize: 11, color: inten > 0.5 ? "#fff" : "#1f4e78", fontWeight: 700 }}>{cnt}건</span>}
                </button>
              );
            })}
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
