import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "../lib/toast";

type Agg = { code: string; name: string; qty: number };

const splitCells = (l: string) => (l.includes("\t") ? l.split("\t") : l.split(/\s{2,}/)).map(s => s.trim());
const toNum = (s: string) => { const v = parseFloat((s || "").replace(/,/g, "")); return isNaN(v) ? 0 : v; };

// 이카운트 화면/엑셀 붙여넣기(헤더 포함) → 품목코드별 수량 합계.
// 헤더에서 품목코드/품목명/수량 열을 자동 인식. 없으면 코드 패턴(C0001 등)으로 보조 인식.
function parseByItem(text: string): { rows: Agg[]; total: number; lines: number; guessed: boolean } {
  const lines = text.split(/\r?\n/).map(l => l.replace(/ /g, " ")).filter(l => l.trim());
  if (!lines.length) return { rows: [], total: 0, lines: 0, guessed: false };

  let headerIdx = -1, ci = -1, ni = -1, qi = -1;
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const cells = splitCells(lines[i]);
    const c = cells.findIndex(x => x.replace(/\s/g, "").includes("품목코드"));
    const n = cells.findIndex(x => x.replace(/\s/g, "").includes("품목명"));
    const q = cells.findIndex(x => x.includes("수량"));
    if (c > -1 || q > -1) { headerIdx = i; ci = c; ni = n; qi = q; break; }
  }

  const map = new Map<string, Agg>();
  let counted = 0;
  for (let i = (headerIdx >= 0 ? headerIdx + 1 : 0); i < lines.length; i++) {
    const cells = splitCells(lines[i]);
    if (!cells.length) continue;
    if ((cells[0] || "").includes("계")) continue;            // 소계/합계 줄 제외
    let code = ci >= 0 ? (cells[ci] || "") : "";
    const name = ni >= 0 ? (cells[ni] || "") : "";
    if (!code) { const k = cells.find(x => /^[A-Za-z]\d{3,}$/.test(x)); code = k || ""; }   // 코드 패턴 보조
    let qty = qi >= 0 ? toNum(cells[qi]) : 0;
    if (qi < 0) { const nums = cells.map(toNum).filter(v => v > 0); qty = nums.length ? nums[0] : 0; }
    if ((!code && !name) || code === "품목코드") continue;
    const key = code || name;
    const cur = map.get(key) || { code, name, qty: 0 };
    if (!cur.name && name) cur.name = name;
    if (!cur.code && code) cur.code = code;
    cur.qty += qty; map.set(key, cur);
    counted++;
  }
  const rows = [...map.values()].sort((a, b) => (a.code || a.name) < (b.code || b.name) ? -1 : 1);
  const total = rows.reduce((s, r) => s + r.qty, 0);
  // 헤더(품목코드/수량 열)를 못 찾아 추정으로 합산한 경우 — 화면에 경고 표시용
  const guessed = rows.length > 0 && (headerIdx < 0 || ci < 0 || qi < 0);
  return { rows, total, lines: counted, guessed };
}

const ym = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`; };

export default function ProdInOut() {
  const [month, setMonth] = useState(ym());
  const [inText, setInText] = useState("");   // 생산입고
  const [outText, setOutText] = useState(""); // 판매현황(출하)
  const inAgg = useMemo(() => parseByItem(inText), [inText]);
  const outAgg = useMemo(() => parseByItem(outText), [outText]);

  const merged = useMemo(() => {
    const m = new Map<string, { code: string; name: string; inQ: number; outQ: number }>();
    inAgg.rows.forEach(r => { const k = r.code || r.name; m.set(k, { code: r.code, name: r.name, inQ: r.qty, outQ: 0 }); });
    outAgg.rows.forEach(r => { const k = r.code || r.name; const e = m.get(k) || { code: r.code, name: r.name, inQ: 0, outQ: 0 }; e.outQ = r.qty; if (!e.name) e.name = r.name; if (!e.code) e.code = r.code; m.set(k, e); });
    const rows = [...m.values()].map(e => ({ ...e, diff: e.inQ - e.outQ })).sort((a, b) => (a.code || a.name) < (b.code || b.name) ? -1 : 1);
    const tIn = rows.reduce((s, r) => s + r.inQ, 0), tOut = rows.reduce((s, r) => s + r.outQ, 0);
    return { rows, tIn, tOut, tDiff: tIn - tOut };
  }, [inAgg, outAgg]);

  const fmt = (n: number) => Math.round(n * 10) / 10 === Math.round(n) ? Math.round(n).toLocaleString() : (Math.round(n * 10) / 10).toLocaleString();

  function exportXlsx() {
    if (!merged.rows.length) { toast.error("비교할 데이터가 없습니다. 두 칸에 붙여넣으세요."); return; }
    const aoa = [["품목코드", "품목명", "출하량(판매)", "생산입고량", "차이(입고−출하)"]];
    merged.rows.forEach(r => aoa.push([r.code, r.name, String(r.outQ), String(r.inQ), String(r.diff)]));
    aoa.push(["합계", "", String(merged.tOut), String(merged.tIn), String(merged.tDiff)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "입출고비교");
    XLSX.writeFile(wb, `생산입고_출하_비교_${month}.xlsx`);
    toast.success("엑셀로 저장했습니다.");
  }

  const box: React.CSSProperties = { width: "100%", height: 150, fontSize: 12, padding: 8, border: "1px solid var(--line)", borderRadius: 8, fontFamily: "monospace" };
  const th: React.CSSProperties = { background: "#f1f3f7", color: "#374151", fontSize: 12, fontWeight: 700, padding: "7px 8px", textAlign: "right", position: "sticky", top: 0, borderBottom: "1px solid var(--line)" };
  const td: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid var(--line2)", fontSize: 13, textAlign: "right" };
  const tdL: React.CSSProperties = { ...td, textAlign: "left" };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>생산입고 vs 출하(판매) 비교</h3>
          <label style={{ fontSize: 13, color: "var(--muted)" }}>대상 월&nbsp;
            <input type="month" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value); }} style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6 }} />
          </label>
          <button className="btn" style={{ marginLeft: "auto" }} onClick={exportXlsx}>📊 엑셀 저장</button>
        </div>
        <div style={{ background: "var(--tint2)", border: "1px solid var(--tint2)", borderRadius: 8, padding: "10px 12px", marginTop: 12, fontSize: 12, lineHeight: 1.6 }}>
          <b style={{ color: "var(--accent)" }}>사용법</b> · 이카운트에서 해당 월로 조회한 뒤 <b>표를 복사</b>(헤더 포함)해 아래 두 칸에 각각 붙여넣으세요. <b>품목코드·수량 열을 자동 인식</b>해 품목코드 기준으로 합산·비교합니다.<br />
          <span className="muted">왼쪽=생산입고 조회(제품창고 입고) · 오른쪽=판매현황(매출=출하). 표 머리글(품목코드/품목명/수량)이 포함되도록 복사하면 가장 정확합니다.</span>
        </div>
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div className="card">
          <h4 style={{ marginTop: 0 }}>📥 생산입고 데이터</h4>
          <textarea value={inText} onChange={e => setInText(e.target.value)} placeholder="이카운트 [생산입고 조회] 표 붙여넣기..." style={box} />
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>인식: <b>{inAgg.rows.length}</b>개 품목 · 합계 <b>{fmt(inAgg.total)}</b></p>
          {inAgg.guessed && <p style={{ fontSize: 12, color: "#b45309", background: "#fff7e6", borderRadius: 6, padding: "6px 8px" }}>⚠ 표 머리글(품목코드/수량)을 찾지 못해 <b>추정 값</b>으로 합산했습니다. 숫자가 틀릴 수 있으니 머리글까지 포함해 다시 복사하세요.</p>}
        </div>
        <div className="card">
          <h4 style={{ marginTop: 0 }}>📤 출하(판매현황) 데이터</h4>
          <textarea value={outText} onChange={e => setOutText(e.target.value)} placeholder="이카운트 [판매현황] 표 붙여넣기..." style={box} />
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>인식: <b>{outAgg.rows.length}</b>개 품목 · 합계 <b>{fmt(outAgg.total)}</b></p>
          {outAgg.guessed && <p style={{ fontSize: 12, color: "#b45309", background: "#fff7e6", borderRadius: 6, padding: "6px 8px" }}>⚠ 표 머리글(품목코드/수량)을 찾지 못해 <b>추정 값</b>으로 합산했습니다. 숫자가 틀릴 수 있으니 머리글까지 포함해 다시 복사하세요.</p>}
        </div>
      </div>

      <div className="card">
        <h4 style={{ marginTop: 0 }}>품목코드별 비교 — {month} <span className="muted" style={{ fontSize: 12 }}>({merged.rows.length}개 품목)</span></h4>
        {merged.rows.length === 0 ? <p className="muted">두 칸에 데이터를 붙여넣으면 비교표가 나타납니다.</p> :
          <div style={{ overflow: "auto", maxHeight: "60vh" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>
                <th style={{ ...th, textAlign: "left" }}>품목코드</th>
                <th style={{ ...th, textAlign: "left" }}>품목명</th>
                <th style={th}>출하량(판매)</th>
                <th style={th}>생산입고량</th>
                <th style={th}>차이(입고−출하)</th>
              </tr></thead>
              <tbody>
                {merged.rows.map(r => {
                  const only = r.inQ === 0 || r.outQ === 0;
                  return (
                    <tr key={r.code || r.name} style={only ? { background: "#fff7e6" } : undefined}>
                      <td style={tdL}><b>{r.code || "-"}</b></td>
                      <td style={tdL}>{r.name || "-"}</td>
                      <td style={td}>{fmt(r.outQ)}</td>
                      <td style={td}>{fmt(r.inQ)}</td>
                      <td style={{ ...td, fontWeight: 700, color: r.diff > 0 ? "var(--ok)" : r.diff < 0 ? "#c0392b" : "var(--muted)" }}>
                        {r.diff > 0 ? "+" : ""}{fmt(r.diff)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "var(--tint)", fontWeight: 700 }}>
                  <td style={{ ...tdL }} colSpan={2}>합계</td>
                  <td style={td}>{fmt(merged.tOut)}</td>
                  <td style={td}>{fmt(merged.tIn)}</td>
                  <td style={{ ...td, color: merged.tDiff > 0 ? "var(--ok)" : merged.tDiff < 0 ? "#c0392b" : "var(--muted)" }}>{merged.tDiff > 0 ? "+" : ""}{fmt(merged.tDiff)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
              차이 = 생산입고 − 출하. <b style={{ color: "var(--ok)" }}>양(+)</b>이면 재고 증가(입고가 많음), <b style={{ color: "#c0392b" }}>음(−)</b>이면 재고 감소(출하가 많음). <span style={{ background: "#fff7e6" }}>노란 줄</span>은 한쪽에만 있는 품목입니다.
            </p>
          </div>}
      </div>
    </div>
  );
}
