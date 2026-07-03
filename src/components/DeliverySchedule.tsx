import { useEffect, useMemo, useState } from "react";
import { Order, PlanEntry } from "../lib/types";
import { listPlans } from "../lib/db";
import { completionDate } from "../lib/plan";
import { nextBusinessDay } from "../lib/holidays";
import { toast } from "../lib/toast";

type Row = { o: Order; base: string; del: string };

export default function DeliverySchedule({ orders }: { orders: Order[] }) {
  const [plans, setPlans] = useState<Record<string, PlanEntry>>({});
  const [fromYm, setFromYm] = useState("");
  const [toYm, setToYm] = useState("");
  const [cust, setCust] = useState("__all__");
  useEffect(() => { listPlans().then(setPlans); }, []);

  const months = useMemo(() => [...new Set(orders.map(o => o.ym))].sort(), [orders]);
  const customers = useMemo(() => [...new Set(orders.map(o => o.customer || "(미상)"))].sort(), [orders]);
  const last = months[months.length - 1] || "";
  const f = fromYm || last, t = toYm || last;
  const lo = f <= t ? f : t, hi = f <= t ? t : f;

  const rows = useMemo<Row[]>(() => {
    return orders
      .filter(o => o.ym >= lo && o.ym <= hi)
      .filter(o => cust === "__all__" || (o.customer || "(미상)") === cust)
      .map(o => { const p = plans[o.id]; const base = (p ? (completionDate(p) || o.order_date) : o.order_date); return { o, base, del: nextBusinessDay(base) }; })
      .sort((a, b) => a.del < b.del ? -1 : a.del > b.del ? 1 : ((a.o.customer || "") < (b.o.customer || "") ? -1 : 1));
  }, [orders, plans, lo, hi, cust]);

  const groups = useMemo(() => {
    const g: Record<string, Row[]> = {};
    rows.forEach(r => { const c = r.o.customer || "(미상)"; (g[c] || (g[c] = [])).push(r); });
    return Object.entries(g).sort((a, b) => a[0] < b[0] ? -1 : 1);
  }, [rows]);

  const periodLabel = lo === hi ? lo : `${lo} ~ ${hi}`;

  function copyOne(c: string, list: Row[]) {
    const head = `[${c}] 배송 스케줄 (${periodLabel})`;
    const lines = list.map(r => `${r.del}  ${r.o.name} (${r.o.spec})  ${r.o.qty.toLocaleString()}g`);
    const txt = [head, ...lines].join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => toast.success(`${c} 스케줄 복사됨`), () => toast.error("복사 실패"));
    else toast.error("이 브라우저에서 자동 복사 불가");
  }

  const th: React.CSSProperties = { background: "#f1f3f7", color: "#374151", fontSize: 12, fontWeight: 700, padding: "6px 8px", textAlign: "left" };
  const td: React.CSSProperties = { padding: "5px 8px", borderBottom: "1px solid var(--line2)", fontSize: 13 };
  const tdR: React.CSSProperties = { ...td, textAlign: "right" };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>🚚 배송 스케줄</h3>
          <label style={{ fontSize: 13, color: "var(--muted)" }}>기간
            <select value={f} onChange={e => setFromYm(e.target.value)} style={{ marginLeft: 6, padding: 6, border: "1px solid var(--line)", borderRadius: 6 }}>
              {months.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <span style={{ margin: "0 6px" }}>~</span>
            <select value={t} onChange={e => setToYm(e.target.value)} style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6 }}>
              {months.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <select value={cust} onChange={e => setCust(e.target.value)} style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6 }}>
            <option value="__all__">전체 고객사</option>
            {customers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={() => window.print()}>🖨 인쇄</button>
        </div>
        <p className="muted" style={{ fontSize: 11, margin: "8px 2px 0" }}>배송예정일 = 생산완료일의 다음 영업일(주말·공휴일이면 그 다음 평일). 생산계획 없는 주문은 주문일 기준.</p>
      </div>

      {groups.length === 0 ? <div className="card"><p className="muted">해당 기간의 주문이 없습니다.</p></div> :
        groups.map(([c, list]) => (
          <div className="card" key={c}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <h4 style={{ margin: 0 }}>{c} <span className="muted" style={{ fontSize: 12 }}>· {list.length}건</span></h4>
              <button className="btn ghost" style={{ marginLeft: "auto", fontSize: 12, padding: "4px 10px" }} onClick={() => copyOne(c, list)}>📋 복사</button>
            </div>
            <div style={{ overflow: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr>
                  <th style={th}>배송예정일</th>
                  <th style={th}>품목</th>
                  <th style={th}>규격</th>
                  <th style={{ ...th, textAlign: "right" }}>수량(g)</th>
                  <th style={th}>생산완료일</th>
                </tr></thead>
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
        ))}
    </div>
  );
}
