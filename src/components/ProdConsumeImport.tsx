import { errMsg } from "../lib/errmsg";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { ProdConsume, listProdConsume, appendProdConsume, clearProdConsume, logAudit } from "../lib/db";
import { parseProdConsume } from "../lib/parseProdConsume";
import { can } from "../lib/perm";
import { toast } from "../lib/toast";
import { confirmDialog } from "../lib/confirm";
import { nf, nf1 } from "../lib/fmt";
import { usePersistState } from "../lib/usePersist";
import { usePaged } from "../lib/usePaged";
import MonthPicker from "./MonthPicker";

export default function ProdConsumeImport() {
  const canEdit = can("order.import");
  const [rows, setRows] = useState<ProdConsume[]>([]);
  const [preview, setPreview] = useState<ProdConsume[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [ym, setYm] = usePersistState("pcImport.ym", "");
  const [loaded, setLoaded] = useState(false);
  const load = () => listProdConsume().then(setRows).catch(e => toast.error("불러오기 실패: " + errMsg(e))).finally(() => setLoaded(true));
  useEffect(() => { load(); }, []);
  const months = useMemo(() => [...new Set(rows.map(r => r.ym).filter(Boolean))].sort(), [rows]);
  const existing = useMemo(() => new Set(rows.map(r => r.sig)), [rows]);
  const newCount = preview ? preview.filter(r => !existing.has(r.sig)).length : 0;
  const [q, setQ] = useState("");
  const detail = useMemo(() => {
    let f = ym ? rows.filter(r => r.ym === ym) : rows;
    const s = q.trim().toLowerCase();
    if (s) f = f.filter(r => `${r.prod_name || ""} ${r.mat_name || ""}`.toLowerCase().includes(s));
    return [...f].sort((a, b) => (a.idate || "") < (b.idate || "") ? -1 : 1);
  }, [rows, ym, q]);
  const { paged, remaining, showMore } = usePaged(detail, 300);
  const totalProd = rows.filter(r => !r.mat_code).reduce((s, r) => s + (Number(r.prod_qty) || 0), 0);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return; setBusy(true);
    try { const buf = await f.arrayBuffer(); const wb = XLSX.read(buf); const ws = wb.Sheets[wb.SheetNames[0]]; const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][]; const list = parseProdConsume(aoa);
      if (!list.length) toast.error("인식된 행이 없습니다. '생산입고/소모현황 I' 엑셀인지 확인하세요."); else { setPreview(list); toast.success(`인식: ${list.length}행`); } }
    catch (er: any) { toast.error("읽기 실패: " + errMsg(er)); }
    setBusy(false); e.target.value = "";
  }
  async function addNew() { if (!preview) return; const toAdd = preview.filter(r => !existing.has(r.sig)); if (!toAdd.length) { toast.error("추가할 신규 행이 없습니다 (모두 중복)."); return; } setBusy(true); try { await appendProdConsume(toAdd); logAudit("생산·소모 추가", "prod_consume", "", { added: toAdd.length }); toast.success(`신규 ${toAdd.length}행 추가`); setPreview(null); load(); } catch (e: any) { toast.error("저장 실패: " + errMsg(e)); } setBusy(false); }
  async function replaceAll() {
    if (!preview) return;
    if (!(await confirmDialog({ title: "전체 교체", message: `기존 생산·소모 데이터 ${rows.length.toLocaleString()}행을 전부 지우고 이 파일(${preview.length.toLocaleString()}행)로 교체합니다.\n복구할 수 없습니다.`, danger: true, confirmLabel: "전체 교체" }))) return;
    setBusy(true); try { await clearProdConsume(); await appendProdConsume(preview); logAudit("생산·소모 전체교체", "prod_consume", "", { n: preview.length }); toast.success("교체 완료"); setPreview(null); load(); } catch (e: any) { toast.error("실패: " + errMsg(e)); } setBusy(false);
  }
  async function clearAll() {
    if (!(await confirmDialog({ title: "전체 삭제", message: `생산·소모 데이터 ${rows.length.toLocaleString()}행을 전부 삭제합니다.\n복구할 수 없습니다.`, danger: true, confirmLabel: "전체 삭제" }))) return;
    setBusy(true); try { await clearProdConsume(); toast.success("삭제됨"); load(); } catch (e: any) { toast.error(errMsg(e)); } setBusy(false);
  }

  const th: React.CSSProperties = { background: "#f1f3f7", color: "#374151", fontSize: 12, fontWeight: 700, padding: "6px 8px", textAlign: "right", position: "sticky", top: 0 };
  const td: React.CSSProperties = { padding: "4px 8px", borderBottom: "1px solid var(--line2)", fontSize: 12, textAlign: "right" };
  const tdL: React.CSSProperties = { ...td, textAlign: "left" };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>🧪 생산소모 가져오기</h3>
          {canEdit && <label className="btn ghost" style={{ cursor: "pointer" }}>엑셀 업로드<input type="file" accept=".xlsx,.xls" onChange={onFile} disabled={busy} style={{ display: "none" }} /></label>}
          {canEdit && rows.length > 0 && <button className="btn ghost" onClick={clearAll} disabled={busy} style={{ color: "#c0392b" }}>전체 삭제</button>}
        </div>
        <p className="muted" style={{ fontSize: 12, margin: "8px 2px 0" }}>이카운트 <b>[생산입고/소모현황 I]</b> 엑셀을 업로드하세요. 분석은 <b>대시보드 → 생산·소모</b>에서 봅니다. · 총 {rows.length}행 · 생산합 {nf(totalProd)}</p>
        {preview &&
          <div style={{ marginTop: 10, background: "#eff6ff", border: "1px solid #dbe7ff", borderRadius: 8, padding: 12 }}>
            <b>인식 {preview.length}행</b> · 신규 {newCount} · 중복 {preview.length - newCount}
            <div style={{ overflow: "auto", maxHeight: 240, border: "1px solid var(--line)", borderRadius: 8, background: "#fff", marginTop: 8 }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr><th style={{ ...th, textAlign: "center" }}>상태</th><th style={{ ...th, textAlign: "left" }}>일자</th><th style={{ ...th, textAlign: "left" }}>생산품목</th><th style={{ ...th, textAlign: "left" }}>소모품목</th><th style={th}>생산수량</th><th style={th}>실제소모</th></tr></thead>
                <tbody>
                  {preview.slice(0, 30).map((r, i) => { const dup = existing.has(r.sig); return (
                    <tr key={i} style={dup ? { opacity: .5 } : undefined}>
                      <td style={{ ...td, textAlign: "center" }}><span style={{ fontSize: 11, fontWeight: 700, borderRadius: 4, padding: "1px 6px", color: "#fff", background: dup ? "#9aa3af" : "#1aa260" }}>{dup ? "중복" : "신규"}</span></td>
                      <td style={tdL}>{r.idate || "-"}</td><td style={tdL}>{r.prod_name}</td><td style={tdL}>{r.mat_name || ""}</td>
                      <td style={td}>{r.prod_qty ? nf1(Number(r.prod_qty)) : ""}</td><td style={td}>{r.act_qty ? nf1(Number(r.act_qty)) : ""}</td>
                    </tr>
                  ); })}
                </tbody>
              </table>
              {preview.length > 30 && <div className="muted" style={{ padding: "6px 8px", fontSize: 12 }}>… 외 {preview.length - 30}행</div>}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button className="btn green" onClick={addNew} disabled={busy || !canEdit}>신규만 추가 ({newCount})</button>
              <button className="btn" onClick={replaceAll} disabled={busy || !canEdit}>전체 교체</button>
              <button className="btn ghost" onClick={() => setPreview(null)}>취소</button>
            </div>
          </div>}
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <h4 style={{ margin: 0 }}>저장된 데이터</h4>
          {months.length > 0 && <MonthPicker months={months} value={ym} onChange={setYm} allowAll />}
          <input placeholder="🔍 생산/소모품목 검색" value={q} onChange={e => setQ(e.target.value)} style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6, minWidth: 160 }} />
          <span className="muted" style={{ fontSize: 12 }}>{detail.length}행</span>
        </div>
        {detail.length === 0 ? <p className="muted">{loaded ? "데이터가 없습니다. 위에서 엑셀을 업로드하세요." : "불러오는 중…"}</p> :
          <div style={{ overflow: "auto", maxHeight: "62vh" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr><th style={{ ...th, textAlign: "left" }}>일자</th><th style={{ ...th, textAlign: "left" }}>생산품목</th><th style={{ ...th, textAlign: "left" }}>소모품목</th><th style={th}>생산수량</th><th style={th}>표준소모</th><th style={th}>실제소모</th><th style={th}>차이</th><th style={th}>금액</th></tr></thead>
              <tbody>{paged.map((r, i) => (
                <tr key={r.id || i}>
                  <td style={tdL}>{r.idate || "-"}</td><td style={tdL}>{r.prod_name}</td><td style={tdL}>{r.mat_name || ""}</td>
                  <td style={td}>{r.prod_qty ? nf1(Number(r.prod_qty)) : ""}</td><td style={td}>{r.std_qty ? nf1(Number(r.std_qty)) : ""}</td>
                  <td style={td}>{r.act_qty ? nf1(Number(r.act_qty)) : ""}</td><td style={td}>{r.diff ? nf1(Number(r.diff)) : ""}</td><td style={td}>{r.amount ? nf(Number(r.amount)) : ""}</td>
                </tr>
              ))}</tbody>
            </table>
            {remaining > 0 && <button className="btn ghost" style={{ width: "100%", marginTop: 6 }} onClick={showMore}>더 보기 (남은 {remaining.toLocaleString()}행)</button>}
          </div>}
      </div>
    </div>
  );
}
