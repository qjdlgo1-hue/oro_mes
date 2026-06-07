import { useEffect, useMemo, useState } from "react";
import { Order, CocData } from "../lib/types";
import { listCocs, upsertCoc } from "../lib/db";

const TODAY = new Date();

function parseSpec(s: string) {
  let size = "", comp = "";
  if (s.includes(":")) { const p = s.split(":"); size = p[0].trim(); comp = p.slice(1).join(":").trim(); }
  else size = s.trim();
  size = size.replace(/^(MSL_|Metco_|SNP_|SNP |Metco )/i, "").trim();
  return { size, comp };
}
function gravitySpec(size: string) {
  if (/16-25/.test(size)) return "9.6 ± 0.05";
  if (/25-32/.test(size)) return "9.5 ± 0.05";
  if (/32-45/.test(size)) return "9.3 ± 0.05";
  return "9.x ± 0.05";
}
function addYear(iso: string) {
  const d = new Date(iso); const e = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${e.getFullYear()}-${p(e.getMonth() + 1)}-${p(e.getDate())}`;
}
function defaults(o: Order): Record<string, string> {
  const { size, comp } = parseSpec(o.spec);
  return {
    customer: o.customer, model: o.name, size, comp,
    prod: o.order_date, exp: addYear(o.order_date), netwt: String(o.qty),
    goldSpec: ">100", goldRes: "", silverSpec: "N/A", silverRes: "N/A",
    gravSpec: gravitySpec(size), gravRes: "",
    cohRes: "0", unpRes: "0", pdSpec: ">90%", pdRes: "", certBy: "",
    method1: "* Cross section polisher / * FE-SEM", method2: "* Gas pycnometer",
    capL: "Optical microscope Data(500x)", capR: "Optical microscope Data(200x)",
  };
}

export default function CocIssue({ orders }: { orders: Order[] }) {
  const [cocs, setCocs] = useState<Record<string, CocData>>({});
  const [sel, setSel] = useState<string | null>(null);
  const [cur, setCur] = useState(() => {
    const months = [...new Set(orders.map(o => o.ym))].sort();
    const last = months[months.length - 1] || `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, "0")}`;
    return { y: +last.slice(0, 4), m: +last.slice(5, 7) };
  });

  useEffect(() => { listCocs().then(setCocs); }, []);

  const ym = `${cur.y}-${String(cur.m).padStart(2, "0")}`;
  const rows = useMemo(() => orders.filter(o => o.ym === ym).sort((a, b) => a.order_date < b.order_date ? -1 : 1), [orders, ym]);
  const months = useMemo(() => [...new Set(orders.map(o => o.ym))].sort(), [orders]);

  const order = orders.find(o => o.id === sel) || null;
  const data: Record<string, string> = order ? { ...defaults(order), ...(cocs[order.id]?.data || {}) } : {};

  function setField(f: string, v: string) {
    if (!order) return;
    const next = { ...data, [f]: v };
    const c: CocData = { order_id: order.id, data: next };
    setCocs(prev => ({ ...prev, [order.id]: c }));
    upsertCoc(c);
  }

  function pickImage(key: string) {
    if (!order) return;
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.onchange = () => {
      const f = inp.files?.[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          const sc = Math.min(1, 520 / img.width);
          c.width = img.width * sc; c.height = img.height * sc;
          c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
          setField(key, c.toDataURL("image/jpeg", 0.8));
        };
        img.src = r.result as string;
      };
      r.readAsDataURL(f);
    };
    inp.click();
  }

  const F = (f: string, style?: React.CSSProperties) =>
    <input className="f" style={style} value={data[f] ?? ""} onChange={e => setField(f, e.target.value)} />;

  return (
    <div className="coc-layout">
      <div className="sidebar no-print">
        <h3>주문 목록</h3>
        <div style={{ padding: 8 }}>
          <select value={ym} onChange={e => { const v = e.target.value; setCur({ y: +v.slice(0, 4), m: +v.slice(5, 7) }); setSel(null); }} style={{ width: "100%", padding: 6 }}>
            {months.length === 0 && <option>{ym}</option>}
            {months.map(m => <option key={m} value={m}>{m.slice(0, 4)}년 {+m.slice(5, 7)}월</option>)}
          </select>
        </div>
        <ul className="olist">
          {rows.map(o =>
            <li key={o.id} className={o.id === sel ? "sel" : ""} onClick={() => setSel(o.id)}>
              <div className="nm">{o.name}</div>
              <div className="meta">{o.customer} · {o.qty.toLocaleString()}g · {o.order_date.slice(5)} · {o.gubun}</div>
            </li>)}
          {rows.length === 0 && <li className="meta" style={{ padding: 14 }}>이 달 주문 없음</li>}
        </ul>
      </div>

      <div className="stage">
        {!order ? <div className="card nodata">왼쪽에서 주문을 선택하세요.</div> :
          <div>
            <div className="no-print" style={{ marginBottom: 8, textAlign: "right" }}>
              <button className="btn green" onClick={() => window.print()}>🖨 인쇄 / PDF 저장</button>
            </div>
            <div className="cert">
              <h2>Certificate of Compliance</h2>
              <div className="sec-title">Product Information</div>
              <table className="info"><tbody>
                <tr><td className="lbl">Manufacturer</td><td>ORO</td><td className="lbl">Customer</td><td>{F("customer")}</td></tr>
                <tr><td className="lbl">Model Name</td><td>{F("model")}</td><td className="lbl">Size</td><td>{F("size")}</td></tr>
                <tr><td className="lbl">Composition</td><td>{F("comp")}</td><td className="lbl">Production Date</td><td>{F("prod")}</td></tr>
                <tr><td className="lbl">Net wt</td><td>{F("netwt", { width: 60 })} g</td><td className="lbl">Expiration Date</td><td>{F("exp")}</td></tr>
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
                  <div className="drop" onClick={() => pickImage("imgL")}>{data.imgL ? <img src={data.imgL} /> : "클릭하여 이미지 추가"}</div></div>
                <div className="imgbox"><div className="cap">{F("capR", { color: "#fff", textAlign: "center" })}</div>
                  <div className="drop" onClick={() => pickImage("imgR")}>{data.imgR ? <img src={data.imgR} /> : "클릭하여 이미지 추가"}</div></div>
              </div>
              <div className="certby">Certified by : <input value={data.certBy ?? ""} onChange={e => setField("certBy", e.target.value)} placeholder="검사자" /></div>
              <div className="footer">809, Dongtandaero 635, Hwaseong-si, Gyeonggi-do, Republic of Korea<br />Tel. 070-8098-0668 &nbsp; E.mail oro_corp@naver.com</div>
            </div>
          </div>}
      </div>
    </div>
  );
}
