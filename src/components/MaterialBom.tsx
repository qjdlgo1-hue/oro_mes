import { useEffect, useMemo, useRef, useState } from "react";
import { Order } from "../lib/types";
import { listBom, upsertBom, logAudit, BomMap } from "../lib/db";
import { can } from "../lib/perm";
import { toast } from "../lib/toast";

const BATCH = 50; // 50g 생산 기준
const num = (n: number) => (Math.round(n * 100) / 100).toLocaleString("ko-KR");

export default function MaterialBom({ orders }: { orders: Order[] }) {
  const canEdit = can("bom.edit");
  const [bom, setBom] = useState<BomMap>({});
  const [ym, setYm] = useState("");
  const [q, setQ] = useState("");
  const bomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { listBom().then(setBom).catch(e => toast.error("불러오기 실패: " + (e.message || e))); }, []);

  const prodOrders = useMemo(() => orders.filter(o => o.gubun === "제품" || o.gubun === "무형상품"), [orders]);
  const products = useMemo(() => {
    const specs = new Map<string, string>(); const custs = new Map<string, Set<string>>();
    prodOrders.forEach(o => { if (!specs.has(o.name)) specs.set(o.name, o.spec); const c = custs.get(o.name) || new Set<string>(); c.add(o.customer); custs.set(o.name, c); });
    let arr = [...specs.entries()].map(([name, spec]) => ({ name, spec, customers: [...(custs.get(name) || [])].join(", ") }));
    if (q.trim()) arr = arr.filter(p => (p.name + p.spec + p.customers).toLowerCase().includes(q.toLowerCase()));
    return arr.sort((a, b) => a.name < b.name ? -1 : 1);
  }, [prodOrders, q]);

  function setVal(name: string, field: "agcn" | "pgc" | "note", v: any) {
    const prev = bom[name] || { agcn: 0, pgc: 0 };
    const next = { ...prev, [field]: field === "note" ? v : Number(v) || 0 };
    setBom(b => ({ ...b, [name]: next }));
    upsertBom(name, { [field]: next[field] } as any).then(() => logAudit("BOM 수정", "bom", name, { [field]: next[field] })).catch(e => toast.error("저장 실패: " + (e.message || e)));
  }

  const months = useMemo(() => [...new Set(orders.map(o => o.ym))].sort((a, b) => a < b ? 1 : -1), [orders]);
  const curYm = ym || months[0] || "";
  const consume = useMemo(() => {
    const rows = prodOrders.filter(o => o.ym === curYm);
    const g = new Map<string, { customer: string; name: string; qty: number; agcn: number; pgc: number; hasBom: boolean }>();
    rows.forEach(o => {
      const key = o.customer + "|" + o.name; const b = bom[o.name]; const f = o.qty / BATCH;
      const e = g.get(key) || { customer: o.customer, name: o.name, qty: 0, agcn: 0, pgc: 0, hasBom: !!b };
      e.qty += o.qty; e.agcn += f * (b?.agcn || 0); e.pgc += f * (b?.pgc || 0); e.hasBom = e.hasBom || !!b; g.set(key, e);
    });
    return [...g.values()].sort((a, b) => a.customer < b.customer ? -1 : a.customer > b.customer ? 1 : (a.name < b.name ? -1 : 1));
  }, [prodOrders, curYm, bom]);
  const totQ = consume.reduce((a, r) => a + r.qty, 0), totAg = consume.reduce((a, r) => a + r.agcn, 0), totPg = consume.reduce((a, r) => a + r.pgc, 0);

  const TH: React.CSSProperties = { background: "var(--navy)", color: "#fff", padding: "6px 8px", fontSize: 12, position: "sticky", top: 0 };
  const TD: React.CSSProperties = { padding: "5px 8px", borderBottom: "1px solid #eef2f7", fontSize: 13 };
  const inp: React.CSSProperties = { width: 90, padding: 5, border: "1px solid var(--line)", borderRadius: 5, textAlign: "right" };

  function focusProduct(name: string) { setQ(name); bomRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card" ref={bomRef}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>제품별 원재료 사용량 (BOM)</h3>
          <span className="muted">기준: <b>50g 생산당</b> 사용량(g) · {canEdit ? "값을 입력하면 자동 저장" : "보기 전용"}</span>
          <input placeholder="품목 검색" value={q} onChange={e => setQ(e.target.value)} style={{ padding: 6, marginLeft: "auto" }} />
        </div>
        <div style={{ overflow: "auto", maxHeight: "45vh" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr>{["품목", "규격", "거래처", "AgCN (50g당, g)", "PGC (50g당, g)", "비고"].map(h => <th key={h} style={{ ...TH, textAlign: h.includes("g)") ? "right" : "left" }}>{h}</th>)}</tr></thead>
            <tbody>
              {products.length === 0 ? <tr><td colSpan={6} style={{ ...TD, textAlign: "center", color: "#888", padding: 24 }}>주문에 등록된 제품이 없습니다.</td></tr> :
                products.map(p => { const b = bom[p.name] || { agcn: 0, pgc: 0, note: "" }; return (
                  <tr key={p.name}>
                    <td style={{ ...TD, fontWeight: 700 }}>{p.name}</td>
                    <td style={{ ...TD, color: "#6b7280" }}>{p.spec}</td>
                    <td style={{ ...TD, color: "#374151" }}>{p.customers}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{canEdit ? <input type="number" inputMode="decimal" style={inp} value={b.agcn || ""} onChange={e => setVal(p.name, "agcn", e.target.value)} /> : num(b.agcn)}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{canEdit ? <input type="number" inputMode="decimal" style={inp} value={b.pgc || ""} onChange={e => setVal(p.name, "pgc", e.target.value)} /> : num(b.pgc)}</td>
                    <td style={TD}>{canEdit ? <input style={{ width: "100%", padding: 5, border: "1px solid var(--line)", borderRadius: 5 }} value={b.note || ""} onChange={e => setVal(p.name, "note", e.target.value)} /> : b.note}</td>
                  </tr>
                ); })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>월별 원재료 소비 <span className="muted">(발주량 ÷ 50 × 사용량)</span></h3>
          <select value={curYm} onChange={e => setYm(e.target.value)} style={{ padding: 6 }}>
            {months.length === 0 && <option>{curYm}</option>}
            {months.map(m => <option key={m} value={m}>{m.slice(0, 4)}년 {+m.slice(5, 7)}월</option>)}
          </select>
        </div>
        {consume.length === 0 ? <p className="muted">이 달 생산(주문)이 없습니다.</p> :
          <div style={{ overflow: "auto", maxHeight: "55vh" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>{["거래처", "품목", "생산량(g)", "AgCN(g)", "PGC(g)"].map(h => <th key={h} style={{ ...TH, textAlign: h.includes("(g)") ? "right" : "left" }}>{h}</th>)}</tr></thead>
              <tbody>
                {consume.map((r, i) => (
                  <tr key={i}>
                    <td style={TD}>{r.customer}</td>
                    <td style={{ ...TD, fontWeight: 700, color: "#2f6cb0", cursor: "pointer", textDecoration: "underline" }} title="위 BOM 입력으로 이동" onClick={() => focusProduct(r.name)}>{r.name}{!r.hasBom && <span style={{ color: "#c0392b", fontSize: 11, textDecoration: "none" }}> ⚠BOM미입력</span>}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{num(r.qty)}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{num(r.agcn)}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{num(r.pgc)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, background: "#e6f0ea" }}>
                  <td style={TD} colSpan={2}>합계</td>
                  <td style={{ ...TD, textAlign: "right" }}>{num(totQ)}</td>
                  <td style={{ ...TD, textAlign: "right", color: "#15663f" }}>{num(totAg)}</td>
                  <td style={{ ...TD, textAlign: "right", color: "#15663f" }}>{num(totPg)}</td>
                </tr>
              </tbody>
            </table>
          </div>}
        <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>※ ⚠BOM미입력 품목은 위 표에서 AgCN·PGC를 입력하면 소비량이 자동 계산됩니다.</p>
      </div>
    </div>
  );
}
