import React, { useState, useEffect } from "react";
import { T } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";
import { Panel, Empty, inputStyle } from "../components/ui";
import { pgcPricesList, quoteItemsList, quoteIssuesList } from "../lib/db";
import { TIER_LABELS, calcItem } from "../lib/quote";

const won = (n) => (Number(n) || 0).toLocaleString("ko-KR");

// 전월 대비 증감 표시 (▲빨강=인상 / ▼파랑=인하) — 금시세 화면에서도 재사용
export function Delta({ cur, prev, small }) {
  if (prev == null || cur == null || prev === 0) return null;
  const diff = cur - prev;
  if (diff === 0) return <span style={{ fontSize: small ? 9 : 10, color: T.sub }}>—</span>;
  const up = diff > 0;
  const pct = ((diff / prev) * 100).toFixed(1);
  return (
    <span style={{ fontSize: small ? 9 : 10, fontWeight: 700, color: up ? T.danger : "#2563EB" }}>
      {up ? "▲" : "▼"}{won(Math.abs(Math.round(diff)))} ({up ? "+" : "-"}{Math.abs(pct)}%)
    </span>
  );
}

// 순수 div 세로 막대 그래프 (Dashboard 채널 바와 같은 방식, 라이브러리 없음)
// rows: [{ym 또는 label, [valueKey]: number}] — 금시세 화면에서도 재사용
export function BarChart({ rows, valueKey, color, height = 120 }) {
  const vals = rows.map((r) => Number(r[valueKey]) || 0);
  const max = Math.max(1, ...vals);
  const min = Math.min(...vals.filter((v) => v > 0));
  // 변동이 잘 보이게 바닥을 최솟값의 90%로
  const floor = min * 0.9;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: height + 34, overflowX: "auto", paddingTop: 16 }}>
      {rows.map((r, i) => {
        const v = Number(r[valueKey]) || 0;
        const h = v > 0 ? Math.max(4, ((v - floor) / (max - floor || 1)) * height) : 2;
        const last = i === rows.length - 1;
        const key = r.ym ?? r.label ?? i;
        return (
          <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 52, flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: last ? T.navy : T.sub, whiteSpace: "nowrap" }}>{won(v)}</div>
            <div style={{ width: "70%", maxWidth: 34, height: h, background: last ? color : `${color}55`, borderRadius: "4px 4px 0 0" }} />
            <div style={{ fontSize: 9, color: last ? T.navy : T.sub, fontWeight: last ? 800 : 600, whiteSpace: "nowrap" }}>{r.label ?? r.ym.slice(2)}</div>
            <Delta cur={v} prev={i > 0 ? Number(rows[i - 1][valueKey]) || null : null} small />
          </div>
        );
      })}
    </div>
  );
}

// ===========================================================================
// 견적 비교·추이 — ① PGC/AgCN 기준가 그래프 ② 월별 판가 추이 ③ 발행본 간 비교
// ===========================================================================
export function QuoteCompare({ companies }) {
  const isMobile = useIsMobile();
  const [prices, setPrices] = useState([]); // ym 내림차순 (db가 desc)
  const [items, setItems] = useState([]);
  const [issues, setIssues] = useState([]);

  // 월별 추이 컨트롤
  const [companyId, setCompanyId] = useState("");
  const [tierIdx, setTierIdx] = useState(0); // 0 = 0.5KG
  const [monthsN, setMonthsN] = useState(6);

  // 발행 비교 컨트롤
  const [issueA, setIssueA] = useState("");
  const [issueB, setIssueB] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [p, it, is] = await Promise.all([pgcPricesList(), quoteItemsList(), quoteIssuesList(100)]);
        setPrices(p); setItems(it); setIssues(is);
      } catch (e) { alert(e.message); }
    })();
  }, []);

  const nameOf = (cid) => companies.find((c) => c.id === cid)?.name || "?";

  // 그래프: 저장된 최근 12개월 (오름차순)
  const chartRows = [...prices].sort((a, b) => (a.ym < b.ym ? -1 : 1)).slice(-12);

  // 월별 추이: 저장된 최근 N개월 (오름차순) × 선택 거래처 품목
  const trendMonths = [...prices].sort((a, b) => (a.ym < b.ym ? -1 : 1)).slice(-monthsN);
  const trendItems = items.filter((it) => it.company_id === companyId);
  const priceAt = (it, m) => calcItem(it, m.price, m.agcn_price, m.etc_cost ?? 1800).tiers[tierIdx];

  // 발행 비교: A 선택 후 B는 같은 거래처의 다른 발행만
  const a = issues.find((x) => x.id === issueA);
  const bList = a ? issues.filter((x) => x.company_id === a.company_id && x.id !== a.id) : [];
  const b = bList.find((x) => x.id === issueB);
  const issueLabel = (x) => `${(x.created_at || "").slice(0, 16).replace("T", " ")} · ${nameOf(x.company_id)} · ${x.ym} 기준 · ${x.item_count}건 (${x.kind === "bulk" ? "일괄" : "개별"})`;
  // 모델명으로 매칭해 diff 행 구성
  let diffRows = [];
  if (a && b) {
    const mapA = new Map((a.rows || []).map((r) => [r.model, r]));
    const mapB = new Map((b.rows || []).map((r) => [r.model, r]));
    const models = [...new Set([...mapA.keys(), ...mapB.keys()])];
    diffRows = models.map((m) => {
      const ra = mapA.get(m), rb = mapB.get(m);
      const pa = ra ? Number(ra.prices?.[tierIdx]) || 0 : null;
      const pb = rb ? Number(rb.prices?.[tierIdx]) || 0 : null;
      return { model: m, gubun: (rb || ra)?.gubun || "", pa, pb };
    });
  }

  const thStyle = { padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "#fff", background: T.navy, whiteSpace: "nowrap", textAlign: "center" };
  const tdStyle = { padding: "7px 10px", fontSize: 12, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" };
  const selStyle = { ...inputStyle, width: "auto", minWidth: 120 };

  return (
    <div style={{ padding: isMobile ? 14 : 28 }}>
      {/* ① 기준가 추이 그래프 */}
      <Panel title="PGC 평균가 추이 (최근 12개월)">
        {chartRows.length === 0 ? <Empty>저장된 기준 정보가 없습니다</Empty> : <BarChart rows={chartRows} valueKey="price" color={T.teal} height={110} />}
      </Panel>
      <div style={{ height: 16 }} />
      <Panel title="AgCN(청화은) 평균가 추이">
        {chartRows.filter((r) => r.agcn_price != null).length === 0 ? <Empty>AgCN 가격 이력이 없습니다</Empty> : (
          <BarChart rows={chartRows.filter((r) => r.agcn_price != null)} valueKey="agcn_price" color={T.gold} height={60} />
        )}
      </Panel>

      <div style={{ height: 16 }} />

      {/* ② 월별 판가 추이 */}
      <div style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginRight: "auto" }}>월별 판가 추이 비교</div>
          <select style={selStyle} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">거래처 선택</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select style={selStyle} value={tierIdx} onChange={(e) => setTierIdx(Number(e.target.value))}>
            {TIER_LABELS.map((t, i) => <option key={t} value={i}>{t} 단가</option>)}
          </select>
          <select style={selStyle} value={monthsN} onChange={(e) => setMonthsN(Number(e.target.value))}>
            {[3, 6, 12].map((n) => <option key={n} value={n}>최근 {n}개월</option>)}
          </select>
        </div>
        {!companyId && <Empty>거래처를 선택하면 품목별 단가가 월별로 어떻게 변했는지 보여줍니다</Empty>}
        {companyId && trendItems.length === 0 && <Empty>이 거래처에 등록된 견적 품목이 없습니다</Empty>}
        {companyId && trendItems.length > 0 && (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 + trendMonths.length * 120 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: "left" }}>모델명</th>
                    <th style={thStyle}>구분</th>
                    {trendMonths.map((m) => <th key={m.ym} style={thStyle}>{m.ym}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {trendItems.map((it) => (
                    <tr key={it.id}>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{it.model}</td>
                      <td style={{ ...tdStyle, textAlign: "center", color: T.sub }}>{it.gubun}</td>
                      {trendMonths.map((m, mi) => {
                        const v = priceAt(it, m);
                        const prev = mi > 0 ? priceAt(it, trendMonths[mi - 1]) : null;
                        return (
                          <td key={m.ym} style={{ ...tdStyle, textAlign: "right" }}>
                            <div style={{ fontWeight: mi === trendMonths.length - 1 ? 800 : 600 }}>{won(v)}</div>
                            <Delta cur={v} prev={prev} small />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "10px 20px", fontSize: 11, color: T.sub, borderTop: `1px solid ${T.border}` }}>
              현재 품목 정보(투입량·수율·마진)에 각 달의 저장된 기준가(PGC·AgCN·기타)를 적용해 재계산한 {TIER_LABELS[tierIdx]} 단가입니다 · ▲ 인상 / ▼ 인하 (전월 대비)
            </div>
          </>
        )}
      </div>

      <div style={{ height: 16 }} />

      {/* ③ 발행본 간 비교 */}
      <div style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginRight: "auto" }}>발행 견적서 간 비교</div>
          <select style={{ ...selStyle, maxWidth: isMobile ? "100%" : 320 }} value={issueA} onChange={(e) => { setIssueA(e.target.value); setIssueB(""); }}>
            <option value="">비교 기준(A) 발행본 선택</option>
            {issues.map((x) => <option key={x.id} value={x.id}>{issueLabel(x)}</option>)}
          </select>
          <select style={{ ...selStyle, maxWidth: isMobile ? "100%" : 320 }} value={issueB} onChange={(e) => setIssueB(e.target.value)} disabled={!a}>
            <option value="">{a ? "비교 대상(B) 선택 — 같은 거래처" : "먼저 A를 선택하세요"}</option>
            {bList.map((x) => <option key={x.id} value={x.id}>{issueLabel(x)}</option>)}
          </select>
        </div>
        {issues.length === 0 && <Empty>발행 이력이 없습니다 — 견적서를 발행하면 여기서 비교할 수 있습니다</Empty>}
        {issues.length > 0 && !(a && b) && <Empty>발행본 A와 B를 선택하면 품목별 단가 차이를 보여줍니다</Empty>}
        {a && b && (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 720 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: "left" }}>모델명</th>
                    <th style={thStyle}>구분</th>
                    <th style={thStyle}>A · {a.ym}</th>
                    <th style={thStyle}>B · {b.ym}</th>
                    <th style={thStyle}>차이 (B−A)</th>
                  </tr>
                </thead>
                <tbody>
                  {diffRows.map((r) => (
                    <tr key={r.model}>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{r.model}</td>
                      <td style={{ ...tdStyle, textAlign: "center", color: T.sub }}>{r.gubun}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {r.pa == null ? <span style={{ fontSize: 10, fontWeight: 800, color: T.ok, background: T.tint2, padding: "1px 8px", borderRadius: 10 }}>신규</span> : won(r.pa)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>
                        {r.pb == null ? <span style={{ fontSize: 10, fontWeight: 800, color: T.danger, background: "#FDECEA", padding: "1px 8px", borderRadius: 10 }}>제외</span> : won(r.pb)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {r.pa != null && r.pb != null ? <Delta cur={r.pb} prev={r.pa} /> : <span style={{ fontSize: 11, color: T.sub }}>-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "10px 20px", fontSize: 11, color: T.sub, borderTop: `1px solid ${T.border}` }}>
              실제 발행된 견적서 스냅샷({TIER_LABELS[tierIdx]} 단가, 수동 수정분 포함) 기준 비교입니다 · 단가 구간은 위의 구간 선택을 따릅니다
            </div>
          </>
        )}
      </div>
    </div>
  );
}
