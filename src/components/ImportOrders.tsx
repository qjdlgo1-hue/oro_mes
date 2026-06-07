import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Order } from "../lib/types";
import { parsePaste, parseRows } from "../lib/parseOrders";
import { replaceMonth } from "../lib/db";
import { sampleOrders } from "../lib/sampleOrders";

export default function ImportOrders({ orders, onChange }: { orders: Order[]; onChange: () => void }) {
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<Order[]>([]);
  const [msg, setMsg] = useState("");

  const byMonth = useMemo(() => {
    const m: Record<string, number> = {};
    orders.forEach(o => { m[o.ym] = (m[o.ym] || 0) + 1; });
    return Object.entries(m).sort((a, b) => a[0] < b[0] ? 1 : -1);
  }, [orders]);

  function doPreview(list: Order[]) {
    setPreview(list);
    const months = [...new Set(list.map(o => o.ym))].sort();
    setMsg(list.length
      ? `미리보기: ${list.length}건 (${months.join(", ")}). 아래 '저장'을 누르면 해당 월 주문을 교체 저장합니다.`
      : "인식된 주문이 없습니다. 컬럼/형식을 확인하세요.");
  }

  function onPaste() { doPreview(parsePaste(pasteText)); }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true });
    doPreview(parseRows(rows));
    e.target.value = "";
  }

  async function save() {
    if (!preview.length) return;
    const months = [...new Set(preview.map(o => o.ym))];
    for (const ym of months) {
      await replaceMonth(ym, preview.filter(o => o.ym === ym));
    }
    setPreview([]); setPasteText(""); setMsg(`저장 완료: ${months.join(", ")}`);
    onChange();
  }

  async function loadSample() {
    const months = [...new Set(sampleOrders.map(o => o.ym))];
    for (const ym of months) await replaceMonth(ym, sampleOrders.filter(o => o.ym === ym));
    setMsg("데모 데이터(2026 1~6월) 불러오기 완료"); onChange();
  }

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>① 엑셀 업로드</h3>
        <p className="muted">이카운트 [주문서현황] → Excel(화면)로 받은 파일을 올리세요.</p>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} />
        <hr style={{ margin: "16px 0", border: 0, borderTop: "1px solid var(--line)" }} />
        <h3>② 화면 복사 → 붙여넣기</h3>
        <p className="muted">주문서현황 표를 드래그 복사(Ctrl+C) 후 아래에 붙여넣기(Ctrl+V).</p>
        <textarea value={pasteText} onChange={e => setPasteText(e.target.value)}
          placeholder="여기에 붙여넣기..." style={{ width: "100%", height: 120, fontSize: 12, padding: 8 }} />
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <button className="btn" onClick={onPaste}>붙여넣기 인식</button>
          <button className="btn ghost" onClick={loadSample}>데모 데이터 불러오기</button>
        </div>
        {msg && <p style={{ marginTop: 12, color: "#1f4e78", fontSize: 13 }}>{msg}</p>}
        {preview.length > 0 &&
          <button className="btn green" style={{ marginTop: 8 }} onClick={save}>이 {preview.length}건 저장</button>}
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
            <h4>미리보기 (상위 10건)</h4>
            <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr>{["일자", "품목구분", "품목명", "규격", "수량", "거래처"].map(h =>
                <th key={h} style={{ border: "1px solid #ddd", padding: 3 }}>{h}</th>)}</tr></thead>
              <tbody>{preview.slice(0, 10).map((o, i) =>
                <tr key={i}>
                  <td style={{ border: "1px solid #eee", padding: 3 }}>{o.order_date}</td>
                  <td style={{ border: "1px solid #eee", padding: 3 }}>{o.gubun}</td>
                  <td style={{ border: "1px solid #eee", padding: 3 }}>{o.name}</td>
                  <td style={{ border: "1px solid #eee", padding: 3 }}>{o.spec}</td>
                  <td style={{ border: "1px solid #eee", padding: 3, textAlign: "right" }}>{o.qty.toLocaleString()}</td>
                  <td style={{ border: "1px solid #eee", padding: 3 }}>{o.customer}</td>
                </tr>)}
              </tbody>
            </table>
          </>}
      </div>
    </div>
  );
}
