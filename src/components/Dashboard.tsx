import { useEffect, useMemo, useState } from "react";
import { Order, PlanEntry } from "../lib/types";
import { listPlans } from "../lib/db";

function won(n: number) { return n.toLocaleString(); }
const TH: React.CSSProperties = { background: "var(--navy)", color: "#fff", padding: "6px 8px", position: "sticky", top: 0, fontSize: 12, fontWeight: 700 };
const TD: React.CSSProperties = { padding: "5px 8px", borderBottom: "1px solid #eef2f7" };

export default function Dashboard({ orders }: { orders: Order[] }) {
  const [plans, setPlans] = useState<Record<string, PlanEntry>>({});
  useEffect(() => { listPlans().then(setPlans); }, []);

  const prod = useMemo(() => orders.filter(o => o.gubun === "제품" || o.gubun === "무형상품"), [orders]);
  const months = useMemo(() => [...new Set(prod.map(o => o.ym))].sort(), [prod]);
  const [sel, setSel] = useState<string>("");
  const curYm = sel || months[months.length - 1] || "";

  const perMonth = useMemo(() => {
    const m: Record<string, { cnt: number; qty: number; doneCnt: number; doneQty: number }> = {};
    prod.forEach(o => {
      const e = m[o.ym] || (m[o.ym] = { cnt: 0, qty: 0, doneCnt: 0, doneQty: 0 });
      e.cnt++; e.qty += o.qty;
      if (plans[o.id]?.done) { e.doneCnt++; e.doneQty += o.qty; }
    });
    return Object.entries(m).sort((a, b) => a[0] < b[0] ? 1 : -1);
  }, [prod, plans]);
  const maxQty = Math.max(1, ...perMonth.map(([, v]) => v.qty));

  function groupBy(key: (o: Order) => string) {
    const m: Record<string, { qty: number; doneQty: number }> = {};
    prod.filter(o => o.ym === curYm).forEach(o => {
      const e = m[key(o)] || (m[key(o)] = { qty: 0, doneQty: 0 });
      e.qty += o.qty; if (plans[o.id]?.done) e.doneQty += o.qty;
    });
    return Object.entries(m).sort((a, b) => b[1].qty - a[1].qty);
  }
  const byItem = useMemo(() => groupBy(o => o.name), [prod, plans, curYm]);
  const byCust = useMemo(() => groupBy(o => o.customer), [prod, plans, curYm]);

  const Bar = ({ val, max, color }: { val: number; max: number; color: string }) =>
    <div style={{ background: "#eef2f7", borderRadius: 4, height: 13, width: 130, display: "inline-block", verticalAlign: "middle", overflow: "hidden" }}>
      <div style={{ width: `${Math.round(val / max * 100)}%`, background: color, height: "100%" }} />
    </div>;

  function DetailTable({ title, rows, head }: { title: string; rows: [string, { qty: number; doneQty: number }][]; head: string }) {
    const mx = Math.max(1, ...rows.map(([, v]) => v.qty));
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        {rows.length === 0 ? <p className="muted">해당 월 데이터 없음.</p> :
          <div style={{ overflow: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}>
              <thead><tr>
                <th style={{ ...TH, textAlign: "left" }}>{head}</th>
                <th style={{ ...TH, textAlign: "right" }}>발주량(g)</th>
                <th style={{ ...TH, textAlign: "right" }}>완료량(g)</th>
                <th style={{ ...TH, textAlign: "right" }}>달성률</th>
                <th style={TH}></th>
              </tr></thead>
              <tbody>
                {rows.map(([name, v]) => {
                  const rate = v.qty ? Math.round(v.doneQty / v.qty * 100) : 0;
                  return (
                    <tr key={name}>
                      <td style={{ ...TD, fontWeight: 700 }}>{name}</td>
                      <td style={{ ...TD, textAlign: "right" }}>{won(v.qty)}</td>
                      <td style={{ ...TD, textAlign: "right" }}>{won(v.doneQty)}</td>
                      <td style={{ ...TD, textAlign: "right", color: rate >= 100 ? "#1aa260" : "#1f4e78" }}>{rate}%</td>
                      <td style={TD}><Bar val={v.qty} max={mx} color="#9bb8d9" /><Bar val={v.doneQty} max={mx} color="#1aa260" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>}
      </div>
    );
  }

  if (prod.length === 0) return <div className="card nodata">데이터가 없습니다. '주문 가져오기' 탭에서 주문을 넣으세요.</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>월별 생산 요약 <span className="muted">(완료 = 생산계획에서 '완료' 처리한 주문 · 행 클릭=상세)</span></h3>
        <div style={{ overflow: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}>
            <thead><tr>
              <th style={{ ...TH, textAlign: "left" }}>월</th>
              <th style={{ ...TH, textAlign: "right" }}>주문건수</th>
              <th style={{ ...TH, textAlign: "right" }}>발주량(g)</th>
              <th style={{ ...TH, textAlign: "right" }}>완료건수</th>
              <th style={{ ...TH, textAlign: "right" }}>완료량(g)</th>
              <th style={{ ...TH, textAlign: "right" }}>달성률</th>
              <th style={TH}></th>
            </tr></thead>
            <tbody>
              {perMonth.map(([ym, v]) => {
                const rate = v.qty ? Math.round(v.doneQty / v.qty * 100) : 0;
                return (
                  <tr key={ym} style={{ cursor: "pointer", background: ym === curYm ? "#eef3fb" : "" }} onClick={() => setSel(ym)}>
                    <td style={{ ...TD, fontWeight: 700 }}>{ym}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{v.cnt}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{won(v.qty)}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{v.doneCnt}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{won(v.doneQty)}</td>
                    <td style={{ ...TD, textAlign: "right", fontWeight: 700, color: rate >= 100 ? "#1aa260" : "#1f4e78" }}>{rate}%</td>
                    <td style={TD}><Bar val={v.qty} max={maxQty} color="#9bb8d9" /><Bar val={v.doneQty} max={maxQty} color="#1aa260" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 6 }}>막대: 연한=발주량, 초록=완료량. <b style={{ color: "#1f4e78" }}>{curYm}</b> 기준 아래 상세.</p>
      </div>

      {/* 반응형: 넓으면 2단, 좁으면 1단 */}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))" }}>
        <DetailTable title={`${curYm} 품목별 상세`} rows={byItem} head="품목" />
        <DetailTable title={`${curYm} 고객사별 상세`} rows={byCust} head="고객사" />
      </div>
    </div>
  );
}
