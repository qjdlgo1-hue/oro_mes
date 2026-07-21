// 재고 — ① 재고 현황(품목별 현재 잔량) ② 재고 수불부(월별 이월/입고/출고/조정/기말)
// ③ 기초·조정(기준일 실사값, 실사 차이 보정). 계산 규칙은 lib/stock.ts 참고.
import { Fragment, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { InoutRow, ProdConsume, StockBase, listInout, listProdConsume, listStockBase, addStockBase, deleteStockBase, logAudit } from "../lib/db";
import { buildStock, balanceOf, monthLedger, stockMonths, ItemStock } from "../lib/stock";
import { thBase, tdBase } from "../lib/styles";
import { nf1, todayIso } from "../lib/fmt";
import { toast } from "../lib/toast";
import { errMsg } from "../lib/errmsg";
import { can } from "../lib/perm";
import { confirmDialog } from "../lib/confirm";
import MonthPicker from "./MonthPicker";

type View = "now" | "ledger" | "adjust";
const CAT_LABEL = { product: "제품", material: "원재료" } as const;

export default function Stock() {
  const canEdit = can("stock.edit");
  const [loaded, setLoaded] = useState(false);
  const [prodIn, setProdIn] = useState<InoutRow[]>([]);
  const [sales, setSales] = useState<InoutRow[]>([]);
  const [purchases, setPurchases] = useState<InoutRow[]>([]);
  const [consumes, setConsumes] = useState<ProdConsume[]>([]);
  const [bases, setBases] = useState<StockBase[]>([]);
  const [view, setView] = useState<View>("now");
  const [q, setQ] = useState("");

  const load = () => Promise.all([listInout("in"), listInout("out"), listInout("purchase"), listProdConsume(), listStockBase()])
    .then(([a, b, c, d, e]) => { setProdIn(a); setSales(b); setPurchases(c); setConsumes(d); setBases(e); })
    .catch(e => toast.error("불러오기 실패: " + errMsg(e)))
    .finally(() => setLoaded(true));
  useEffect(() => { load(); }, []);

  const items = useMemo(() => buildStock(prodIn, sales, purchases, consumes, bases), [prodIn, sales, purchases, consumes, bases]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(it => `${it.code} ${it.name} ${it.spec}`.toLowerCase().includes(s));
  }, [items, q]);
  const months = useMemo(() => stockMonths(items), [items]);
  const [ym, setYm] = useState("");
  const curYm = months.includes(ym) ? ym : (months[months.length - 1] || "");
  const T = todayIso();

  const th: React.CSSProperties = { ...thBase, borderBottom: "1px solid var(--line)" };
  const td: React.CSSProperties = tdBase;
  const tdL: React.CSSProperties = { ...td, textAlign: "left" };
  const num = (v: number, strong?: boolean) => (
    <span style={{ fontWeight: strong ? 700 : 400, color: v < 0 ? "#c0392b" : undefined }}>{v ? nf1(v) : v === 0 ? "0" : ""}</span>
  );

  // ---- 엑셀 내보내기 ----
  function exportNow() {
    const aoa: any[][] = [["분류", "품목코드", "품목명", "규격", "기초(기준일)", "기초수량", "입고", "출고", "조정", "현재고"]];
    filtered.forEach(it => {
      let inQ = 0, outQ = 0, adjQ = 0;
      it.moves.forEach(mv => { if (mv.src === "조정") adjQ += mv.qty; else if (mv.qty >= 0) inQ += mv.qty; else outQ += -mv.qty; });
      aoa.push([CAT_LABEL[it.cat], it.code, it.name, it.spec, it.base?.bdate || "", it.base?.qty ?? "", inQ, outQ, adjQ, balanceOf(it)]);
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "재고현황");
    XLSX.writeFile(wb, `재고현황_${T}.xlsx`);
  }
  function exportLedger() {
    const aoa: any[][] = [["분류", "품목코드", "품목명", "규격", "이월", "입고", "출고", "조정", "기말"]];
    filtered.forEach(it => {
      const l = monthLedger(it, curYm);
      if (!l.rows.length && !l.open && !l.close) return;
      aoa.push([CAT_LABEL[it.cat], it.code, it.name, it.spec, l.open, l.inQty, l.outQty, l.adjQty, l.close]);
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), curYm);
    XLSX.writeFile(wb, `재고수불부_${curYm}.xlsx`);
  }

  // ---- 기초·조정 입력 상태 ----
  const [baseDate, setBaseDate] = useState(T);
  const [baseQty, setBaseQty] = useState<Record<string, string>>({});
  const [adj, setAdj] = useState({ key: "", bdate: T, qty: "", note: "" });
  const [busy, setBusy] = useState(false);

  async function saveBases() {
    const rows: StockBase[] = [];
    for (const it of items) {
      const v = (baseQty[it.key] || "").trim();
      if (v === "") continue;
      const qty = Number(v.replace(/,/g, ""));
      if (isNaN(qty)) { toast.error(`수량이 숫자가 아닙니다: ${it.name || it.code}`); return; }
      rows.push({ kind: "base", cat: it.cat, item_code: it.code, name: it.name, spec: it.spec, bdate: baseDate, qty });
    }
    if (!rows.length) { toast.error("입력된 기초재고가 없습니다."); return; }
    setBusy(true);
    try {
      for (const r of rows) await addStockBase(r);
      logAudit("기초재고 입력", "stock", "", { date: baseDate, items: rows.length });
      toast.success(`기초재고 ${rows.length}건 저장 (${baseDate} 기준)`);
      setBaseQty({}); load();
    } catch (e: any) { toast.error("저장 실패: " + errMsg(e)); }
    setBusy(false);
  }
  async function saveAdj() {
    const it = items.find(x => x.key === adj.key);
    if (!it) { toast.error("품목을 선택하세요."); return; }
    const qty = Number(String(adj.qty).replace(/,/g, ""));
    if (!qty) { toast.error("조정 수량(±)을 입력하세요."); return; }
    setBusy(true);
    try {
      await addStockBase({ kind: "adj", cat: it.cat, item_code: it.code, name: it.name, spec: it.spec, bdate: adj.bdate, qty, note: adj.note });
      logAudit("재고 조정", "stock", "", { name: it.name || it.code, qty, note: adj.note });
      toast.success(`조정 저장: ${it.name || it.code} ${qty > 0 ? "+" : ""}${nf1(qty)}`);
      setAdj({ key: "", bdate: T, qty: "", note: "" }); load();
    } catch (e: any) { toast.error("저장 실패: " + errMsg(e)); }
    setBusy(false);
  }
  async function delBase(r: StockBase) {
    if (!(await confirmDialog({ title: "삭제", message: `${r.kind === "base" ? "기초재고" : "조정"} (${r.name || r.item_code}, ${r.bdate}, ${nf1(Number(r.qty))})를 삭제할까요?`, danger: true, confirmLabel: "삭제" }))) return;
    try { await deleteStockBase(r.id!); logAudit("기초/조정 삭제", "stock", r.id || "", { name: r.name }); load(); }
    catch (e: any) { toast.error("삭제 실패: " + errMsg(e)); }
  }

  // ---- 수불부 상세 펼침 ----
  const [openKey, setOpenKey] = useState("");

  const CatRows = ({ cat, children }: { cat: "product" | "material"; children: (list: ItemStock[]) => React.ReactNode }) => {
    const list = filtered.filter(it => it.cat === cat);
    if (!list.length) return null;
    return <>
      <tr><td colSpan={99} style={{ ...tdL, background: "var(--tint2)", fontWeight: 700 }}>{cat === "product" ? "📦 제품" : "⚗️ 원재료"} · {list.length}품목</td></tr>
      {children(list)}
    </>;
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div className="seg">
          <button className={view === "now" ? "on" : ""} onClick={() => setView("now")}>재고 현황</button>
          <button className={view === "ledger" ? "on" : ""} onClick={() => setView("ledger")}>재고 수불부</button>
          <button className={view === "adjust" ? "on" : ""} onClick={() => setView("adjust")}>기초·조정</button>
        </div>
        {view === "ledger" && months.length > 0 && <MonthPicker months={months} value={curYm} onChange={setYm} />}
        {view !== "adjust" && <input placeholder="🔍 품목 검색" value={q} onChange={e => setQ(e.target.value)} style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6, minWidth: 160 }} />}
        {view === "now" && <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={exportNow}>📊 엑셀 저장</button>}
        {view === "ledger" && <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={exportLedger}>📊 엑셀 저장</button>}
      </div>

      {!loaded ? <p className="muted">불러오는 중…</p> : items.length === 0 ? (
        <div className="card"><p className="muted" style={{ margin: 0, lineHeight: 1.8 }}>
          아직 재고 데이터가 없습니다. <b>생산 가져오기</b>(생산입고)·<b>판매 가져오기</b>(출고)·<b>구매 가져오기</b>(원재료 매입)·<b>생산·소모</b>(원재료 소모)에서 데이터를 쌓으면
          제품 = 생산입고 − 판매, 원재료 = 구매 − 소모로 재고가 자동 계산됩니다. 시작 잔량은 <b>기초·조정</b> 탭에서 실사값으로 입력하세요.
        </p></div>
      ) : <>

      {view === "now" && (
        <div className="card" style={{ overflow: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr>
              <th style={{ ...th, textAlign: "left" }}>품목코드</th>
              <th style={{ ...th, textAlign: "left" }}>품목명</th>
              <th style={{ ...th, textAlign: "left" }}>규격</th>
              <th style={th}>기초</th><th style={th}>입고</th><th style={th}>출고</th><th style={th}>조정</th>
              <th style={th}>현재고</th>
            </tr></thead>
            <tbody>
              {(["product", "material"] as const).map(cat => (
                <CatRows key={cat} cat={cat}>{list => list.map(it => {
                  let inQ = 0, outQ = 0, adjQ = 0;
                  it.moves.forEach(mv => { if (mv.src === "조정") adjQ += mv.qty; else if (mv.qty >= 0) inQ += mv.qty; else outQ += -mv.qty; });
                  const bal = balanceOf(it);
                  return (
                    <tr key={it.key}>
                      <td style={tdL}><b>{it.code || "-"}</b></td>
                      <td style={tdL}>{it.name}</td>
                      <td style={tdL}>{it.spec}</td>
                      <td style={td} title={it.base ? `${it.base.bdate} 기준` : "기초재고 미입력 — 0부터 누적"}>{it.base ? nf1(it.base.qty) : <span className="muted">-</span>}</td>
                      <td style={td}>{num(inQ)}</td>
                      <td style={td}>{num(outQ)}</td>
                      <td style={td}>{num(adjQ)}</td>
                      <td style={{ ...td, background: bal < 0 ? "#fdecea" : undefined }}>{num(bal, true)}{bal < 0 && " ⚠"}</td>
                    </tr>
                  );
                })}</CatRows>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.7 }}>
            제품 = 생산입고 − 판매출고, 원재료 = 구매입고 − 생산소모 (± 조정, 기초재고 기준일 이후 누적). 현재고가 <b style={{ color: "#c0392b" }}>음수(⚠)</b>면
            기초재고 미입력이나 데이터 누락 가능성이 큽니다 — <b>기초·조정</b>에서 실사값을 입력하세요. 수량 단위는 이카운트 원본 그대로입니다.
          </p>
        </div>
      )}

      {view === "ledger" && (
        <div className="card" style={{ overflow: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr>
              <th style={{ ...th, textAlign: "left" }}>품목코드</th>
              <th style={{ ...th, textAlign: "left" }}>품목명</th>
              <th style={th}>이월</th><th style={th}>입고</th><th style={th}>출고</th><th style={th}>조정</th><th style={th}>기말</th>
              <th style={{ ...th, textAlign: "center" }}>상세</th>
            </tr></thead>
            <tbody>
              {(["product", "material"] as const).map(cat => (
                <CatRows key={cat} cat={cat}>{list => list.map(it => {
                  const l = monthLedger(it, curYm);
                  if (!l.rows.length && !l.open && !l.close) return null;
                  const opened = openKey === it.key;
                  let run = l.open;
                  return (
                    <Fragment key={it.key}>
                      <tr style={opened ? { background: "var(--tint2)" } : undefined}>
                        <td style={tdL}><b>{it.code || "-"}</b></td>
                        <td style={tdL}>{it.name}</td>
                        <td style={td}>{num(l.open)}</td>
                        <td style={td}>{num(l.inQty)}</td>
                        <td style={td}>{num(l.outQty)}</td>
                        <td style={td}>{num(l.adjQty)}</td>
                        <td style={{ ...td, background: l.close < 0 ? "#fdecea" : undefined }}>{num(l.close, true)}</td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <button className="btn ghost" style={{ padding: "2px 9px", fontSize: 12 }} onClick={() => setOpenKey(opened ? "" : it.key)}>{opened ? "닫기" : `${l.rows.length}건`}</button>
                        </td>
                      </tr>
                      {opened && (
                        <tr><td colSpan={8} style={{ padding: "4px 10px 10px" }}>
                          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
                            <thead><tr>
                              <th style={{ ...th, textAlign: "left" }}>일자</th>
                              <th style={{ ...th, textAlign: "center" }}>구분</th>
                              <th style={th}>입고</th><th style={th}>출고</th><th style={th}>잔량</th>
                              <th style={{ ...th, textAlign: "left" }}>비고</th>
                            </tr></thead>
                            <tbody>
                              <tr><td style={tdL}>{curYm} 이월</td><td style={{ ...td, textAlign: "center" }}>-</td><td style={td} /><td style={td} /><td style={td}>{num(l.open, true)}</td><td style={tdL} /></tr>
                              {l.rows.map((mv, i) => {
                                run += mv.qty;
                                return (
                                  <tr key={i}>
                                    <td style={tdL}>{mv.date}</td>
                                    <td style={{ ...td, textAlign: "center" }}>{mv.src}</td>
                                    <td style={td}>{mv.qty >= 0 ? num(mv.qty) : ""}</td>
                                    <td style={td}>{mv.qty < 0 ? num(-mv.qty) : ""}</td>
                                    <td style={td}>{num(Math.round(run * 1000) / 1000, true)}</td>
                                    <td style={tdL}>{mv.note || ""}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}</CatRows>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>이월 = 전월 말 잔량(기초재고 기준일이 이 달이면 기초 수량). 기말 = 이월 + 입고 − 출고 ± 조정.</p>
        </div>
      )}

      {view === "adjust" && (
        <div style={{ display: "grid", gap: 14 }}>
          <div className="card">
            <h4 style={{ marginTop: 0 }}>기초재고 입력 <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>— 기준일 시작 시점의 실사 잔량. 그 이전 데이터는 잔량 계산에서 제외됩니다. 재실사 시 새 기준일로 다시 입력하면 됩니다.</span></h4>
            <label style={{ fontSize: 13 }}>기준일 <input type="date" value={baseDate} onChange={e => setBaseDate(e.target.value)} style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6 }} /></label>
            <div style={{ overflow: "auto", maxHeight: "44vh", marginTop: 8, border: "1px solid var(--line)", borderRadius: 8 }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr>
                  <th style={{ ...th, textAlign: "left" }}>분류</th>
                  <th style={{ ...th, textAlign: "left" }}>품목코드</th>
                  <th style={{ ...th, textAlign: "left" }}>품목명</th>
                  <th style={th}>현재 계산 잔량</th>
                  <th style={{ ...th, textAlign: "left" }}>실사 수량 입력</th>
                </tr></thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it.key}>
                      <td style={tdL}>{CAT_LABEL[it.cat]}</td>
                      <td style={tdL}><b>{it.code || "-"}</b></td>
                      <td style={tdL}>{it.name}</td>
                      <td style={td}>{num(balanceOf(it))}</td>
                      <td style={tdL}><input value={baseQty[it.key] || ""} onChange={e => setBaseQty(o => ({ ...o, [it.key]: e.target.value }))}
                        placeholder="비우면 저장 안 함" style={{ padding: 5, border: "1px solid var(--line)", borderRadius: 6, width: 130 }} disabled={!canEdit} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn green" style={{ marginTop: 10 }} onClick={saveBases} disabled={busy || !canEdit}>기초재고 저장</button>
            {!canEdit && <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>입력 권한이 없습니다 (관리자에게 재고 편집 권한 요청)</span>}
          </div>

          <div className="card">
            <h4 style={{ marginTop: 0 }}>실사 조정 <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>— 전산 재고와 실물 차이를 ±수량으로 보정 (수불부에 '조정' 행으로 표시)</span></h4>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", fontSize: 13 }}>
              <label>품목<br />
                <select value={adj.key} onChange={e => setAdj(o => ({ ...o, key: e.target.value }))} style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6, minWidth: 200 }}>
                  <option value="">선택…</option>
                  {items.map(it => <option key={it.key} value={it.key}>[{CAT_LABEL[it.cat]}] {it.name || it.code}</option>)}
                </select></label>
              <label>일자<br /><input type="date" value={adj.bdate} onChange={e => setAdj(o => ({ ...o, bdate: e.target.value }))} style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6 }} /></label>
              <label>조정 수량(±)<br /><input value={adj.qty} onChange={e => setAdj(o => ({ ...o, qty: e.target.value }))} placeholder="-30 = 30 감소" style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6, width: 110 }} /></label>
              <label>사유<br /><input value={adj.note} onChange={e => setAdj(o => ({ ...o, note: e.target.value }))} placeholder="예: 7월 실사 차이" style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6, minWidth: 180 }} /></label>
              <button className="btn" onClick={saveAdj} disabled={busy || !canEdit}>+ 조정 추가</button>
            </div>
          </div>

          <div className="card">
            <h4 style={{ marginTop: 0 }}>등록된 기초재고·조정 <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>({bases.length}건)</span></h4>
            {bases.length === 0 ? <p className="muted">아직 없습니다.</p> :
              <div style={{ overflow: "auto", maxHeight: "40vh" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead><tr>
                    <th style={{ ...th, textAlign: "center" }}>구분</th>
                    <th style={{ ...th, textAlign: "left" }}>일자</th>
                    <th style={{ ...th, textAlign: "left" }}>품목</th>
                    <th style={th}>수량</th>
                    <th style={{ ...th, textAlign: "left" }}>사유</th>
                    <th style={{ ...th, textAlign: "center" }}>관리</th>
                  </tr></thead>
                  <tbody>
                    {[...bases].sort((a, b) => a.bdate < b.bdate ? 1 : -1).map(r => (
                      <tr key={r.id}>
                        <td style={{ ...td, textAlign: "center" }}><span style={{ fontSize: 11, fontWeight: 700, borderRadius: 4, padding: "1px 6px", color: "#fff", background: r.kind === "base" ? "var(--accent)" : "#8e5bd8" }}>{r.kind === "base" ? "기초" : "조정"}</span></td>
                        <td style={tdL}>{r.bdate}</td>
                        <td style={tdL}>{r.name || r.item_code}</td>
                        <td style={td}>{num(Number(r.qty))}</td>
                        <td style={tdL}>{r.note || ""}</td>
                        <td style={{ ...td, textAlign: "center" }}>{canEdit && <button className="btn ghost" style={{ padding: "2px 9px", fontSize: 12 }} onClick={() => delBase(r)}>삭제</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
          </div>
        </div>
      )}
      </>}
    </div>
  );
}
