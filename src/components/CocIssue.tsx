import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "../lib/toast";
import { Order, CocData, Settings, PlanEntry } from "../lib/types";
import { listCocs, upsertCoc, getSettings, saveSettings, listPlans, logAudit } from "../lib/db";
import { completionDate } from "../lib/plan";
import { parseSpec, gravitySpec, addYear } from "../lib/coc";

const TODAY = new Date();

// prod/exp 는 생산계획에서 자동 계산하므로 defaults 에서 제외
function defaults(o: Order): Record<string, string> {
  const { size, comp } = parseSpec(o.spec);
  return {
    customer: o.customer, model: o.name, size, comp, netwt: String(o.qty),
    goldSpec: ">100", goldRes: "", silverSpec: "N/A", silverRes: "N/A",
    gravSpec: gravitySpec(size), gravRes: "",
    cohRes: "0", unpRes: "0", pdSpec: ">90%", pdRes: "", certBy: "",
    method1: "* Cross section polisher / * FE-SEM", method2: "* Gas pycnometer",
    capL: "Optical microscope Data(500x)", capR: "Optical microscope Data(200x)",
  };
}

function pickImageFile(maxW: number, cb: (durl: string) => void) {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
  inp.onchange = () => {
    const f = inp.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        const sc = Math.min(1, maxW / img.width);
        c.width = img.width * sc; c.height = img.height * sc;
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        cb(c.toDataURL("image/png"));
      };
      img.src = r.result as string;
    };
    r.readAsDataURL(f);
  };
  inp.click();
}

export default function CocIssue({ orders }: { orders: Order[] }) {
  const [cocs, setCocs] = useState<Record<string, CocData>>({});
  const [plans, setPlans] = useState<Record<string, PlanEntry>>({});
  const [settings, setSettings] = useState<Settings>({});
  const [fmtOpen, setFmtOpen] = useState(false);
  const certRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [cur, setCur] = useState(() => {
    const months = [...new Set(orders.map(o => o.ym))].sort();
    const last = months[months.length - 1] || `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, "0")}`;
    return { y: +last.slice(0, 4), m: +last.slice(5, 7) };
  });

  useEffect(() => { listCocs().then(setCocs); listPlans().then(setPlans); getSettings().then(setSettings); }, []);

  const ym = `${cur.y}-${String(cur.m).padStart(2, "0")}`;
  const rows = useMemo(() => orders.filter(o => o.ym === ym).sort((a, b) => a.order_date < b.order_date ? -1 : 1), [orders, ym]);
  const months = useMemo(() => [...new Set(orders.map(o => o.ym))].sort(), [orders]);

  const order = orders.find(o => o.id === sel) || null;
  const data: Record<string, string> = order ? { ...defaults(order), ...(cocs[order.id]?.data || {}) } : {};

  // 생산완료일(계획 마지막날) → Production Date 자동 반영. data.prod 가 있으면 직접수정으로 간주.
  const planProd = order ? completionDate(plans[order.id]) : null;
  const prodManual = !!(order && cocs[order.id]?.data?.prod);
  const effProd = (order && cocs[order.id]?.data?.prod) || planProd || order?.order_date || "";
  const effExp = addYear(effProd);

  function setField(f: string, v: string) {
    if (!order) return;
    const next = { ...data, [f]: v };
    const c: CocData = { order_id: order.id, data: next };
    setCocs(prev => ({ ...prev, [order.id]: c }));
    upsertCoc(c);
  }
  function clearProd() { // 직접수정 해제 → 다시 생산계획 자동
    if (!order) return;
    const next = { ...data }; delete next.prod;
    const c: CocData = { order_id: order.id, data: next };
    setCocs(prev => ({ ...prev, [order.id]: c }));
    upsertCoc(c);
  }
  function pickPerCoc(key: string) { pickImageFile(520, durl => setField(key, durl)); }
  function setLogo() { pickImageFile(400, durl => { const s = { ...settings, logo: durl }; setSettings(s); saveSettings(s); }); }
  function setStamp() { pickImageFile(300, durl => { const s = { ...settings, stamp: durl }; setSettings(s); saveSettings(s); }); }
  const fmt = settings.format || {};
  function setFmt(patch: any) { const nf = { ...fmt, ...patch }; const s = { ...settings, format: nf }; setSettings(s); saveSettings(s); }
  async function savePdf() {
    if (!order || !certRef.current) return;
    try {
      toast.success("PDF 만드는 중…");
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
      const canvas = await html2canvas(certRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const paper = fmt.paper || "A4";
      const pdf = new jsPDF({ unit: "mm", format: paper === "Letter" ? "letter" : "a4" });
      const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
      const m = fmt.marginMm ?? 10; const iw = pw - m * 2;
      const pagePx = Math.floor((ph - m * 2) * canvas.width / iw);
      let sY = 0, first = true;
      while (sY < canvas.height) {
        const h = Math.min(pagePx, canvas.height - sY);
        const slice = document.createElement("canvas"); slice.width = canvas.width; slice.height = h;
        slice.getContext("2d")!.drawImage(canvas, 0, sY, canvas.width, h, 0, 0, canvas.width, h);
        if (!first) pdf.addPage();
        pdf.addImage(slice.toDataURL("image/jpeg", 0.95), "JPEG", m, m, iw, h * iw / canvas.width);
        sY += h; first = false;
      }
      pdf.save(`COC_${(data.model || "성적서")}_${(effProd || "")}.pdf`.replace(/\s/g, ""));
      logAudit("COC PDF 저장", "coc", order.id, { name: order.name });
    } catch (e: any) { toast.error("PDF 생성 실패: " + (e.message || e)); }
  }

  const F = (f: string, style?: React.CSSProperties) =>
    <input className="f" style={style} value={data[f] ?? ""} onChange={e => setField(f, e.target.value)} />;

  return (
    <div className="coc-layout">
      <div className="sidebar no-print">
        <h3>주문 목록</h3>
        <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <select value={ym} onChange={e => { const v = e.target.value; setCur({ y: +v.slice(0, 4), m: +v.slice(5, 7) }); setSel(null); }} style={{ width: "100%", padding: 6 }}>
            {months.length === 0 && <option>{ym}</option>}
            {months.map(m => <option key={m} value={m}>{m.slice(0, 4)}년 {+m.slice(5, 7)}월</option>)}
          </select>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn ghost" style={{ flex: 1, fontSize: 12 }} onClick={setLogo}>로고 설정{settings.logo ? " ✓" : ""}</button>
            <button className="btn ghost" style={{ flex: 1, fontSize: 12 }} onClick={setStamp}>도장 설정{settings.stamp ? " ✓" : ""}</button>
          </div>
          <button className="btn ghost" style={{ fontSize: 12, marginTop: 6, width: "100%" }} onClick={() => setFmtOpen(o => !o)}>서식 설정 {fmtOpen ? "▲" : "▼"}</button>
          {fmtOpen &&
            <div style={{ padding: 8, background: "#f5f9ff", borderRadius: 8, marginTop: 6, fontSize: 12 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <label style={{ flex: 1 }}>용지<select value={fmt.paper || "A4"} onChange={e => setFmt({ paper: e.target.value })} style={{ width: "100%", padding: 5 }}><option>A4</option><option>Letter</option></select></label>
                <label style={{ flex: 1 }}>여백(mm)<input type="number" inputMode="numeric" value={fmt.marginMm ?? 10} onChange={e => setFmt({ marginMm: Number(e.target.value) })} style={{ width: "100%", padding: 5 }} /></label>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <label style={{ flex: 1 }}>로고 높이(px)<input type="number" inputMode="numeric" value={fmt.logoH ?? 46} onChange={e => setFmt({ logoH: Number(e.target.value) })} style={{ width: "100%", padding: 5 }} /></label>
                <label style={{ flex: 1 }}>글자 배율<input type="number" step={0.05} value={fmt.fontScale ?? 1} onChange={e => setFmt({ fontScale: Number(e.target.value) })} style={{ width: "100%", padding: 5 }} /></label>
              </div>
              <label>푸터 1줄<input value={fmt.footer1 ?? ""} placeholder="회사 주소" onChange={e => setFmt({ footer1: e.target.value })} style={{ width: "100%", padding: 5, marginBottom: 4 }} /></label>
              <label>푸터 2줄<input value={fmt.footer2 ?? ""} placeholder="Tel / E.mail" onChange={e => setFmt({ footer2: e.target.value })} style={{ width: "100%", padding: 5 }} /></label>
              <p className="muted" style={{ fontSize: 10, marginTop: 6 }}>서식은 모든 COC에 공통 적용됩니다.</p>
            </div>}
        </div>
        <ul className="olist">
          {rows.map(o => {
            const cp = completionDate(plans[o.id]);
            const dn = !!plans[o.id]?.done;
            return (
              <li key={o.id} className={o.id === sel ? "sel" : ""} onClick={() => setSel(o.id)}>
                <div className="nm">{o.name}</div>
                <div className="meta">{o.customer} · {o.qty.toLocaleString()}g · 주문 {o.order_date.slice(5)}{cp ? ` · 완료 ${cp.slice(5)}` : ""}{dn ? " ✅" : ""}</div>
              </li>
            );
          })}
          {rows.length === 0 && <li className="meta" style={{ padding: 14 }}>이 달 주문 없음</li>}
        </ul>
      </div>

      <div className="stage">
        {!order ? <div className="card nodata">왼쪽에서 주문을 선택하세요.</div> :
          <div>
            <div className="no-print" style={{ marginBottom: 8, textAlign: "right" }}>
              <button className="btn green" onClick={savePdf}>📄 PDF 저장</button>
              <button className="btn ghost" style={{ marginLeft: 8 }} onClick={() => { logAudit("COC 인쇄", "coc", order.id, { name: order.name }); window.print(); }}>🖨 인쇄</button>
            </div>
            <div className="cert" ref={certRef} style={{ zoom: fmt.fontScale || 1 } as any}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                {settings.logo ? <img src={settings.logo} style={{ maxHeight: fmt.logoH || 46, maxWidth: 220 }} /> : <span style={{ width: 1 }} />}
                <span className="muted" style={{ fontSize: 10 }}>{settings.company || ""}</span>
              </div>
              <h2>Certificate of Compliance</h2>
              <div className="sec-title">Product Information</div>
              <table className="info"><tbody>
                <tr><td className="lbl">Manufacturer</td><td>ORO</td><td className="lbl">Customer</td><td>{F("customer")}</td></tr>
                <tr><td className="lbl">Model Name</td><td>{F("model")}</td><td className="lbl">Size</td><td>{F("size")}</td></tr>
                <tr>
                  <td className="lbl">Composition</td><td>{F("comp")}</td>
                  <td className="lbl">Production Date</td>
                  <td>
                    <input className="f" value={effProd} onChange={e => setField("prod", e.target.value)} />
                    <div className="no-print" style={{ fontSize: 9, color: prodManual ? "#c0392b" : "#1aa260", lineHeight: 1.2 }}>
                      {prodManual
                        ? <>직접수정됨 <span style={{ color: "#2f6cb0", cursor: "pointer", textDecoration: "underline" }} onClick={clearProd}>↻ 생산계획 완료일로</span></>
                        : (planProd ? "생산계획 완료일 자동" : "생산계획 없음 → 주문일 사용")}
                    </div>
                  </td>
                </tr>
                <tr><td className="lbl">Net wt</td><td>{F("netwt", { width: 60 })} g</td><td className="lbl">Expiration Date</td><td>{effExp} <span className="no-print muted" style={{ fontSize: 9 }}>(생산일+1년 자동)</span></td></tr>
              </tbody></table>
              <div className="sec-title">Thickness (Average)</div>
              <div className="method">{F("method1")}</div>
              <table className="spec"><tbody>
                <tr><th>Item</th><th>Unit</th><th>Specification</th><th>Result</th></tr>
                <tr><td className="item">Gold</td><td>nm</td><td>{F("goldSpec", { textAlign: "center" })}</td><td>{F("goldRes", { textAlign: "center" })}</td></tr>
                <tr><td className="item">Silver</td><td>nm</td><td>{F("silverSpec", { textAlign: "center" })}</td><td>{F("silverRes", { textAlign: "center" })}</td></tr>
              </tbody></table>
              <div className="sec-title">Specific gravity</div>
              <div className="method">{F("method2")}</div>
              <table className="spec"><tbody>
                <tr><th>Item</th><th>Unit</th><th>Specification</th><th>Result</th></tr>
                <tr><td className="item">Specific gravity</td><td>g/cm³</td><td>{F("gravSpec", { textAlign: "center" })}</td><td>{F("gravRes", { textAlign: "center" })}</td></tr>
              </tbody></table>
              <div className="sec-title">Visual Inspection</div>
              <div className="method">* Optical microscope</div>
              <table className="spec"><tbody>
                <tr><th>Item</th><th>Unit</th><th>Specification</th><th>Result</th></tr>
                <tr><td className="item">Cohesion</td><td>EA</td><td>C=0</td><td>{F("cohRes", { textAlign: "center" })}</td></tr>
                <tr><td className="item">Unplated</td><td>EA</td><td>C=0</td><td>{F("unpRes", { textAlign: "center" })}</td></tr>
                <tr><td className="item">Particle Density</td><td>%</td><td>{F("pdSpec", { textAlign: "center" })}</td><td>{F("pdRes", { textAlign: "center" })}</td></tr>
              </tbody></table>
              <div className="imgs">
                <div className="imgbox"><div className="cap">{F("capL", { color: "#fff", textAlign: "center" })}</div>
                  <div className="drop" onClick={() => pickPerCoc("imgL")}>{data.imgL ? <img src={data.imgL} /> : "클릭하여 이미지 추가"}</div></div>
                <div className="imgbox"><div className="cap">{F("capR", { color: "#fff", textAlign: "center" })}</div>
                  <div className="drop" onClick={() => pickPerCoc("imgR")}>{data.imgR ? <img src={data.imgR} /> : "클릭하여 이미지 추가"}</div></div>
              </div>
              <div className="certby" style={{ position: "relative" }}>
                Certified by : <input value={data.certBy ?? ""} onChange={e => setField("certBy", e.target.value)} placeholder="검사자" />
                {settings.stamp && <img src={settings.stamp} style={{ height: 60, position: "absolute", right: 0, top: -18 }} />}
              </div>
              <div className="footer">{fmt.footer1 || "809, Dongtandaero 635, Hwaseong-si, Gyeonggi-do, Republic of Korea"}<br />{fmt.footer2 || "Tel. 070-8098-0668 \u00a0 E.mail oro_corp@naver.com"}</div>
            </div>
          </div>}
      </div>
    </div>
  );
}
