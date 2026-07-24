import { errMsg } from "../lib/errmsg";
import { todayIso } from "../lib/fmt";
import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Order, PlanEntry, CocData } from "../lib/types";
import { parsePaste, parseRows } from "../lib/parseOrders";
import { appendOrders, dupKey, updateOrder, deleteOrder, logAudit, listPlans, listCocs, replaceMonth, listItems, Item } from "../lib/db";
import { buildManualOrders, mapItemGubun } from "../lib/manualOrders";
import { completionDate } from "../lib/plan";
import { sampleOrders } from "../lib/sampleOrders";
import { toast } from "../lib/toast";
import { can } from "../lib/perm";
import { useIsMobile } from "../lib/useIsMobile";
import { confirmDialog } from "../lib/confirm";
import { usePersistState } from "../lib/usePersist";
import MonthPicker from "./MonthPicker";

export default function ImportOrders({ orders, onChange }: { orders: Order[]; onChange: () => void }) {
  const canImport = can("order.import"), canEdit = can("order.edit"), canDelete = can("order.delete");
  const isMobile = useIsMobile();
  const blankOrder = (): Order => ({ id: "", order_no: "수동입력", order_date: todayIso(), ym: "", item_code: "", gubun: "제품", name: "", spec: "", qty: 0, customer: "", note: "" });
  const [no, setNo] = useState<Order>(blankOrder());
  async function addManual() {
    if (!no.name.trim()) { toast.error("품목명을 입력하세요."); return; }
    if (!(Number(no.qty) > 0)) { toast.error("수량을 입력하세요."); return; }
    const id = (crypto as any).randomUUID?.() || String(Date.now());
    const ord: Order = { ...no, id, ym: no.order_date.slice(0, 7), qty: Number(no.qty) };
    setBusy(true);
    try { await appendOrders([ord]); await logAudit("주문 직접추가", "order", id, { name: ord.name, qty: ord.qty }); toast.success("주문 추가됨 (수동입력)"); setNo(blankOrder()); onChange(); }
    catch (e: any) { toast.error("추가 실패: " + errMsg(e)); }
    setBusy(false);
  }
  // ---- 품목 선택 모달 (단수: 폼에 적용 / 복수: 품목별 수량으로 일괄 추가) ----
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pitems, setPitems] = useState<Item[] | null>(null); // 첫 오픈 시 지연 로드
  const [pq, setPq] = useState("");
  const [pg, setPg] = useState("");                          // 구분 필터
  const [psel, setPsel] = useState<Map<string, number>>(new Map()); // key(code|name) → 수량
  useEffect(() => { if (pickerOpen && pitems === null) listItems().then(setPitems).catch(() => setPitems([])); }, [pickerOpen, pitems]);
  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPickerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen]);
  const pKey = (i: { code: string; name: string }) => `${i.code}|${i.name}`;
  const pActive = useMemo(() => (pitems || []).filter(i => i.active), [pitems]);
  const pGubuns = useMemo(() => [...new Set(pActive.map(i => i.gubun))], [pActive]);
  const pList = useMemo(() => {
    let arr = pActive;
    if (pg) arr = arr.filter(i => i.gubun === pg);
    const s = pq.trim().toLowerCase();
    if (s) arr = arr.filter(i => (i.code + " " + i.name + " " + i.spec).toLowerCase().includes(s));
    return arr.slice(0, 300);
  }, [pActive, pg, pq]);
  const pPicks = useMemo(() => {
    const byKey = new Map(pActive.map(i => [pKey(i), i]));
    return [...psel.entries()].flatMap(([k, qty]) => { const it = byKey.get(k); return it ? [{ code: it.code, name: it.name, spec: it.spec, gubun: it.gubun, qty }] : []; });
  }, [psel, pActive]);
  const togglePick = (i: Item) => setPsel(m => {
    const n = new Map(m);
    const k = pKey(i);
    if (n.has(k)) n.delete(k); else n.set(k, Number(no.qty) > 0 ? Number(no.qty) : 0);
    return n;
  });
  function applyOne() {
    const p = pPicks[0];
    if (!p) return;
    setNo({ ...no, item_code: p.code || "", name: p.name, spec: p.spec || "", gubun: mapItemGubun(p.gubun), qty: p.qty > 0 ? p.qty : no.qty });
    setPsel(new Map()); setPickerOpen(false);
  }
  async function addMany() {
    const missing = pPicks.filter(p => !(p.qty > 0));
    if (missing.length) { toast.error(`수량을 입력하세요: ${missing.slice(0, 3).map(p => p.name).join(", ")}${missing.length > 3 ? " 외" : ""}`); return; }
    setBusy(true);
    try {
      const rows = buildManualOrders({ ...no, ym: no.order_date.slice(0, 7) }, pPicks, () => (crypto as any).randomUUID?.() || String(Date.now() + Math.random()));
      await appendOrders(rows);
      await logAudit("주문 직접추가(일괄)", "order", "", { count: rows.length, names: rows.map(r => r.name).slice(0, 5) });
      toast.success(`주문 ${rows.length}건 추가됨 (수동입력)`);
      setPsel(new Map()); setPickerOpen(false); setNo(blankOrder()); onChange();
    } catch (e: any) { toast.error("추가 실패: " + errMsg(e)); }
    setBusy(false);
  }
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false);
  const [plans, setPlans] = useState<Record<string, PlanEntry>>({});
  const [cocs, setCocs] = useState<Record<string, CocData>>({});
  const [viewYm, setViewYm] = usePersistState<string>("orders.viewYm", "");
  const [showChanged, setShowChanged] = useState(false);
  const [q, setQ] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Order>>({});

  useEffect(() => { listPlans().then(setPlans); listCocs().then(setCocs); }, [orders]);

  const existingKeys = useMemo(() => new Set(orders.map(dupKey)), [orders]);
  const months = useMemo(() => [...new Set(orders.map(o => o.ym))].sort(), [orders]);
  const byMonth = useMemo(() => {
    const m: Record<string, number> = {}; orders.forEach(o => { m[o.ym] = (m[o.ym] || 0) + 1; });
    return Object.entries(m).sort((a, b) => a[0] < b[0] ? 1 : -1);
  }, [orders]);
  const [colY2, setColY2] = useState<Set<string>>(new Set());
  const toggleY2 = (y: string) => setColY2(s => { const n = new Set(s); n.has(y) ? n.delete(y) : n.add(y); return n; });
  const byYear2 = useMemo(() => {
    const g: Record<string, { months: [string, number][]; total: number }> = {};
    byMonth.forEach(([ym, n]) => { const y = ym.slice(0, 4); const e = g[y] || (g[y] = { months: [], total: 0 }); e.months.push([ym, n]); e.total += n; });
    return Object.entries(g).sort((a, b) => a[0] < b[0] ? 1 : -1);
  }, [byMonth]);
  const curView = (months.includes(viewYm) ? viewYm : "") || months[months.length - 1] || "";
  const viewRows = useMemo(() => orders.filter(o => o.ym === curView).sort((a, b) => a.order_date < b.order_date ? -1 : 1), [orders, curView]);
  const pqOf = (o: Order) => (plans[o.id]?.qty != null ? Number(plans[o.id]!.qty) : (Number(o.qty) || 0));
  const isChanged = (o: Order) => plans[o.id]?.qty != null && Number(plans[o.id]!.qty) !== (Number(o.qty) || 0);
  const displayRows = useMemo(() => {
    let r = showChanged ? viewRows.filter(isChanged) : viewRows;
    const s = q.trim().toLowerCase();
    if (s) r = r.filter(o => `${o.name} ${o.spec} ${o.customer} ${o.note || ""}`.toLowerCase().includes(s));
    return r;
  }, [viewRows, showChanged, plans, q]);
  const sumSu = viewRows.reduce((s2, o) => s2 + (Number(o.qty) || 0), 0);
  const sumSa = viewRows.reduce((s2, o) => s2 + pqOf(o), 0);
  const changedCnt = viewRows.filter(isChanged).length;

  const marked = useMemo(() => {
    const seen = new Set(existingKeys);
    return preview.map(o => { const k = dupKey(o); const dup = seen.has(k); seen.add(k); return { o, dup }; });
  }, [preview, existingKeys]);
  const newCount = marked.filter(m => !m.dup).length;
  const dupCount = marked.filter(m => m.dup).length;
  // 이카운트엔 없는데 DB엔 있는 주문(검토용): 가져온 달 범위 내에서
  const orphans = useMemo(() => {
    if (!preview.length) return [];
    const pmonths = new Set(preview.map(o => o.ym));
    const pkeys = new Set(preview.map(dupKey));
    return orders.filter(o => pmonths.has(o.ym) && !pkeys.has(dupKey(o)));
  }, [preview, orders]);

  function doPreview(list: Order[]) {
    setPreview(list);
    const ms = [...new Set(list.map(o => o.ym))].sort();
    if (!list.length) toast.error("인식된 주문이 없습니다. 컬럼/형식을 확인하세요.");
    else toast.success(`인식: ${list.length}건 (${ms.join(", ")})`);
  }
  function onPaste() { doPreview(parsePaste(pasteText)); }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      doPreview(parseRows(XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true })));
    } catch (er: any) { toast.error("엑셀 읽기 실패: " + errMsg(er)); }
    e.target.value = "";
  }

  async function syncNew() {
    const toAdd = marked.filter(m => !m.dup).map(m => m.o);
    if (!toAdd.length) { toast.error("추가할 신규 주문이 없습니다 (모두 중복)."); return; }
    setBusy(true);
    try {
      await appendOrders(toAdd);
      await logAudit("주문 동기화", "order", "", { added: toAdd.length, months: [...new Set(toAdd.map(o => o.ym))] });
      toast.success(`신규 ${toAdd.length}건 추가 완료 (중복 ${dupCount}건은 유지)`);
      setPreview([]); setPasteText(""); onChange();
    } catch (e: any) { toast.error("저장 실패: " + errMsg(e)); }
    setBusy(false);
  }
  async function loadSample() {
    setBusy(true);
    try {
      const ms = [...new Set(sampleOrders.map(o => o.ym))];
      for (const m of ms) await replaceMonth(m, sampleOrders.filter(o => o.ym === m));
      toast.success("데모 데이터(2026 1~6월) 불러오기 완료"); onChange();
    } catch (e: any) { toast.error("실패: " + errMsg(e)); }
    setBusy(false);
  }

  // ---- 다중 선택 → 일괄 작업 (구분/거래처 일괄 변경, 일괄 삭제) ----
  const [sel, setSel] = useState<Set<string>>(new Set());
  const selRows = displayRows.filter(o => sel.has(o.id));
  async function bulkPatch(patch: Partial<Order>, label: string) {
    if (!selRows.length) return;
    if (!(await confirmDialog({ title: "일괄 변경", message: `선택한 ${selRows.length}건의 ${label}을(를) 일괄 변경합니다.
계속할까요?`, confirmLabel: "변경" }))) return;
    setBusy(true);
    try {
      for (const o of selRows) await updateOrder(o.id, patch);
      await logAudit("주문 일괄 변경", "order", "", { count: selRows.length, ...patch });
      toast.success(`${selRows.length}건 일괄 변경 완료`);
      setSel(new Set()); onChange();
    } catch (e: any) { toast.error("일괄 변경 실패: " + errMsg(e)); }
    setBusy(false);
  }
  async function bulkDelete() {
    if (!canDelete) { toast.error("삭제 권한이 없습니다."); return; }
    if (!selRows.length) return;
    if (!(await confirmDialog({ title: "일괄 삭제", message: `선택한 ${selRows.length}건을 휴지통으로 이동합니다.
관리자 페이지 휴지통에서 복구할 수 있습니다.`, danger: true, confirmLabel: `${selRows.length}건 삭제` }))) return;
    setBusy(true);
    try {
      for (const o of selRows) await deleteOrder(o.id);
      await logAudit("주문 일괄 삭제", "order", "", { count: selRows.length });
      toast.success(`${selRows.length}건 휴지통으로 이동됨`);
      setSel(new Set()); onChange();
    } catch (e: any) { toast.error("일괄 삭제 실패: " + errMsg(e)); }
    setBusy(false);
  }
  const [bulkGubun, setBulkGubun] = useState("제품");
  const [bulkCust, setBulkCust] = useState("");

  function startEdit(o: Order) { setEditId(o.id); setDraft({ name: o.name, spec: o.spec, qty: o.qty, customer: o.customer, note: o.note, gubun: o.gubun }); }
  async function saveEdit(id: string) {
    setBusy(true);
    try {
      const patch = { ...draft, qty: Number(draft.qty) || 0 };
      await updateOrder(id, patch);
      await logAudit("주문 수정", "order", id, patch);
      toast.success("수정 저장됨 (생산계획·COC 연결 유지)"); setEditId(null); onChange();
    } catch (e: any) { toast.error("수정 실패: " + errMsg(e)); }
    setBusy(false);
  }
  async function removeOrder(o: Order) {
    if (!canDelete) { toast.error("삭제 권한이 없습니다."); return; }
    const linked = [plans[o.id] && "생산계획", cocs[o.id] && "COC"].filter(Boolean).join("·");
    const ok = await confirmDialog({
      title: "주문 삭제",
      message: `${o.order_date} · ${o.name} · ${o.qty.toLocaleString()}g (${o.customer})\n휴지통으로 이동합니다${linked ? ` (연결된 ${linked}는 복구 시 함께 돌아옵니다)` : ""}.\n관리자 페이지 휴지통에서 복구/영구삭제할 수 있습니다.`,
      danger: true, confirmLabel: "삭제",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteOrder(o.id);
      await logAudit("주문 삭제", "order", o.id, { name: o.name, qty: o.qty, date: o.order_date });
      toast.success("휴지통으로 이동됨 (관리자 페이지에서 복구 가능)"); onChange();
    } catch (e: any) { toast.error("삭제 실패: " + errMsg(e)); }
    setBusy(false);
  }

  const cell: React.CSSProperties = { border: "1px solid #eee", padding: "4px 6px" };
  const inp: React.CSSProperties = { width: "100%", fontSize: 12, padding: 2, border: "1px solid #ccd" };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>주문 가져오기</h3>
          <div style={{ background: "var(--tint2)", border: "1px solid var(--tint2)", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12, lineHeight: 1.6 }}>
            <b style={{ color: "var(--accent)" }}>이카운트에서 가져오는 방법</b><br />
            <b>가장 빠름(추천):</b> 이카운트 <b>[판매 &gt; 주문서현황]</b> 조회 → 브라우저 즐겨찾기의 <b>「ORO 주문복사」</b> 클릭(표 자동 복사) → 아래 붙여넣기 칸에 <b>Ctrl+V</b> → <b>붙여넣기 인식</b> → <b>신규만 추가</b>.<br />
            <span className="muted">「ORO 주문복사」 즐겨찾기가 없으면 설치용 파일(ORO_ecount_order_copy.html)로 한 번만 설치하세요. 없어도 아래 ①②로 가능합니다.</span>
          </div>
          <p className="muted">① 이카운트 [주문서현황] → Excel(화면) 파일 업로드</p>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} disabled={busy} />
          <p className="muted" style={{ marginTop: 14 }}>② 또는 주문서현황 표 복사 후 붙여넣기</p>
          <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder="여기에 붙여넣기..."
            style={{ width: "100%", height: 96, fontSize: 12, padding: 8 }} />
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={onPaste} disabled={busy}>붙여넣기 인식</button>
            <button className="btn ghost" onClick={loadSample} disabled={busy}>데모 데이터</button>
          </div>

          {preview.length > 0 &&
            <div style={{ marginTop: 12, padding: 10, background: "var(--tint)", borderRadius: 8 }}>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                <b style={{ color: "var(--ok)" }}>신규 {newCount}건</b> · <b style={{ color: "#888" }}>중복(유지) {dupCount}건</b>
              </div>
              <div style={{ overflow: "auto", maxHeight: 240, border: "1px solid var(--line)", borderRadius: 8, background: "#fff", marginBottom: 8 }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
                  <thead><tr>{["상태", "주문일", "구분", "품목명", "규격", "수량", "거래처"].map(h =>
                    <th key={h} style={{ ...cell, background: "#f1f3f7", color: "#374151", position: "sticky", top: 0, textAlign: "left" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {marked.slice(0, 30).map(({ o, dup }, i) => (
                      <tr key={i} style={dup ? { opacity: .5 } : undefined}>
                        <td style={cell}><span style={{ fontSize: 11, fontWeight: 700, borderRadius: 4, padding: "1px 6px", color: "#fff", background: dup ? "#9aa3af" : "var(--ok)" }}>{dup ? "중복" : "신규"}</span></td>
                        <td style={cell}>{o.order_date}</td><td style={cell}>{o.gubun}</td>
                        <td style={{ ...cell, fontWeight: 700 }}>{o.name}</td><td style={cell}>{o.spec}</td>
                        <td style={{ ...cell, textAlign: "right" }}>{o.qty.toLocaleString()}</td><td style={cell}>{o.customer}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {marked.length > 30 && <div className="muted" style={{ padding: "6px 8px", fontSize: 11 }}>… 외 {marked.length - 30}건</div>}
              </div>
              <button className="btn green" onClick={syncNew} disabled={busy || !canImport}>동기화 — 신규 {newCount}건 추가</button>
              <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                동기화는 신규만 추가하고 기존 주문·생산계획·COC는 그대로 둡니다. (전체 교체 없음)
              </p>
              {orphans.length > 0 &&
                <div style={{ marginTop: 8, padding: 8, background: "#fff7e6", borderRadius: 6 }}>
                  <div style={{ fontSize: 12, color: "#9a6700" }}>⚠ 이카운트엔 없는데 DB에 남아있는 주문 {orphans.length}건 (취소/변경분일 수 있음)</div>
                  <div style={{ maxHeight: 120, overflow: "auto", marginTop: 4 }}>
                    {orphans.map(o => (
                      <div key={o.id} style={{ fontSize: 11, display: "flex", justifyContent: "space-between", gap: 8, padding: "2px 0" }}>
                        <span>{o.order_date.slice(5)} {o.name} {o.qty}g {o.customer}</span>
                        {canDelete && <button className="btn ghost" style={{ padding: "1px 8px", fontSize: 11 }} onClick={() => removeOrder(o)}>삭제</button>}
                      </div>
                    ))}
                  </div>
                </div>}
            </div>}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>저장된 주문 (월별)</h3>
          {byMonth.length === 0 ? <p className="muted">아직 없음.</p> :
            <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}>
              <thead><tr><th style={{ textAlign: "left", padding: 4, borderBottom: "1px solid var(--line)" }}>연/월</th><th style={{ padding: 4, borderBottom: "1px solid var(--line)" }}>건수</th></tr></thead>
              <tbody>
                {byYear2.map(([y, yv]) => {
                  const collapsed = colY2.has(y);
                  return (
                    <React.Fragment key={y}>
                      <tr style={{ cursor: "pointer", background: "var(--tint)", fontWeight: 700 }} onClick={() => toggleY2(y)}>
                        <td style={{ padding: "5px 4px" }}>{collapsed ? "▶" : "▼"} {y}년</td>
                        <td style={{ padding: "5px 4px", textAlign: "center" }}>{yv.total}</td>
                      </tr>
                      {!collapsed && yv.months.map(([ym, n]) => (
                        <tr key={ym}><td style={{ padding: "3px 4px 3px 22px" }}>{ym.slice(5)}월</td><td style={{ padding: "3px 4px", textAlign: "center" }}>{n}</td></tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>}
          {!canDelete && <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>※ 삭제 권한이 없습니다.</p>}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>➕ 주문 직접 추가 <span className="muted" style={{ fontSize: 12 }}>(긴급·이카운트 외)</span></h3>
          {canImport ? <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><label style={{ fontSize: 12, fontWeight: 700 }}>주문일자</label><input type="date" value={no.order_date} onChange={e => setNo({ ...no, order_date: e.target.value })} style={{ width: "100%", padding: 7, border: "1px solid var(--line)", borderRadius: 6, marginBottom: 8 }} /></div>
              <div><label style={{ fontSize: 12, fontWeight: 700 }}>구분</label><select value={no.gubun} onChange={e => setNo({ ...no, gubun: e.target.value })} style={{ width: "100%", padding: 7, border: "1px solid var(--line)", borderRadius: 6, marginBottom: 8 }}><option>제품</option><option>무형상품</option><option>원재료</option></select></div>
            </div>
            <label style={{ fontSize: 12, fontWeight: 700 }}>품목명 <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>— 누르면 품목 선택창이 열립니다 (복수 선택 가능)</span></label>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input value={no.name} onChange={e => setNo({ ...no, name: e.target.value })}
                onMouseDown={e => { if (!no.name.trim()) { e.preventDefault(); setPickerOpen(true); } }}
                placeholder="예: ACC2532-G20A (클릭하여 선택)" style={{ flex: 1, padding: 7, border: "1px solid var(--line)", borderRadius: 6 }} />
              <button className="btn ghost" style={{ padding: "4px 10px", whiteSpace: "nowrap" }} onClick={() => setPickerOpen(true)}>📦 선택{psel.size > 0 ? ` (${psel.size})` : ""}</button>
            </div>
            <label style={{ fontSize: 12, fontWeight: 700 }}>규격</label><input value={no.spec} onChange={e => setNo({ ...no, spec: e.target.value })} placeholder="예: 25-32um : Ni+Au(0.2um)" style={{ width: "100%", padding: 7, border: "1px solid var(--line)", borderRadius: 6, marginBottom: 8 }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><label style={{ fontSize: 12, fontWeight: 700 }}>수량(g)</label><input type="number" inputMode="numeric" value={no.qty || ""} onChange={e => setNo({ ...no, qty: Number(e.target.value) })} placeholder="1000" style={{ width: "100%", padding: 7, border: "1px solid var(--line)", borderRadius: 6, marginBottom: 8 }} /></div>
              <div><label style={{ fontSize: 12, fontWeight: 700 }}>거래처</label><input value={no.customer} onChange={e => setNo({ ...no, customer: e.target.value })} placeholder="주식회사 ..." style={{ width: "100%", padding: 7, border: "1px solid var(--line)", borderRadius: 6, marginBottom: 8 }} /></div>
            </div>
            <label style={{ fontSize: 12, fontWeight: 700 }}>적요(비고)</label><input value={no.note} onChange={e => setNo({ ...no, note: e.target.value })} placeholder="긴급/메모" style={{ width: "100%", padding: 7, border: "1px solid var(--line)", borderRadius: 6, marginBottom: 10 }} />
            <button className="btn green" style={{ width: "100%" }} disabled={busy} onClick={addManual}>이 주문 추가</button>
            <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>추가한 주문은 목록에 ✋수동 으로 표시됩니다. 생산계획·COC에서 동일하게 사용됩니다.</p>
          </> : <p className="muted">주문 추가 권한이 없습니다.</p>}

          {pickerOpen && (
            <div onClick={() => setPickerOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
              <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
                style={{ background: "#fff", borderRadius: 10, padding: "16px 18px", width: "100%", maxWidth: 680, maxHeight: "84vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 30px rgba(0,0,0,.3)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <b style={{ fontSize: 14 }}>📦 품목 선택</b>
                  <span className="muted" style={{ fontSize: 12 }}>1개 선택 → 폼에 적용 · 여러 개 선택 → 수량 입력 후 한 번에 추가</span>
                  <button className="btn ghost" style={{ marginLeft: "auto", padding: "2px 10px", fontSize: 12 }} onClick={() => setPickerOpen(false)}>✕ 닫기</button>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                  <input autoFocus placeholder="🔍 코드/품목명/규격 검색" value={pq} onChange={e => setPq(e.target.value)}
                    style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6, minWidth: 200 }} />
                  {pGubuns.length > 1 && (
                    <div className="seg">
                      <button className={pg === "" ? "on" : ""} onClick={() => setPg("")}>전체</button>
                      {pGubuns.map(g => <button key={g} className={pg === g ? "on" : ""} onClick={() => setPg(g)}>{g}</button>)}
                    </div>
                  )}
                </div>
                <div style={{ overflow: "auto", flex: 1, border: "1px solid var(--line)", borderRadius: 8 }}>
                  {pitems === null ? <p className="muted" style={{ padding: 12 }}>품목 불러오는 중…</p> :
                    pList.length === 0 ? <p className="muted" style={{ padding: 12 }}>검색 결과가 없습니다.</p> : (
                      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
                        <thead><tr>
                          <th style={{ background: "#f1f3f7", padding: "6px 8px", position: "sticky", top: 0 }}>
                            <input type="checkbox" checked={pList.length > 0 && pList.every(i => psel.has(pKey(i)))}
                              onChange={e => setPsel(m => { const n = new Map(m); pList.forEach(i => { if (e.target.checked) { if (!n.has(pKey(i))) n.set(pKey(i), Number(no.qty) > 0 ? Number(no.qty) : 0); } else n.delete(pKey(i)); }); return n; })} />
                          </th>
                          <th style={{ background: "#f1f3f7", padding: "6px 8px", textAlign: "left", position: "sticky", top: 0 }}>코드</th>
                          <th style={{ background: "#f1f3f7", padding: "6px 8px", textAlign: "left", position: "sticky", top: 0 }}>품목명</th>
                          <th style={{ background: "#f1f3f7", padding: "6px 8px", textAlign: "left", position: "sticky", top: 0 }}>규격</th>
                          <th style={{ background: "#f1f3f7", padding: "6px 8px", position: "sticky", top: 0 }}>구분</th>
                          <th style={{ background: "#f1f3f7", padding: "6px 8px", textAlign: "right", position: "sticky", top: 0 }}>수량(g)</th>
                        </tr></thead>
                        <tbody>
                          {pList.map(i => {
                            const k = pKey(i), on = psel.has(k);
                            const td: React.CSSProperties = { padding: "5px 8px", borderBottom: "1px solid #eef2f7" };
                            return (
                              <tr key={k} onClick={() => togglePick(i)} style={{ cursor: "pointer", background: on ? "var(--tint2)" : undefined }}>
                                <td style={{ ...td, textAlign: "center" }}><input type="checkbox" checked={on} onChange={() => togglePick(i)} onClick={e => e.stopPropagation()} /></td>
                                <td style={{ ...td, fontWeight: 700 }}>{i.code || "-"}</td>
                                <td style={td}>{i.name}</td>
                                <td style={{ ...td, fontSize: 11.5 }}>{i.spec}</td>
                                <td style={{ ...td, textAlign: "center", fontSize: 11.5 }}>{i.gubun}</td>
                                <td style={{ ...td, textAlign: "right" }} onClick={e => e.stopPropagation()}>
                                  {on && <input type="number" inputMode="numeric" value={psel.get(k) || ""} placeholder="수량"
                                    onChange={e => setPsel(m => { const n = new Map(m); n.set(k, Number(e.target.value)); return n; })}
                                    style={{ width: 80, padding: 4, border: "1px solid var(--line)", borderRadius: 5, textAlign: "right" }} />}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                </div>
                {pq.trim() && !pActive.some(i => i.name === pq.trim()) && (
                  <button className="btn ghost" style={{ marginTop: 8, fontSize: 12, alignSelf: "flex-start" }}
                    onClick={() => { setNo({ ...no, name: pq.trim() }); setPickerOpen(false); }}>
                    ✏️ 「{pq.trim()}」 직접 입력으로 사용 (품목 마스터에 없음)
                  </button>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                  <span className="muted" style={{ fontSize: 12.5 }}>선택 <b>{psel.size}</b>건{psel.size > 1 ? " — 주문일자·거래처·적요는 폼의 값이 공통 적용됩니다" : ""}</span>
                  <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    {psel.size === 1 && <button className="btn green" onClick={applyOne}>폼에 적용</button>}
                    {psel.size > 1 && <button className="btn green" disabled={busy} onClick={addMany}>➕ {psel.size}건 주문 추가</button>}
                    {psel.size > 0 && <button className="btn ghost" onClick={() => setPsel(new Map())}>선택 해제</button>}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>저장된 주문 데이터</h3>
          {months.length > 0 &&
            <MonthPicker months={months} value={curView} onChange={setViewYm} />}
          <input placeholder="🔍 품목/거래처 검색" value={q} onChange={e => setQ(e.target.value)} style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6, minWidth: 150 }} />
          <span className="muted">{displayRows.length}건 · 생산완료일=생산계획 마지막날 · COC=발행여부</span>
          <label style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, marginLeft: "auto" }}><input type="checkbox" checked={showChanged} onChange={e => setShowChanged(e.target.checked)} /> 변동만 보기</label>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <span style={{ background: "var(--tint)", color: "#374151", padding: "4px 10px", borderRadius: 6, fontSize: 12 }}>수주 합계 <b>{sumSu.toLocaleString()}</b>g</span>
          <span style={{ background: "var(--tint2)", color: "var(--accent)", padding: "4px 10px", borderRadius: 6, fontSize: 12 }}>생산 합계 <b>{sumSa.toLocaleString()}</b>g</span>
          <span style={{ background: sumSa - sumSu === 0 ? "#f1f3f7" : sumSa - sumSu > 0 ? "#e8f6ee" : "#fdeaea", color: sumSa - sumSu > 0 ? "var(--ok)" : sumSa - sumSu < 0 ? "#c0392b" : "var(--muted)", padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>차이 {sumSa - sumSu > 0 ? "+" : ""}{(sumSa - sumSu).toLocaleString()}g</span>
          <span style={{ background: "#fff7e6", color: "#9a6700", padding: "4px 10px", borderRadius: 6, fontSize: 12 }}>변동 {changedCnt}건</span>
        </div>
        {canEdit && sel.size > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10, background: "#eef7f2", border: "1px solid var(--accent)", borderRadius: 8, padding: "6px 10px", fontSize: 12.5 }}>
            <b>선택 {sel.size}건</b>
            <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              구분→
              <select value={bulkGubun} onChange={e => setBulkGubun(e.target.value)} style={{ padding: 5, border: "1px solid var(--line)", borderRadius: 5 }}>
                <option>제품</option><option>무형상품</option><option>원재료</option>
              </select>
              <button className="btn ghost" style={{ padding: "3px 9px", fontSize: 12 }} disabled={busy} onClick={() => bulkPatch({ gubun: bulkGubun }, `구분(${bulkGubun})`)}>일괄 변경</button>
            </span>
            <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              거래처→
              <input value={bulkCust} onChange={e => setBulkCust(e.target.value)} placeholder="새 거래처명" style={{ padding: 5, border: "1px solid var(--line)", borderRadius: 5, width: 130 }} />
              <button className="btn ghost" style={{ padding: "3px 9px", fontSize: 12 }} disabled={busy || !bulkCust.trim()} onClick={() => bulkPatch({ customer: bulkCust.trim() }, `거래처(${bulkCust.trim()})`)}>일괄 변경</button>
            </span>
            {canDelete && <button className="btn danger" style={{ padding: "3px 10px", fontSize: 12 }} disabled={busy} onClick={bulkDelete}>🗑 일괄 삭제</button>}
            <button className="btn ghost" style={{ padding: "3px 9px", fontSize: 12, marginLeft: "auto" }} onClick={() => setSel(new Set())}>선택 해제</button>
          </div>
        )}
        {displayRows.length === 0 ? <p className="muted">표시할 데이터가 없습니다.</p> :
          isMobile ? (
          <div>
            {displayRows.map(o => {
              const cp = completionDate(plans[o.id]); const done = !!plans[o.id]?.done; const hasCoc = !!cocs[o.id];
              return (
                <div className="mcard" key={o.id}>
                  <div className="mrow"><span className="k">{o.order_date}</span><span className="v">{o.qty.toLocaleString()}g</span></div>
                  <div className="mrow"><span className="k">품목</span><span className="v">{o.order_no && o.order_no.includes("수동") ? "✋ " : ""}{o.name}</span></div>
                  <div className="mrow"><span className="k">규격</span><span className="v" style={{ fontWeight: 400 }}>{o.spec}</span></div>
                  <div className="mrow"><span className="k">거래처</span><span className="v" style={{ fontWeight: 400 }}>{o.customer}</span></div>
                  <div className="mrow"><span className="k">수주 / 생산 / 차이</span><span className="v" style={{ fontWeight: 400 }}>{o.qty.toLocaleString()} / <b style={{ color: "var(--accent)" }}>{pqOf(o).toLocaleString()}</b> / {(() => { const d = pqOf(o) - (Number(o.qty) || 0); return <span style={{ color: d > 0 ? "var(--ok)" : d < 0 ? "#c0392b" : "#888", fontWeight: 700 }}>{d !== 0 ? (d > 0 ? "+" : "") + d.toLocaleString() : "-"}</span>; })()}g</span></div>
                  <div className="mrow"><span className="k">완료일 / 상태 / COC</span><span className="v" style={{ fontWeight: 400 }}>{cp || "-"} · {done ? "완료" : (cp ? "진행중" : "미계획")} · {hasCoc ? "발행" : "-"}</span></div>
                  {canDelete && <button className="btn danger" style={{ marginTop: 8, width: "100%" }} onClick={() => removeOrder(o)}>삭제</button>}
                </div>
              );
            })}
            <p className="muted" style={{ fontSize: 11 }}>※ 주문 내용 수정은 PC 화면에서 가능합니다.</p>
          </div>
          ) : (
          <div style={{ overflow: "auto", maxHeight: "62vh" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
              <thead><tr>
                {canEdit && <th style={{ ...cell, background: "#f1f3f7", position: "sticky", top: 0, width: 30 }}>
                  <input type="checkbox" title="전체 선택" checked={displayRows.length > 0 && sel.size === displayRows.length}
                    onChange={e => setSel(e.target.checked ? new Set(displayRows.map(r => r.id)) : new Set())} />
                </th>}
                {["주문일", "구분", "품목명", "규격", "수주(g)", "생산(g)", "차이", "거래처", "생산완료일", "상태", "COC", "적요", "관리"].map(h =>
                <th key={h} style={{ ...cell, background: "#f1f3f7", color: "#374151", position: "sticky", top: 0 }}>{h}</th>)}</tr></thead>
              <tbody>
                {displayRows.map(o => {
                  const cp = completionDate(plans[o.id]); const done = !!plans[o.id]?.done; const hasCoc = !!cocs[o.id];
                  const editing = editId === o.id;
                  const pv = pqOf(o), diff = pv - (Number(o.qty) || 0);
                  return (
                    <tr key={o.id} style={sel.has(o.id) ? { background: "#f2faf6" } : undefined}>
                      {canEdit && <td style={{ ...cell, textAlign: "center" }}>
                        <input type="checkbox" checked={sel.has(o.id)}
                          onChange={e => setSel(v => { const n = new Set(v); e.target.checked ? n.add(o.id) : n.delete(o.id); return n; })} />
                      </td>}
                      <td style={cell}>{o.order_date}</td>
                      <td style={cell}>{editing ? <input style={inp} value={draft.gubun ?? ""} onChange={e => setDraft(d => ({ ...d, gubun: e.target.value }))} /> : o.gubun}</td>
                      <td style={{ ...cell, fontWeight: 700 }}>{editing ? <input style={inp} value={draft.name ?? ""} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} /> : o.name}</td>
                      <td style={cell}>{editing ? <input style={inp} value={draft.spec ?? ""} onChange={e => setDraft(d => ({ ...d, spec: e.target.value }))} /> : o.spec}</td>
                      <td style={{ ...cell, textAlign: "right" }}>{editing ? <input style={{ ...inp, textAlign: "right" }} type="number" value={draft.qty ?? 0} onChange={e => setDraft(d => ({ ...d, qty: Number(e.target.value) }))} /> : o.qty.toLocaleString()}</td>
                      <td style={{ ...cell, textAlign: "right", color: "var(--accent)", fontWeight: 700 }}>{pv.toLocaleString()}</td>
                      <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: diff > 0 ? "var(--ok)" : diff < 0 ? "#c0392b" : "#bbb" }}>{diff !== 0 ? (diff > 0 ? "+" : "") + diff.toLocaleString() : "-"}</td>
                      <td style={cell}>{editing ? <input style={inp} value={draft.customer ?? ""} onChange={e => setDraft(d => ({ ...d, customer: e.target.value }))} /> : o.customer}</td>
                      <td style={{ ...cell, textAlign: "center", color: cp ? "#1f4e78" : "#bbb", fontWeight: cp ? 700 : 400 }}>{cp || "-"}</td>
                      <td style={{ ...cell, textAlign: "center", color: done ? "var(--ok)" : (cp ? "#2f6cb0" : "#bbb"), fontWeight: done ? 700 : 400 }}>{done ? "완료" : (cp ? "진행중" : "미계획")}</td>
                      <td style={{ ...cell, textAlign: "center", color: hasCoc ? "var(--ok)" : "#bbb" }}>{hasCoc ? "발행" : "-"}</td>
                      <td style={cell}>{editing ? <input style={inp} value={draft.note ?? ""} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} /> : o.note}</td>
                      <td style={{ ...cell, whiteSpace: "nowrap" }}>
                        {editing ? (
                          <>
                            <button className="btn green" style={{ padding: "2px 8px", fontSize: 11 }} disabled={busy} onClick={() => saveEdit(o.id)}>저장</button>{" "}
                            <button className="btn ghost" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => setEditId(null)}>취소</button>
                          </>
                        ) : (
                          <>
                            {canEdit && <button className="btn ghost" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => startEdit(o)}>수정</button>}{" "}
                            {canDelete && <button className="btn danger" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => removeOrder(o)}>삭제</button>}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
      </div>
    </div>
  );
}
