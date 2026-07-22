// 품목 — 품목 마스터 등록/관리 (이카운트 품목등록 대응).
// ① 목록: 검색·구분 필터 + 인라인 수정  ② 미등록 후보 자동 수집 → 체크 선택 → 일괄 등록
// ③ 이카운트 [품목등록 리스트] 붙여넣기 가져오기  ④ 수동 등록
import { useEffect, useMemo, useState } from "react";
import { Item, InoutRow, BomRow, listItems, upsertItems, updateItem, deleteItem, listOrders, listInout, listBomRows, logAudit } from "../lib/db";
import { Order } from "../lib/types";
import { collectItemCandidates, parseItemsText } from "../lib/items";
import { thBase, tdBase } from "../lib/styles";
import { toast } from "../lib/toast";
import { errMsg } from "../lib/errmsg";
import { can } from "../lib/perm";
import { confirmDialog } from "../lib/confirm";

const GUBUNS = ["제품", "반제품", "원재료", "부재료", "상품", "무형상품"];

export default function Items() {
  const canEdit = can("item.edit");
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<"list" | "collect" | "import">("list");
  const [q, setQ] = useState("");
  const [gubunF, setGubunF] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => listItems().then(setItems).catch(e => toast.error("불러오기 실패: " + errMsg(e))).finally(() => setLoaded(true));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let arr = items;
    if (gubunF) arr = arr.filter(it => it.gubun === gubunF);
    const s = q.trim().toLowerCase();
    if (s) arr = arr.filter(it => `${it.code} ${it.name} ${it.spec}`.toLowerCase().includes(s));
    return arr;
  }, [items, q, gubunF]);

  // ---- 인라인 수정 (즉시 저장) ----
  function patch(it: Item, p: Partial<Item>) {
    setItems(list => list.map(x => x.id === it.id ? { ...x, ...p } : x));
    updateItem(it.id!, p).then(() => logAudit("품목 수정", "item", it.code || it.name, p))
      .catch(e => { toast.error("저장 실패: " + errMsg(e)); load(); });
  }
  async function del(it: Item) {
    if (!(await confirmDialog({ title: "품목 삭제", message: `[${it.code || "-"}] ${it.name} 품목을 삭제할까요?\n(주문·BOM 등 기존 데이터는 그대로 남습니다)`, danger: true, confirmLabel: "삭제" }))) return;
    try { await deleteItem(it.id!); logAudit("품목 삭제", "item", it.code || it.name, {}); load(); }
    catch (e: any) { toast.error("삭제 실패: " + errMsg(e)); }
  }

  // ---- 수동 등록 ----
  const [nf, setNf] = useState({ code: "", name: "", spec: "", gubun: "제품", unit: "g" });
  async function addManual() {
    if (!nf.name.trim()) { toast.error("품목명을 입력하세요."); return; }
    setBusy(true);
    try {
      await upsertItems([{ code: nf.code.trim(), name: nf.name.trim(), spec: nf.spec.trim(), gubun: nf.gubun, unit: nf.unit.trim() || "g", active: true }]);
      logAudit("품목 등록", "item", nf.code || nf.name, {});
      toast.success(`등록됨: ${nf.name}`);
      setNf({ code: "", name: "", spec: "", gubun: "제품", unit: "g" }); load();
    } catch (e: any) { toast.error("등록 실패: " + errMsg(e)); }
    setBusy(false);
  }

  // ---- 미등록 후보 수집 ----
  const [cands, setCands] = useState<Item[]>([]);
  const [collecting, setCollecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set()); // key = code|name
  const ck = (it: Item) => `${it.code}|${it.name}`;
  async function collect() {
    setCollecting(true);
    try {
      const [orders, pin, out, pur, bom] = await Promise.all([
        listOrders(), listInout("in"), listInout("out"), listInout("purchase"), listBomRows(),
      ]) as [Order[], InoutRow[], InoutRow[], InoutRow[], BomRow[]];
      const c = collectItemCandidates(orders, pin, out, pur, bom, items);
      setCands(c); setSel(new Set(c.map(ck)));  // 기본 전체 선택
      if (!c.length) toast.info("미등록 품목이 없습니다 — 모든 품목이 이미 등록되어 있습니다.");
    } catch (e: any) { toast.error("수집 실패: " + errMsg(e)); }
    setCollecting(false);
  }
  async function registerSelected() {
    const rows = cands.filter(c => sel.has(ck(c)));
    if (!rows.length) { toast.error("선택된 후보가 없습니다."); return; }
    setBusy(true);
    try {
      await upsertItems(rows);
      logAudit("품목 일괄 등록(자동 수집)", "item", "", { count: rows.length });
      toast.success(`${rows.length}건 일괄 등록 완료`);
      setCands(cs => cs.filter(c => !sel.has(ck(c)))); setSel(new Set()); load();
    } catch (e: any) { toast.error("일괄 등록 실패: " + errMsg(e)); }
    setBusy(false);
  }

  // ---- 이카운트 붙여넣기 가져오기 ----
  const [text, setText] = useState("");
  async function importText() {
    const rows = parseItemsText(text);
    if (!rows.length) { toast.error("인식된 품목이 없습니다. 머리글(품목코드·품목명 포함)까지 복사했는지 확인하세요."); return; }
    if (!(await confirmDialog({ title: "품목 가져오기", message: `인식: ${rows.length}건 — 같은 코드는 덮어쓰고 새 품목은 추가합니다.\n계속할까요?`, confirmLabel: "가져오기" }))) return;
    setBusy(true);
    try {
      await upsertItems(rows);
      logAudit("품목 가져오기", "item", "", { count: rows.length });
      toast.success(`품목 ${rows.length}건 가져오기 완료`);
      setText(""); setView("list"); load();
    } catch (e: any) { toast.error("가져오기 실패: " + errMsg(e)); }
    setBusy(false);
  }

  const th: React.CSSProperties = thBase;
  const td: React.CSSProperties = tdBase;
  const tdL: React.CSSProperties = { ...td, textAlign: "left" };
  const inp: React.CSSProperties = { padding: 5, border: "1px solid var(--line)", borderRadius: 5, width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div className="seg">
          <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>품목 목록</button>
          <button className={view === "collect" ? "on" : ""} onClick={() => { setView("collect"); if (!cands.length) collect(); }}>미등록 후보 수집</button>
          <button className={view === "import" ? "on" : ""} onClick={() => setView("import")}>이카운트 가져오기</button>
        </div>
        {view === "list" && <>
          <input placeholder="🔍 코드/품목명/규격 검색" value={q} onChange={e => setQ(e.target.value)} style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6, minWidth: 180 }} />
          <select value={gubunF} onChange={e => setGubunF(e.target.value)} style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6 }}>
            <option value="">전체 구분</option>
            {GUBUNS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <span className="muted" style={{ fontSize: 12 }}>{filtered.length}/{items.length}품목</span>
        </>}
      </div>

      {view === "list" && (
        <div className="card">
          {canEdit && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12, paddingBottom: 12, borderBottom: "1px dashed var(--line)", fontSize: 12.5 }}>
              <b style={{ alignSelf: "center" }}>✏️ 신규 등록</b>
              <label>코드<br /><input value={nf.code} onChange={e => setNf(o => ({ ...o, code: e.target.value }))} style={{ ...inp, width: 110 }} placeholder="(선택)" /></label>
              <label>품목명<br /><input value={nf.name} onChange={e => setNf(o => ({ ...o, name: e.target.value }))} style={{ ...inp, width: 170 }} /></label>
              <label>규격<br /><input value={nf.spec} onChange={e => setNf(o => ({ ...o, spec: e.target.value }))} style={{ ...inp, width: 130 }} /></label>
              <label>구분<br /><select value={nf.gubun} onChange={e => setNf(o => ({ ...o, gubun: e.target.value }))} style={{ ...inp, width: 100 }}>{GUBUNS.map(g => <option key={g}>{g}</option>)}</select></label>
              <label>단위<br /><input value={nf.unit} onChange={e => setNf(o => ({ ...o, unit: e.target.value }))} style={{ ...inp, width: 60 }} /></label>
              <button className="btn" onClick={addManual} disabled={busy}>+ 등록</button>
            </div>
          )}
          {!loaded ? <p className="muted">불러오는 중…</p> : items.length === 0 ? (
            <p className="muted" style={{ lineHeight: 1.8 }}>등록된 품목이 없습니다. <b>미등록 후보 수집</b>으로 기존 주문·판매·구매·BOM 데이터에서 품목을 한 번에 긁어오거나, <b>이카운트 가져오기</b>로 [품목등록 리스트]를 붙여넣으세요.</p>
          ) : (
            <div style={{ overflow: "auto", maxHeight: "62vh" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
                <thead><tr>
                  <th style={{ ...th, textAlign: "left" }}>코드</th>
                  <th style={{ ...th, textAlign: "left" }}>품목명</th>
                  <th style={{ ...th, textAlign: "left" }}>규격</th>
                  <th style={{ ...th, textAlign: "center" }}>구분</th>
                  <th style={{ ...th, textAlign: "center" }}>단위</th>
                  <th style={{ ...th, textAlign: "left" }}>비고</th>
                  <th style={{ ...th, textAlign: "center" }}>사용</th>
                  {canEdit && <th style={{ ...th, textAlign: "center" }}>관리</th>}
                </tr></thead>
                <tbody>
                  {filtered.map(it => (
                    <tr key={it.id} style={!it.active ? { opacity: .5 } : undefined}>
                      <td style={{ ...tdL, fontWeight: 700, whiteSpace: "nowrap" }}>{it.code || "-"}</td>
                      <td style={tdL}>{it.name}</td>
                      <td style={tdL}>{canEdit ? <input value={it.spec} onChange={e => patch(it, { spec: e.target.value })} style={{ ...inp, minWidth: 90 }} /> : it.spec}</td>
                      <td style={{ ...td, textAlign: "center" }}>{canEdit
                        ? <select value={it.gubun} onChange={e => patch(it, { gubun: e.target.value })} style={{ ...inp, width: 92 }}>{GUBUNS.map(g => <option key={g}>{g}</option>)}</select>
                        : it.gubun}</td>
                      <td style={{ ...td, textAlign: "center" }}>{canEdit ? <input value={it.unit} onChange={e => patch(it, { unit: e.target.value })} style={{ ...inp, width: 50, textAlign: "center" }} /> : it.unit}</td>
                      <td style={tdL}>{canEdit ? <input value={it.note || ""} onChange={e => patch(it, { note: e.target.value })} style={{ ...inp, minWidth: 90 }} /> : (it.note || "")}</td>
                      <td style={{ ...td, textAlign: "center" }}><input type="checkbox" checked={it.active} disabled={!canEdit} onChange={e => patch(it, { active: e.target.checked })} /></td>
                      {canEdit && <td style={{ ...td, textAlign: "center" }}><button className="btn ghost" style={{ padding: "2px 9px", fontSize: 12 }} onClick={() => del(it)}>삭제</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === "collect" && (
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <h4 style={{ margin: 0 }}>미등록 품목 후보 <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>— 주문·생산·판매·구매·BOM 데이터에서 자동 수집 (구분은 자동 추정, 수정 가능)</span></h4>
            <button className="btn ghost" onClick={collect} disabled={collecting}>{collecting ? "수집 중…" : "🔄 다시 수집"}</button>
            {canEdit && cands.length > 0 && <button className="btn green" style={{ marginLeft: "auto" }} disabled={busy || sel.size === 0} onClick={registerSelected}>선택 {sel.size}건 일괄 등록</button>}
          </div>
          {cands.length === 0 ? <p className="muted">{collecting ? "수집 중…" : "미등록 후보가 없습니다."}</p> : (
            <div style={{ overflow: "auto", maxHeight: "60vh" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
                <thead><tr>
                  <th style={{ ...th, textAlign: "center", width: 40 }}>
                    <input type="checkbox" checked={sel.size === cands.length && cands.length > 0}
                      onChange={e => setSel(e.target.checked ? new Set(cands.map(ck)) : new Set())} />
                  </th>
                  <th style={{ ...th, textAlign: "left" }}>코드</th>
                  <th style={{ ...th, textAlign: "left" }}>품목명</th>
                  <th style={{ ...th, textAlign: "left" }}>규격</th>
                  <th style={{ ...th, textAlign: "center" }}>구분(추정)</th>
                </tr></thead>
                <tbody>
                  {cands.map(c => (
                    <tr key={ck(c)}>
                      <td style={{ ...td, textAlign: "center" }}>
                        <input type="checkbox" checked={sel.has(ck(c))}
                          onChange={e => setSel(s => { const n = new Set(s); e.target.checked ? n.add(ck(c)) : n.delete(ck(c)); return n; })} />
                      </td>
                      <td style={{ ...tdL, fontWeight: 700 }}>{c.code || "-"}</td>
                      <td style={tdL}>{c.name}</td>
                      <td style={tdL}>{c.spec}</td>
                      <td style={{ ...td, textAlign: "center" }}>
                        <select value={c.gubun} onChange={e => setCands(cs => cs.map(x => ck(x) === ck(c) ? { ...x, gubun: e.target.value } : x))} style={{ ...inp, width: 92 }}>
                          {GUBUNS.map(g => <option key={g}>{g}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === "import" && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>이카운트 [품목등록 리스트] 가져오기</h4>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
            이카운트 <b>[기초등록 → 품목등록]</b> 리스트를 조회 → 표 복사(머리글 포함) → 아래에 붙여넣기.
            같은 코드는 덮어쓰고 새 품목은 추가됩니다 (누적 — 기존 등록 유지).
          </p>
          <textarea value={text} onChange={e => setText(e.target.value)}
            placeholder={"품목코드\t품목명\t품목구분\t규격\t단위 ..."}
            style={{ width: "100%", height: 140, fontSize: 12, padding: 8, border: "1px solid var(--line)", borderRadius: 8, fontFamily: "monospace", boxSizing: "border-box" }} />
          <button className="btn green" style={{ marginTop: 8 }} disabled={busy || !text.trim() || !canEdit} onClick={importText}>가져오기</button>
        </div>
      )}
    </div>
  );
}
