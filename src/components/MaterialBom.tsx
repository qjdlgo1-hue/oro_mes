// 원재료(BOM) — BOM 등록 시트 + 리비전(Rev 1→2→3) 이력 관리.
// · 리비전 원칙: 확정본(active/obsolete)은 불변 — 수정하려면 [새 리비전으로 편집](draft 복제) 후 [확정].
//   품목당 active는 1개(DB 부분 유니크 인덱스). 확정/발행은 RPC 한 트랜잭션.
// · 신규 등록: 품목 마스터(제품/반제품)에서 선택하거나 직접 입력 → Rev 1 draft → 자재 입력 → 확정.
// · 가져오기: 이카운트 [BOM(소요량)현황] — 파일에 포함된 제품마다 새 리비전 발행(이력 보존, 미포함 제품 유지)
// · 월별 소비: 수주량을 BOM으로 전개(반제품 → 원분말까지 재귀) → 원재료별 동적 열 (active 리비전 기준)
import { errMsg } from "../lib/errmsg";
import { useAsyncList } from "../lib/useAsyncList";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Order } from "../lib/types";
import {
  BomRow, BomRev, Item, listBomRows, listBomRevs, listBomRowsByRev,
  bomNextRev, bomPublish, discardBomRev, importBomRevs,
  upsertBomRow, deleteBomRow, listItems, logAudit,
} from "../lib/db";
import { parseBomText, parseBomCells } from "../lib/parseBom";
import { buildBomIndex, explodeByItem, resolveProd } from "../lib/bom";
import { can } from "../lib/perm";
import { toast } from "../lib/toast";
import { confirmDialog } from "../lib/confirm";
import { usePersistState } from "../lib/usePersist";
import MonthPicker from "./MonthPicker";

const num = (n: number) => (Math.round(n * 100) / 100).toLocaleString("ko-KR");

function RevBadge({ s }: { s: BomRev["status"] }) {
  if (s === "active") return <b style={{ color: "#15663f", fontSize: 12 }}>● active (사용 중)</b>;
  if (s === "draft") return <b style={{ color: "#b5720a", fontSize: 12 }}>✏ draft (편집 중)</b>;
  return <span className="muted" style={{ fontSize: 12 }}>obsolete (이력)</span>;
}

export default function MaterialBom({ orders }: { orders: Order[] }) {
  const canEdit = can("bom.edit");
  const { data: rows, reload } = useAsyncList<BomRow[]>(listBomRows, [], "BOM"); // active 리비전 행 (전개·소비 계산의 원천)
  const [revs, setRevs] = useState<BomRev[]>([]);
  const loadRevs = () => listBomRevs().then(setRevs).catch(e => toast.error("리비전 불러오기 실패: " + errMsg(e)));
  useEffect(() => { loadRevs(); }, []);
  const [ym, setYm] = usePersistState("bom.ym", "");
  const [q, setQ] = useState("");
  const [proc, setProc] = useState("");        // 공정 필터
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const idx = useMemo(() => buildBomIndex(rows), [rows]);
  const procs = useMemo(() => [...new Set(rows.map(r => r.process).filter(Boolean))].sort(), [rows]);
  const matCount = useMemo(() => new Set(rows.map(r => r.mat_code || r.mat_name)).size, [rows]);
  const revsByProd = useMemo(() => {
    const m = new Map<string, BomRev[]>();
    revs.forEach(v => { const a = m.get(v.prod_name) || []; a.push(v); m.set(v.prod_name, a); });
    m.forEach(a => a.sort((x, y) => y.revision - x.revision));
    return m;
  }, [revs]);

  // 제품 목록 = active 행의 생산품목 + 리비전 보유 품목(draft만 있는 신규 포함)
  const products = useMemo(() => {
    const m = new Map<string, { code: string; name: string; process: string; batch: number; mats: BomRow[] }>();
    rows.forEach(r => {
      const e = m.get(r.prod_name) || { code: r.prod_code, name: r.prod_name, process: r.process, batch: r.batch_qty, mats: [] };
      e.mats.push(r);
      if (!e.code && r.prod_code) e.code = r.prod_code;
      m.set(r.prod_name, e);
    });
    revsByProd.forEach((vs, name) => {
      if (!m.has(name)) m.set(name, { code: vs[0].prod_code || "", name, process: "", batch: 50, mats: [] });
    });
    let arr = [...m.values()];
    if (proc) arr = arr.filter(p => p.process === proc);
    const s = q.trim().toLowerCase();
    if (s) arr = arr.filter(p => (p.code + " " + p.name).toLowerCase().includes(s));
    return arr.sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name));
  }, [rows, revsByProd, q, proc]);

  // ---- 리비전 패널 (펼친 제품) ----
  const [openProd, setOpenProd] = useState("");
  const [panelRevId, setPanelRevId] = useState("");
  const [panelRows, setPanelRows] = useState<BomRow[]>([]);
  const [desc, setDesc] = useState("");       // 확정 시 저장할 변경 사유
  const [add, setAdd] = useState({ mat_code: "", mat_name: "", qty: "" });
  const panelRevs = revsByProd.get(openProd) || [];
  const panelRev = panelRevs.find(v => v.id === panelRevId);
  const editable = canEdit && panelRev?.status === "draft";

  function openPanel(name: string) {
    if (openProd === name) { setOpenProd(""); setPanelRevId(""); return; }
    const vs = revsByProd.get(name) || [];
    const def = vs.find(v => v.status === "draft") || vs.find(v => v.status === "active") || vs[0];
    setOpenProd(name); setPanelRevId(def?.id || ""); setDesc(""); setAdd({ mat_code: "", mat_name: "", qty: "" });
  }
  useEffect(() => {
    if (!panelRevId) { setPanelRows([]); return; }
    listBomRowsByRev(panelRevId).then(setPanelRows).catch(e => toast.error("BOM 상세 불러오기 실패: " + errMsg(e)));
  }, [panelRevId]);

  // ---- 리비전 동작 ----
  async function newRevision(p: { code: string; name: string }) {
    setBusy(true);
    try {
      const id = await bomNextRev(p.code, p.name);
      logAudit("BOM 새 리비전 발행", "bom", p.name, {});
      await loadRevs();
      setOpenProd(p.name); setPanelRevId(id); setDesc("");
      toast.success("새 리비전(draft)이 만들어졌습니다 — 편집 후 [확정]하면 적용됩니다.");
    } catch (e: any) { toast.error("리비전 발행 실패: " + errMsg(e)); }
    setBusy(false);
  }
  async function publish() {
    if (!panelRev) return;
    if (!panelRows.length) { toast.error("자재가 없습니다 — 소모품목을 먼저 추가하세요."); return; }
    if (!(await confirmDialog({
      title: "BOM 리비전 확정",
      message: `${openProd} Rev ${panelRev.revision}을 확정(active)합니다.\n기존 사용 중 리비전은 이력(obsolete)으로 남고, 이후 소요량 전개·원가 계산은 이 리비전 기준으로 바뀝니다.`,
      confirmLabel: "확정",
    }))) return;
    setBusy(true);
    try {
      await bomPublish(panelRev.id, desc.trim() || undefined);
      logAudit("BOM 리비전 확정", "bom", openProd, { rev: panelRev.revision });
      await Promise.all([loadRevs(), reload()]);
      toast.success(`Rev ${panelRev.revision} 확정 — 지금부터 이 리비전이 사용됩니다.`);
    } catch (e: any) { toast.error("확정 실패: " + errMsg(e)); }
    setBusy(false);
  }
  async function discard() {
    if (!panelRev) return;
    if (!(await confirmDialog({ title: "draft 폐기", danger: true, confirmLabel: "폐기", message: `${openProd} Rev ${panelRev.revision} (draft)를 폐기할까요?\n이 리비전의 자재 행이 삭제됩니다. (확정된 리비전은 영향 없음)` }))) return;
    setBusy(true);
    try {
      await discardBomRev(panelRev.id);
      logAudit("BOM draft 폐기", "bom", openProd, { rev: panelRev.revision });
      await loadRevs();
      const left = (revsByProd.get(openProd) || []).filter(v => v.id !== panelRev.id);
      if (left.length) setPanelRevId((left.find(v => v.status === "active") || left[0]).id);
      else { setOpenProd(""); setPanelRevId(""); }
      toast.success("draft 폐기됨");
    } catch (e: any) { toast.error("폐기 실패: " + errMsg(e)); }
    setBusy(false);
  }

  // ---- draft 행 편집 ----
  function setQty(r: BomRow, v: string) {
    const qty = Number(v) || 0;
    setPanelRows(list => list.map(x => x.id === r.id ? { ...x, qty } : x));
    upsertBomRow({ ...r, qty }).then(() => logAudit("BOM 수정", "bom", r.prod_name, { mat: r.mat_name, qty, rev: panelRev?.revision }))
      .catch(e => toast.error("저장 실패: " + errMsg(e)));
  }
  async function delRow(r: BomRow) {
    if (!(await confirmDialog({ title: "원재료 행 삭제", message: `${r.prod_name} ← ${r.mat_name} (${num(r.qty)}) 행을 삭제할까요?`, danger: true, confirmLabel: "삭제" }))) return;
    try {
      await deleteBomRow(r.id!);
      logAudit("BOM 행 삭제", "bom", r.prod_name, { mat: r.mat_name, rev: panelRev?.revision });
      setPanelRows(list => list.filter(x => x.id !== r.id));
    } catch (e: any) { toast.error("삭제 실패: " + errMsg(e)); }
  }
  async function addRow(p: { code: string; name: string; process: string; batch: number }) {
    if (!panelRev || panelRev.status !== "draft") return;
    const matName = add.mat_name.trim();
    if (!matName) { toast.error("원재료명을 입력하세요."); return; }
    if (matName === p.name || (add.mat_code.trim() && add.mat_code.trim() === p.code)) { toast.error("자기 자신을 소모품목으로 넣을 수 없습니다."); return; }
    const qty = Number(add.qty) || 0;
    if (qty <= 0) { toast.error("소요량을 입력하세요."); return; }
    const base = panelRows[0];
    try {
      await upsertBomRow({
        prod_code: p.code, prod_name: p.name, process: base?.process ?? p.process ?? "", version: "기본",
        mat_code: add.mat_code.trim(), mat_name: matName, batch_qty: base?.batch_qty ?? p.batch ?? 50, qty, rev_id: panelRev.id,
      });
      logAudit("BOM 행 추가", "bom", p.name, { mat: matName, qty, rev: panelRev.revision });
      setAdd({ mat_code: "", mat_name: "", qty: "" });
      setPanelRows(await listBomRowsByRev(panelRev.id));
    } catch (e: any) { toast.error("추가 실패: " + errMsg(e)); }
  }
  const matNames = useMemo(() => [...new Set(rows.map(r => r.mat_name))].sort(), [rows]);

  // ---- 신규 BOM 등록 ----
  const [newOpen, setNewOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => { if (newOpen && items === null) listItems().then(setItems).catch(() => setItems([])); }, [newOpen, items]);
  const [nb, setNb] = useState({ code: "", name: "" });
  const prodItems = useMemo(() => (items || []).filter((i: any) => i.active && (i.gubun === "제품" || i.gubun === "반제품")), [items]);
  async function createBom() {
    const name = nb.name.trim();
    if (!name) { toast.error("품목명을 입력하세요."); return; }
    if (revsByProd.has(name)) { toast.error("이미 BOM이 있는 품목입니다 — 목록에서 [새 리비전으로 편집]을 사용하세요."); return; }
    setBusy(true);
    try {
      const id = await bomNextRev(nb.code.trim(), name);
      logAudit("BOM 신규 등록", "bom", name, {});
      await loadRevs();
      setNewOpen(false); setNb({ code: "", name: "" }); setQ("");
      setOpenProd(name); setPanelRevId(id); setDesc("");
      toast.success("Rev 1 (draft) 생성 — 소모품목을 추가하고 [확정]하세요.");
    } catch (e: any) { toast.error("등록 실패: " + errMsg(e)); }
    setBusy(false);
  }

  // ---- 가져오기 (제품별 새 리비전 발행) ----
  async function doImport(parsed: BomRow[]) {
    if (!parsed.length) { toast.error("인식된 BOM 행이 없습니다. 머리글(생산품목명·소요량 포함)까지 복사했는지 확인하세요."); return; }
    const prodN = new Set(parsed.map(r => r.prod_name)).size;
    const matN = new Set(parsed.map(r => r.mat_code || r.mat_name)).size;
    if (!(await confirmDialog({
      title: "BOM 가져오기 (리비전 발행)",
      message: `인식: ${parsed.length}행 · 생산품목 ${prodN}종 · 소모품목 ${matN}종\n\n파일에 포함된 제품마다 새 리비전을 발행해 바로 적용(active)합니다.\n기존 리비전은 이력으로 보존되고, 파일에 없는 제품은 그대로 유지됩니다.`,
      confirmLabel: "가져오기",
    }))) return;
    setBusy(true);
    try {
      const res = await importBomRevs(parsed);
      await logAudit("BOM 가져오기(리비전 발행)", "bom", "", { rows: parsed.length, products: res.products });
      toast.success(`BOM 가져오기 완료 — 제품 ${res.products}종에 새 리비전 발행 (${parsed.length}행)`);
      setText(""); setImportOpen(false);
      await Promise.all([reload(), loadRevs()]);
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

  // ---- 월별 소비 (BOM 전개, 원재료별 동적 열) ----
  const prodOrders = useMemo(() => orders.filter(o => o.gubun === "제품" || o.gubun === "무형상품"), [orders]);
  const months = useMemo(() => [...new Set(orders.map(o => o.ym))].sort((a, b) => a < b ? 1 : -1), [orders]);
  const curYm = ym || months[0] || "";
  const consume = useMemo(() => {
    const g = new Map<string, { customer: string; name: string; code: string; qty: number }>();
    prodOrders.filter(o => o.ym === curYm).forEach(o => {
      const key = o.customer + "|" + o.name;
      const e = g.get(key) || { customer: o.customer, name: o.name, code: (o.item_code || "").trim(), qty: 0 };
      if (!e.code && o.item_code) e.code = o.item_code.trim();
      e.qty += o.qty; g.set(key, e);
    });
    const list = [...g.values()].sort((a, b) => a.customer < b.customer ? -1 : a.customer > b.customer ? 1 : (a.name < b.name ? -1 : 1));
    // 각 행을 BOM으로 전개 → 원재료별 소요량. 이 달에 등장한 원재료만 열로 쓴다.
    // 코드 우선 매칭(품목코드 == BOM 생산품목코드), 이름 폴백 — 표기가 달라도 코드만 맞으면 연동
    const rowsX = list.map(r => ({ ...r, hasBom: !!resolveProd(idx, r), mats: new Map(explodeByItem(idx, r, r.qty).map(m => [m.name, m.qty])) }));
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
          <span className="muted" style={{ fontSize: 12 }}>제품 {revsByProd.size || idx.byProd.size}종 · 원재료 {matCount}종 · {rows.length}행{procs.length > 0 && ` · 공정: ${procs.join("/")}`}</span>
          {canEdit && <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => { setNewOpen(v => !v); setImportOpen(false); }}>➕ BOM 신규 등록</button>
            <button className="btn ghost" onClick={() => { setImportOpen(v => !v); setNewOpen(false); }}>📥 BOM 가져오기</button>
          </span>}
        </div>

        {newOpen && canEdit && (
          <div style={{ background: "var(--tint2)", border: "1px solid var(--line)", borderRadius: 8, padding: 12, marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ fontSize: 12.5 }}>품목 선택 (제품/반제품)<br />
              <select value="" onChange={e => { const it = prodItems.find(x => x.code === e.target.value); if (it) setNb({ code: it.code, name: it.name }); }}
                style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6, maxWidth: 240 }}>
                <option value="">직접 입력…</option>
                {prodItems.map(it => <option key={it.code + it.name} value={it.code}>[{it.code}] {it.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12.5 }}>코드<br /><input value={nb.code} onChange={e => setNb(o => ({ ...o, code: e.target.value }))} style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6, width: 110 }} /></label>
            <label style={{ fontSize: 12.5 }}>생산품목명<br /><input value={nb.name} onChange={e => setNb(o => ({ ...o, name: e.target.value }))} style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6, width: 180 }} /></label>
            <button className="btn green" disabled={busy} onClick={createBom}>Rev 1 만들기</button>
            <span className="muted" style={{ fontSize: 11.5 }}>만들면 draft 상태로 열립니다 — 자재 입력 후 [확정]해야 전개·원가에 반영됩니다.</span>
          </div>
        )}

        {importOpen && canEdit && (
          <div style={{ background: "var(--tint2)", border: "1px solid var(--line)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.6 }}>
              이카운트 <b>[생산/외주 → BOM(소요량)현황]</b> 을 조회 → 표 전체 복사(머리글 포함) 후 붙여넣거나, 내보낸 엑셀 파일을 올리세요.
              파일에 포함된 제품마다 <b>새 리비전을 발행해 바로 적용</b>하고, 기존 리비전은 이력으로 남습니다 (파일에 없는 제품은 유지).
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

        {products.length === 0 ? (
          <p className="muted" style={{ lineHeight: 1.8 }}>등록된 BOM이 없습니다. {canEdit ? "➕ BOM 신규 등록으로 직접 입력하거나, 📥 BOM 가져오기로 이카운트 [BOM(소요량)현황]을 넣으세요." : ""}</p>
        ) : (
          <div style={{ overflow: "auto", maxHeight: "60vh" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>
                <th style={{ ...TH, textAlign: "left" }}>품목코드</th>
                <th style={{ ...TH, textAlign: "left" }}>생산품목명</th>
                <th style={{ ...TH, textAlign: "center" }}>공정</th>
                <th style={{ ...TH, textAlign: "right" }}>기준수량</th>
                <th style={{ ...TH, textAlign: "right" }}>원재료 수</th>
                <th style={{ ...TH, textAlign: "center" }}>리비전</th>
                <th style={{ ...TH, textAlign: "center" }}>상세</th>
              </tr></thead>
              <tbody>
                {products.map(p => {
                  const opened = openProd === p.name;
                  const vs = revsByProd.get(p.name) || [];
                  const act = vs.find(v => v.status === "active");
                  const hasDraft = vs.some(v => v.status === "draft");
                  return (
                    <Fragment key={p.name}>
                      <tr style={opened ? { background: "var(--tint2)" } : undefined}>
                        <td style={{ ...TD, fontWeight: 700 }}>{p.code || "-"}</td>
                        <td style={TD}>{p.name}</td>
                        <td style={{ ...TD, textAlign: "center" }}>{p.process}</td>
                        <td style={{ ...TD, textAlign: "right" }}>{p.mats.length ? num(p.batch) : "-"}</td>
                        <td style={{ ...TD, textAlign: "right" }}>{p.mats.length}</td>
                        <td style={{ ...TD, textAlign: "center", whiteSpace: "nowrap", fontSize: 12 }}>
                          {act ? <b>Rev {act.revision}</b> : <span className="muted">-</span>}
                          {hasDraft && <span title="편집 중인 draft 리비전이 있습니다" style={{ color: "#b5720a", fontWeight: 700 }}> ✏</span>}
                        </td>
                        <td style={{ ...TD, textAlign: "center" }}>
                          <button className="btn ghost" style={{ padding: "2px 9px", fontSize: 12 }} onClick={() => openPanel(p.name)}>{opened ? "닫기" : "보기"}</button>
                        </td>
                      </tr>
                      {opened && (
                        <tr><td colSpan={7} style={{ padding: "4px 10px 12px" }}>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "6px 0" }}>
                            {panelRevs.length > 0 && (
                              <select value={panelRevId} onChange={e => setPanelRevId(e.target.value)} style={{ padding: 5, border: "1px solid var(--line)", borderRadius: 6, fontSize: 12.5 }}>
                                {panelRevs.map(v => <option key={v.id} value={v.id}>Rev {v.revision} — {v.status === "active" ? "사용 중" : v.status === "draft" ? "편집 중" : "이력"}{v.effective_from ? ` (${v.effective_from}~)` : ""}</option>)}
                              </select>
                            )}
                            {panelRev && <RevBadge s={panelRev.status} />}
                            {panelRev?.description && <span className="muted" style={{ fontSize: 12 }}>· {panelRev.description}</span>}
                            <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {canEdit && panelRev && panelRev.status !== "draft" && !hasDraft &&
                                <button className="btn" style={{ padding: "3px 10px", fontSize: 12 }} disabled={busy} onClick={() => newRevision(p)}>✏️ 새 리비전으로 편집 (Rev {Math.max(...vs.map(v => v.revision)) + 1})</button>}
                              {canEdit && panelRev && panelRev.status !== "draft" && hasDraft &&
                                <button className="btn ghost" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setPanelRevId(vs.find(v => v.status === "draft")!.id)}>✏ 편집 중인 draft 열기</button>}
                              {editable && <>
                                <input placeholder="변경 사유 (선택)" value={desc} onChange={e => setDesc(e.target.value)} style={{ padding: 5, border: "1px solid var(--line)", borderRadius: 6, fontSize: 12, width: 160 }} />
                                <button className="btn green" style={{ padding: "3px 10px", fontSize: 12 }} disabled={busy} onClick={publish}>✔ 확정 (적용)</button>
                                <button className="btn ghost" style={{ padding: "3px 10px", fontSize: 12, color: "#c0392b" }} disabled={busy} onClick={discard}>draft 폐기</button>
                              </>}
                            </span>
                          </div>
                          {panelRev && panelRev.status !== "draft" && <p className="muted" style={{ fontSize: 11.5, margin: "0 0 6px" }}>확정된 리비전은 수정할 수 없습니다 — 변경하려면 [새 리비전으로 편집]으로 복제본(draft)을 만들어 편집 후 확정하세요.</p>}
                          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
                            <thead><tr>
                              <th style={{ ...TH, textAlign: "left" }}>소모품목코드</th>
                              <th style={{ ...TH, textAlign: "left" }}>소모품목명</th>
                              <th style={{ ...TH, textAlign: "right" }}>소요량 ({num(panelRows[0]?.batch_qty ?? p.batch)} 생산당)</th>
                              <th style={{ ...TH, textAlign: "center" }}>구분</th>
                              {editable && <th style={{ ...TH, textAlign: "center" }}>관리</th>}
                            </tr></thead>
                            <tbody>
                              {panelRows.map(r => {
                                const isSub = idx.prodNames.has(r.mat_name) || (r.mat_code && idx.byCode.has(r.mat_code));
                                return (
                                  <tr key={r.id || r.mat_code + r.mat_name}>
                                    <td style={TD}>{r.mat_code || "-"}</td>
                                    <td style={{ ...TD, fontWeight: 600 }}>{r.mat_name}</td>
                                    <td style={{ ...TD, textAlign: "right" }}>{editable ? <input type="number" inputMode="decimal" style={inp} value={r.qty || ""} onChange={e => setQty(r, e.target.value)} /> : num(r.qty)}</td>
                                    <td style={{ ...TD, textAlign: "center" }}>{isSub ? <span title="다른 BOM의 생산품목 — 소요량 전개 시 하위 BOM으로 재귀 계산" style={{ fontSize: 11, fontWeight: 700, color: "#8e5bd8" }}>반제품↳</span> : <span className="muted" style={{ fontSize: 11 }}>원재료</span>}</td>
                                    {editable && <td style={{ ...TD, textAlign: "center" }}><button className="btn ghost" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => delRow(r)}>삭제</button></td>}
                                  </tr>
                                );
                              })}
                              {panelRows.length === 0 && <tr><td colSpan={editable ? 5 : 4} style={{ ...TD, textAlign: "center" }} className="muted">자재가 없습니다{editable ? " — 아래에서 추가하세요" : ""}.</td></tr>}
                              {editable && (
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
        <p className="muted" style={{ fontSize: 11, marginTop: 8, marginBottom: 0 }}>
          리비전 원칙: 확정본은 바꾸지 않고 <b>새 리비전 발행 → 편집(draft) → 확정</b>으로 이력을 남깁니다. 소요량 전개·원가 계산은 항상 <b>사용 중(active)</b> 리비전 기준입니다.
        </p>
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
        <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>※ ⚠BOM미입력 품목은 소비 계산에서 제외됩니다 — BOM 신규 등록/가져오기로 입력하세요.</p>
      </div>
    </div>
  );
}
