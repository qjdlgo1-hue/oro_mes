import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { ProdConsume, listProdConsume } from "../lib/db";
import { nf, nf1, nf3 } from "../lib/fmt";
import { usePersistState } from "../lib/usePersist";
import { useIsMobile } from "../lib/useIsMobile";
import MonthPicker from "./MonthPicker";

const PIE = ["#2563eb", "#f59e0b", "#1aa260", "#a855f7", "#ef4444", "#0ea5e9", "#84cc16", "#e879a0", "#6b7280", "#14b8a6"];
type PV = "prod" | "mat" | "std" | "unit";

export default function ProdConsumeAnalysis() {
  const [rows, setRows] = useState<ProdConsume[]>([]);
  const [view, setView] = usePersistState<PV>("pc.view", "prod");
  const [ym, setYm] = usePersistState("pc.ym", "");
  const [selMat, setSelMat] = useState<string | null>(null);
  const [matrixAll, setMatrixAll] = useState(false); // 매트릭스: 기본 최근 12개월, 체크 시 전체 기간
  const [prodAll, setProdAll] = useState(false);     // 생산실적 월별 차트: 동일 패턴
  const [loaded, setLoaded] = useState(false);
  const isMobile = useIsMobile();
  const yw = isMobile ? 78 : 120;
  useEffect(() => { listProdConsume().then(setRows).catch(() => {}).finally(() => setLoaded(true)); }, []);

  const months = useMemo(() => [...new Set(rows.map(r => r.ym).filter(Boolean))].sort(), [rows]);
  const scoped = useMemo(() => ym ? rows.filter(r => r.ym === ym) : rows, [rows, ym]);
  const prodRows = useMemo(() => scoped.filter(r => !r.mat_code && (Number(r.prod_qty) || 0) > 0), [scoped]);
  const consRows = useMemo(() => scoped.filter(r => !!r.mat_code), [scoped]);

  const aggSum = (list: ProdConsume[], keyFn: (r: ProdConsume) => string, valFn: (r: ProdConsume) => number) => {
    const m: Record<string, number> = {}; list.forEach(r => { const k = keyFn(r) || "(기타)"; m[k] = (m[k] || 0) + valFn(r); });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  };
  const prodByMonth = useMemo(() => aggSum(prodRows, r => r.ym, r => Number(r.prod_qty) || 0).sort((a, b) => a.name < b.name ? -1 : 1), [prodRows]);
  const prodByItem = useMemo(() => aggSum(prodRows, r => r.prod_name, r => Number(r.prod_qty) || 0).sort((a, b) => b.value - a.value), [prodRows]);
  const matByItem = useMemo(() => aggSum(consRows, r => r.mat_name || "", r => Number(r.act_qty) || 0).sort((a, b) => b.value - a.value), [consRows]);
  const matMonthly = useMemo(() => {
    const mm = [...new Set(consRows.map(r => r.ym).filter(Boolean))].sort();
    const top = matByItem.slice(0, 8).map(m => m.name); const topSet = new Set(top); const keys = [...top, "기타"];
    const data = mm.map(m => { const row: any = { name: m }; keys.forEach(k => row[k] = 0); consRows.filter(r => r.ym === m).forEach(r => { const mn = r.mat_name || ""; row[topSet.has(mn) ? mn : "기타"] += Number(r.act_qty) || 0; }); return row; });
    return { data, keys };
  }, [consRows, matByItem]);
  const matrix = useMemo(() => {
    const mm = [...new Set(consRows.map(r => r.ym).filter(Boolean))].sort();
    const mats: Record<string, Record<string, number>> = {};
    consRows.forEach(r => { const mn = r.mat_name || "(기타)"; const m = r.ym; if (!m) return; (mats[mn] || (mats[mn] = {})); mats[mn][m] = (mats[mn][m] || 0) + (Number(r.act_qty) || 0); });
    const mrows = Object.entries(mats).map(([name, byM]) => ({ name, byM, total: Object.values(byM).reduce((s2, v) => s2 + v, 0) })).sort((a, b) => b.total - a.total);
    return { months: mm, rows: mrows };
  }, [consRows]);
  const stdVs = useMemo(() => {
    const m: Record<string, { std: number; act: number; loss: number }> = {};
    consRows.forEach(r => { const k = r.mat_name || "(기타)"; const e = m[k] || (m[k] = { std: 0, act: 0, loss: 0 }); e.std += Number(r.std_qty) || 0; e.act += Number(r.act_qty) || 0; e.loss += Number(r.amount) || 0; });
    return Object.entries(m).map(([name, v]) => ({ name, 표준: v.std, 실제: v.act, diff: v.std - v.act, loss: v.loss })).sort((a, b) => b.실제 - a.실제);
  }, [consRows]);
  const lossByMonth = useMemo(() => aggSum(consRows, r => r.ym, r => Number(r.amount) || 0).sort((a, b) => a.name < b.name ? -1 : 1), [consRows]);
  const unitData = useMemo(() => {
    const pq: Record<string, number> = {}; prodRows.forEach(r => { pq[r.prod_name] = (pq[r.prod_name] || 0) + (Number(r.prod_qty) || 0); });
    const m: Record<string, Record<string, number>> = {};
    consRows.forEach(r => { const pn = r.prod_name; const mn = r.mat_name || ""; (m[pn] || (m[pn] = {})); m[pn][mn] = (m[pn][mn] || 0) + (Number(r.act_qty) || 0); });
    const out: { prod: string; mat: string; act: number; prodQty: number; unit: number }[] = [];
    Object.keys(m).forEach(pn => { const q = pq[pn] || 0; Object.keys(m[pn]).forEach(mn => out.push({ prod: pn, mat: mn, act: m[pn][mn], prodQty: q, unit: q > 0 ? m[pn][mn] / q : 0 })); });
    return out.sort((a, b) => a.prod < b.prod ? -1 : a.prod > b.prod ? 1 : b.act - a.act);
  }, [prodRows, consRows]);

  // 드릴다운: 선택 원재료의 소비 상세
  const matDetail = useMemo(() => selMat ? consRows.filter(r => (r.mat_name || "") === selMat).sort((a, b) => (a.idate || "") < (b.idate || "") ? -1 : (a.idate || "") > (b.idate || "") ? 1 : 0) : [], [consRows, selMat]);
  const matDetailMonthly = useMemo(() => { if (!selMat) return []; const m: Record<string, number> = {}; consRows.filter(r => (r.mat_name || "") === selMat).forEach(r => { if (r.ym) m[r.ym] = (m[r.ym] || 0) + (Number(r.act_qty) || 0); }); return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => a.name < b.name ? -1 : 1); }, [consRows, selMat]);
  const matDetActTotal = matDetail.reduce((s, r) => s + (Number(r.act_qty) || 0), 0);

  const totalProd = prodRows.reduce((s, r) => s + (Number(r.prod_qty) || 0), 0);
  const totalLoss = consRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const th: React.CSSProperties = { background: "#f1f3f7", color: "#374151", fontSize: 12, fontWeight: 700, padding: "6px 8px", textAlign: "right", position: "sticky", top: 0 };
  const td: React.CSSProperties = { padding: "5px 8px", borderBottom: "1px solid var(--line2)", fontSize: 13, textAlign: "right" };
  const tdL: React.CSSProperties = { ...td, textAlign: "left" };

  const HBar = ({ data, color = "#2563eb", onPick }: { data: { name: string; value: number }[]; color?: string; onPick?: (n: string) => void }) => (
    <div style={{ width: "100%", height: Math.max(180, Math.min(data.length, 12) * 30 + 30) }}>
      <ResponsiveContainer>
        <BarChart layout="vertical" data={data.slice(0, 12)} margin={{ left: 10, right: 16 }}>
          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} />
          <YAxis type="category" dataKey="name" width={yw} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: any) => nf(Number(v))} />
          <Bar dataKey="value" fill={color} cursor={onPick ? "pointer" : undefined} onClick={(d: any) => onPick && d && onPick(d.name)} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  if (rows.length === 0) return <div className="card"><p className="muted">{loaded ? "생산·소모 데이터가 없습니다. '생산소모 가져오기' 탭에서 엑셀을 업로드하세요." : "불러오는 중…"}</p></div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ padding: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <b>🧪 생산·소모 분석</b>
          <MonthPicker months={months} value={ym} onChange={setYm} allowAll />
          <div className="seg" style={{ flexWrap: "wrap" }}>
            <button className={view === "prod" ? "on" : ""} onClick={() => setView("prod")}>생산실적</button>
            <button className={view === "mat" ? "on" : ""} onClick={() => setView("mat")}>원재료 소모</button>
            <button className={view === "std" ? "on" : ""} onClick={() => setView("std")}>표준대비(수율·로스)</button>
            <button className={view === "unit" ? "on" : ""} onClick={() => setView("unit")}>원단위(BOM)</button>
          </div>
          <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>생산합 {nf(totalProd)} · 로스 {nf(totalLoss)}원</span>
        </div>
      </div>

      {view === "prod" &&
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
              <h4 style={{ margin: 0 }}>월별 생산량</h4>
              {prodByMonth.length > 12 &&
                <label style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                  <input type="checkbox" checked={prodAll} onChange={e => setProdAll(e.target.checked)} />
                  전체 기간 보기{!prodAll && ` (이전 ${prodByMonth.length - 12}개월 숨김)`}
                </label>}
            </div>
            <div style={{ width: "100%", height: 260 }}><ResponsiveContainer><BarChart data={prodAll ? prodByMonth : prodByMonth.slice(-12)}><CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} width={64} /><Tooltip formatter={(v: any) => nf(Number(v))} /><Bar dataKey="value" name="생산량" fill="#2563eb" /></BarChart></ResponsiveContainer></div>
          </div>
          <div className="card"><h4 style={{ marginTop: 0 }}>품목별 생산량 (상위)</h4><HBar data={prodByItem} /></div>
          <div className="card" style={{ gridColumn: "1 / -1" }}><h4 style={{ marginTop: 0 }}>품목별 생산량 표</h4><div style={{ overflow: "auto", maxHeight: "40vh" }}><table style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr><th style={{ ...th, textAlign: "left" }}>생산품목</th><th style={th}>생산량</th></tr></thead><tbody>{prodByItem.map(r => <tr key={r.name}><td style={tdL}>{r.name}</td><td style={td}>{nf1(r.value)}</td></tr>)}</tbody></table></div></div>
        </div>}

      {view === "mat" &&
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
            <div className="card"><h4 style={{ marginTop: 0 }}>원재료별 실제소모 (클릭=상세)</h4><HBar data={matByItem} color="#1aa260" onPick={setSelMat} /></div>
            <div className="card"><h4 style={{ marginTop: 0 }}>소모 표 (클릭=상세)</h4><div style={{ overflow: "auto", maxHeight: "44vh" }}><table style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr><th style={{ ...th, textAlign: "left" }}>원재료/반제품</th><th style={th}>실제소모</th></tr></thead><tbody>{matByItem.map(r => <tr key={r.name} onClick={() => setSelMat(r.name)} style={{ cursor: "pointer", background: selMat === r.name ? "#eff6ff" : undefined }}><td style={tdL}>{r.name}</td><td style={td}>{nf1(r.value)}</td></tr>)}</tbody></table></div></div>
          </div>

          {selMat &&
            <div className="card" style={{ border: "2px solid #2563eb" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <h4 style={{ margin: 0 }}>🔎 {selMat} 소비 상세 <span className="muted" style={{ fontSize: 12 }}>· {matDetail.length}건 · 실제소모 {nf1(matDetActTotal)}</span></h4>
                <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={() => setSelMat(null)}>닫기</button>
              </div>
              {matDetailMonthly.length > 0 && <div style={{ width: "100%", height: 200 }}><ResponsiveContainer><BarChart data={matDetailMonthly}><CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} width={64} /><Tooltip formatter={(v: any) => nf(Number(v))} /><Bar dataKey="value" name={selMat} fill="#2563eb" /></BarChart></ResponsiveContainer></div>}
              <div style={{ overflow: "auto", maxHeight: "46vh" }}><table style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr><th style={{ ...th, textAlign: "left" }}>일자</th><th style={{ ...th, textAlign: "left" }}>생산품목</th><th style={th}>표준소모</th><th style={th}>실제소모</th><th style={th}>차이</th></tr></thead>
                <tbody>{matDetail.map((r, i) => <tr key={r.id || i}><td style={tdL}>{r.idate || "-"}</td><td style={tdL}>{r.prod_name}</td><td style={td}>{nf1(Number(r.std_qty) || 0)}</td><td style={{ ...td, fontWeight: 700 }}>{nf1(Number(r.act_qty) || 0)}</td><td style={{ ...td, color: (Number(r.diff) || 0) > 0 ? "#1aa260" : (Number(r.diff) || 0) < 0 ? "#c0392b" : "#6b7280" }}>{nf1(Number(r.diff) || 0)}</td></tr>)}</tbody></table></div>
            </div>}

          <div className="card">
            <h4 style={{ marginTop: 0 }}>월별 원재료 소모 추이 <span className="muted" style={{ fontSize: 12 }}>(상위 8 + 기타, 누적)</span></h4>
            {matMonthly.data.length === 0 ? <p className="muted">월별 데이터가 없습니다 (날짜 없는 요약본은 월별 분석 불가).</p> :
              <div style={{ width: "100%", height: 320 }}><ResponsiveContainer><BarChart data={matMonthly.data} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} width={64} /><Tooltip formatter={(v: any) => nf(Number(v))} /><Legend />{matMonthly.keys.map((k, i) => <Bar key={k} dataKey={k} stackId="a" fill={PIE[i % PIE.length]} />)}</BarChart></ResponsiveContainer></div>}
          </div>
          {matrix.months.length > 0 && (() => {
            // 월 수가 늘어나도 열이 짓눌리지 않게: 기본 최근 12개월 + 전체 토글, 표는 내용 폭만큼 넓어지고 가로 스크롤
            const shownMonths = matrixAll ? matrix.months : matrix.months.slice(-12);
            const hiddenCnt = matrix.months.length - shownMonths.length;
            const rowTotal = (r: { byM: Record<string, number> }) => shownMonths.reduce((s, m) => s + (r.byM[m] || 0), 0);
            return (
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <h4 style={{ margin: 0 }}>원재료 × 월 소모 매트릭스 <span className="muted" style={{ fontSize: 12 }}>(행 클릭=상세 · 발주계획용)</span></h4>
                {matrix.months.length > 12 &&
                  <label style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                    <input type="checkbox" checked={matrixAll} onChange={e => setMatrixAll(e.target.checked)} />
                    전체 기간 보기{!matrixAll && ` (이전 ${hiddenCnt}개월 숨김)`}
                  </label>}
              </div>
              <div style={{ overflow: "auto", maxHeight: "56vh" }}>
                <table style={{ borderCollapse: "collapse", width: "max-content", minWidth: "100%" }}>
                  <thead><tr>
                    <th style={{ ...th, textAlign: "left", left: 0, zIndex: 4, minWidth: 150, whiteSpace: "nowrap" }}>원재료/반제품</th>
                    {shownMonths.map(m => <th key={m} style={{ ...th, minWidth: 76, whiteSpace: "nowrap" }}>{m}</th>)}
                    <th style={{ ...th, minWidth: 88, whiteSpace: "nowrap" }}>합계{matrixAll || hiddenCnt <= 0 ? "" : "(표시분)"}</th>
                  </tr></thead>
                  <tbody>{matrix.rows.map(r => (
                    <tr key={r.name} onClick={() => setSelMat(r.name)} style={{ cursor: "pointer", background: selMat === r.name ? "#eff6ff" : undefined }}>
                      <td style={{ ...tdL, position: "sticky", left: 0, background: selMat === r.name ? "#eff6ff" : "#fff", zIndex: 1, whiteSpace: "nowrap" }}>{r.name}</td>
                      {shownMonths.map(m => <td key={m} style={{ ...td, whiteSpace: "nowrap" }}>{r.byM[m] ? nf1(r.byM[m]) : "-"}</td>)}
                      <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>{nf1(matrixAll ? r.total : rowTotal(r))}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>월이 많으면 표가 옆으로 넓어지고 가로 스크롤로 봅니다(원재료 열은 고정). 위 월 선택으로 특정 월만 볼 수도 있어요.</p>
            </div>
            );
          })()}
        </div>}

      {view === "std" &&
        <>
          <div className="card"><h4 style={{ marginTop: 0 }}>표준 vs 실제 소모 (상위 10)</h4><div style={{ width: "100%", height: 320 }}><ResponsiveContainer><BarChart data={stdVs.slice(0, 10)} margin={{ left: 8, right: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" /><XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} width={64} /><Tooltip formatter={(v: any) => nf(Number(v))} /><Legend /><Bar dataKey="표준" fill="#94a3b8" /><Bar dataKey="실제" fill="#2563eb" /></BarChart></ResponsiveContainer></div></div>
          <div className="card"><h4 style={{ marginTop: 0 }}>월별 로스(차이) 금액</h4><div style={{ width: "100%", height: 220 }}><ResponsiveContainer><BarChart data={lossByMonth}><CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} width={70} /><Tooltip formatter={(v: any) => nf(Number(v)) + " 원"} /><Bar dataKey="value" name="로스금액" fill="#ef4444" /></BarChart></ResponsiveContainer></div></div>
          <div className="card"><h4 style={{ marginTop: 0 }}>표준 대비 실제 · 로스</h4><div style={{ overflow: "auto", maxHeight: "50vh" }}><table style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr><th style={{ ...th, textAlign: "left" }}>원재료/반제품</th><th style={th}>표준소모</th><th style={th}>실제소모</th><th style={th}>차이</th><th style={th}>로스금액</th></tr></thead>
            <tbody>{stdVs.map(r => <tr key={r.name}><td style={tdL}>{r.name}</td><td style={td}>{nf1(r.표준)}</td><td style={td}>{nf1(r.실제)}</td><td style={{ ...td, color: r.diff > 0 ? "#1aa260" : r.diff < 0 ? "#c0392b" : "#6b7280", fontWeight: 700 }}>{r.diff > 0 ? "+" : ""}{nf1(r.diff)}</td><td style={{ ...td, color: r.loss ? "#c0392b" : "#bbb" }}>{r.loss ? nf(r.loss) : "-"}</td></tr>)}</tbody></table></div>
            <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>차이 = 표준소모 − 실제소모 (양수=절감, 음수=초과). 로스금액 = 초과분 × 단가.</p></div>
        </>}

      {view === "unit" &&
        <div className="card"><h4 style={{ marginTop: 0 }}>원단위 실측 (제품 1단위당 원재료 소모 = 실제 BOM)</h4><div style={{ overflow: "auto", maxHeight: "62vh" }}><table style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr><th style={{ ...th, textAlign: "left" }}>생산품목</th><th style={{ ...th, textAlign: "left" }}>원재료/반제품</th><th style={th}>실제소모</th><th style={th}>생산량</th><th style={th}>원단위</th></tr></thead>
          <tbody>{unitData.map((r, i) => <tr key={i}><td style={tdL}>{r.prod}</td><td style={tdL}>{r.mat}</td><td style={td}>{nf1(r.act)}</td><td style={td}>{nf1(r.prodQty)}</td><td style={{ ...td, fontWeight: 700, color: "#2563eb" }}>{r.prodQty > 0 ? nf3(r.unit) : "계산불가"}</td></tr>)}</tbody></table></div>
          <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>원단위 = 실제소모 ÷ 생산량. 기존 원재료(BOM) 탭 추정치와 비교·보정.</p></div>}
    </div>
  );
}
