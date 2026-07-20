import React, { useState, useEffect } from "react";
import { T } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";
import { Panel, Empty, inputStyle, btnStyle, IconBtn } from "../components/ui";
import { goldPricesList, goldPricesUpsert, goldPriceSave, goldPriceDelete, pgcPricesList, pgcPriceSave } from "../lib/db";
import { parseShinhanGold, monthlyAvg } from "../lib/gold";
import { BarChart, Delta } from "./QuoteCompare";

const won = (n) => (n == null || isNaN(n) ? "-" : Number(n).toLocaleString("ko-KR", { maximumFractionDigits: 2 }));

// ===========================================================================
// 일별 금시세 입력 — 신한은행 표 붙여넣기 + 그날의 PGC·청화은 기록
// 월 평균을 계산해 견적 기준 정보(crm_pgc_prices)로 원클릭 반영
// ===========================================================================
export function GoldPriceScreen({ canEdit = true }) {
  const isMobile = useIsMobile();
  const thisYear = new Date().getFullYear();
  const thisYm = new Date().toISOString().slice(0, 7);

  const [list, setList] = useState([]); // 일별 시세 (최신순)
  const [year, setYear] = useState(thisYear);
  const [paste, setPaste] = useState("");
  const [preview, setPreview] = useState(null); // {rows, errors}
  const [saving, setSaving] = useState(false);
  const [avgYm, setAvgYm] = useState(thisYm);

  const load = async () => {
    try { setList(await goldPricesList()); } catch (e) { alert(e.message); }
  };
  useEffect(() => { load(); }, []);

  // 붙여넣기 → 미리보기
  const doPreview = () => setPreview(parseShinhanGold(paste, year));

  // 미리보기 저장 (같은 날짜는 시세만 갱신, PGC·청화은 입력값은 보존)
  const doSave = async () => {
    if (!preview || preview.rows.length === 0) return;
    setSaving(true);
    try {
      await goldPricesUpsert(preview.rows);
      setPaste(""); setPreview(null);
      await load();
      alert(`${preview.rows.length}일치 시세를 저장했습니다.`);
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  // PGC·청화은 인라인 입력 (타이핑 중엔 화면만, blur/Enter 시 저장)
  const changeCell = (date, key, val) =>
    setList((prev) => prev.map((r) => (r.date === date ? { ...r, [key]: val } : r)));
  const saveCell = async (row, key) => {
    const v = row[key] === "" || row[key] == null ? null : Number(row[key]) || null;
    try {
      await goldPriceSave({ date: row.date, [key]: v });
      setList((prev) => prev.map((r) => (r.date === row.date ? { ...r, [key]: v } : r)));
    } catch (e) { alert(e.message); }
  };

  const removeRow = async (row) => {
    if (!window.confirm(`${row.date} 시세를 삭제할까요?`)) return;
    try { await goldPriceDelete(row.date); load(); } catch (e) { alert(e.message); }
  };

  // 월 평균 → 견적 기준 정보 반영
  const avg = monthlyAvg(list, avgYm);
  const applyAvg = async () => {
    if (!avg.pgc) { alert(`${avgYm}에 입력된 PGC 값이 없습니다 — 표에서 PGC를 먼저 입력하세요.`); return; }
    const pgcR = Math.round(avg.pgc);
    const agcnR = avg.agcn ? Math.round(avg.agcn) : null;
    if (!window.confirm(`${avgYm} 견적 기준 정보를 저장할까요?\n\nPGC 평균가: ₩${won(pgcR)}/g (${avg.pgcDays}일 평균)${agcnR ? `\n청화은 평균가: ₩${won(agcnR)}/g (${avg.agcnDays}일 평균)` : "\n청화은: 입력 없음 — 기존값 유지"}`)) return;
    try {
      // 기존 기준 정보의 기타비 등은 유지
      const prices = await pgcPricesList();
      const cur = prices.find((p) => p.ym === avgYm);
      await pgcPriceSave({ ym: avgYm, price: pgcR, agcn_price: agcnR ?? cur?.agcn_price ?? null, etc_cost: cur?.etc_cost ?? null });
      alert(`${avgYm} 기준 정보가 저장되었습니다 — 견적서 작성 탭에서 바로 사용됩니다.`);
    } catch (e) { alert(e.message); }
  };

  // 그래프: 최근 30일 종가 (오름차순, 라벨 MM.DD)
  const chartRows = [...list].slice(0, 30).reverse().map((r) => ({ label: r.date.slice(5).replace("-", "."), close: r.close }));

  const thStyle = { padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "#fff", background: T.navy, whiteSpace: "nowrap", textAlign: "center" };
  const tdStyle = { padding: "6px 10px", fontSize: 12, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap", textAlign: "right" };
  const cellInput = { width: 84, border: `1px solid ${T.border}`, borderRadius: 4, padding: "3px 5px", fontSize: 12, textAlign: "right", fontFamily: "inherit" };

  return (
    <div style={{ padding: isMobile ? 14 : 28 }}>
      {/* 붙여넣기 입력 */}
      {canEdit && (
        <Panel title="신한은행 금시세 붙여넣기">
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <textarea
                style={{ ...inputStyle, minHeight: 96, resize: "vertical", fontSize: 12 }}
                placeholder={"신한은행 금시세 표를 그대로 복사해 붙여넣으세요.\n예) 07.20.  191,251.69  상승1,019.13  +0.54%  200,814.27 ..."}
                value={paste}
                onChange={(e) => { setPaste(e.target.value); setPreview(null); }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 4 }}>연도</div>
                <select style={{ ...inputStyle, width: 110 }} value={year} onChange={(e) => { setYear(Number(e.target.value)); setPreview(null); }}>
                  {[thisYear, thisYear - 1].map((y) => <option key={y} value={y}>{y}년</option>)}
                </select>
              </div>
              <button onClick={doPreview} disabled={!paste.trim()} style={{ ...btnStyle("ghost"), opacity: paste.trim() ? 1 : 0.4 }}>미리보기</button>
              <button onClick={doSave} disabled={!preview || preview.rows.length === 0 || saving} style={{ ...btnStyle("primary"), opacity: preview && preview.rows.length > 0 && !saving ? 1 : 0.4 }}>
                {saving ? "저장 중..." : `저장${preview ? ` (${preview.rows.length}일)` : ""}`}
              </button>
            </div>
          </div>
          {preview && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: preview.rows.length ? T.ok : T.danger }}>
                {preview.rows.length}일치 인식됨{preview.errors.length ? ` · 실패 ${preview.errors.length}건: ${preview.errors.join(", ")}` : ""}
              </div>
              {preview.rows.length > 0 && (
                <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>
                  {preview.rows.map((r) => `${r.date} 종가 ${won(r.close)}`).join(" · ")}
                  <span style={{ marginLeft: 6 }}>— 같은 날짜는 시세만 갱신되고 PGC·청화은 입력값은 유지됩니다</span>
                </div>
              )}
            </div>
          )}
        </Panel>
      )}

      <div style={{ height: 16 }} />

      {/* 월 평균 → 견적 기준 정보 */}
      <Panel title="월 평균 → 견적 기준 정보 반영">
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 4 }}>기준 월</div>
            <input type="month" style={{ ...inputStyle, width: 150 }} value={avgYm} onChange={(e) => setAvgYm(e.target.value)} />
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            <span style={{ color: T.sub }}>입력 {avg.days}일 · </span>
            종가 평균 <b style={{ color: T.navy }}>₩{won(avg.close)}</b>
            <span style={{ color: T.sub }}> · </span>
            PGC 평균 <b style={{ color: T.teal }}>{avg.pgc ? `₩${won(Math.round(avg.pgc))}` : "-"}</b><span style={{ fontSize: 11, color: T.sub }}>({avg.pgcDays}일)</span>
            <span style={{ color: T.sub }}> · </span>
            청화은 평균 <b style={{ color: T.gold }}>{avg.agcn ? `₩${won(Math.round(avg.agcn))}` : "-"}</b><span style={{ fontSize: 11, color: T.sub }}>({avg.agcnDays}일)</span>
          </div>
          {canEdit && (
            <button onClick={applyAvg} style={btnStyle("primary")}>이 평균을 {avgYm} 기준 정보로 저장</button>
          )}
        </div>
      </Panel>

      <div style={{ height: 16 }} />

      {/* 종가 추이 그래프 */}
      <Panel title="금 종가 추이 (최근 30일)">
        {chartRows.length === 0 ? <Empty>시세를 입력하면 추이가 표시됩니다</Empty> : <BarChart rows={chartRows} valueKey="close" color={T.gold} height={100} />}
      </Panel>

      <div style={{ height: 16 }} />

      {/* 일별 시세 표 */}
      <div style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, fontWeight: 700, fontSize: 15 }}>
          일별 시세 <span style={{ fontSize: 12, color: T.sub, fontWeight: 600 }}>(최근 {list.length}일 · 최신순)</span>
        </div>
        {list.length === 0 && <Empty>아직 입력된 시세가 없습니다 — 위에 신한은행 표를 붙여넣으세요</Empty>}
        {list.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: "left" }}>날짜</th>
                  <th style={thStyle}>종가</th>
                  <th style={thStyle}>전일대비</th>
                  <th style={thStyle}>실물 살 때</th>
                  <th style={thStyle}>실물 팔 때</th>
                  <th style={thStyle}>계좌입금</th>
                  <th style={thStyle}>계좌송금</th>
                  <th style={{ ...thStyle, background: T.tealDark }}>PGC</th>
                  <th style={{ ...thStyle, background: T.tealDark }}>청화은</th>
                  {canEdit && <th style={thStyle}></th>}
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const up = Number(r.change) > 0, down = Number(r.change) < 0;
                  return (
                    <tr key={r.date}>
                      <td style={{ ...tdStyle, textAlign: "left", fontWeight: 700 }}>{r.date}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{won(r.close)}</td>
                      <td style={{ ...tdStyle, color: up ? T.danger : down ? "#2563EB" : T.sub, fontSize: 11, fontWeight: 700 }}>
                        {r.change == null ? "-" : `${up ? "▲" : down ? "▼" : "—"}${won(Math.abs(r.change))}${r.change_rate != null ? ` (${r.change_rate > 0 ? "+" : ""}${r.change_rate}%)` : ""}`}
                      </td>
                      <td style={tdStyle}>{won(r.buy_physical)}</td>
                      <td style={tdStyle}>{won(r.sell_physical)}</td>
                      <td style={tdStyle}>{won(r.deposit)}</td>
                      <td style={tdStyle}>{won(r.withdraw)}</td>
                      <td style={{ ...tdStyle, background: "#F4FAFA" }}>
                        {canEdit ? (
                          <input type="number" style={cellInput} value={r.pgc ?? ""}
                            onChange={(e) => changeCell(r.date, "pgc", e.target.value)}
                            onBlur={() => saveCell(list.find((x) => x.date === r.date), "pgc")}
                            onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                            placeholder="입력" />
                        ) : won(r.pgc)}
                      </td>
                      <td style={{ ...tdStyle, background: "#F4FAFA" }}>
                        {canEdit ? (
                          <input type="number" style={cellInput} value={r.agcn ?? ""}
                            onChange={(e) => changeCell(r.date, "agcn", e.target.value)}
                            onBlur={() => saveCell(list.find((x) => x.date === r.date), "agcn")}
                            onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                            placeholder="입력" />
                        ) : won(r.agcn)}
                      </td>
                      {canEdit && (
                        <td style={tdStyle}><IconBtn danger onClick={() => removeRow(r)}>🗑</IconBtn></td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {list.length > 0 && (
          <div style={{ padding: "10px 20px", fontSize: 11, color: T.sub, borderTop: `1px solid ${T.border}` }}>
            PGC·청화은 칸에 그날 가격을 입력하면 바로 저장됩니다 (Enter 또는 칸 벗어나기) · 위의 "월 평균 → 기준 정보 반영"으로 견적 기준가에 한 번에 적용됩니다
          </div>
        )}
      </div>
    </div>
  );
}
