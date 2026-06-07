import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Order, PlanEntry, CocData } from "../lib/types";
import { parsePaste, parseRows } from "../lib/parseOrders";
import { replaceMonth, appendOrders, dupKey, listPlans, listCocs } from "../lib/db";
import { completionDate } from "../lib/plan";
import { sampleOrders } from "../lib/sampleOrders";

export default function ImportOrders({ orders, onChange }: { orders: Order[]; onChange: () => void }) {
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<Order[]>([]);
  const [msg, setMsg] = useState("");
  const [plans, setPlans] = useState<Record<string, PlanEntry>>({});
  const [cocs, setCocs] = useState<Record<string, CocData>>({});
  const [viewYm, setViewYm] = useState<string>("");

  useEffect(() => { listPlans().then(setPlans); listCocs().then(setCocs); }, [orders]);

  const existingKeys = useMemo(() => new Set(orders.map(dupKey)), [orders]);
  const byMonth = useMemo(() => {
    const m: Record<string, number> = {};
    orders.forEach(o => { m[o.ym] = (m[o.ym] || 0) + 1; });
    return Object.entries(m).sort((a, b) => a[0] < b[0] ? 1 : -1);
  }, [orders]);
  const months = useMemo(() => [...new Set(orders.map(o => o.ym))].sort(), [orders]);
  const curView = viewYm || months[months.length - 1] || "";
  const viewRows = useMemo(() =>
    orders.filter(o => o.ym === curView).sort((a, b) => a.order_date < b.order_date ? -1 : 1),
    [orders, curView]);

  const marked = useMemo(() => {
    const seen = new Set(existingKeys);
    return preview.map(o => { const k = dupKey(o); const dup = seen.has(k); seen.add(k); return { o, dup }; });
  }, [preview, existingKeys]);
  const newCount = marked.filter(m => !m.dup).length;
  const dupCount = marked.filter(m => m.dup).length;

  function doPreview(list: Order[]) {
    setPreview(list);
    const ms = [...new Set(list.map(o => o.ym))].sort();
    setMsg(list.length ? `인식: ${list.length}건 (${ms.join(", ")})` : "인식된 주문이 없습니다. 컬럼/형식을 확인하세요.");
  }
  function onPaste() { doPreview(parsePaste(pasteText)); }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    doPreview(parseRows(XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true })));
    e.target.value = "";
  }
  async function addNewOnly() {
    const toAdd = marked.filter(m => !m.dup).map(m => m.o);
    if (!toAdd.length) { setMsg("추가할 신규 주문이 없습니다 (모두 중복)."); return; }
    await appendOrders(toAdd);
    setPreview([]); setPasteText(""); setMsg(`신규 ${toAdd.length}건 추가 완료 (중복 ${dupCount}건 제외)`); onChange();
  }
  async function replaceMonths() {
    const ms = [...new Set(preview.map(o => o.ym))];
    for (const m of ms) await replaceMonth(m, preview.filter(o => o.ym === m));
    setPreview([]); setPasteText(""); setMsg(`교체 저장 완료: ${ms.join(", ")} (총 ${preview.length}건)`); onChange();
  }
  async function loadSample() {
    const ms = [...new Set(sampleOrders.map(o => o.ym))];
    for (const m of ms) await replaceMonth(m, sampleOrders.filter(o => o.ym === m));
    setMsg("데모 데이터(2026 1~6월) 불러오기 완료"); onChange();
  }

  const cell: React.CSSProperties = { border: "1px solid #eee", padding: "4px 6px" };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>① 엑셀 업로드</h3>
          <p className="muted">이카운트 [주문서현황] → Excel(화면)로 받은 파일을 올리세요.</p>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} />
          <hr style={{ margin: "16px 0", border: 0, borderTop: "1px solid var(--line)" }} />
          <h3>② 화면 복사 → 붙여넣기</h3>
          <p className="muted">주문서현황 표를 드래그 복사(Ctrl+C) 후 아래에 붙여넣기(Ctrl+V).</p>
          <textarea value={pasteText} onChange={e => setPasteText(e.target.value)}
            placeholder="여기에 붙여넣기..." style={{ width: "100%", height: 100, fontSize: 12, padding: 8 }} />
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={onPaste}>붙여넣기 인식</button>
            <button className="btn ghost" onClick={loadSample}>데모 데이터 불러오기</button>
          </div>
          {msg && <p style={{ marginTop: 12, color: "#1f4e78", fontSize: 13 }}>{msg}</p>}
          {preview.length > 0 &&
            <div style={{ marginTop: 10, padding: 10, background: "#f5f9ff", borderRadius: 8 }}>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                <b style={{ color: "#1aa260" }}>신규 {newCount}건</b> · <b style={{ color: "#c0392b" }}>중복 {dupCount}건</b>
                <span className="muted"> (기준: 일자·품목·규격·수량·거래처)</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn green" onClick={addNewOnly}>신규 {newCount}건만 추가</button>
                <button className="btn" onClick={replaceMonths}>이 달 전체 교체</button>
              </div>
            </div>}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>저장된 주문 (월별)</h3>
          {byMonth.length === 0 ? <p className="muted">아직 없음. 왼쪽에서 가져오세요.</p> :
            <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr><th style={{ textAlign: "left", padding: 4 }}>월</th><th style={{ padding: 4 }}>건수</th></tr></thead>
              <tbody>{byMonth.map(([ym, n]) =>
                <tr key={ym}><td style={{ padding: 4 }}>{ym}</td><td style={{ padding: 4, textAlign: "center" }}>{n}</td></tr>)}
              </tbody>
            </table>}
          {preview.length > 0 &&
            <>
              <h4>미리보기 (상위 12건, <span style={{ color: "#c0392b" }}>빨강=중복</span>)</h4>
              <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
                <thead><tr>{["", "일자", "품목명", "규격", "수량", "거래처"].map(h =>
                  <th key={h} style={cell}>{h}</th>)}</tr></thead>
                <tbody>{marked.slice(0, 12).map((m, i) =>
                  <tr key={i} style={{ background: m.dup ? "#fdeeee" : "#fff" }}>
                    <td style={{ ...cell, color: m.dup ? "#c0392b" : "#1aa260" }}>{m.dup ? "중복" : "신규"}</td>
                    <td style={cell}>{m.o.order_date}</td><td style={cell}>{m.o.name}</td><td style={cell}>{m.o.spec}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{m.o.qty.toLocaleString()}</td><td style={cell}>{m.o.customer}</td>
                  </tr>)}
                </tbody>
              </table>
            </>}
        </div>
      </div>

      {/* 저장된 주문 데이터 보기 */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>저장된 주문 데이터</h3>
          {months.length > 0 &&
            <select value={curView} onChange={e => setViewYm(e.target.value)} style={{ padding: 5 }}>
              {months.map(m => <option key={m} value={m}>{m.slice(0, 4)}년 {+m.slice(5, 7)}월</option>)}
            </select>}
          <span className="muted">{viewRows.length}건 · 생산완료일=생산계획 마지막날(자동) · COC=성적서 발행여부</span>
        </div>
        {viewRows.length === 0 ? <p className="muted">표시할 데이터가 없습니다.</p> :
          <div style={{ overflow: "auto", maxHeight: "60vh" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
              <thead><tr>{["주문일", "품목구분", "품목명", "규격", "수량(g)", "거래처", "생산완료일", "상태", "COC", "적요"].map(h =>
                <th key={h} style={{ ...cell, background: "#1f4e78", color: "#fff", position: "sticky", top: 0 }}>{h}</th>)}</tr></thead>
              <tbody>
                {viewRows.map(o => {
                  const cp = completionDate(plans[o.id]);
                  const done = !!plans[o.id]?.done;
                  const hasCoc = !!cocs[o.id];
                  return (
                    <tr key={o.id}>
                      <td style={cell}>{o.order_date}</td>
                      <td style={cell}>{o.gubun}</td>
                      <td style={{ ...cell, fontWeight: 700 }}>{o.name}</td>
                      <td style={cell}>{o.spec}</td>
                      <td style={{ ...cell, textAlign: "right" }}>{o.qty.toLocaleString()}</td>
                      <td style={cell}>{o.customer}</td>
                      <td style={{ ...cell, textAlign: "center", color: cp ? "#1f4e78" : "#bbb", fontWeight: cp ? 700 : 400 }}>{cp || "-"}</td>
                      <td style={{ ...cell, textAlign: "center", color: done ? "#1aa260" : (cp ? "#2f6cb0" : "#bbb"), fontWeight: done ? 700 : 400 }}>{done ? "완료" : (cp ? "진행중" : "미계획")}</td>
                      <td style={{ ...cell, textAlign: "center", color: hasCoc ? "#1aa260" : "#bbb" }}>{hasCoc ? "발행" : "-"}</td>
                      <td style={{ ...cell, color: "#888" }}>{o.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>}
      </div>
    </div>
  );
}
