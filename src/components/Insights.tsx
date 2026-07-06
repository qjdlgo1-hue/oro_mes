import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, CartesianGrid } from "recharts";
import * as XLSX from "xlsx";
import { InoutRow, listInout, listPlans } from "../lib/db";
import ProdConsumeAnalysis from "./ProdConsumeAnalysis";
import { Order, PlanEntry } from "../lib/types";
import { toast } from "../lib/toast";

type View = "in" | "out" | "pc";
type Unit = "year" | "quarter" | "month";
type Trade = "all" | "내자" | "외자";

const nf = (n: number) => Math.round(n).toLocaleString();
const PIE = ["#2563eb", "#f59e0b", "#1aa260", "#a855f7", "#ef4444", "#0ea5e9", "#84cc16", "#e879a0"];

export default function Insights({ orders = [] }: { orders?: Order[] }) {
  const [view, setView] = useState<View>("in");
  const [unit, setUnit] = useState<Unit>("month");
  const [year, setYear] = useState<string>("");      // "" = 전체
  const [trade, setTrade] = useState<Trade>("all");
  const [gubuns, setGubuns] = useState<Set<string>>(new Set());
  const [inRows, setInRows] = useState<InoutRow[]>([]);
  const [outRows, setOutRows] = useState<InoutRow[]>([]);
  const [plans, setPlans] = useState<Record<string, PlanEntry>>({});

  useEffect(() => {
    listInout("in").then(setInRows).catch(e => toast.error("생산 불러오기 실패: " + (e.message || e)));
    listPlans().then(setPlans).catch(() => {});
    listInout("out").then(setOutRows).catch(e => toast.error("판매 불러오기 실패: " + (e.message || e)));
  }, []);

  const isIn = view === "in";
  const rows = isIn ? inRows : outRows;
  const valueOf = (r: InoutRow) => isIn ? (Number(r.qty) || 0) : (Number(r.amount) || 0);
  const unitLabel = isIn ? "생산량(g)" : "판매액(원)";

  const gubunOpts = useMemo(() => [...new Set(inRows.map(r => r.gubun || "").filter(Boolean))].sort(), [inRows]);
  useEffect(() => { if (gubunOpts.length) setGubuns(new Set(gubunOpts)); }, [gubunOpts.join(",")]);
  const tradeFiltered = useMemo(() => {
    if (isIn) return gubunOpts.length ? rows.filter(r => gubuns.has(r.gubun || "")) : rows;
    return trade === "all" ? rows : rows.filter(r => (r.trade_type || "") === trade);
  }, [rows, isIn, trade, gubuns, gubunOpts]);
  const years = useMemo(() => [...new Set(rows.map(r => r.ym.slice(0, 4)))].sort(), [rows]);
  const scoped = useMemo(() => unit === "year" ? tradeFiltered : (year ? tradeFiltered.filter(r => r.ym.slice(0, 4) === year) : tradeFiltered), [tradeFiltered, unit, year]);

  function bucketOf(ym: string) {
    const y = ym.slice(0, 4), m = +ym.slice(5, 7), q = Math.ceil(m / 3);
    if (unit === "year") return { key: y, label: `${y}년` };
    if (unit === "quarter") return { key: `${y}-Q${q}`, label: year ? `${q}분기` : `${y} ${q}Q` };
    return { key: ym, label: year ? `${m}월` : ym };
  }

  const periodData = useMemo(() => {
    const m = new Map<string, any>();
    scoped.forEach(r => {
      const b = bucketOf(r.ym), v = valueOf(r);
      const e = m.get(b.key) || { key: b.key, name: b.label, value: 0, 내자: 0, 외자: 0 };
      e.value += v;
      if (!isIn) { (r.trade_type === "외자" ? (e.외자 += v) : (e.내자 += v)); }
      m.set(b.key, e);
    });
    return [...m.values()].sort((a, b) => a.key < b.key ? -1 : 1);
  }, [scoped, unit, year, isIn]);

  const aggBy = (keyFn: (r: InoutRow) => string) => {
    const m = new Map<string, { name: string; value: number }>();
    scoped.forEach(r => { const k = keyFn(r) || "(미상)"; const e = m.get(k) || { name: k, value: 0 }; e.value += valueOf(r); m.set(k, e); });
    return [...m.values()].sort((a, b) => b.value - a.value);
  };
  const byItem = useMemo(() => {
    const m = new Map<string, { code: string; name: string; value: number }>();
    scoped.forEach(r => { const code = r.item_code || r.name || "(미상)"; const e = m.get(code) || { code, name: r.name || r.item_code || "(미상)", value: 0 }; if ((!e.name || e.name === e.code) && r.name) e.name = r.name; e.value += valueOf(r); m.set(code, e); });
    return [...m.values()].sort((a, b) => b.value - a.value);
  }, [scoped, isIn]);
  const byCust = useMemo(() => aggBy(r => r.customer || ""), [scoped, isIn]);

  const total = scoped.reduce((s, r) => s + valueOf(r), 0);
  const domestic = !isIn ? scoped.filter(r => (r.trade_type || "") !== "외자").reduce((s, r) => s + valueOf(r), 0) : 0;
  const foreign = !isIn ? scoped.filter(r => (r.trade_type || "") === "외자").reduce((s, r) => s + valueOf(r), 0) : 0;
  const custCnt = new Set(scoped.map(r => r.customer || "")).size;
  const itemCnt = new Set(scoped.map(r => r.item_code || r.name)).size;
  const tradePie = [{ name: "내자", value: domestic }, { name: "외자", value: foreign }].filter(d => d.value > 0);

  function onBar(d: any) {
    if (!d || !d.key) return;
    if (unit === "year") { setYear(d.key); setUnit("quarter"); }
    else if (unit === "quarter") { setYear(d.key.slice(0, 4)); setUnit("month"); }
  }

  function exportXlsx() {
    if (!scoped.length) { toast.error("데이터가 없습니다."); return; }
    const wb = XLSX.utils.book_new();
    const p = [[unit === "year" ? "연도" : unit === "quarter" ? "분기" : "월", unitLabel, ...(isIn ? [] : ["내자", "외자"])]];
    periodData.forEach(r => p.push([r.name, String(Math.round(r.value)), ...(isIn ? [] : [String(Math.round(r.내자)), String(Math.round(r.외자))])]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(p), "기간별");
    const it = [["품목코드", "품목명", unitLabel]]; byItem.forEach(r => it.push([r.code, r.name, String(Math.round(r.value))]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(it), "품목별");
    if (!isIn) { const cu = [["거래처", "판매액"]]; byCust.forEach(r => cu.push([r.name, String(Math.round(r.value))])); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cu), "거래처별"); }
    XLSX.writeFile(wb, `${isIn ? "생산" : "판매"}_대시보드_${year || "전체"}.xlsx`);
    toast.success("엑셀 저장 완료");
  }

  const seg = (active: boolean): React.CSSProperties => ({ borderRadius: 0, fontSize: 13, background: active ? "#2563eb" : "#e7ebf1", color: active ? "#fff" : "#374151" });
  const card: React.CSSProperties = { background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: 14 };
  const kpi = (label: string, val: string, color = "#1f2330") => (
    <div style={card}><div className="muted" style={{ fontSize: 12 }}>{label}</div><div style={{ fontSize: 22, fontWeight: 700, color }}>{val}</div></div>
  );
  const th: React.CSSProperties = { background: "#f1f3f7", color: "#374151", fontSize: 12, fontWeight: 700, padding: "6px 8px", textAlign: "right", position: "sticky", top: 0 };
  const td: React.CSSProperties = { padding: "5px 8px", borderBottom: "1px solid var(--line2)", fontSize: 13, textAlign: "right" };
  const tdL: React.CSSProperties = { ...td, textAlign: "left" };

  const empty = rows.length === 0;

  const ovp = useMemo(() => {
    const m: Record<string, { ym: string; su: number; sa: number }> = {};
    orders.forEach(o => { const e = m[o.ym] || (m[o.ym] = { ym: o.ym, su: 0, sa: 0 }); const eff = plans[o.id]?.qty != null ? Number(plans[o.id]!.qty) : (Number(o.qty) || 0); e.su += Number(o.qty) || 0; e.sa += eff; });
    return Object.values(m).sort((a, b) => a.ym < b.ym ? -1 : 1).map(x => ({ name: x.ym, "수주": x.su, "생산": x.sa, diff: x.sa - x.su }));
  }, [orders, plans]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {view !== "pc" && ovp.length > 0 &&
        <div className="card">
          <h4 style={{ marginTop: 0 }}>월별 수주 vs 생산(계획) 요약 <span className="muted" style={{ fontSize: 12 }}>· 수주=주문수량, 생산=생산계획수량</span></h4>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={ovp} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} width={70} />
                <Tooltip formatter={(v: any) => Number(v).toLocaleString() + " g"} />
                <Legend />
                <Bar dataKey="수주" fill="#94a3b8" />
                <Bar dataKey="생산" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ overflow: "auto", maxHeight: "38vh", marginTop: 8 }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>
                <th style={{ ...th, textAlign: "left" }}>월</th>
                <th style={th}>수주(g)</th>
                <th style={th}>생산(g)</th>
                <th style={th}>차이</th>
              </tr></thead>
              <tbody>
                {ovp.map(r => (
                  <tr key={r.name}>
                    <td style={{ ...td, textAlign: "left" }}>{r.name}</td>
                    <td style={td}>{r["수주"].toLocaleString()}</td>
                    <td style={td}>{r["생산"].toLocaleString()}</td>
                    <td style={{ ...td, fontWeight: 700, color: r.diff > 0 ? "#1aa260" : r.diff < 0 ? "#c0392b" : "#6b7280" }}>{r.diff > 0 ? "+" : ""}{r.diff.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>}
      {/* 상단 토글 + 컨트롤 */}
      <div className="card">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
            <button className="btn" style={seg(view === "in")} onClick={() => setView("in")}>🏭 생산</button>
            <button className="btn" style={seg(view === "out")} onClick={() => setView("out")}>💰 판매</button>
            <button className="btn" style={seg(view === "pc")} onClick={() => setView("pc")}>🧪 생산·소모</button>
          </div>
          {view !== "pc" && <>
          <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
            {(["year", "quarter", "month"] as Unit[]).map(u => (
              <button key={u} className="btn" style={seg(unit === u)} onClick={() => setUnit(u)}>{u === "year" ? "연도별" : u === "quarter" ? "분기별" : "월별"}</button>
            ))}
          </div>
          <select value={year} onChange={e => setYear(e.target.value)} style={{ padding: 7, border: "1px solid var(--line)", borderRadius: 6 }}>
            <option value="">전체 연도</option>
            {years.map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          {isIn && gubunOpts.length > 0 &&
            <div style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap", border: "1px solid var(--line)", borderRadius: 8, padding: "4px 10px" }}>
              <span className="muted" style={{ fontSize: 12 }}>품목구분</span>
              {gubunOpts.map(g => (
                <label key={g} style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input type="checkbox" checked={gubuns.has(g)} onChange={() => setGubuns(s => { const n = new Set(s); n.has(g) ? n.delete(g) : n.add(g); return n; })} /> {g}
                </label>
              ))}
            </div>}
          {!isIn &&
            <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
              {(["all", "내자", "외자"] as Trade[]).map(t => (
                <button key={t} className="btn" style={seg(trade === t)} onClick={() => setTrade(t)}>{t === "all" ? "전체" : t}</button>
              ))}
            </div>}
          <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={exportXlsx}>📊 엑셀</button>
          </>}
        </div>
        {view !== "pc" && <p className="muted" style={{ fontSize: 11, margin: "8px 2px 0" }}>
          {isIn ? "생산입고 수량(g) 기준" : "판매 공급가액(부가세 제외) 기준"} · 막대를 누르면 {unit === "year" ? "분기" : unit === "quarter" ? "월" : "상세"}로 펼쳐집니다.
        </p>}
      </div>

      {view === "pc" ? <ProdConsumeAnalysis /> : empty ? <div className="card"><p className="muted">데이터가 없습니다. '{isIn ? "생산" : "판매"} 가져오기' 탭에서 먼저 데이터를 넣으세요.</p></div> :
      <>
        {/* KPI */}
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {isIn ? <>
            {kpi("총 생산량(g)", nf(total), "#2563eb")}
            {kpi("생산 건수", nf(scoped.length))}
            {kpi("품목 수", nf(itemCnt))}
          </> : <>
            {kpi("총 판매액", nf(total) + "원", "#1aa260")}
            {kpi("내자", nf(domestic) + "원", "#2563eb")}
            {kpi("외자", nf(foreign) + "원", "#f59e0b")}
            {kpi("거래처 수", nf(custCnt))}
          </>}
        </div>

        {/* 기간별 메인 차트 */}
        <div className="card">
          <h4 style={{ marginTop: 0 }}>{unit === "year" ? "연도별" : unit === "quarter" ? "분기별" : "월별"} {unitLabel}{year ? ` · ${year}년` : ""}</h4>
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={periodData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} width={70} />
                <Tooltip formatter={(v: any) => nf(v) + (isIn ? " g" : " 원")} />
                {isIn
                  ? <Bar dataKey="value" name="생산량" fill="#2563eb" cursor="pointer" onClick={onBar} />
                  : (trade === "all"
                    ? <>
                        <Legend />
                        <Bar dataKey="내자" stackId="a" fill="#2563eb" cursor="pointer" onClick={onBar} />
                        <Bar dataKey="외자" stackId="a" fill="#f59e0b" cursor="pointer" onClick={onBar} />
                      </>
                    : <Bar dataKey="value" name={trade} fill={trade === "외자" ? "#f59e0b" : "#2563eb"} cursor="pointer" onClick={onBar} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 보조 차트 */}
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: isIn ? "1fr" : "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <div className="card">
            <h4 style={{ marginTop: 0 }}>품목별 {unitLabel} (상위 10)</h4>
            <div style={{ width: "100%", height: Math.max(180, Math.min(byItem.length, 10) * 34 + 30) }}>
              <ResponsiveContainer>
                <BarChart layout="vertical" data={byItem.slice(0, 10)} margin={{ left: 10, right: 16 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => nf(v) + (isIn ? " g" : " 원")} />
                  <Bar dataKey="value" fill="#2563eb">{byItem.slice(0, 10).map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {!isIn &&
            <div className="card">
              <h4 style={{ marginTop: 0 }}>거래처별 판매액 (상위 10)</h4>
              <div style={{ width: "100%", height: Math.max(180, Math.min(byCust.length, 10) * 34 + 30) }}>
                <ResponsiveContainer>
                  <BarChart layout="vertical" data={byCust.slice(0, 10)} margin={{ left: 10, right: 16 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => nf(v) + " 원"} />
                    <Bar dataKey="value" fill="#1aa260">{byCust.slice(0, 10).map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>}

          {!isIn && tradePie.length > 0 &&
            <div className="card">
              <h4 style={{ marginTop: 0 }}>내자 / 외자 비중</h4>
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={tradePie} dataKey="value" nameKey="name" outerRadius={90} label={(e: any) => `${e.name} ${Math.round(e.percent * 100)}%`}>
                      <Cell fill="#2563eb" /><Cell fill="#f59e0b" />
                    </Pie>
                    <Tooltip formatter={(v: any) => nf(v) + " 원"} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>}
        </div>

        {/* 표 */}
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: isIn ? "1fr" : "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <div className="card">
            <h4 style={{ marginTop: 0 }}>품목별 {unitLabel}</h4>
            <div style={{ overflow: "auto", maxHeight: "50vh" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr><th style={{ ...th, textAlign: "left" }}>품목코드</th><th style={{ ...th, textAlign: "left" }}>품목명</th><th style={th}>{unitLabel}</th></tr></thead>
                <tbody>{byItem.map(r => <tr key={r.code}><td style={tdL}>{r.code}</td><td style={tdL}>{r.name}</td><td style={td}>{nf(r.value)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
          {!isIn &&
            <div className="card">
              <h4 style={{ marginTop: 0 }}>거래처별 판매액</h4>
              <div style={{ overflow: "auto", maxHeight: "50vh" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead><tr><th style={{ ...th, textAlign: "left" }}>거래처</th><th style={th}>판매액</th></tr></thead>
                  <tbody>{byCust.map(r => <tr key={r.name}><td style={tdL}>{r.name}</td><td style={td}>{nf(r.value)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>}
        </div>
      </>}
    </div>
  );
}
