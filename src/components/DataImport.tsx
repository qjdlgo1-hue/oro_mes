import { errMsg } from "../lib/errmsg";
import { thBase, tdBase } from "../lib/styles";
import { useEffect, useMemo, useState } from "react";
import { InoutKind, InoutRow, inoutSig, listInout, appendInout, deleteInoutMonth, updateInoutRow, listOrders, logAudit } from "../lib/db";
import { buildPurchaseBulk, sendEcountPurchase } from "../lib/ecount";
import { hasSupabase } from "../lib/supabase";
import { parseInout } from "../lib/parseInout";
import { todayIso } from "../lib/fmt";
import { toast } from "../lib/toast";
import { can } from "../lib/perm";
import { confirmDialog } from "../lib/confirm";
import { nf1 as fmt } from "../lib/fmt";
import { usePersistState } from "../lib/usePersist";
import { useSort } from "../lib/useSort";
import { usePaged } from "../lib/usePaged";
import MonthPicker from "./MonthPicker";
import ProdReceipt from "./ProdReceipt";

type Cfg = { kind: InoutKind; title: string; source: string; accent: string; audit: string };
const CFG: Record<InoutKind, Cfg> = {
  in: { kind: "in", title: "생산 가져오기", source: "이카운트 [생산입고 조회]", accent: "var(--accent)", audit: "생산입고" },
  out: { kind: "out", title: "판매 가져오기", source: "이카운트 [판매현황]", accent: "var(--ok)", audit: "판매현황" },
  purchase: { kind: "purchase", title: "구매 가져오기", source: "이카운트 [구매현황]", accent: "#8e5bd8", audit: "구매입고" },
};

export default function DataImport({ kind }: { kind: InoutKind }) {
  const cfg = CFG[kind];
  const canEdit = can("order.import");
  const [rows, setRows] = useState<InoutRow[]>([]);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<InoutRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [ymMap, setYmMap] = usePersistState<Record<string, string>>("inout.ym", {});
  const selYm = ymMap[kind] || "";
  const setSelYm = (v: string) => setYmMap(m => ({ ...m, [kind]: v }));
  const [loaded, setLoaded] = useState(false);

  const load = () => listInout(kind).then(setRows).catch(e => toast.error("불러오기 실패: " + errMsg(e))).finally(() => setLoaded(true));
  useEffect(() => { setLoaded(false); load(); /* eslint-disable-next-line */ }, [kind]);

  const existing = useMemo(() => new Set(rows.map(r => r.sig)), [rows]);
  const marked = useMemo(() => {
    const seen = new Set(existing);
    return preview.map(r => { const dup = seen.has(r.sig); seen.add(r.sig); return { r, dup }; });
  }, [preview, existing]);
  const newRows = marked.filter(m => !m.dup).map(m => m.r);
  const dupCount = marked.length - newRows.length;

  const byMonth = useMemo(() => {
    const m: Record<string, { n: number; qty: number }> = {};
    rows.forEach(r => { const e = m[r.ym] || (m[r.ym] = { n: 0, qty: 0 }); e.n++; e.qty += Number(r.qty) || 0; });
    return Object.entries(m).sort((a, b) => a[0] < b[0] ? 1 : -1);
  }, [rows]);

  const months = byMonth.map(([ym]) => ym);
  const curYm = selYm === "__all__" ? "__all__" : ((months.includes(selYm) ? selYm : "") || months[0] || "");
  const [q, setQ] = useState("");
  const detail = useMemo(() => {
    let f = curYm === "__all__" ? rows : rows.filter(r => r.ym === curYm);
    const s = q.trim().toLowerCase();
    if (s) f = f.filter(r => `${r.item_code || ""} ${r.name || ""} ${r.spec || ""} ${(r as any).customer || ""}`.toLowerCase().includes(s));
    return [...f].sort((a, b) => a.idate < b.idate ? -1 : a.idate > b.idate ? 1 : (a.item_code < b.item_code ? -1 : 1));
  }, [rows, curYm, q]);
  const { sorted: detailSorted, toggle, arrow } = useSort(detail);
  const { paged: detailPaged, remaining, showMore } = usePaged(detailSorted, 300);
  const detailQty = detail.reduce((s, r) => s + (Number(r.qty) || 0), 0);

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
      // 구분이 비어 있으면 주문 데이터의 품목코드→구분 매핑으로 자동 보완 (대시보드 품목구분 필터용)
      let rowsToAdd = newRows;
      if (newRows.some(r => !(r.gubun || "").trim())) {
        try {
          const gmap = new Map<string, string>();
          (await listOrders()).forEach(o => { if (o.item_code && o.gubun && !gmap.has(o.item_code)) gmap.set(o.item_code, o.gubun); });
          rowsToAdd = newRows.map(r => (r.gubun || "").trim() ? r : { ...r, gubun: gmap.get(r.item_code) || "" });
        } catch { /* 매핑 실패 시 원본 그대로 저장 */ }
      }
      await appendInout(rowsToAdd);
      await logAudit(`${cfg.audit} 누적추가`, "inout", "", { added: newRows.length, months: [...new Set(newRows.map(r => r.ym))] });
      toast.success(`신규 ${newRows.length}건 추가 완료 (중복 ${dupCount}건 제외)`);
      setText(""); setPreview([]); load();
    } catch (e: any) { toast.error("저장 실패: " + errMsg(e)); }
    setBusy(false);
  }
  async function delMonth(ym: string) {
    const v = byMonth.find(([m]) => m === ym)?.[1];
    if (!(await confirmDialog({ title: "월 데이터 삭제", message: `${ym.slice(0, 4)}년 ${+ym.slice(5, 7)}월 ${cfg.title.replace(" 가져오기", "")} 데이터 ${v?.n || 0}건을 삭제할까요?\n복구할 수 없습니다.`, danger: true, confirmLabel: "삭제" }))) return;
    setBusy(true);
    try {
      await deleteInoutMonth(kind, ym);
      await logAudit(`${cfg.audit} 월삭제`, "inout", ym, {});
      toast.success(`${ym} 삭제됨`); load();
    } catch (e: any) { toast.error("삭제 실패: " + errMsg(e)); }
    setBusy(false);
  }

  // ---- 직접 입력 (구매 탭 전용 — 급한 매입 건을 표 붙여넣기 없이 바로 추가) ----
  const [man, setMan] = useState({ idate: todayIso(), item_code: "", name: "", spec: "", qty: "", amount: "", customer: "" });
  const setM = (k: string, v: string) => setMan(o => ({ ...o, [k]: v }));
  async function addManual() {
    if (!man.name.trim() && !man.item_code.trim()) { toast.error("품목코드 또는 품목명을 입력하세요."); return; }
    const qty = Number(String(man.qty).replace(/,/g, ""));
    if (!man.idate || !qty) { toast.error("일자와 수량을 입력하세요."); return; }
    const base = {
      kind, ym: man.idate.slice(0, 7), idate: man.idate,
      item_code: man.item_code.trim(), name: man.name.trim(), spec: man.spec.trim(), qty,
      amount: man.amount ? Number(String(man.amount).replace(/,/g, "")) : null,
      customer: man.customer.trim(), trade_type: "", gubun: "", cust_code: "", vat: null, total: null, currency: "", fx_rate: null, note: "직접입력",
    };
    setBusy(true);
    try {
      await appendInout([{ ...base, sig: inoutSig(base) }]);
      await logAudit(`${cfg.audit} 직접입력`, "inout", "", { name: base.name || base.item_code, qty });
      toast.success(`추가됨: ${base.name || base.item_code} ${qty.toLocaleString()}`);
      setMan(o => ({ ...o, item_code: "", name: "", spec: "", qty: "", amount: "", customer: "" }));
      load();
    } catch (e: any) { toast.error("저장 실패: " + errMsg(e)); }
    setBusy(false);
  }

  // ---- 이카운트 구매입력 전송 (kind='purchase' 전용) — 현재 목록의 미전송 건을 행별 개별 전송.
  // 직접 입력·AI 인식으로 MES에만 있는 매입 건을 ERP에 반영하는 용도. 이카운트에서 가져온 데이터를
  // 되보내면 중복 전표가 되므로, 반드시 확인 모달에서 건수를 보고 전송한다. 성공 즉시 전표번호 기록.
  const [erpBusy, setErpBusy] = useState(false);
  const erpTargets = useMemo(() => kind !== "purchase" ? [] :
    detail.filter(r => !r.ecount_slip && (r.item_code || "").trim() && r.id), [kind, detail]);
  async function sendErpPurchase() {
    if (!erpTargets.length) return;
    const ok = await confirmDialog({
      title: "이카운트 구매입력 전송", confirmLabel: "전송",
      message: `현재 목록의 미전송 ${erpTargets.length}건을 이카운트 [구매입력] 전표로 전송합니다.\n※ 이카운트 [구매현황]에서 가져온 데이터를 되보내면 중복 전표가 됩니다 — 직접 입력·AI 인식 건만 전송하세요.\n공급가액·부가세는 MES 값(없으면 10% 계산)으로 전송됩니다.`,
    });
    if (!ok) return;
    setErpBusy(true);
    let okCnt = 0; const errs: string[] = [];
    for (const r of erpTargets) {
      try {
        const res = await sendEcountPurchase(buildPurchaseBulk([{
          code: (r.item_code || "").trim(), qty: Number(r.qty) || 0, date: r.idate,
          supply: r.amount != null ? Number(r.amount) : null, vat: r.vat != null ? Number(r.vat) : null,
          cust: r.cust_code || undefined,
        }]));
        if (res.success < 1) throw new Error(res.details?.length ? JSON.stringify(res.details[0]).slice(0, 160) : "이카운트가 실패로 응답했습니다.");
        await updateInoutRow(r.id!, { ecount_slip: res.slip_nos[0] || "sent" });
        okCnt++;
      } catch (e: any) { errs.push(`${r.name || r.item_code}: ${errMsg(e)}`); }
    }
    if (okCnt) logAudit("이카운트 구매입력 전송", "inout", "", { count: okCnt });
    if (errs.length) toast.error(`구매입력 전송 — 성공 ${okCnt}건 · 실패 ${errs.length}건: ${errs[0]}${errs.length > 1 ? " 외" : ""}`);
    else toast.success(`이카운트 구매입력 ${okCnt}건 전송 완료`);
    load();
    setErpBusy(false);
  }

  const box: React.CSSProperties = { width: "100%", height: 130, fontSize: 12, padding: 8, border: "1px solid var(--line)", borderRadius: 8, fontFamily: "monospace" };
  const th: React.CSSProperties = { ...thBase, borderBottom: "1px solid var(--line)" };
  const td: React.CSSProperties = tdBase;
  const tdL: React.CSSProperties = { ...td, textAlign: "left" };
  const isOut = kind !== "in"; // 판매·구매는 금액/거래처 열 표시 (구매현황도 같은 열 구성)
  const isIn = kind === "in";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        <div className="card">
          <h3 style={{ marginTop: 0, color: cfg.accent }}>{cfg.title}</h3>
          <div style={{ background: "var(--tint2)", border: "1px solid var(--tint2)", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12, lineHeight: 1.6 }}>
            <b style={{ color: "var(--accent)" }}>{cfg.source}</b> 을(를) 조회 → <b>표 복사(머리글 포함)</b> → 아래에 붙여넣기 → <b>인식</b> → <b>누적 추가</b>. 같은 행은 자동으로 중복 제외되어, 매월 반복해도 안전하게 쌓입니다.
          </div>
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder={`${cfg.source} 표 붙여넣기...`} style={box} />
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={doParse} disabled={busy}>인식</button>
            {preview.length > 0 && <button className="btn green" onClick={addNew} disabled={busy || !canEdit}>누적 추가 — 신규 {newRows.length}건</button>}
          </div>
          {preview.length > 0 && <>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              인식 {preview.length}건 · <b style={{ color: "var(--ok)" }}>신규 {newRows.length}</b> · <b style={{ color: "#888" }}>중복(유지) {dupCount}</b>
              {!canEdit && " · 추가 권한 없음"}
            </p>
            <div style={{ overflow: "auto", maxHeight: 260, border: "1px solid var(--line)", borderRadius: 8 }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr>
                  <th style={{ ...th, textAlign: "center" }}>상태</th>
                  <th style={{ ...th, textAlign: "left" }}>일자</th>
                  <th style={{ ...th, textAlign: "left" }}>품목코드</th>
                  <th style={{ ...th, textAlign: "left" }}>품목명</th>
                  <th style={th}>수량</th>
                  {isOut && <th style={{ ...th, textAlign: "left" }}>거래처</th>}
                </tr></thead>
                <tbody>
                  {marked.slice(0, 30).map(({ r, dup }, i) => (
                    <tr key={i} style={dup ? { opacity: .5 } : undefined}>
                      <td style={{ ...td, textAlign: "center" }}><span style={{ fontSize: 11, fontWeight: 700, borderRadius: 4, padding: "1px 6px", color: "#fff", background: dup ? "#9aa3af" : "var(--ok)" }}>{dup ? "중복" : "신규"}</span></td>
                      <td style={tdL}>{r.idate}</td><td style={tdL}>{r.item_code}</td><td style={tdL}>{r.name}</td>
                      <td style={td}>{fmt(Number(r.qty) || 0)}</td>
                      {isOut && <td style={tdL}>{r.customer || ""}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              {marked.length > 30 && <div className="muted" style={{ padding: "6px 8px", fontSize: 12 }}>… 외 {marked.length - 30}건 (전체는 추가 후 아래 표에서 확인)</div>}
            </div>
          </>}
          {kind === "purchase" && canEdit && (() => {
            const mi: React.CSSProperties = { padding: 6, border: "1px solid var(--line)", borderRadius: 6, width: "100%", boxSizing: "border-box" };
            return (
              <div style={{ marginTop: 14, borderTop: "1px dashed var(--line)", paddingTop: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>✏️ 직접 입력 <span className="muted" style={{ fontWeight: 400 }}>— 급한 매입 건 1건씩 추가</span></div>
                <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", fontSize: 12 }}>
                  <label>일자<input type="date" value={man.idate} onChange={e => setM("idate", e.target.value)} style={mi} /></label>
                  <label>품목코드<input value={man.item_code} onChange={e => setM("item_code", e.target.value)} style={mi} /></label>
                  <label>품목명<input value={man.name} onChange={e => setM("name", e.target.value)} style={mi} /></label>
                  <label>규격<input value={man.spec} onChange={e => setM("spec", e.target.value)} style={mi} /></label>
                  <label>수량<input value={man.qty} onChange={e => setM("qty", e.target.value)} style={mi} placeholder="g" /></label>
                  <label>공급가액<input value={man.amount} onChange={e => setM("amount", e.target.value)} style={mi} placeholder="원 (선택)" /></label>
                  <label>거래처<input value={man.customer} onChange={e => setM("customer", e.target.value)} style={mi} placeholder="(선택)" /></label>
                </div>
                <button className="btn" style={{ marginTop: 8 }} onClick={addManual} disabled={busy}>+ 추가</button>
              </div>
            );
          })()}
        </div>

        <div className="card">
          <h4 style={{ marginTop: 0 }}>누적 저장 현황 <span className="muted" style={{ fontSize: 12 }}>(총 {rows.length}건)</span></h4>
          {byMonth.length === 0 ? <p className="muted">{loaded ? "아직 저장된 데이터가 없습니다." : "불러오는 중…"}</p> :
            <div style={{ overflow: "auto", maxHeight: "40vh" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr>
                  <th style={{ ...th, textAlign: "left" }}>연/월</th>
                  <th style={th}>건수</th>
                  <th style={th}>수량 합계</th>
                  <th style={{ ...th, textAlign: "center" }}>관리</th>
                </tr></thead>
                <tbody>
                  {byMonth.map(([ym, v]) => (
                    <tr key={ym} style={ym === curYm ? { background: "var(--tint2)" } : undefined}>
                      <td style={tdL}><a className="xlink" style={{ border: "none", padding: 0, background: "none", cursor: "pointer" }} onClick={() => setSelYm(ym)}>{ym.slice(0, 4)}년 {+ym.slice(5, 7)}월</a></td>
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

      {kind === "in" && canEdit && <ProdReceipt inRows={rows} onChanged={load} />}

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <h4 style={{ margin: 0 }}>가져온 데이터</h4>
          {months.length > 0 &&
            <MonthPicker months={[...months].sort()} value={curYm} onChange={setSelYm} allowAll allValue="__all__" />}
          <input placeholder="🔍 품목/규격/거래처 검색" value={q} onChange={e => setQ(e.target.value)} style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6, minWidth: 170 }} />
          <span className="muted" style={{ fontSize: 12 }}>{detail.length}건 · 수량 합계 {fmt(detailQty)}</span>
          {kind === "purchase" && hasSupabase && canEdit && erpTargets.length > 0 &&
            <button className="btn ghost" style={{ marginLeft: "auto" }} disabled={erpBusy}
              title="품목코드가 있는 미전송 건을 이카운트 [구매입력] 전표로 전송 (직접 입력·AI 인식 건 전용)"
              onClick={sendErpPurchase}>{erpBusy ? "전송 중…" : `📡 이카운트 전송 (미전송 ${erpTargets.length}건)`}</button>}
        </div>
        {detail.length === 0 ? <p className="muted">{loaded ? "표시할 데이터가 없습니다. 위에서 붙여넣고 누적 추가하세요." : "불러오는 중…"}</p> :
          <div style={{ overflow: "auto", maxHeight: "58vh" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>
                <th style={{ ...th, textAlign: "left", left: 0, zIndex: 4, cursor: "pointer" }} onClick={() => toggle("idate")}>일자{arrow("idate")}</th>
                <th style={{ ...th, textAlign: "left", cursor: "pointer" }} onClick={() => toggle("item_code")}>품목코드{arrow("item_code")}</th>
                <th style={{ ...th, textAlign: "left", cursor: "pointer" }} onClick={() => toggle("name")}>품목명{arrow("name")}</th>
                <th style={{ ...th, textAlign: "left" }}>규격</th>
                <th style={{ ...th, cursor: "pointer" }} onClick={() => toggle("qty")}>수량{arrow("qty")}</th>
                {isIn && <th style={{ ...th, textAlign: "center" }}>구분</th>}
                {isOut && <th style={{ ...th, cursor: "pointer" }} onClick={() => toggle("amount")}>공급가액{arrow("amount")}</th>}
                {isOut && <th style={th}>부가세</th>}
                {isOut && <th style={th}>합계</th>}
                {isOut && <th style={{ ...th, textAlign: "left", cursor: "pointer" }} onClick={() => toggle("customer")}>거래처{arrow("customer")}</th>}
                {isOut && <th style={{ ...th, textAlign: "center" }}>구분</th>}
                {isOut && <th style={{ ...th, textAlign: "center" }}>통화</th>}
                {kind === "purchase" && hasSupabase && <th style={{ ...th, textAlign: "center" }} title="이카운트 구매입력 전송 여부">ERP</th>}
              </tr></thead>
              <tbody>
                {detailPaged.map((r, i) => (
                  <tr key={r.id || i}>
                    <td style={{ ...tdL, position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>{r.idate}</td>
                    <td style={tdL}><b>{r.item_code || "-"}</b></td>
                    <td style={tdL}>{r.name || "-"}</td>
                    <td style={tdL}>{r.spec || ""}</td>
                    <td style={td}>{fmt(Number(r.qty) || 0)}</td>
                    {isIn && <td style={{ ...td, textAlign: "center" }}>{r.gubun || ""}</td>}
                    {isOut && <td style={td}>{r.amount != null ? Number(r.amount).toLocaleString() : ""}</td>}
                    {isOut && <td style={td}>{r.vat != null ? Number(r.vat).toLocaleString() : ""}</td>}
                    {isOut && <td style={td}>{r.total != null ? Number(r.total).toLocaleString() : ""}</td>}
                    {isOut && <td style={tdL}>{r.customer || ""}</td>}
                    {isOut && <td style={{ ...td, textAlign: "center" }}>{r.trade_type || ""}</td>}
                    {isOut && <td style={{ ...td, textAlign: "center" }}>{r.currency || ""}</td>}
                    {kind === "purchase" && hasSupabase && <td style={{ ...td, textAlign: "center" }}>{r.ecount_slip ? <span title={"전표 " + r.ecount_slip} style={{ color: "var(--ok)", fontWeight: 700, fontSize: 11 }}>✓</span> : <span className="muted">-</span>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {remaining > 0 && <button className="btn ghost" style={{ width: "100%", marginTop: 6 }} onClick={showMore}>더 보기 (남은 {remaining.toLocaleString()}건)</button>}
          </div>}
      </div>
    </div>
  );
}
