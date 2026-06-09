import { useEffect, useMemo, useRef, useState } from "react";
import { Order, CocData, Settings, PlanEntry } from "../lib/types";
import { listCocs, upsertCoc, getSettings, saveSettings, listPlans, logAudit, storageUpload, storageBlobToDataUrl } from "../lib/db";
import { completionDate } from "../lib/plan";
import { parseSpec, gravitySpec, addYear } from "../lib/coc";
import { can } from "../lib/perm";
import { toast } from "../lib/toast";
import { supabase } from "../lib/supabase";

const TODAY = new Date();
const todayIso = () => new Date().toISOString().slice(0, 10);

const L = {
  ko: { title: "성적서", sub: "Certificate of Compliance", pinfo: "제품 정보", manu: "제조사", cust: "고객사", model: "모델명", size: "사이즈", comp: "조성", prod: "생산일", netwt: "중량", exp: "유효기간", thick: "두께 (평균)", item: "항목", unit: "단위", spec: "규격", result: "결과", gold: "금", silver: "은", sg: "비중", visual: "외관검사", coh: "응집", unp: "미도금", pd: "입자밀도", cert: "검사자", overall: "종합판정", issue: "발행번호" },
  en: { title: "Certificate of Compliance", sub: "", pinfo: "Product Information", manu: "Manufacturer", cust: "Customer", model: "Model Name", size: "Size", comp: "Composition", prod: "Production Date", netwt: "Net wt", exp: "Expiration Date", thick: "Thickness (Average)", item: "Item", unit: "Unit", spec: "Specification", result: "Result", gold: "Gold", silver: "Silver", sg: "Specific gravity", visual: "Visual Inspection", coh: "Cohesion", unp: "Unplated", pd: "Particle Density", cert: "Certified by", overall: "Overall", issue: "No." },
};

function judge(spec: string, res: string): "PASS" | "FAIL" | "" {
  const s = (spec || "").trim(), r = (res || "").trim();
  if (!s || /n\/a/i.test(s) || !r || /n\/a/i.test(r)) return "";
  const num = parseFloat(r.replace(/[^0-9.\-]/g, "")); if (isNaN(num)) return "";
  let m = s.match(/([0-9.]+)\s*±\s*([0-9.]+)/); if (m) { const c = +m[1], d = +m[2]; return num >= c - d && num <= c + d ? "PASS" : "FAIL"; }
  m = s.match(/(>=|<=|>|<)\s*([0-9.]+)/); if (m) { const n = +m[2]; const ok = m[1] === ">" ? num > n : m[1] === ">=" ? num >= n : m[1] === "<" ? num < n : num <= n; return ok ? "PASS" : "FAIL"; }
  m = s.match(/=\s*([0-9.]+)/); if (m) return num === +m[1] ? "PASS" : "FAIL";
  return "";
}

function parseSpecDefaults(o: Order): Record<string, string> {
  const { size, comp } = parseSpec(o.spec);
  return {
    customer: o.customer, model: o.name, size, comp, netwt: String(o.qty),
    goldSpec: ">100", goldRes: "", silverSpec: "N/A", silverRes: "N/A",
    gravSpec: gravitySpec(size), gravRes: "", cohRes: "0", unpRes: "0", pdSpec: ">90%", pdRes: "", certBy: "",
    method1: "* Cross section polisher / * FE-SEM", method2: "* Gas pycnometer",
    capL: "Optical microscope Data(500x)", capR: "Optical microscope Data(200x)",
  };
}

function pickFile(cb: (f: File) => void) {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
  inp.onchange = () => { const f = inp.files?.[0]; if (f) cb(f); }; inp.click();
}
function pickDataUrl(maxW: number, cb: (d: string) => void) {
  pickFile(f => { const r = new FileReader(); r.onload = () => { const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); const sc = Math.min(1, maxW / img.width); c.width = img.width * sc; c.height = img.height * sc; c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height); cb(c.toDataURL("image/png")); }; img.src = r.result as string; }; r.readAsDataURL(f); });
}

export default function CocIssue({ orders }: { orders: Order[] }) {
  const [cocs, setCocs] = useState<Record<string, CocData>>({});
  const [plans, setPlans] = useState<Record<string, PlanEntry>>({});
  const [settings, setSettings] = useState<Settings>({});
  const [sel, setSel] = useState<string | null>(null);
  const [lang, setLang] = useState<"ko" | "en">("en");
  const [fmtOpen, setFmtOpen] = useState(false);
  const [imgCache, setImgCache] = useState<Record<string, string>>({});
  const [email, setEmail] = useState("");
  const certRef = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(() => {
    const months = [...new Set(orders.map(o => o.ym))].sort();
    const last = months[months.length - 1] || `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, "0")}`;
    return { y: +last.slice(0, 4), m: +last.slice(5, 7) };
  });

  useEffect(() => { listCocs().then(setCocs); listPlans().then(setPlans); getSettings().then(setSettings); supabase?.auth.getUser().then(({ data }) => setEmail(data.user?.email || "")); }, []);

  const ym = `${cur.y}-${String(cur.m).padStart(2, "0")}`;
  const rows = useMemo(() => orders.filter(o => o.ym === ym).sort((a, b) => a.order_date < b.order_date ? -1 : 1), [orders, ym]);
  const months = useMemo(() => [...new Set(orders.map(o => o.ym))].sort(), [orders]);
  const order = orders.find(o => o.id === sel) || null;
  const data: Record<string, string> = order ? { ...parseSpecDefaults(order), ...(cocs[order.id]?.data || {}) } : {};
  const t = L[lang];
  const fmt = settings.format || {};

  const planProd = order ? completionDate(plans[order.id]) : null;
  const prodManual = !!(order && cocs[order.id]?.data?.prod);
  const effProd = (order && cocs[order.id]?.data?.prod) || planProd || order?.order_date || "";
  const effExp = addYear(effProd);

  // 이미지(Storage) → dataURL 해소
  useEffect(() => {
    if (!order) return; const d = cocs[order.id]?.data || {};
    (["imgL_path", "imgR_path"] as const).forEach(k => { const p = (d as any)[k]; if (p && !imgCache[p]) storageBlobToDataUrl("coc", p).then(u => { if (u) setImgCache(c => ({ ...c, [p]: u })); }); });
  }, [sel, cocs]);
  const imgSrc = (key: "imgL" | "imgR") => { const p = data[key + "_path"]; return p ? imgCache[p] : data[key]; };

  function setField(f: string, v: string) { if (!order) return; const next = { ...data, [f]: v }; const c: CocData = { order_id: order.id, data: next }; setCocs(prev => ({ ...prev, [order.id]: c })); upsertCoc(c); }
  function setMany(patch: Record<string, string>) { if (!order) return; const next = { ...data, ...patch }; const c: CocData = { order_id: order.id, data: next }; setCocs(prev => ({ ...prev, [order.id]: c })); upsertCoc(c); }
  function clearProd() { if (!order) return; const next = { ...data }; delete next.prod; const c: CocData = { order_id: order.id, data: next }; setCocs(prev => ({ ...prev, [order.id]: c })); upsertCoc(c); }
  function setLogo() { pickDataUrl(400, d => { const s = { ...settings, logo: d }; setSettings(s); saveSettings(s); }); }
  function setStamp() { pickDataUrl(300, d => { const s = { ...settings, stamp: d }; setSettings(s); saveSettings(s); }); }
  function setFmt(patch: any) { const nf = { ...fmt, ...patch }; const s = { ...settings, format: nf }; setSettings(s); saveSettings(s); }
  async function pickCocImage(key: "imgL" | "imgR") {
    pickFile(async f => { try { const path = await storageUpload("coc", f); const url = await storageBlobToDataUrl("coc", path); if (url) setImgCache(c => ({ ...c, [path]: url })); setField(key + "_path", path); toast.success("이미지 저장됨"); } catch (e: any) { toast.error("업로드 실패: " + (e.message || e)); } });
  }

  function nextIssueNo() {
    const y = new Date().getFullYear(); let max = 0;
    Object.values(cocs).forEach(c => { const n = (c.data as any)?.issueNo; if (n) { const m = String(n).match(new RegExp(`ORO-${y}-(\\d+)`)); if (m) max = Math.max(max, +m[1]); } });
    return `ORO-${y}-${String(max + 1).padStart(4, "0")}`;
  }
  function issue() {
    if (!order) return;
    const issueNo = data.issueNo || nextIssueNo();
    const version = String((Number(data.version) || 0) + 1);
    setMany({ issueNo, issuedAt: todayIso(), issuedBy: email, version });
    logAudit("COC 발행", "coc", order.id, { issueNo, version });
    toast.success(`발행 확정: ${issueNo} (v${version})`);
  }

  async function savePdf() {
    if (!order || !certRef.current) return;
    try {
      toast.success("PDF 만드는 중…");
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
      const canvas = await html2canvas(certRef.current, { scale: 2, backgroundColor: "#ffffff" });
      const pdf = new jsPDF({ unit: "mm", format: (fmt.paper === "Letter" ? "letter" : "a4") });
      const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(); const m = fmt.marginMm ?? 10; const iw = pw - m * 2;
      const pagePx = Math.floor((ph - m * 2) * canvas.width / iw); let sY = 0, first = true;
      while (sY < canvas.height) {
        const h = Math.min(pagePx, canvas.height - sY);
        const slice = document.createElement("canvas"); slice.width = canvas.width; slice.height = h;
        slice.getContext("2d")!.drawImage(canvas, 0, sY, canvas.width, h, 0, 0, canvas.width, h);
        if (!first) pdf.addPage();
        pdf.addImage(slice.toDataURL("image/jpeg", 0.95), "JPEG", m, m, iw, h * iw / canvas.width);
        sY += h; first = false;
      }
      pdf.save(`COC_${data.issueNo || data.model || "성적서"}.pdf`.replace(/\s/g, ""));
      logAudit("COC PDF 저장", "coc", order.id, { issueNo: data.issueNo });
    } catch (e: any) { toast.error("PDF 생성 실패: " + (e.message || e)); }
  }

  // 판정
  const judges = order ? {
    sg: judge(data.gravSpec, data.gravRes),
    coh: judge("C=0", data.cohRes), unp: judge("C=0", data.unpRes), pd: judge(data.pdSpec, data.pdRes),
  } : {};
  const anyFail = Object.values(judges).includes("FAIL");
  const anyJudged = Object.values(judges).some(v => v);
  const overall = anyJudged ? (anyFail ? "FAIL" : "PASS") : "";

  // styles
  const fI: React.CSSProperties = { width: "100%", padding: 6, border: "1px solid var(--line)", borderRadius: 5, fontSize: 13 };
  const lb: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#475569" };
  const Badge = ({ v }: { v: string }) => v ? <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: v === "PASS" ? "#1aa260" : "#c0392b", borderRadius: 4, padding: "1px 5px", marginLeft: 6 }}>{v}</span> : null;

  function F(field: string, label: string, w?: string) {
    return <div style={{ width: w || "auto" }}><label style={lb}>{label}</label><input style={fI} value={data[field] ?? ""} onChange={e => setField(field, e.target.value)} /></div>;
  }

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
            <button className="btn ghost" style={{ flex: 1, fontSize: 12 }} onClick={setLogo}>로고{settings.logo ? " ✓" : ""}</button>
            <button className="btn ghost" style={{ flex: 1, fontSize: 12 }} onClick={setStamp}>도장{settings.stamp ? " ✓" : ""}</button>
          </div>
          <button className="btn ghost" style={{ fontSize: 12 }} onClick={() => setFmtOpen(o => !o)}>서식 설정 {fmtOpen ? "▲" : "▼"}</button>
          {fmtOpen &&
            <div style={{ padding: 8, background: "#f5f9ff", borderRadius: 8, fontSize: 12 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <label style={{ flex: 1 }}>용지<select value={fmt.paper || "A4"} onChange={e => setFmt({ paper: e.target.value })} style={{ width: "100%", padding: 5 }}><option>A4</option><option>Letter</option></select></label>
                <label style={{ flex: 1 }}>여백mm<input type="number" value={fmt.marginMm ?? 10} onChange={e => setFmt({ marginMm: Number(e.target.value) })} style={{ width: "100%", padding: 5 }} /></label>
              </div>
              <label>로고높이px<input type="number" value={fmt.logoH ?? 46} onChange={e => setFmt({ logoH: Number(e.target.value) })} style={{ width: "100%", padding: 5, marginBottom: 4 }} /></label>
              <label>머리말(상단)<input value={fmt.header ?? ""} onChange={e => setFmt({ header: e.target.value })} placeholder="예: ORO 주식회사 / 품질보증서" style={{ width: "100%", padding: 5, marginBottom: 4 }} /></label>
              <label>푸터1<input value={fmt.footer1 ?? ""} onChange={e => setFmt({ footer1: e.target.value })} style={{ width: "100%", padding: 5, marginBottom: 4 }} /></label>
              <label>푸터2<input value={fmt.footer2 ?? ""} onChange={e => setFmt({ footer2: e.target.value })} style={{ width: "100%", padding: 5 }} /></label>
            </div>}
        </div>
        <ul className="olist">
          {rows.map(o => { const cp = completionDate(plans[o.id]); const dn = !!plans[o.id]?.done; const iss = (cocs[o.id]?.data as any)?.issueNo; return (
            <li key={o.id} className={o.id === sel ? "sel" : ""} onClick={() => setSel(o.id)}>
              <div className="nm">{o.name}{iss ? ` · ${iss}` : ""}</div>
              <div className="meta">{o.customer} · {o.qty.toLocaleString()}g · 주문 {o.order_date.slice(5)}{cp ? ` · 완료 ${cp.slice(5)}` : ""}{dn ? " ✅" : ""}</div>
            </li>
          ); })}
          {rows.length === 0 && <li className="meta" style={{ padding: 14 }}>이 달 주문 없음</li>}
        </ul>
      </div>

      <div className="stage" style={{ flexDirection: "column", alignItems: "stretch" }}>
        {!order ? <div className="card nodata">왼쪽에서 주문을 선택하세요.</div> : <>
          {/* 입력 폼 */}
          <div className="card no-print" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <h3 style={{ margin: 0 }}>성적서 입력 {data.issueNo ? <span style={{ color: "#1aa260", fontSize: 13 }}>· {data.issueNo} (v{data.version})</span> : <span className="muted" style={{ fontSize: 12 }}>· 미발행</span>}</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn ghost" onClick={() => setLang(l => l === "ko" ? "en" : "ko")}>{lang === "ko" ? "EN" : "국문"}</button>
                <button className="btn" onClick={issue}>📋 발행 확정</button>
                <button className="btn green" onClick={savePdf}>📄 PDF 저장</button>
                <button className="btn ghost" onClick={() => { logAudit("COC 인쇄", "coc", order.id, {}); window.print(); }}>🖨 인쇄</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
              {F("customer", "고객사")}{F("model", "모델명")}{F("size", "사이즈")}{F("comp", "조성")}
              {F("netwt", "중량(g)")}
              <div><label style={lb}>생산일</label><input style={fI} value={effProd} onChange={e => setField("prod", e.target.value)} /><div style={{ fontSize: 9, color: prodManual ? "#c0392b" : "#1aa260" }}>{prodManual ? <>직접수정 <span style={{ color: "#2f6cb0", cursor: "pointer", textDecoration: "underline" }} onClick={clearProd}>↻자동</span></> : "생산계획 자동"}</div></div>
              <div><label style={lb}>유효기간</label><input style={{ ...fI, background: "#f3f4f6" }} value={effExp} readOnly /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginTop: 10 }}>
              {F("gravSpec", "비중 규격")}{F("gravRes", "비중 결과")}
              {F("cohRes", "응집 결과")}{F("unpRes", "미도금 결과")}{F("pdSpec", "입자밀도 규격")}{F("pdRes", "입자밀도 결과")}
              {F("certBy", "검사자")}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <div>{F("capL", "이미지1 제목")}<button className="btn ghost" style={{ marginTop: 4, fontSize: 12 }} onClick={() => pickCocImage("imgL")}>이미지1 업로드{imgSrc("imgL") ? " ✓" : ""}</button></div>
              <div>{F("capR", "이미지2 제목")}<button className="btn ghost" style={{ marginTop: 4, fontSize: 12 }} onClick={() => pickCocImage("imgR")}>이미지2 업로드{imgSrc("imgR") ? " ✓" : ""}</button></div>
            </div>
          </div>

          {/* 미리보기(읽기전용) = 인쇄/PDF 대상 */}
          <div className="cert" ref={certRef}>
            {fmt.header && <div style={{ textAlign: "center", fontSize: 12, color: "#555", marginBottom: 6, borderBottom: "1px solid #eee", paddingBottom: 4 }}>{fmt.header}</div>}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              {settings.logo ? <img src={settings.logo} style={{ maxHeight: fmt.logoH || 46, maxWidth: 220 }} /> : <span style={{ width: 1 }} />}
              <span style={{ fontSize: 11, color: "#555" }}>{data.issueNo ? `${t.issue}: ${data.issueNo}` : ""}</span>
            </div>
            <h2>{t.title}{lang === "ko" && t.sub ? <span style={{ fontSize: 14, display: "block", color: "#555" }}>{t.sub}</span> : ""}</h2>
            {overall && <div style={{ textAlign: "right", marginTop: -10, marginBottom: 6 }}><span style={{ fontWeight: 700, color: overall === "PASS" ? "#1aa260" : "#c0392b" }}>{t.overall}: {overall}</span></div>}
            <div className="sec-title">{t.pinfo}</div>
            <table className="info"><tbody>
              <tr><td className="lbl">{t.manu}</td><td>ORO</td><td className="lbl">{t.cust}</td><td>{data.customer}</td></tr>
              <tr><td className="lbl">{t.model}</td><td>{data.model}</td><td className="lbl">{t.size}</td><td>{data.size}</td></tr>
              <tr><td className="lbl">{t.comp}</td><td>{data.comp}</td><td className="lbl">{t.prod}</td><td>{effProd}</td></tr>
              <tr><td className="lbl">{t.netwt}</td><td>{data.netwt}g</td><td className="lbl">{t.exp}</td><td>{effExp}</td></tr>
            </tbody></table>
            <div className="sec-title">{t.sg}</div>
            <div className="method">{data.method2}</div>
            <table className="spec"><tbody>
              <tr><th>{t.item}</th><th>{t.unit}</th><th>{t.spec}</th><th>{t.result}</th></tr>
              <tr><td className="item">{t.sg}</td><td>g/cm³</td><td>{data.gravSpec}</td><td>{data.gravRes}<Badge v={judges.sg!} /></td></tr>
            </tbody></table>
            <div className="sec-title">{t.visual}</div>
            <div className="method">* Optical microscope</div>
            <table className="spec"><tbody>
              <tr><th>{t.item}</th><th>{t.unit}</th><th>{t.spec}</th><th>{t.result}</th></tr>
              <tr><td className="item">{t.coh}</td><td>EA</td><td>C=0</td><td>{data.cohRes}<Badge v={judges.coh!} /></td></tr>
              <tr><td className="item">{t.unp}</td><td>EA</td><td>C=0</td><td>{data.unpRes}<Badge v={judges.unp!} /></td></tr>
              <tr><td className="item">{t.pd}</td><td>%</td><td>{data.pdSpec}</td><td>{data.pdRes}<Badge v={judges.pd!} /></td></tr>
            </tbody></table>
            <div className="imgs">
              <div className="imgbox"><div className="cap">{data.capL}</div><div className="drop">{imgSrc("imgL") ? <img src={imgSrc("imgL")} /> : <span style={{ color: "#bbb" }}>이미지 없음</span>}</div></div>
              <div className="imgbox"><div className="cap">{data.capR}</div><div className="drop">{imgSrc("imgR") ? <img src={imgSrc("imgR")} /> : <span style={{ color: "#bbb" }}>이미지 없음</span>}</div></div>
            </div>
            <div className="certby" style={{ position: "relative" }}>
              {t.cert} : {data.certBy}
              {settings.stamp && <img src={settings.stamp} style={{ height: 60, position: "absolute", right: 0, top: -18 }} />}
            </div>
            <div className="footer">{fmt.footer1 || "809, Dongtandaero 635, Hwaseong-si, Gyeonggi-do, Republic of Korea"}<br />{fmt.footer2 || "Tel. 070-8098-0668   E.mail oro_corp@naver.com"}{data.issuedAt ? `  |  발행일 ${data.issuedAt}` : ""}</div>
          </div>
        </>}
      </div>
    </div>
  );
}
