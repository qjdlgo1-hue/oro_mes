// 지원사업 정산 현황 뷰 — GrantDocs에서 분리(공고별 비목 집계 + 예산 입력 + 인쇄용 정산표)
import { GrantDoc, GrantProfile } from "../lib/db";
import { ProgramKey, TD_SETTLE_DOCS, money, docAmount, settleSummary } from "../lib/grantforms";
import { todayIso } from "../lib/fmt";
import { inp, lbl } from "../lib/styles";

type Props = {
  prog: ProgramKey;
  isSsp: boolean;
  progDef: { name: string };
  progItems: readonly string[];
  progBudgets: Record<string, string>;
  setBudget: (item: string, v: string) => void;
  settleDocs: GrantDoc[];
  prof: GrantProfile;
  sspP: { taskName?: string };
  busy: boolean;
  saveProf: () => void;
  onBack: () => void;
};

export default function GrantSettleView({ prog, isSsp, progDef, progItems, progBudgets, setBudget, settleDocs, prof, sspP, busy, saveProf, onBack }: Props) {
  const { lines, totalAmount, totalBudget } = settleSummary(settleDocs, progBudgets, progItems);
  const hasBudget = totalBudget > 0;
  const sorted = [...settleDocs].sort((a, b) =>
    String(a.data?.writeDate || a.created_at || "").localeCompare(String(b.data?.writeDate || b.created_at || "")));
  return (
    <>
      <div className="card grant-side">
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button className="btn ghost" onClick={onBack}>← 건 목록</button>
          <h4 style={{ margin: 0 }}>📊 정산 현황</h4>
          <span className="muted" style={{ fontSize: 12 }}>등록된 집행 건이 지출항목별로 자동 집계됩니다.</span>
          <span style={{ marginLeft: "auto" }}>
            <button className="btn" onClick={() => window.print()}>🖨 정산표 인쇄/PDF</button>
          </span>
        </div>
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
            {prog === "td" ? "세목별 계획액(원)" : isSsp ? "비목별 예산(원)" : "지출항목별 예산(원)"} <span className="muted" style={{ fontWeight: 400 }}>— 입력하면 잔액·집행률이 계산됩니다 (선택, 회사 정보와 함께 저장)</span>
          </div>
          {prog === "td" && (
            <div style={{ fontSize: 12, background: "#f3f7fc", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 10px", marginBottom: 8, lineHeight: 1.7 }}>
              <b>📎 정산 제출물 (관리지침 제37조)</b><br />{TD_SETTLE_DOCS.map(s => <span key={s}>· {s}<br /></span>)}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {progItems.map(it => (
              <div key={it} style={{ width: 165 }}>
                <label style={lbl}>{it}</label>
                <input style={inp} value={progBudgets[it] || ""} placeholder="예산(원)"
                  onChange={e => setBudget(it, e.target.value)} />
              </div>
            ))}
          </div>
          <button className="btn green" style={{ marginTop: 8 }} disabled={busy} onClick={saveProf}>예산 저장</button>
        </div>
      </div>

      {/* 인쇄 대상 정산표 */}
      <div className="gdoc printable">
        <h2 className="gtitle">「{progDef.name}」 사업비 집행 정산 현황</h2>
        <table className="gt gx" style={{ fontSize: "11pt" }}><tbody>
          <tr style={{ height: "6.9mm" }}>
            <th style={{ width: "18%" }}>기 업 명</th><td style={{ width: "34%", textAlign: "center" }}>{prof.company}</td>
            <th style={{ width: "18%" }}>작 성 일</th><td style={{ textAlign: "center" }}>{todayIso()}</td>
          </tr>
          <tr style={{ height: "6.9mm" }}><th>과 제 명</th><td colSpan={3} style={{ textAlign: "center" }}>{prog === "td" ? prof.td?.project : isSsp ? sspP.taskName : prof.project}</td></tr>
        </tbody></table>
        <div style={{ fontSize: "13pt", fontWeight: 700, margin: "5mm 0 1.5mm" }}>□ {prog === "td" ? "세목별" : isSsp ? "비목별" : "지출항목별"} 집계</div>
        <table className="gt gx" style={{ fontSize: "10.5pt" }}>
          <thead><tr style={{ height: "6.9mm" }}>
            <th>지출항목</th><th style={{ width: "9%" }}>건수</th><th style={{ width: "17%" }}>집행액(원)</th>
            {hasBudget && <><th style={{ width: "17%" }}>예산(원)</th><th style={{ width: "17%" }}>잔액(원)</th><th style={{ width: "11%" }}>집행률</th></>}
          </tr></thead>
          <tbody>
            {lines.map(l => (
              <tr key={l.item} style={{ height: "6.4mm" }}>
                <td style={{ paddingLeft: "2mm" }}>{l.item}</td>
                <td style={{ textAlign: "center" }}>{l.count || ""}</td>
                <td style={{ textAlign: "right" }}>{l.amount ? money(l.amount) : ""}</td>
                {hasBudget && <>
                  <td style={{ textAlign: "right" }}>{l.budget ? money(l.budget) : ""}</td>
                  <td style={{ textAlign: "right" }}>{l.budget ? money(l.budget - l.amount) : ""}</td>
                  <td style={{ textAlign: "center" }}>{l.budget ? Math.round(l.amount / l.budget * 100) + "%" : ""}</td>
                </>}
              </tr>
            ))}
            {lines.length === 0 && <tr><td colSpan={hasBudget ? 6 : 3} style={{ textAlign: "center", padding: "3mm" }}>등록된 집행 건이 없습니다.</td></tr>}
            {lines.length > 0 && (
              <tr style={{ height: "6.9mm", fontWeight: 700 }}>
                <td style={{ textAlign: "center" }}>합 계</td>
                <td style={{ textAlign: "center" }}>{lines.reduce((s, l) => s + l.count, 0)}</td>
                <td style={{ textAlign: "right" }}>{money(totalAmount)}</td>
                {hasBudget && <>
                  <td style={{ textAlign: "right" }}>{money(totalBudget)}</td>
                  <td style={{ textAlign: "right" }}>{money(totalBudget - totalAmount)}</td>
                  <td style={{ textAlign: "center" }}>{totalBudget ? Math.round(totalAmount / totalBudget * 100) + "%" : ""}</td>
                </>}
              </tr>
            )}
          </tbody>
        </table>
        <div style={{ fontSize: "13pt", fontWeight: 700, margin: "5mm 0 1.5mm" }}>□ 집행 건 상세</div>
        <table className="gt gx" style={{ fontSize: "10.5pt" }}>
          <thead><tr style={{ height: "6.9mm" }}>
            <th style={{ width: "7%" }}>No</th><th style={{ width: "14%" }}>일자</th><th style={{ width: "17%" }}>지출항목</th>
            <th>건명(품명/용역명)</th><th style={{ width: "17%" }}>업체</th><th style={{ width: "16%" }}>금액(원)</th>
          </tr></thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.id || i} style={{ height: "6.4mm" }}>
                <td style={{ textAlign: "center" }}>{i + 1}</td>
                <td style={{ textAlign: "center" }}>{String(r.data?.writeDate || r.created_at || "").slice(0, 10)}</td>
                <td style={{ textAlign: "center" }}>{r.expense_item}</td>
                <td style={{ paddingLeft: "2mm" }}>{r.title}</td>
                <td style={{ textAlign: "center" }}>{r.data?.vendor || r.data?.svcVendor || r.data?.vdName || ""}</td>
                <td style={{ textAlign: "right" }}>{money(docAmount(r.data || {})) || "0"}</td>
              </tr>
            ))}
            {sorted.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", padding: "3mm" }}>등록된 집행 건이 없습니다.</td></tr>}
          </tbody>
        </table>
        <p style={{ fontSize: "10pt", marginTop: "2mm" }}>※ 금액은 각 건의 지급요청서 지급액(없으면 합계 → 단가×수량 → 용역금액 순)을 기준으로 집계함.</p>
      </div>
    </>
  );
}
