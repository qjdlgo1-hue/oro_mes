// 생산입고 전표 (이카운트 '생산입고II — 소모품목 선택' 대응) — 생산 가져오기 화면 내 카드.
// 완제품 라인 입력 → [BOM풀기]로 소모(원재료) 라인 자동 전개(수정 가능) → 저장 시 RPC가
// 입고(+)와 소모(−)를 한 트랜잭션으로 기록. 전표 취소는 그 전표가 만든 행을 되돌린다.
// 재고부족은 저장을 막지 않고 경고로 표시(기초재고 미입력 이력이 있어 STRICT 차단은 부적합).
import { useEffect, useMemo, useState } from "react";
import {
  Item, InoutRow, ProdConsume, StockBase, BomRow, ProductionReceipt,
  listItems, listBomRows, listInout, listProdConsume, listStockBase, listOrders, listPlans,
  listProductionReceipts, saveProductionReceipt, cancelProductionReceipt, logAudit,
} from "../lib/db";
import { Order, PlanEntry } from "../lib/types";
import { buildBomIndex } from "../lib/bom";
import { buildStock, balanceOf, itemKey } from "../lib/stock";
import { expandReceiptConsumes, buildReceiptPayload, buildMonthCandidates, ReceiptProdLine, ReceiptConsumeLine } from "../lib/receipt";
import { thBase, tdBase } from "../lib/styles";
import { nf1, todayIso } from "../lib/fmt";
import { toast } from "../lib/toast";
import { errMsg } from "../lib/errmsg";
import { confirmDialog } from "../lib/confirm";

const blankProd = (): ReceiptProdLine => ({ item_code: "", name: "", spec: "", qty: 0, gubun: "제품" });

export default function ProdReceipt({ inRows, onChanged }: { inRows: InoutRow[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [bomRows, setBomRows] = useState<BomRow[]>([]);
  const [purchases, setPurchases] = useState<InoutRow[]>([]);
  const [consAll, setConsAll] = useState<ProdConsume[]>([]);
  const [bases, setBases] = useState<StockBase[]>([]);
  const [receipts, setReceipts] = useState<ProductionReceipt[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [plans, setPlans] = useState<Record<string, PlanEntry>>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const [rdate, setRdate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [prods, setProds] = useState<ReceiptProdLine[]>([blankProd()]);
  const [consumes, setConsumes] = useState<ReceiptConsumeLine[]>([]);
  const [tab, setTab] = useState<"prod" | "consume">("prod");

  useEffect(() => {
    if (!open || loaded) return;
    Promise.all([listItems(), listBomRows(), listInout("purchase"), listProdConsume(), listStockBase(), listProductionReceipts(), listOrders(), listPlans()])
      .then(([it, br, pu, pc, sb, rc, od, pl]) => { setItems(it); setBomRows(br); setPurchases(pu); setConsAll(pc); setBases(sb); setReceipts(rc); setOrders(od); setPlans(pl); })
      .catch(e => toast.error("불러오기 실패: " + errMsg(e)))
      .finally(() => setLoaded(true));
  }, [open, loaded]);

  const bomIdx = useMemo(() => buildBomIndex(bomRows), [bomRows]);
  // 소모 자재 현재 잔량 (원재료 규칙: 구매 − 소모 ± 기초/조정) — 부족 경고용
  const balMap = useMemo(() => {
    const st = buildStock([], [], purchases, consAll, bases);
    const m = new Map<string, number>();
    st.forEach(it => m.set(it.key, balanceOf(it)));
    return m;
  }, [purchases, consAll, bases]);
  const balOf = (c: ReceiptConsumeLine) => balMap.get(itemKey(c.mat_code, c.mat_name));

  // 완제품 후보(제품·반제품) — 품목 마스터에서 선택, 없으면 직접 입력
  const prodItems = useMemo(() => items.filter(i => i.active && (i.gubun === "제품" || i.gubun === "반제품")), [items]);
  // 전표 월(입고일 기준)의 생산계획·생산 품목 — 전표 입고 완료 시 (완료) 표시
  const ym = rdate.slice(0, 7);
  const monthCands = useMemo(() => buildMonthCandidates(ym, orders, plans, inRows), [ym, orders, plans, inRows]);
  const setProd = (i: number, patch: Partial<ReceiptProdLine>) => setProds(ps => ps.map((p, j) => j === i ? { ...p, ...patch } : p));
  const selVal = (p: ReceiptProdLine) => {
    const ci = monthCands.findIndex(c => c.name === p.name && (c.item_code || "") === (p.item_code || ""));
    if (ci >= 0) return "c:" + ci;
    return prodItems.some(it => it.code === p.item_code) ? "m:" + p.item_code : "";
  };
  const pickProd = (i: number, v: string) => {
    if (v.startsWith("c:")) {
      const c = monthCands[Number(v.slice(2))];
      if (c) setProd(i, { item_code: c.item_code, name: c.name, spec: c.spec, gubun: c.gubun, qty: c.planQty || prods[i].qty || 0 });
    } else if (v.startsWith("m:")) {
      const it = prodItems.find(x => x.code === v.slice(2));
      if (it) setProd(i, { item_code: it.code, name: it.name, spec: it.spec, gubun: it.gubun });
    }
  };
  const setCons = (i: number, patch: Partial<ReceiptConsumeLine>) => setConsumes(cs => cs.map((c, j) => j === i ? { ...c, ...patch } : c));

  function expand() {
    const valid = prods.filter(p => p.name && p.qty > 0);
    if (!valid.length) { toast.error("생산품목과 수량을 먼저 입력하세요."); return; }
    const cs = expandReceiptConsumes(bomIdx, valid);
    const noBom = valid.filter(p => !cs.some(c => c.prod_name === p.name));
    setConsumes(cs);
    setTab("consume");
    if (noBom.length) toast.info(`BOM 미등록: ${noBom.map(p => p.name).join(", ")} — 소모 탭에서 직접 추가할 수 있습니다.`);
    else toast.success(`BOM풀기 완료 — 소모 ${cs.length}건 전개`);
  }

  async function save() {
    const payload = buildReceiptPayload(rdate, note.trim(), prods, consumes);
    if (!payload.prods.length) { toast.error("생산품목 라인이 없습니다."); return; }
    const shortage = consumes.filter(c => { const b = balOf(c); return b != null && b < c.act_qty; });
    const ok = await confirmDialog({
      title: "생산입고 전표 저장", confirmLabel: "저장",
      message: `${rdate} · 생산 ${payload.prods.length}건(입고+) · 소모 ${payload.consumes.length}건(불출−)을 한 전표로 저장합니다.` +
        (shortage.length ? `\n⚠ 재고부족 ${shortage.length}건: ${shortage.slice(0, 3).map(c => `${c.mat_name}(잔량 ${nf1(balOf(c)!)} < 필요 ${nf1(c.act_qty)})`).join(", ")}${shortage.length > 3 ? " 외" : ""} — 그래도 저장하면 음수 재고로 표시됩니다.` : "") +
        `\n저장은 원자적으로 처리되어 일부만 반영되는 일이 없습니다.`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const id = await saveProductionReceipt(payload);
      logAudit("생산입고 전표 저장", "receipt", id, { prods: payload.prods.length, consumes: payload.consumes.length });
      toast.success(`전표 저장 완료 — 생산입고 ${payload.prods.length}건 + 소모 ${payload.consumes.length}건`);
      setProds([blankProd()]); setConsumes([]); setNote(""); setTab("prod");
      setReceipts(await listProductionReceipts());
      onChanged();
    } catch (e: any) { toast.error("전표 저장 실패(전체 롤백됨): " + errMsg(e)); }
    setBusy(false);
  }

  async function cancel(r: ProductionReceipt) {
    const n = inRows.filter(x => x.receipt_id === r.id).length;
    if (!(await confirmDialog({ title: "전표 취소", danger: true, confirmLabel: "취소(되돌리기)", message: `${r.rdate} 전표를 취소할까요?\n이 전표가 기록한 생산입고${n ? ` ${n}건` : ""}과 소모 행이 재고에서 되돌려집니다.` }))) return;
    setBusy(true);
    try {
      await cancelProductionReceipt(r.id!);
      logAudit("생산입고 전표 취소", "receipt", r.id!, {});
      toast.success("전표 취소됨 — 재고에서 되돌려졌습니다.");
      setReceipts(await listProductionReceipts());
      onChanged();
    } catch (e: any) { toast.error("취소 실패: " + errMsg(e)); }
    setBusy(false);
  }

  const th: React.CSSProperties = thBase, td: React.CSSProperties = tdBase;
  const tdL: React.CSSProperties = { ...td, textAlign: "left" };
  const inp: React.CSSProperties = { padding: 5, border: "1px solid var(--line)", borderRadius: 5, boxSizing: "border-box" };

  return (
    <div className="card">
      <h4 style={{ margin: 0, cursor: "pointer", userSelect: "none" }} onClick={() => setOpen(o => !o)}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{open ? "▼" : "▶"}</span> 📋 생산입고 전표
        <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> — 완제품 입고 + BOM 소모 자동 불출 (원자 저장·취소 가능)</span>
      </h4>
      {open && (!loaded ? <p className="muted" style={{ marginBottom: 0 }}>불러오는 중…</p> : (
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", fontSize: 12.5 }}>
            <label>입고일<br /><input type="date" value={rdate} onChange={e => setRdate(e.target.value)} style={inp} /></label>
            <label>적요<br /><input value={note} onChange={e => setNote(e.target.value)} style={{ ...inp, width: 220 }} placeholder="(선택)" /></label>
            <button className="btn" onClick={expand} disabled={busy}>🧩 BOM풀기</button>
            <button className="btn green" onClick={save} disabled={busy}>💾 전표 저장</button>
            {monthCands.length > 0 && <span className="muted" style={{ fontSize: 12, paddingBottom: 4 }}>
              이번 달 생산계획·생산 {monthCands.length}품목 · 전표 완료 {monthCands.filter(c => c.done).length}
            </span>}
          </div>

          <div className="seg" style={{ width: "fit-content" }}>
            <button className={tab === "prod" ? "on" : ""} onClick={() => setTab("prod")}>생산 (입고+) {prods.filter(p => p.name && p.qty > 0).length || ""}</button>
            <button className={tab === "consume" ? "on" : ""} onClick={() => setTab("consume")}>소모 (불출−) {consumes.length || ""}</button>
          </div>

          {tab === "prod" && (
            <div style={{ overflow: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560, fontSize: 12.5 }}>
                <thead><tr>
                  <th style={{ ...th, textAlign: "left" }}>품목 선택</th>
                  <th style={{ ...th, textAlign: "left" }}>코드</th>
                  <th style={{ ...th, textAlign: "left" }}>품목명</th>
                  <th style={th}>수량(g)</th><th style={th}></th>
                </tr></thead>
                <tbody>
                  {prods.map((p, i) => (
                    <tr key={i}>
                      <td style={tdL}>
                        <select value={selVal(p)} onChange={e => pickProd(i, e.target.value)} style={{ ...inp, maxWidth: 240 }}>
                          <option value="">직접 입력…</option>
                          {monthCands.length > 0 && (
                            <optgroup label={`이번 달(${ym}) 생산계획·생산`}>
                              {monthCands.map((c, k) => (
                                <option key={"c" + k} value={"c:" + k}>
                                  [{c.item_code || "-"}] {c.name}{c.planQty > 0 ? ` — 계획 ${nf1(c.planQty)}g` : ""}{c.done ? " (완료)" : ""}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="품목 마스터">
                            {prodItems.map(it => <option key={it.code + it.name} value={"m:" + it.code}>[{it.code}] {it.name}</option>)}
                          </optgroup>
                        </select>
                      </td>
                      <td style={tdL}><input value={p.item_code} onChange={e => setProd(i, { item_code: e.target.value })} style={{ ...inp, width: 90 }} /></td>
                      <td style={tdL}><input value={p.name} onChange={e => setProd(i, { name: e.target.value })} style={{ ...inp, width: 160 }} /></td>
                      <td style={td}><input type="number" value={p.qty || ""} onChange={e => setProd(i, { qty: Number(e.target.value) })} style={{ ...inp, width: 90, textAlign: "right" }} /></td>
                      <td style={{ ...td, textAlign: "center" }}><button className="btn ghost" style={{ padding: "1px 8px", fontSize: 11 }} onClick={() => setProds(ps => ps.length > 1 ? ps.filter((_, j) => j !== i) : ps)}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn ghost" style={{ marginTop: 6, fontSize: 12 }} onClick={() => setProds(ps => [...ps, blankProd()])}>+ 생산품목 추가</button>
            </div>
          )}

          {tab === "consume" && (
            <div style={{ overflow: "auto" }}>
              {consumes.length === 0 ? <p className="muted" style={{ margin: "4px 0" }}>[BOM풀기]를 누르면 생산품목의 BOM 소요량으로 자동 전개됩니다. 직접 추가도 가능합니다.</p> : (
                <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640, fontSize: 12.5 }}>
                  <thead><tr>
                    <th style={{ ...th, textAlign: "left" }}>생산품목</th>
                    <th style={{ ...th, textAlign: "left" }}>소모품목코드</th>
                    <th style={{ ...th, textAlign: "left" }}>소모품목명</th>
                    <th style={th}>수량(g)</th><th style={th}>현재 잔량</th><th style={th}></th>
                  </tr></thead>
                  <tbody>
                    {consumes.map((c, i) => {
                      const b = balOf(c);
                      const short = b != null && b < c.act_qty;
                      return (
                        <tr key={i} style={short ? { background: "#fdf6ec" } : undefined}>
                          <td style={tdL}>{c.prod_name} <span className="muted">({nf1(c.prod_qty)}g)</span></td>
                          <td style={tdL}><input value={c.mat_code} onChange={e => setCons(i, { mat_code: e.target.value })} style={{ ...inp, width: 90 }} /></td>
                          <td style={tdL}><input value={c.mat_name} onChange={e => setCons(i, { mat_name: e.target.value })} style={{ ...inp, width: 150 }} /></td>
                          <td style={td}><input type="number" value={c.act_qty || ""} onChange={e => setCons(i, { act_qty: Number(e.target.value) })} style={{ ...inp, width: 100, textAlign: "right" }} /></td>
                          <td style={{ ...td, whiteSpace: "nowrap" }}>{b == null ? <span className="muted">-</span> : <>{nf1(b)}{short && <b style={{ color: "#b5720a" }}> 부족⚠</b>}</>}</td>
                          <td style={{ ...td, textAlign: "center" }}><button className="btn ghost" style={{ padding: "1px 8px", fontSize: 11 }} onClick={() => setConsumes(cs => cs.filter((_, j) => j !== i))}>×</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <button className="btn ghost" style={{ marginTop: 6, fontSize: 12 }} onClick={() => setConsumes(cs => [...cs, { prod_code: "", prod_name: prods[0]?.name || "", mat_code: "", mat_name: "", prod_qty: prods[0]?.qty || 0, act_qty: 0 }])}>+ 소모품목 직접 추가</button>
            </div>
          )}

          {receipts.length > 0 && (
            <div>
              <b style={{ fontSize: 12.5 }}>최근 전표</b>
              <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
                {receipts.slice(0, 8).map(r => (
                  <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, padding: "4px 8px", border: "1px solid var(--line)", borderRadius: 6, opacity: r.status === "CANCELED" ? .5 : 1 }}>
                    <b>{r.rdate}</b>
                    <span className="muted">입고 {inRows.filter(x => x.receipt_id === r.id).length}건{r.note ? ` · ${r.note}` : ""}</span>
                    {r.status === "CANCELED"
                      ? <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--muted)" }}>취소됨</span>
                      : <button className="btn ghost" style={{ marginLeft: "auto", padding: "2px 10px", fontSize: 12, color: "#c0392b" }} disabled={busy} onClick={() => cancel(r)}>전표 취소</button>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="muted" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.6 }}>
            저장하면 생산입고(+)와 원재료 소모(−)가 <b>한 트랜잭션</b>으로 재고에 반영됩니다(하나라도 실패하면 전체 롤백).
            재고부족은 경고만 하고 저장을 막지 않습니다. 전표 취소 시 그 전표가 만든 행이 재고에서 되돌려집니다.
          </p>
        </div>
      ))}
    </div>
  );
}
