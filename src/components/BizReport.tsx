import { useEffect, useMemo, useState } from "react";
import { errMsg } from "../lib/errmsg";
import { toast } from "../lib/toast";
import { confirmDialog } from "../lib/confirm";
import { nf, todayIso } from "../lib/fmt";
import { usePaged } from "../lib/usePaged";
import {
  InoutRow, ProdConsume, listInout, listOrders, listPlans, listReceipts, listProdConsume,
  BizReport as BizReportRow, listBizReports, getBizReport, saveBizReport, deleteBizReport, aiBizReport, logAudit,
} from "../lib/db";
import { Order, PlanEntry, Receipt } from "../lib/types";
import { aggregateKpis, ruleReport, periodLabel, Kpis, PeriodType } from "../lib/bizreport";
import MonthPicker from "./MonthPicker";

// 외부 라이브러리 없이 보고서 마크다운(헤딩/굵게/불릿/표/구분선)만 렌더하는 경량 렌더러
function Md({ src }: { src: string }) {
  const nodes = useMemo(() => {
    const out: React.ReactNode[] = [];
    const lines = src.split("\n");
    const inline = (s: string) => {
      const parts = s.split(/(\*\*[^*]+\*\*)/g);
      return parts.map((p, i) => p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p);
    };
    let i = 0, key = 0;
    while (i < lines.length) {
      const ln = lines[i];
      if (/^\s*$/.test(ln)) { i++; continue; }
      if (ln.startsWith("|")) { // 표 블록
        const rows: string[][] = [];
        while (i < lines.length && lines[i].startsWith("|")) {
          const cells = lines[i].replace(/^\||\|$/g, "").split("|").map(c => c.trim());
          if (!cells.every(c => /^:?-{2,}:?$/.test(c))) rows.push(cells);
          i++;
        }
        out.push(
          <div key={key++} style={{ overflowX: "auto", margin: "8px 0" }}>
            <table className="brep-t"><thead><tr>{rows[0]?.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
              <tbody>{rows.slice(1).map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j} style={{ textAlign: j > 0 ? "right" : "left" }}>{inline(c)}</td>)}</tr>)}</tbody></table>
          </div>);
        continue;
      }
      if (ln.startsWith("- ") || ln.startsWith("  - ")) { // 불릿 블록
        const items: { d: number; t: string }[] = [];
        while (i < lines.length && /^(\s*)-\s/.test(lines[i])) { items.push({ d: lines[i].startsWith("  ") ? 1 : 0, t: lines[i].replace(/^\s*-\s/, "") }); i++; }
        out.push(<ul key={key++} style={{ margin: "6px 0", paddingLeft: 22 }}>{items.map((it, j) => <li key={j} style={{ marginLeft: it.d * 16, fontSize: 13.5, lineHeight: 1.65 }}>{inline(it.t)}</li>)}</ul>);
        continue;
      }
      if (ln.startsWith("### ")) out.push(<h4 key={key++} style={{ margin: "14px 0 4px" }}>{inline(ln.slice(4))}</h4>);
      else if (ln.startsWith("## ")) out.push(<h3 key={key++} style={{ margin: "18px 0 6px", borderBottom: "1px solid var(--line)", paddingBottom: 4 }}>{inline(ln.slice(3))}</h3>);
      else if (ln.startsWith("# ")) out.push(<h2 key={key++} style={{ margin: "4px 0 8px" }}>{inline(ln.slice(2))}</h2>);
      else if (/^---+$/.test(ln)) out.push(<hr key={key++} style={{ border: 0, borderTop: "1px solid var(--line)", margin: "14px 0" }} />);
      else out.push(<p key={key++} style={{ margin: "6px 0", fontSize: 13.5, lineHeight: 1.7 }}>{inline(ln.startsWith("*") && ln.endsWith("*") && !ln.startsWith("**") ? ln.slice(1, -1) : ln)}</p>);
      i++;
    }
    return out;
  }, [src]);
  return <div className="brep-md">{nodes}</div>;
}

const lastMonthKey = () => { const t = new Date(); const d = new Date(t.getFullYear(), t.getMonth() - 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

export default function BizReport() {
  const [ptype, setPtype] = useState<PeriodType>("month");
  const [ym, setYm] = useState(lastMonthKey());          // month용
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [sub, setSub] = useState("1");                    // 분기(1-4)/반기(1-2)
  const [busy, setBusy] = useState(false);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [md, setMd] = useState("");
  const [aiUsed, setAiUsed] = useState<string | null>(null); // model명 or null(규칙)
  const [hist, setHist] = useState<BizReportRow[]>([]);
  const { paged, remaining, showMore } = usePaged(hist, 30);
  // 월 선택지: 최근 36개월 (데이터 유무와 무관하게 선택 가능)
  const months = useMemo(() => {
    const t = new Date(); const out: string[] = [];
    for (let i = 35; i >= 0; i--) { const d = new Date(t.getFullYear(), t.getMonth() - i, 1); out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }
    return out;
  }, []);

  const periodKey = ptype === "month" ? ym : ptype === "quarter" ? `${year}-Q${sub}` : ptype === "half" ? `${year}-H${sub}` : year;
  const label = periodLabel(ptype, periodKey);

  const loadHist = () => listBizReports().then(setHist).catch(e => toast.error("보고서 이력 불러오기 실패: " + errMsg(e)));
  useEffect(() => { loadHist(); }, []);

  async function generate() {
    setBusy(true); setMd(""); setKpis(null); setAiUsed(null);
    try {
      const [out, inn, orders, plans, receipts, prodcon] = await Promise.all([
        listInout("out").catch(() => [] as InoutRow[]),
        listInout("in").catch(() => [] as InoutRow[]),
        listOrders().catch(() => [] as Order[]),
        listPlans().catch(() => ({} as Record<string, PlanEntry>)),
        listReceipts().catch(() => [] as Receipt[]),
        listProdConsume().catch(() => [] as ProdConsume[]),
      ]);
      const k = aggregateKpis({ periodType: ptype, periodKey, out, inn, orders, plans, receipts, prodcon, today: todayIso() });
      setKpis(k);
      let text = "", model: string | null = null;
      try {
        const r = await aiBizReport({ periodLabel: k.label, kpis: k });
        text = r.md; model = r.model;
        toast.success("AI 분석 보고서가 생성되었습니다.");
      } catch (e: any) {
        text = ruleReport(k);
        toast.error("AI 분석 불가 — 규칙 기반 보고서로 대체: " + errMsg(e));
      }
      setMd(text); setAiUsed(model);
      const saved = await saveBizReport({
        period_type: ptype, period_key: periodKey, title: `${k.label} 경영분석보고서${model ? "" : " (규칙 기반)"}`,
        content_md: text, kpis: k, ai: !!model, model,
      });
      setHist(h => [saved, ...h]);
      logAudit("경영보고서 생성", "biz_report", saved.id || "", { period: periodKey, ai: !!model });
    } catch (e: any) { toast.error("보고서 생성 실패: " + errMsg(e)); }
    setBusy(false);
  }

  async function openReport(id?: string) {
    if (!id) return;
    try {
      const r = await getBizReport(id);
      if (!r) { toast.error("보고서를 찾을 수 없습니다."); return; }
      setMd(r.content_md); setKpis((r.kpis as Kpis) || null); setAiUsed(r.ai ? (r.model || "AI") : null);
      window.scrollTo({ top: 0 });
    } catch (e: any) { toast.error("열기 실패: " + errMsg(e)); }
  }
  async function removeReport(r: BizReportRow) {
    if (!(await confirmDialog({ title: "보고서 삭제", message: `'${r.title}' 보고서를 삭제할까요?`, danger: true, confirmLabel: "삭제" }))) return;
    try {
      await deleteBizReport(r.id!); setHist(h => h.filter(x => x.id !== r.id)); toast.success("삭제됨");
      logAudit("경영보고서 삭제", "biz_report", r.id!, { title: r.title });
    } catch (e: any) { toast.error("삭제 실패: " + errMsg(e)); }
  }

  const kcard: React.CSSProperties = { background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px" };
  const kpiCard = (t: string, v: string, c = "#1f2330") => (
    <div style={kcard}><div className="muted" style={{ fontSize: 11.5 }}>{t}</div><div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div></div>
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card no-print">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div className="seg">
            {([["month", "월간"], ["quarter", "분기"], ["half", "반기"], ["year", "연간"]] as [PeriodType, string][]).map(([v, l]) => (
              <button key={v} className={ptype === v ? "on" : ""} onClick={() => setPtype(v)}>{l}</button>
            ))}
          </div>
          {ptype === "month" && <MonthPicker months={months} value={ym} onChange={setYm} />}
          {ptype !== "month" && (
            <>
              <select value={year} onChange={e => setYear(e.target.value)} style={{ padding: 7, border: "1px solid var(--line)", borderRadius: 6 }}>
                {Array.from({ length: 4 }, (_, i) => String(new Date().getFullYear() - i)).map(y => <option key={y} value={y}>{y}년</option>)}
              </select>
              {ptype === "quarter" && <select value={sub} onChange={e => setSub(e.target.value)} style={{ padding: 7, border: "1px solid var(--line)", borderRadius: 6 }}>{["1", "2", "3", "4"].map(q => <option key={q} value={q}>{q}분기</option>)}</select>}
              {ptype === "half" && <select value={sub} onChange={e => setSub(e.target.value)} style={{ padding: 7, border: "1px solid var(--line)", borderRadius: 6 }}>{[["1", "상반기"], ["2", "하반기"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
            </>
          )}
          <button className="btn green" disabled={busy} onClick={generate}>{busy ? "생성 중…" : "📊 보고서 생성"}</button>
          {md && <button className="btn ghost" onClick={() => window.print()}>🖨 인쇄/PDF</button>}
        </div>
        <p className="muted" style={{ fontSize: 11.5, margin: "8px 2px 0" }}>
          {label} 데이터를 집계해 AI(Claude)가 경영 현황을 분석합니다. AI 키가 등록되지 않았거나 호출에 실패하면 규칙 기반 요약으로 대체되며, 생성된 보고서는 자동 저장됩니다.
        </p>
      </div>

      {kpis && (
        <div className="no-print" style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {kpis.sales.hasData && kpiCard("매출(공급가액)", nf(kpis.sales.total) + "원", "var(--ok)")}
          {kpis.production.hasData && kpiCard("생산량", nf(kpis.production.totalQty) + "g", "var(--accent)")}
          {kpiCard("수주", nf(kpis.orders.count) + "건")}
          {kpiCard("납기 지연", nf(kpis.orders.late) + "건", kpis.orders.late > 0 ? "#c0392b" : "var(--ok)")}
          {kpis.spend.hasData && kpiCard("지출(증빙)", nf(kpis.spend.total) + "원", "#f59e0b")}
        </div>
      )}

      {md && (
        <div className="card brep-print printable">
          <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <span className="muted" style={{ fontSize: 11.5 }}>{aiUsed ? `🤖 AI 분석 (${aiUsed})` : "📐 규칙 기반 요약"}</span>
          </div>
          <Md src={md} />
        </div>
      )}

      <div className="card no-print">
        <h4 style={{ marginTop: 0 }}>지난 보고서</h4>
        {hist.length === 0 ? <p className="muted" style={{ fontSize: 13 }}>저장된 보고서가 없습니다. 위에서 첫 보고서를 생성해 보세요.</p> :
          <div style={{ display: "grid", gap: 6 }}>
            {paged.map(r => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 6, fontSize: 13, flexWrap: "wrap" }}>
                <span style={{ background: r.ai ? "#eaf1fe" : "#f1f3f7", borderRadius: 4, padding: "1px 6px", fontSize: 11 }}>{r.ai ? "🤖 AI" : "📐 규칙"}</span>
                <b>{r.title}</b>
                <span className="muted" style={{ fontSize: 12 }}>{String(r.created_at || "").slice(0, 16).replace("T", " ")}</span>
                <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
                  <button className="btn ghost" style={{ padding: "2px 10px", fontSize: 12 }} onClick={() => openReport(r.id)}>열기</button>
                  <button className="btn danger" style={{ padding: "2px 10px", fontSize: 12 }} onClick={() => removeReport(r)}>삭제</button>
                </span>
              </div>
            ))}
            {remaining > 0 && <button className="btn ghost" onClick={showMore}>더 보기 ({nf(remaining)}건)</button>}
          </div>}
      </div>
    </div>
  );
}
