// 원재료(BOM) — 이카운트 [BOM(소요량)현황] 기반 행 단위 BOM.
// · 가져오기: 이카운트 내보내기(붙여넣기/엑셀)를 통째로 임포트 (전체 교체 — 이카운트가 원본)
// · 제품별 원재료 행 조회/수정/추가/삭제 (공정·기준수량·소요량)
// · 월별 소비: 수주량을 BOM으로 전개(반제품 → 원분말까지 재귀) → 원재료별 동적 열
import { errMsg } from "../lib/errmsg";
import { useAsyncList } from "../lib/useAsyncList";
import { Fragment, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Order } from "../lib/types";
import { BomRow, listBomRows, replaceBomRows, upsertBomRow, deleteBomRow, logAudit } from "../lib/db";
import { parseBomText, parseBomCells } from "../lib/parseBom";
import { buildBomIndex, explode } from "../lib/bom";
import { can } from "../lib/perm";
import { toast } from "../lib/toast";
import { confirmDialog } from "../lib/confirm";
import { usePersistState } from "../lib/usePersist";
import MonthPicker from "./MonthPicker";

const num = (n: number) => (Math.round(n * 100) / 100).toLocaleString("ko-KR");

export default function MaterialBom({ orders }: { orders: Order[] }) {
  const canEdit = can("bom.edit");
  const { data: rows, setData: setRows, reload } = useAsyncList<BomRow[]>(listBomRows, [], "BOM");
  const [ym, setYm] = usePersistState("bom.ym", "");
  const [q, setQ] = useState("");
  const [proc, setProc] = useState("");        // 공정 필터
  const [openProd, setOpenProd] = useState(""); // 펼친 제품
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const idx = useMemo(() => buildBomIndex(rows), [rows]);
  const procs = useMemo(() => [...new Set(rows.map(r => r.process).filter(Boolean))].sort(), [rows]);
  const matCount = useMemo(() => new Set(rows.map(r => r.mat_code || r.mat_name)).size, [rows]);

  // 제품 목록 (BOM에 등록된 생산품목 기준 + 검색/공정 필터)
  const products = useMemo(() => {
    const m = new Map<string, { code: string; name: string; process: string; batch: number; mats: BomRow[] }>();
    rows.forEach(r => {
      const e = m.get(r.prod_name) || { code: r.prod_code, name: r.prod_name, process: r.process, batch: r.batch_qty, mats: [] };
      e.mats.push(r);
      if (!e.code && r.prod_code) e.code = r.prod_code;
      m.set(r.prod_name, e);
    });
    let arr = [...m.values()];
    if (proc) arr = arr.filter(p => p.process === proc);
    const s = q.trim().toLowerCase();
    if (s) arr = arr.filter(p => (p.code + " " + p.name).toLowerCase().includes(s));
    return arr.sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name));
  }, [rows, q, proc]);

  // ---- 가져오기 ----
  async function doImport(parsed: BomRow[]) {
    if (!parsed.length) { toast.error("인식된 BOM 행이 없습니다. 머리글(생산품목명·소요량 포함)까지 복사했는지 확인하세요."); return; }
    const prodN = new Set(parsed.map(r => r.prod_name)).size;
    const matN = new Set(parsed.map(r => r.mat_code || r.mat_name)).size;
    if (!(await confirmDialog({
      title: "BOM 전체 교체",
      message: `인식: ${parsed.length}행 · 생산품목 ${prodN}종 · 소모품목 ${matN}종\n\n기존 BOM을 전부 지우고 이 데이터로 교체합니다 (이카운트가 원본).\n계속할까요?`,
      confirmLabel: "교체 가져오기",
    }))) return;
    setBusy(true);
    try {
      await replaceBomRows(parsed);
      await logAudit("BOM 가져오기(전체 교체)", "bom", "", { rows: parsed.length, products: prodN, materials: matN });
      toast.success(`BOM 가져오기 완료 — ${parsed.length}행 (제품 ${prodN} · 원재료 ${matN})`);
      setText(""); setImportOpen(false); reload();
    } catch (e: any) { toast.error("가져오기 실패: " + errMsg(e)); }
    setBusy(false);
  }
  async function onFile(f: File) {
    try {
      const wb = XLSX.read(await f.arrayBuffer());
      const cells = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
      await doImport(parseBomCells(cells));
    } catch (e: any) { toast.error("엑셀 읽기 실패: " + errMsg(e)); }
    if (fileRef.current) fileRef.current.value = "";
  }

  // ---- 행 수정/추가/삭제 ----
  function setQty(r: BomRow, v: string) {
    const qty = Number(v) || 0;
    setRows(list => list.map(x => x.id === r.id ? { ...x, qty } : x));
    upsertBomRow({ ...r, qty }).then(() => logAudit("BOM 수정", "bom", r.prod_name, { mat: r.mat_name, qty }))
      .catch(e => toast.error("저장 실패: " + errMsg(e)));
  }
  async function delRow(r: BomRow) {
    if (!(await confirmDialog({ title: "원재료 행 삭제", message: `${r.prod_name} ← ${r.mat_name} (${num(r.qty)}) 행을 삭제할까요?`, danger: true, confirmLabel: "삭제" }))) return;
    try { await deleteBomRow(r.id!); logAudit("BOM 행 삭제", "bom", r.prod_name, { mat: r.mat_name }); reload(); }
    catch (e: any) { toast.error("삭제 실패: " + errMsg(e)); }
  }
  const [add, setAdd] = useState({ mat_code: "", mat_name: "", qty: "" });
  async function addRow(p: { code: string; name: string; process: string; batch: number }) {
    if (!add.mat_name.trim()) { toast.error("원재료명을 입력하세요."); return; }
    const qty = Number(add.qty) || 0;
    if (qty <= 0) { toast.error("소요량을 입력하세요."); return; }
    try {
      await upsertBomRow({ prod_code: p.code, prod_name: p.name, process: p.process, version: "기본", mat_code: add.mat_code.trim(), mat_name: add.mat_name.trim(), batch_qty: p.batch, qty });
      logAudit("BOM 행 추가", "bom", p.name, { mat: add.mat_name, qty });
      setAdd({ mat_code: "", mat_name: "", qty: "" }); reload();
    } catch (e: any) { toast.error("추가 실패: " + errMsg(e)); }
  }
  const matNames = useMemo(() => [...new Set(rows.map(r => r.mat_name))].sort(), [rows]);

  // ---- 월별 소비 (BOM 전개, 원재료별 동적 열) ----
  const prodOrders = useMemo(() => orders.filter(o => o.gubun === "제품" || o.gubun === "무형상품"), [orders]);
  const months = useMemo(() => [...new Set(orders.map(o => o.ym))].sort((a, b) => a < b ? 1 : -1), [orders]);
  const curYm = ym || months[0] || "";
  const consume = useMemo(() => {
    const g = new Map<string, { customer: string; name: string; qty: number }>();
    prodOrders.filter(o => o.ym === curYm).forEach(o => {
      const key = o.customer + "|" + o.name;
      const e = g.get(key) || { customer: o.customer, name: o.name, qty: 0 };
      e.qty += o.qty; g.set(key, e);
    });
    const list = [...g.values()].sort((a, b) => a.customer < b.customer ? -1 : a.customer > b.customer ? 1 : (a.name < b.name ? -1 : 1));
    // 각 행을 BOM으로 전개 → 원재료별 소요량. 이 달에 등장한 원재료만 열로 쓴다.
    const rowsX = list.map(r => ({ ...r, hasBom: idx.byProd.has(r.name), mats: new Map(explode(idx, r.name, r.qty).map(m => [m.name, m.qty])) }));
    const cols = [...new Set(rowsX.flatMap(r => [...r.mats.keys()]))].sort();
    const tot = new Map<string, number>();
    rowsX.forEach(r => r.mats.forEach((v, k) => tot.set(k, (tot.get(k) || 0) + v)));
    return { rows: rowsX, cols, tot, totQ: rowsX.reduce((s, r) => s + r.qty, 0) };
  }, [prodOrders, curYm, idx]);

  const TH: React.CSSProperties = { background: "#f1f3f7", color: "#374151", padding: "6px 8px", fontSize: 12, position: "sticky", top: 0 };
  const TD: React.CSSProperties = { padding: "5px 8px", borderBottom: "1px solid #eef2f7", fontSize: 13 };
  const inp: React.CSSProperties = { width: 80, padding: 5, border: "1px solid var(--line)", borderRadius: 5, textAlign: "right" };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>제품별 원재료 (BOM)</h3>
          <span className="muted" style={{ fontSize: 12 }}>제품 {idx.byProd.size}종 · 원재료 {matCount}종 · {rows.length}행{procs.length > 0 && ` · 공정: ${procs.join("/")}`}</span>
          {canEdit && <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setImportOpen(v => !v)}>📥 BOM 가져오기</button>}
        </div>

        {importOpen && canEdit && (
          <div style={{ background: "var(--tint2)", border: "1px solid var(--line)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.6 }}>
              이카운트 <b>[생산/외주 → BOM(소요량)현황]</b> 을 조회 → 표 전체 복사(머리글 포함) 후 붙여넣거나, 내보낸 엑셀 파일을 올리세요.
              <b> 가져오기는 기존 BOM을 전부 교체</b>합니다 (이카운트가 원본).
            </p>
            <textarea value={text} onChange={e => setText(e.target.value)} placeholder="생산품목코드	생산품목명	생산공정명	BOM버전	소모품목코드	소모품목명	생산수량	소요량 ..."
              style={{ width: "100%", height: 110, fontSize: 12, padding: 8, border: "1px solid var(--line)", borderRadius: 8, fontFamily: "monospace", boxSizing: "border-box" }} />
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn green" disabled={busy || !text.trim()} onClick={() => doImport(parseBomText(text))}>붙여넣기 가져오기</button>
              <label className="btn ghost" style={{ cursor: "pointer" }}>📄 엑셀 파일 선택
                <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
              </label>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <input placeholder="🔍 품목코드/품목명 검색" value={q} onChange={e => setQ(e.target.value)} style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6, minWidth: 180 }} />
          {procs.length > 1 && (
            <div className="seg">
              <button className={proc === "" ? "on" : ""} onClick={() => setProc("")}>전체</button>
              {procs.map(p => <button key={p} className={proc === p ? "on" : ""} onClick={() => setProc(p)}>{p}</button>)}
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="muted" style={{ lineHeight: 1.8 }}>등록된 BOM이 없습니다. {canEdit ? "위 📥 BOM 가져오기로 이카운트 [BOM(소요량)현황]을 통째로 넣으세요 — 한 번이면 끝납니다." : ""}</p>
        ) : (
          <div style={{ overflow: "auto", maxHeight: "50vh" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>
                <th style={{ ...TH, textAlign: "left" }}>품목코드</th>
                <th style={{ ...TH, textAlign: "left" }}>생산품목명</th>
                <th style={{ ...TH, textAlign: "center" }}>공정</th>
                <th style={{ ...TH, textAlign: "right" }}>기준수량</th>
                <th style={{ ...TH, textAlign: "right" }}>원재료 수</th>
                <th style={{ ...TH, textAlign: "center" }}>상세</th>
              </tr></thead>
              <tbody>
                {products.map(p => {
                  const opened = openProd === p.name;
                  return (
                    <Fragment key={p.name}>
                      <tr style={opened ? { background: "var(--tint2)" } : undefined}>
                        <td style={{ ...TD, fontWeight: 700 }}>{p.code || "-"}</td>
                        <td style={TD}>{p.name}</td>
                        <td style={{ ...TD, textAlign: "center" }}>{p.process}</td>
                        <td style={{ ...TD, textAlign: "right" }}>{num(p.batch)}</td>
                        <td style={{ ...TD, textAlign: "right" }}>{p.mats.length}</td>
                        <td style={{ ...TD, textAlign: "center" }}>
                          <button className="btn ghost" style={{ padding: "2px 9px", fontSize: 12 }} onClick={() => { setOpenProd(opened ? "" : p.name); setAdd({ mat_code: "", mat_name: "", qty: "" }); }}>{opened ? "닫기" : "보기"}</button>
                        </td>
                      </tr>
                      {opened && (
                        <tr><td colSpan={6} style={{ padding: "4px 10px 12px" }}>
                          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
                            <thead><tr>
                              <th style={{ ...TH, textAlign: "left" }}>소모품목코드</th>
                              <th style={{ ...TH, textAlign: "left" }}>소모품목명</th>
                              <th style={{ ...TH, textAlign: "right" }}>소요량 ({num(p.batch)} 생산당)</th>
                              <th style={{ ...TH, textAlign: "center" }}>구분</th>
                              {canEdit && <th style={{ ...TH, textAlign: "center" }}>관리</th>}
                            </tr></thead>
                            <tbody>
                              {p.mats.map(r => {
                                const isSub = idx.prodNames.has(r.mat_name) || (r.mat_code && idx.byCode.has(r.mat_code));
                                return (
                                  <tr key={r.id || r.mat_code + r.mat_name}>
                                    <td style={TD}>{r.mat_code || "-"}</td>
                                    <td style={{ ...TD, fontWeight: 600 }}>{r.mat_name}</td>
                                    <td style={{ ...TD, textAlign: "right" }}>{canEdit ? <input type="number" inputMode="decimal" style={inp} value={r.qty || ""} onChange={e => setQty(r, e.target.value)} /> : num(r.qty)}</td>
                                    <td style={{ ...TD, textAlign: "center" }}>{isSub ? <span title="다른 BOM의 생산품목 — 소요량 전개 시 하위 BOM으로 재귀 계산" style={{ fontSize: 11, fontWeight: 700, color: "#8e5bd8" }}>반제품↳</span> : <span className="muted" style={{ fontSize: 11 }}>원재료</span>}</td>
                                    {canEdit && <td style={{ ...TD, textAlign: "center" }}><button className="btn ghost" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => delRow(r)}>삭제</button></td>}
                                  </tr>
                                );
                              })}
                              {canEdit && (
                                <tr>
                                  <td style={TD}><input placeholder="코드(선택)" value={add.mat_code} onChange={e => setAdd(o => ({ ...o, mat_code: e.target.value }))} style={{ width: 90, padding: 5, border: "1px solid var(--line)", borderRadius: 5 }} /></td>
                                  <td style={TD}>
                                    <input placeholder="원재료명" list="bom-mats" value={add.mat_name} onChange={e => setAdd(o => ({ ...o, mat_name: e.target.value }))} style={{ width: 140, padding: 5, border: "1px solid var(--line)", borderRadius: 5 }} />
                                    <datalist id="bom-mats">{matNames.map(m => <option key={m} value={m} />)}</datalist>
                                  </td>
                                  <td style={{ ...TD, textAlign: "right" }}><input placeholder="소요량" value={add.qty} onChange={e => setAdd(o => ({ ...o, qty: e.target.value }))} style={inp} /></td>
                                  <td style={TD} />
                                  <td style={{ ...TD, textAlign: "center" }}><button className="btn" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => addRow(p)}>+ 추가</button></td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>월별 원재료 소비 <span className="muted" style={{ fontSize: 12 }}>(수주량 × BOM 전개 — 반제품은 원재료까지 재귀 계산)</span></h3>
          <MonthPicker months={[...months].sort()} value={curYm} onChange={setYm} />
        </div>
        {consume.rows.length === 0 ? <p className="muted">이 달 생산(주문)이 없습니다.</p> :
          <div style={{ overflow: "auto", maxHeight: "55vh" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>
                <th style={{ ...TH, textAlign: "left" }}>거래처</th>
                <th style={{ ...TH, textAlign: "left" }}>품목</th>
                <th style={{ ...TH, textAlign: "right" }}>수주량(g)</th>
                {consume.cols.map(c => <th key={c} style={{ ...TH, textAlign: "right" }}>{c}</th>)}
              </tr></thead>
              <tbody>
                {consume.rows.map((r, i) => (
                  <tr key={i}>
                    <td style={TD}>{r.customer}</td>
                    <td style={{ ...TD, fontWeight: 700 }}>{r.name}{!r.hasBom && <span style={{ color: "#c0392b", fontSize: 11 }}> ⚠BOM미입력</span>}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{num(r.qty)}</td>
                    {consume.cols.map(c => <td key={c} style={{ ...TD, textAlign: "right" }}>{r.mats.has(c) ? num(r.mats.get(c)!) : ""}</td>)}
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, background: "#e6f0ea" }}>
                  <td style={TD} colSpan={2}>합계</td>
                  <td style={{ ...TD, textAlign: "right" }}>{num(consume.totQ)}</td>
                  {consume.cols.map(c => <td key={c} style={{ ...TD, textAlign: "right", color: "#15663f" }}>{num(consume.tot.get(c) || 0)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>}
        <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>※ ⚠BOM미입력 품목은 소비 계산에서 제외됩니다 — BOM 가져오기 또는 위 표에서 원재료 행을 추가하세요.</p>
      </div>
    </div>
  );
}
