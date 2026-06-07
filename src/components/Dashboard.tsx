import { useEffect, useMemo, useState } from "react";
import { Order, PlanEntry } from "../lib/types";
import { listPlans } from "../lib/db";

function won(n: number) { return n.toLocaleString(); }

export default function Dashboard({ orders }: { orders: Order[] }) {
  const [plans, setPlans] = useState<Record<string, PlanEntry>>({});
  useEffect(() => { listPlans().then(setPlans); }, []);

  // 제품+무형상품만 집계
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

  // 선택 월의 품목별 분해
  const byItem = useMemo(() => {
    const m: Record<string, { qty: number; doneQty: number }> = {};
    prod.filter(o => o.ym === curYm).forEach(o => {
      const e = m[o.name] || (m[o.name] = { qty: 0, doneQty: 0 });
      e.qty += o.qty;
      if (plans[o.id]?.done) e.doneQty += o.qty;
    });
    return Object.entries(m).sort((a, b) => b[1].qty - a[1].qty);
  }, [prod, plans, curYm]);
  const maxItem = Math.max(1, ...byItem.map(([, v]) => v.qty));

  const Bar = ({ val, max, color }: { val: number; max: number; color: string }) =>
    <div style={{ background: "#eef2f7", borderRadius: 4, height: 14, width: 160, display: "inline-block", verticalAlign: "middle", overflow: "hidden" }}>
      <div style={{ width: `${Math.round(val / max * 100)}%`, background: color, height: "100%" }} />
    </div>;

  if (prod.length === 0) return <div className="card nodata">데이터가 없습니다. '주문 가져오기' 탭에서 주문을 넣으세요.</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>월별 생산 요약 <span className="muted">(완료 = 생산계획에서 '완료' 처리한 주문)</span></h3>
        <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}>
          <thead><tr>{["월", "주문건수", "발주량(g)", "완료건수", "완료량(g)", "달성률", ""].map(h =>
            <th key={h} style={{ borderBottom: "2px solid var(--navy)", padding: "6px 8px", textAlign: h === "월" ? "left" : "right", color: "var(--navy)" }}>{h}</th>)}</tr></thead>
          <tbody>
            {perMonth.map(([ym, v]) => {
              const rate = v.qty ? Math.round(v.doneQty / v.qty * 100) : 0;
              return (
                <tr key={ym} style={{ cursor: "pointer", background: ym === curYm ? "#eef3fb" : "" }} onClick={() => setSel(ym)}>
                  <td style={{ padding: "6px 8px", fontWeight: 700 }}>{ym}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{v.cnt}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{won(v.qty)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{v.doneCnt}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{won(v.doneQty)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: rate >= 100 ? "#1aa260" : "#1f4e78" }}>{rate}%</td>
                  <td style={{ padding: "6px 8px" }}><Bar val={v.qty} max={maxQty} color="#9bb8d9" /><Bar val={v.doneQty} max={maxQty} color="#1aa260" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 6 }}>막대: 연한=발주량, 초록=완료량. 행을 클릭하면 아래에 그 달 품목별 상세가 나옵니다.</p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{curYm} 품목별 상세</h3>
        {byItem.length === 0 ? <p className="muted">해당 월 데이터 없음.</p> :
          <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}>
            <thead><tr>{["품목", "발주량(g)", "완료량(g)", "달성률", ""].map(h =>
              <th key={h} style={{ borderBottom: "2px solid var(--navy)", padding: "6px 8px", textAlign: h === "품목" ? "left" : "right", color: "var(--navy)" }}>{h}</th>)}</tr></thead>
            <tbody>
              {byItem.map(([name, v]) => {
                const rate = v.qty ? Math.round(v.doneQty / v.qty * 100) : 0;
                return (
                  <tr key={name}>
                    <td style={{ padding: "5px 8px", fontWeight: 700 }}>{name}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{won(v.qty)}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{won(v.doneQty)}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", color: rate >= 100 ? "#1aa260" : "#1f4e78" }}>{rate}%</td>
                    <td style={{ padding: "5px 8px" }}><Bar val={v.qty} max={maxItem} color="#9bb8d9" /><Bar val={v.doneQty} max={maxItem} color="#1aa260" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>}
      </div>
    </div>
  );
}
