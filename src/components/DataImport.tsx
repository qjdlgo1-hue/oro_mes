import { useEffect, useMemo, useState } from "react";
import { InoutKind, InoutRow, listInout, appendInout, deleteInoutMonth, logAudit } from "../lib/db";
import { parseInout } from "../lib/parseInout";
import { toast } from "../lib/toast";
import { can } from "../lib/perm";

type Cfg = { kind: InoutKind; title: string; source: string; accent: string };
const CFG: Record<InoutKind, Cfg> = {
  in: { kind: "in", title: "생산입고 가져오기", source: "이카운트 [생산입고 조회]", accent: "#2563eb" },
  out: { kind: "out", title: "판매현황 가져오기", source: "이카운트 [판매현황]", accent: "#1aa260" },
};
const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString();

export default function DataImport({ kind }: { kind: InoutKind }) {
  const cfg = CFG[kind];
  const canEdit = can("order.import");
  const [rows, setRows] = useState<InoutRow[]>([]);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<InoutRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = () => listInout(kind).then(setRows).catch(e => toast.error("불러오기 실패: " + (e.message || e)));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [kind]);

  const existing = useMemo(() => new Set(rows.map(r => r.sig)), [rows]);
  const marked = useMemo(() => {
    const seen = new Set(existing);
    return preview.map(r => { const dup = seen.has(r.sig); seen.add(r.sig); return { r, dup }; });
  }, [preview, existing]);
  const newRows = marked.filter(m => !m.dup).map(m => m.r);
  const dupCount = marked.length - newRows.length;

  // 월별 집계
  const byMonth = useMemo(() => {
    const m: Record<string, { n: number; qty: number }> = {};
    rows.forEach(r => { const e = m[r.ym] || (m[r.ym] = { n: 0, qty: 0 }); e.n++; e.qty += Number(r.qty) || 0; });
    return Object.entries(m).sort((a, b) => a[0] < b[0] ? 1 : -1);
  }, [rows]);

  function doParse() {
    const list = parseInout(kind, text);
    setPreview(list);
    if (!list.length) toast.error("인식된 행이 없습니다. 머리글(품목코드·수량 포함)까지 복사했는지 확인하세요.");
    else toast.success(`인식: ${list.length}건 (${[...new Set(list.map(r => r.ym))].sort().join(", ")})`);
  }
  async function addNew() {
    if (!newRows.length) { toast.error("추가할 신규 데이터가 없습니다 (모두 중복)."); return; }
    setBusy(true);
    try {
      await appendInout(newRows);
      await logAudit(kind === "in" ? "생산입고 누적추가" : "판매현황 누적추가", "inout", "", { added: newRows.length, months: [...new Set(newRows.map(r => r.ym))] });
      toast.success(`신규 ${newRows.length}건 추가 완료 (중복 ${dupCount}건 제외)`);
      setText(""); setPreview([]); load();
    } catch (e: any) { toast.error("저장 실패: " + (e.message || e)); }
    setBusy(false);
  }
  async function delMonth(ym: string) {
    if (!confirm(`${ym} ${cfg.title.replace(" 가져오기", "")} 데이터를 삭제할까요? (되돌릴 수 없음)`)) return;
    setBusy(true);
    try {
      await deleteInoutMonth(kind, ym);
      await logAudit(kind === "in" ? "생산입고 월삭제" : "판매현황 월삭제", "inout", ym, {});
      toast.success(`${ym} 삭제됨`); load();
    } catch (e: any) { toast.error("삭제 실패: " + (e.message || e)); }
    setBusy(false);
  }

  const box: React.CSSProperties = { width: "100%", height: 130, fontSize: 12, padding: 8, border: "1px solid var(--line)", borderRadius: 8, fontFamily: "monospace" };
  const th: React.CSSProperties = { background: "#f1f3f7", color: "#374151", fontSize: 12, fontWeight: 700, padding: "6px 8px", textAlign: "right", borderBottom: "1px solid var(--line)" };
  const td: React.CSSProperties = { padding: "5px 8px", borderBottom: "1px solid var(--line2)", fontSize: 13, textAlign: "right" };
  const tdL: React.CSSProperties = { ...td, textAlign: "left" };

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
      <div className="card">
        <h3 style={{ marginTop: 0, color: cfg.accent }}>{cfg.title}</h3>
        <div style={{ background: "#eff6ff", border: "1px solid #dbe7ff", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12, lineHeight: 1.6 }}>
          <b style={{ color: "#2563eb" }}>{cfg.source}</b> 을(를) 조회 → <b>표 복사(머리글 포함)</b> → 아래에 붙여넣기 → <b>인식</b> → <b>누적 추가</b>. 같은 행은 자동으로 중복 제외되어, 매월 반복해도 안전하게 쌓입니다.
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder={`${cfg.source} 표 붙여넣기...`} style={box} />
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={doParse} disabled={busy}>인식</button>
          {preview.length > 0 && <button className="btn green" onClick={addNew} disabled={busy || !canEdit}>누적 추가 — 신규 {newRows.length}건</button>}
        </div>
        {preview.length > 0 &&
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            인식 {preview.length}건 · <b style={{ color: "#1aa260" }}>신규 {newRows.length}</b> · <b style={{ color: "#888" }}>중복(유지) {dupCount}</b>
            {!canEdit && " · 추가 권한 없음"}
          </p>}
      </div>

      <div className="card">
        <h4 style={{ marginTop: 0 }}>누적 저장 현황 <span className="muted" style={{ fontSize: 12 }}>(총 {rows.length}건)</span></h4>
        {byMonth.length === 0 ? <p className="muted">아직 저장된 데이터가 없습니다.</p> :
          <div style={{ overflow: "auto", maxHeight: "60vh" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>
                <th style={{ ...th, textAlign: "left" }}>연/월</th>
                <th style={th}>건수</th>
                <th style={th}>수량 합계</th>
                <th style={{ ...th, textAlign: "center" }}>관리</th>
              </tr></thead>
              <tbody>
                {byMonth.map(([ym, v]) => (
                  <tr key={ym}>
                    <td style={tdL}>{ym.slice(0, 4)}년 {+ym.slice(5, 7)}월</td>
                    <td style={td}>{v.n}</td>
                    <td style={td}>{fmt(v.qty)}</td>
                    <td style={{ ...td, textAlign: "center" }}>
                      {canEdit && <button className="btn ghost" style={{ padding: "2px 9px", fontSize: 12 }} onClick={() => delMonth(ym)} disabled={busy}>삭제</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
      </div>
    </div>
  );
}
