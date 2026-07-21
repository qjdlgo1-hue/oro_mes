// 원가·마진 분석 — 대시보드 '원가·마진' 뷰.
// 재료원가 = BOM(AgCN·PGC, 50g 생산 기준) × 구매 평균 단가. 인건비·경비 미포함(재료원가 기준 마진).
import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend } from "recharts";
import { InoutRow, BomMap, listInout, listBom } from "../lib/db";
import { matPrice, marginByItem, priceTrend } from "../lib/margin";
import { thBase, tdBase } from "../lib/styles";
import { nf } from "../lib/fmt";
import { toast } from "../lib/toast";
import { errMsg } from "../lib/errmsg";
import { useIsMobile } from "../lib/useIsMobile";

export default function MarginAnalysis() {
  const [sales, setSales] = useState<InoutRow[]>([]);
  const [purchases, setPurchases] = useState<InoutRow[]>([]);
  const [bom, setBom] = useState<BomMap>({});
  const [loaded, setLoaded] = useState(false);
  const [year, setYear] = useState("");
  const isMobile = useIsMobile();

  useEffect(() => {
    Promise.all([listInout("out"), listInout("purchase"), listBom()])
      .then(([o, p, b]) => { setSales(o); setPurchases(p); setBom(b); })
      .catch(e => toast.error("불러오기 실패: " + errMsg(e)))
      .finally(() => setLoaded(true));
  }, []);

  const years = useMemo(() => [...new Set([...sales, ...purchases].map(r => r.ym.slice(0, 4)))].sort(), [sales, purchases]);
  const scopedSales = useMemo(() => year ? sales.filter(r => r.ym.slice(0, 4) === year) : sales, [sales, year]);
  const scopedPurch = useMemo(() => year ? purchases.filter(r => r.ym.slice(0, 4) === year) : purchases, [purchases, year]);

  // 원재료 평균 단가 — 구매 품목명에서 AgCN/PGC 키워드로 매칭 (기간 가중평균)
  const priceAgcn = useMemo(() => matPrice(scopedPurch, "agcn"), [scopedPurch]);
  const pricePgc = useMemo(() => matPrice(scopedPurch, "pgc"), [scopedPurch]);
  const rows = useMemo(() => marginByItem(scopedSales, bom, priceAgcn, pricePgc), [scopedSales, bom, priceAgcn, pricePgc]);
  const withCost = rows.filter(r => r.cost != null);
  const totSales = rows.reduce((s, r) => s + r.sales, 0);
  const totCost = withCost.reduce((s, r) => s + (r.cost || 0), 0);
  const totCostSales = withCost.reduce((s, r) => s + r.sales, 0);
  const totMargin = totCostSales - totCost;
  const trendAgcn = useMemo(() => priceTrend(scopedPurch, "agcn"), [scopedPurch]);
  const trendPgc = useMemo(() => priceTrend(scopedPurch, "pgc"), [scopedPurch]);
  const trend = useMemo(() => {
    const yms = [...new Set([...trendAgcn.map(t => t.ym), ...trendPgc.map(t => t.ym)])].sort();
    return yms.map(ym => ({ ym, AgCN: trendAgcn.find(t => t.ym === ym)?.price ?? null, PGC: trendPgc.find(t => t.ym === ym)?.price ?? null }));
  }, [trendAgcn, trendPgc]);

  const th: React.CSSProperties = thBase;
  const td: React.CSSProperties = tdBase;
  const tdL: React.CSSProperties = { ...td, textAlign: "left" };
  const card: React.CSSProperties = { background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: 14 };
  const kpi = (label: string, val: string, color = "#1f2330") => (
    <div style={card}><div className="muted" style={{ fontSize: 12 }}>{label}</div><div style={{ fontSize: 22, fontWeight: 700, color }}>{val}</div></div>
  );
  const pct = (v: number | null) => v == null ? "-" : Math.round(v * 100) + "%";

  if (!loaded) return <div className="card"><p className="muted">불러오는 중…</p></div>;
  if (!sales.length) return <div className="card"><p className="muted">판매 데이터가 없습니다. '판매 가져오기'에서 먼저 데이터를 넣으세요.</p></div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select value={year} onChange={e => setYear(e.target.value)} style={{ padding: 7, border: "1px solid var(--line)", borderRadius: 6 }}>
          <option value="">전체 연도</option>
          {years.map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
        <span className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
          재료원가 = BOM(AgCN·PGC 사용량, 50g 생산 기준) × 구매 평균 단가 — <b>인건비·경비·Ni 분말은 포함되지 않습니다</b>.
          평균 단가: AgCN {priceAgcn > 0 ? nf(Math.round(priceAgcn)) + "원/g" : "구매 데이터 없음"} · PGC {pricePgc > 0 ? nf(Math.round(pricePgc)) + "원/g" : "구매 데이터 없음"}
        </span>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        {kpi("총 판매액", nf(Math.round(totSales)) + "원", "var(--ok)")}
        {kpi("재료원가 (원가 계산 가능 품목)", nf(Math.round(totCost)) + "원", "#c0392b")}
        {kpi("재료 마진", nf(Math.round(totMargin)) + "원", "var(--accent)")}
        {kpi("평균 마진율", totCostSales > 0 ? Math.round(totMargin / totCostSales * 100) + "%" : "-", "#8e5bd8")}
      </div>

      <div className="card">
        <h4 style={{ marginTop: 0 }}>품목별 마진율 <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>(원가 계산 가능한 상위 10)</span></h4>
        {withCost.length === 0 ? <p className="muted" style={{ fontSize: 13 }}>원가를 계산할 수 있는 품목이 없습니다 — 원재료(BOM) 탭에서 제품별 AgCN·PGC 사용량을 입력하고, 구매 가져오기에 AgCN·PGC 매입 내역(금액 포함)을 넣으면 자동 계산됩니다.</p> :
          <div style={{ width: "100%", height: Math.max(180, Math.min(withCost.length, 10) * 34 + 30) }}>
            <ResponsiveContainer>
              <BarChart layout="vertical" data={withCost.slice(0, 10).map(r => ({ name: r.name, 마진율: Math.round((r.rate || 0) * 100) }))} margin={{ left: 10, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                <XAxis type="number" tick={{ fontSize: 11 }} unit="%" />
                <YAxis type="category" dataKey="name" width={isMobile ? 78 : 130} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => v + "%"} />
                <Bar dataKey="마진율" fill="var(--accent)" />
              </BarChart>
            </ResponsiveContainer>
          </div>}
      </div>

      <div className="card">
        <h4 style={{ marginTop: 0 }}>품목별 원가·마진</h4>
        <div style={{ overflow: "auto", maxHeight: "55vh" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr>
              <th style={{ ...th, textAlign: "left" }}>품목명</th>
              <th style={th}>판매량(g)</th><th style={th}>판매액(원)</th>
              <th style={th}>재료원가(원)</th><th style={th}>마진(원)</th><th style={th}>마진율</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.name}>
                  <td style={tdL}>{r.name}</td>
                  <td style={td}>{nf(Math.round(r.qty))}</td>
                  <td style={td}>{nf(Math.round(r.sales))}</td>
                  <td style={td}>{r.cost != null ? nf(Math.round(r.cost)) : <span className="muted" title="BOM 미등록 또는 원재료 구매 단가 없음">-</span>}</td>
                  <td style={{ ...td, color: r.margin != null && r.margin < 0 ? "#c0392b" : undefined, fontWeight: 700 }}>{r.margin != null ? nf(Math.round(r.margin)) : "-"}</td>
                  <td style={{ ...td, fontWeight: 700, color: r.rate != null && r.rate < 0 ? "#c0392b" : "var(--accent)" }}>{pct(r.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>재료원가 "-" = BOM 미등록 품목 (원재료 탭에서 사용량 입력 시 자동 계산). 마진은 재료비만 반영한 값입니다.</p>
      </div>

      {trend.length > 0 && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>원재료 월별 평균 매입 단가 (원/g)</h4>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={trend} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                <XAxis dataKey="ym" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} width={70} />
                <Tooltip formatter={(v: any) => nf(Math.round(v)) + " 원/g"} />
                <Legend />
                <Line type="monotone" dataKey="AgCN" stroke="var(--accent)" connectNulls />
                <Line type="monotone" dataKey="PGC" stroke="#f59e0b" connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
