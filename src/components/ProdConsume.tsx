import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, Cell } from "recharts";
import { ProdConsume, listProdConsume, appendProdConsume, clearProdConsume, logAudit } from "../lib/db";
import { parseProdConsume } from "../lib/parseProdConsume";
import { can } from "../lib/perm";
import { toast } from "../lib/toast";

const nf = (n: number) => Math.round(n).toLocaleString();
const nf1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString();
const PIE = ["#2563eb", "#f59e0b", "#1aa260", "#a855f7", "#ef4444", "#0ea5e9", "#84cc16", "#e879a0", "#6b7280", "#14b8a6"];
type View = "prod" | "mat" | "std" | "unit";

export default function ProdConsumeView() {
  const canEdit = can("order.import");
  const [rows, setRows] = useState<ProdConsume[]>([]);
  const [view, setView] = useState<View>("prod");
  const [ym, setYm] = useState<string>("");
  const [preview, setPreview] = useState<ProdConsume[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => listProdConsume().then(setRows).catch(e => toast.error("불러오기 실패: " + (e.message || e)));
  useEffect(() => { load(); }, []);

  const months = useMemo(() => [...new Set(rows.map(r => r.ym))].sort(), [rows]);
  const scoped = useMemo(() => ym ? rows.filter(r => r.ym === ym) : rows, [rows, ym]);
  const prodRows = useMemo(() => scoped.filter(r => !r.mat_code && (Number(r.prod_qty) || 0) > 0), [scoped]);
  const consRows = useMemo(() => scoped.filter(r => !!r.mat_code), [scoped]);

  const existing = useMemo(() => new Set(rows.map(r => r.sig)), [rows]);
  const newCount = preview ? preview.filter(r => !existing.has(r.sig)).length : 0;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return; setBusy(true);
    try {
      const buf = await f.arrayBuffer(); const wb = XLSX.read(buf); const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][];
      const list = parseProdConsume(aoa);
      if (!list.length) toast.error("인식된 행이 없습니다. '생산입고/소모현황 I' 엑셀인지 확인하세요.");
      else { setPreview(list); toast.success(`인식: ${list.length}행 (${[...new Set(list.map(r => r.ym))].sort().join(", ")})`); }
    } catch (er: any) { toast.error("읽기 실패: " + (er.message || er)); }
    setBusy(false); e.target.value = "";
  }
  async function addNew() {
    if (!preview) return; const toAdd = preview.filter(r => !existing.has(r.sig));
    if (!toAdd.length) { toast.error("추가할 신규 행이 없습니다 (모두 중복)."); return; }
    setBusy(true); try { await appendProdConsume(toAdd); logAudit("생산·소모 추가", "prod_consume", "", { added: toAdd.length }); toast.success(`신규 ${toAdd.length}행 추가`); setPreview(null); load(); } catch (e: any) { toast.error("저장 실패: " + (e.message || e)); } setBusy(false);
  }
  async function replaceAll() {
    if (!preview) return; if (!confirm("기존 생산·소모 데이터를 전부 지우고 이 파일로 교체할까요?")) return;
    setBusy(true); try { await clearProdConsume(); await appendProdConsume(preview); logAudit("생산·소모 전체교체", "prod_consume", "", { n: preview.length }); toast.success("교체 완료"); setPreview(null); load(); } catch (e: any) { toast.error("실패: " + (e.message || e)); } setBusy(false);
  }
  async function clearAll() {
    if (!confirm("생산·소모 데이터를 전부 삭제할까요?")) return;
    setBusy(true); try { await clearProdConsume(); toast.success("삭제됨"); load(); } catch (e: any) { toast.error(e.message || e); } setBusy(false);
  }

  // ---- 집계 ----
  const aggSum = (list: ProdConsume[], keyFn: (r: ProdConsume) => string, valFn: (r: ProdConsume) => number) => {
    const m: Record<string, number> = {}; list.forEach(r => { const k = keyFn(r) || "(기타)"; m[k] = (m[k] || 0) + valFn(r); });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  };
  const prodByMonth = useMemo(() => aggSum(prodRows, r => r.ym, r => Number(r.prod_qty) || 0).sort((a, b) => a.name < b.name ? -1 : 1), [prodRows]);
  const prodByItem = useMemo(() => aggSum(prodRows, r => r.prod_name, r => Number(r.prod_qty) || 0).sort((a, b) => b.value - a.value), [prodRows]);
  const matByItem = useMemo(() => aggSum(consRows, r => r.mat_name || "", r => Number(r.act_qty) || 0).sort((a, b) => b.value - a.value), [consRows]);
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

  const totalProd = prodRows.reduce((s, r) => s + (Number(r.prod_qty) || 0), 0);
  const totalLoss = consRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const seg = (a: boolean): React.CSSProperties => ({ borderRadius: 0, fontSize: 13, background: a ? "#2563eb" : "#e7ebf1", color: a ? "#fff" : "#374151" });
  const th: React.CSSProperties = { background: "#f1f3f7", color: "#374151", fontSize: 12, fontWeight: 700, padding: "6px 8px", textAlign: "right", position: "sticky", top: 0 };
  const td: React.CSSProperties = { padding: "5px 8px", borderBottom: "1px solid var(--line2)", fontSize: 13, textAlign: "right" };
  const tdL: React.CSSProperties = { ...td, textAlign: "left" };

  const HBar = ({ data, unitTxt, color = "#2563eb" }: { data: { name: string; value: number }[]; unitTxt: string; color?: string }) => (
    <div style={{ width: "100%", height: Math.max(180, Math.min(data.length, 12) * 30 + 30) }}>
      <ResponsiveContainer>
        <BarChart layout="vertical" data={data.slice(0, 12)} margin={{ left: 10, right: 16 }}>
          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: any) => nf(Number(v)) + unitTxt} />
          <Bar dataKey="value" fill={color}>{data.slice(0, 12).map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>🧪 생산·소모 분석</h3>
          <select value={ym} onChange={e => setYm(e.target.value)} style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6 }}>
            <option value="">전체 월</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {canEdit && <label className="btn ghost" style={{ cursor: "pointer" }}>엑셀 업로드<input type="file" accept=".xlsx,.xls" onChange={onFile} disabled={busy} style={{ display: "none" }} /></label>}
          {canEdit && rows.length > 0 && <button className="btn ghost" onClick={clearAll} disabled={busy} style={{ color: "#c0392b" }}>전체 삭제</button>}
        </div>
        <p className="muted" style={{ fontSize: 12, margin: "8px 2px 0" }}>이카운트 <b>[생산입고/소모현황 I]</b> 엑셀을 업로드하세요. 총 {rows.length}행 · 생산 {nf(totalProd)} · 로스금액 {nf(totalLoss)}원</p>
        {preview &&
          <div style={{ marginTop: 10, background: "#eff6ff", border: "1px solid #dbe7ff", borderRadius: 8, padding: 12 }}>
            <b>인식 {preview.length}행</b> · 신규 {newCount} · 중복 {preview.length - newCount}
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button className="btn green" onClick={addNew} disabled={busy || !canEdit}>신규만 추가 ({newCount})</button>
              <button className="btn" onClick={replaceAll} disabled={busy || !canEdit}>전체 교체</button>
              <button className="btn ghost" onClick={() => setPreview(null)}>취소</button>
            </div>
          </div>}
      </div>

      {rows.length === 0 ? <div className="card"><p className="muted">데이터가 없습니다. 위에서 '생산입고/소모현황 I' 엑셀을 업로드하세요.</p></div> :
      <>
        <div className="card" style={{ padding: 8 }}>
          <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", flexWrap: "wrap" }}>
            <button className="btn" style={seg(view === "prod")} onClick={() => setView("prod")}>생산실적</button>
            <button className="btn" style={seg(view === "mat")} onClick={() => setView("mat")}>원재료 소모</button>
            <button className="btn" style={seg(view === "std")} onClick={() => setView("std")}>표준대비(수율·로스)</button>
            <button className="btn" style={seg(view === "unit")} onClick={() => setView("unit")}>원단위(BOM)</button>
          </div>
        </div>

        {view === "prod" &&
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
            <div className="card"><h4 style={{ marginTop: 0 }}>월별 생산량</h4>
              <div style={{ width: "100%", height: 260 }}><ResponsiveContainer><BarChart data={prodByMonth}><CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} width={64} /><Tooltip formatter={(v: any) => nf(Number(v))} /><Bar dataKey="value" name="생산량" fill="#2563eb" /></BarChart></ResponsiveContainer></div>
            </div>
            <div className="card"><h4 style={{ marginTop: 0 }}>품목별 생산량 (상위)</h4><HBar data={prodByItem} unitTxt="" /></div>
            <div className="card" style={{ gridColumn: "1 / -1" }}><h4 style={{ marginTop: 0 }}>품목별 생산량 표</h4>
              <div style={{ overflow: "auto", maxHeight: "40vh" }}><table style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr><th style={{ ...th, textAlign: "left" }}>생산품목</th><th style={th}>생산량</th></tr></thead><tbody>{prodByItem.map(r => <tr key={r.name}><td style={tdL}>{r.name}</td><td style={td}>{nf1(r.value)}</td></tr>)}</tbody></table></div>
            </div>
          </div>}

        {view === "mat" &&
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
            <div className="card"><h4 style={{ marginTop: 0 }}>원재료·반제품별 실제소모 (상위)</h4><HBar data={matByItem} unitTxt="" color="#1aa260" /></div>
            <div className="card" style={{ gridColumn: "1 / -1" }}><h4 style={{ marginTop: 0 }}>소모 표</h4>
              <div style={{ overflow: "auto", maxHeight: "50vh" }}><table style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr><th style={{ ...th, textAlign: "left" }}>원재료/반제품</th><th style={th}>실제소모</th></tr></thead><tbody>{matByItem.map(r => <tr key={r.name}><td style={tdL}>{r.name}</td><td style={td}>{nf1(r.value)}</td></tr>)}</tbody></table></div>
            </div>
          </div>}

        {view === "std" &&
          <>
            <div className="card"><h4 style={{ marginTop: 0 }}>표준 vs 실제 소모 (상위 10)</h4>
              <div style={{ width: "100%", height: 320 }}><ResponsiveContainer><BarChart data={stdVs.slice(0, 10)} margin={{ left: 8, right: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" /><XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} width={64} /><Tooltip formatter={(v: any) => nf(Number(v))} /><Legend /><Bar dataKey="표준" fill="#94a3b8" /><Bar dataKey="실제" fill="#2563eb" /></BarChart></ResponsiveContainer></div>
            </div>
            <div className="card"><h4 style={{ marginTop: 0 }}>월별 로스(차이) 금액</h4>
              <div style={{ width: "100%", height: 220 }}><ResponsiveContainer><BarChart data={lossByMonth}><CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} width={70} /><Tooltip formatter={(v: any) => nf(Number(v)) + " 원"} /><Bar dataKey="value" name="로스금액" fill="#ef4444" /></BarChart></ResponsiveContainer></div>
            </div>
            <div className="card"><h4 style={{ marginTop: 0 }}>표준 대비 실제 · 로스</h4>
              <div style={{ overflow: "auto", maxHeight: "50vh" }}><table style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr><th style={{ ...th, textAlign: "left" }}>원재료/반제품</th><th style={th}>표준소모</th><th style={th}>실제소모</th><th style={th}>차이</th><th style={th}>로스금액</th></tr></thead>
                <tbody>{stdVs.map(r => <tr key={r.name}><td style={tdL}>{r.name}</td><td style={td}>{nf1(r.표준)}</td><td style={td}>{nf1(r.실제)}</td><td style={{ ...td, color: r.diff > 0 ? "#1aa260" : r.diff < 0 ? "#c0392b" : "#6b7280", fontWeight: 700 }}>{r.diff > 0 ? "+" : ""}{nf1(r.diff)}</td><td style={{ ...td, color: r.loss ? "#c0392b" : "#bbb" }}>{r.loss ? nf(r.loss) : "-"}</td></tr>)}</tbody></table></div>
              <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>차이 = 표준소모 − 실제소모 (양수=절감, 음수=초과). 로스금액 = 초과분 × 단가(단가 입력분만).</p>
            </div>
          </>}

        {view === "unit" &&
          <div className="card"><h4 style={{ marginTop: 0 }}>원단위 실측 (제품 1단위당 원재료 소모 = 실제 BOM)</h4>
            <div style={{ overflow: "auto", maxHeight: "62vh" }}><table style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr><th style={{ ...th, textAlign: "left" }}>생산품목</th><th style={{ ...th, textAlign: "left" }}>원재료/반제품</th><th style={th}>실제소모</th><th style={th}>생산량</th><th style={th}>원단위(소모/생산)</th></tr></thead>
              <tbody>{unitData.map((r, i) => <tr key={i}><td style={tdL}>{r.prod}</td><td style={tdL}>{r.mat}</td><td style={td}>{nf1(r.act)}</td><td style={td}>{nf1(r.prodQty)}</td><td style={{ ...td, fontWeight: 700, color: "#2563eb" }}>{(Math.round(r.unit * 1000) / 1000).toLocaleString()}</td></tr>)}</tbody></table></div>
            <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>원단위 = 실제소모 ÷ 생산량. 기존 원재료(BOM) 탭의 추정치와 비교해 보정하세요.</p>
          </div>}
      </>}
    </div>
  );
}
