import React, { useState, useEffect } from "react";
import { T } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";
import { Panel, Empty, inputStyle, btnStyle, IconBtn } from "../components/ui";
import { goldPricesList, goldPricesUpsert, goldPriceSave, goldPriceDelete, goldPricesDeleteMany, pgcPricesList, pgcPriceSave } from "../lib/db";
import { parseShinhanGold, monthlyAvg } from "../lib/gold";
import { BarChart } from "./QuoteCompare";

const won = (n) => (n == null || n === "" || isNaN(n) ? "-" : Number(n).toLocaleString("ko-KR", { maximumFractionDigits: 2 }));

// ===========================================================================
// 일별 금시세 입력 — 신한은행 표 붙여넣기 + 사용자 엑셀 구조의 구매 기록
// 열: 날짜|매매기준율|전일대비|[실물·계좌 4열]|국제금시세|원달러환율|
//     PGC|구매량|비율|PGC참고자료|구매대금|청화은|은수량|은구매액
// 월 평균 → 견적 기준 정보(crm_pgc_prices) 원클릭 반영
// ===========================================================================
export function GoldPriceScreen({ canEdit = true }) {
  const isMobile = useIsMobile();
  const thisYear = new Date().getFullYear();
  const thisYm = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);

  const [list, setList] = useState([]); // 일별 시세 (최신순)
  const [year, setYear] = useState(thisYear);
  const [paste, setPaste] = useState("");
  const [preview, setPreview] = useState(null); // {rows, errors}
  const [saving, setSaving] = useState(false);
  const [avgYm, setAvgYm] = useState(thisYm);
  const [selected, setSelected] = useState(() => new Set()); // 일괄 삭제용 선택
  const [showBank, setShowBank] = useState(false); // 실물·계좌 4열 표시 여부 (기본 숨김)
  const [newDate, setNewDate] = useState(today); // 수동 행 추가용 날짜

  const load = async () => {
    try { setList(await goldPricesList()); setSelected(new Set()); } catch (e) { alert(e.message); }
  };
  useEffect(() => { load(); }, []);

  // ----- 붙여넣기 → 미리보기 → 저장 -----
  const doPreview = () => setPreview(parseShinhanGold(paste, year));
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

  // ----- 수동 행 추가 (붙여넣기 없이 날짜만 만들고 셀에서 직접 입력) -----
  const addRow = async () => {
    if (!newDate) return;
    if (list.some((r) => r.date === newDate)) { alert(`${newDate}은 이미 있습니다 — 표에서 바로 수정하세요.`); return; }
    try { await goldPriceSave({ date: newDate }); await load(); } catch (e) { alert(e.message); }
  };

  // ----- 셀 인라인 편집 (타이핑 중엔 화면만, blur/Enter 시 해당 칸만 저장) -----
  const changeCell = (date, key, val) =>
    setList((prev) => prev.map((r) => (r.date === date ? { ...r, [key]: val } : r)));
  const saveCell = async (row, key, isText) => {
    const raw = row[key];
    const v = isText ? (String(raw || "").trim() || null) : (raw === "" || raw == null ? null : Number(raw) || null);
    try {
      await goldPriceSave({ date: row.date, [key]: v });
      setList((prev) => prev.map((r) => (r.date === row.date ? { ...r, [key]: v } : r)));
    } catch (e) { alert(e.message); }
  };

  const removeRow = async (row) => {
    if (!window.confirm(`${row.date} 시세를 삭제할까요?`)) return;
    try { await goldPriceDelete(row.date); load(); } catch (e) { alert(e.message); }
  };

  // ----- 체크박스 선택 → 여러 날 한 번에 삭제 -----
  const toggleSelect = (date) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  const allSelected = list.length > 0 && selected.size === list.length;
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(list.map((r) => r.date)));
  const removeSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`선택한 ${selected.size}일치 시세를 삭제할까요?\n(해당 날짜의 입력값이 모두 지워집니다)`)) return;
    try { await goldPricesDeleteMany([...selected]); await load(); } catch (e) { alert(e.message); }
  };

  // ----- 월 평균 → 견적 기준 정보 반영 -----
  const avg = monthlyAvg(list, avgYm);
  const applyAvg = async () => {
    if (!avg.pgc) { alert(`${avgYm}에 입력된 PGC 값이 없습니다 — 표에서 PGC를 먼저 입력하세요.`); return; }
    const pgcR = Math.round(avg.pgc);
    const agcnR = avg.agcn ? Math.round(avg.agcn) : null;
    if (!window.confirm(`${avgYm} 견적 기준 정보를 저장할까요?\n\nPGC 평균가: ₩${won(pgcR)}/g (${avg.pgcDays}일 평균)${agcnR ? `\n청화은 평균가: ₩${won(agcnR)}/g (${avg.agcnDays}일 평균)` : "\n청화은: 입력 없음 — 기존값 유지"}`)) return;
    try {
      const prices = await pgcPricesList();
      const cur = prices.find((p) => p.ym === avgYm);
      await pgcPriceSave({ ym: avgYm, price: pgcR, agcn_price: agcnR ?? cur?.agcn_price ?? null, etc_cost: cur?.etc_cost ?? null });
      alert(`${avgYm} 기준 정보가 저장되었습니다 — 견적서 작성 탭에서 바로 사용됩니다.`);
    } catch (e) { alert(e.message); }
  };

  // 그래프: 최근 30일 매매기준율 (오름차순)
  const chartRows = [...list].slice(0, 30).reverse().map((r) => ({ label: r.date.slice(5).replace("-", "."), close: r.close }));

  const thStyle = { padding: "8px 8px", fontSize: 11, fontWeight: 700, color: "#fff", background: T.navy, whiteSpace: "nowrap", textAlign: "center" };
  const tdStyle = { padding: "5px 8px", fontSize: 12, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap", textAlign: "right" };
  const cellInput = { width: 82, border: `1px solid ${T.border}`, borderRadius: 4, padding: "3px 5px", fontSize: 12, textAlign: "right", fontFamily: "inherit" };

  // 인라인 편집 셀 (숫자 or 텍스트) — 조회 전용이면 값만 표시
  // 주의: JSX 컴포넌트가 아니라 함수 호출로 사용 (컴포넌트로 쓰면 리렌더마다
  //       리마운트되어 타이핑 중 포커스를 잃음)
  const editCell = (row, k, { text, width, bg } = {}) => (
    <td style={{ ...tdStyle, background: bg }}>
      {canEdit ? (
        <input
          type={text ? "text" : "number"}
          style={{ ...cellInput, width: width || 82, textAlign: text ? "left" : "right" }}
          value={row[k] ?? ""}
          onChange={(e) => changeCell(row.date, k, e.target.value)}
          onBlur={() => saveCell(list.find((x) => x.date === row.date), k, text)}
          onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
          placeholder="입력"
        />
      ) : (text ? (row[k] || "-") : won(row[k]))}
    </td>
  );

  const PGC_BG = "#F4FAFA"; // PGC 관련 열 배경
  const AG_BG = "#FBF7EE";  // 청화은 관련 열 배경

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
                  {preview.rows.map((r) => `${r.date} 기준율 ${won(r.close)}`).join(" · ")}
                  <span style={{ marginLeft: 6 }}>— 같은 날짜는 시세만 갱신되고 PGC·청화은 등 입력값은 유지됩니다</span>
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
            기준율 평균 <b style={{ color: T.navy }}>₩{won(avg.close)}</b>
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

      {/* 매매기준율 추이 그래프 */}
      <Panel title="금 매매기준율 추이 (최근 30일)">
        {chartRows.length === 0 ? <Empty>시세를 입력하면 추이가 표시됩니다</Empty> : <BarChart rows={chartRows} valueKey="close" color={T.gold} height={100} />}
      </Panel>

      <div style={{ height: 16 }} />

      {/* 일별 시세·구매 기록 표 */}
      <div style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginRight: "auto" }}>
            일별 시세·구매 기록 <span style={{ fontSize: 12, color: T.sub, fontWeight: 600 }}>(최근 {list.length}일 · 최신순)</span>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: T.sub, cursor: "pointer" }}>
            <input type="checkbox" checked={showBank} onChange={(e) => setShowBank(e.target.checked)} style={{ cursor: "pointer" }} />
            실물·계좌 열 보기
          </label>
          {canEdit && selected.size > 0 && (
            <button onClick={removeSelected} style={{ ...btnStyle("ghost"), color: T.danger, fontSize: 12, padding: "7px 14px" }}>
              🗑 선택한 {selected.size}일 삭제
            </button>
          )}
          {canEdit && (
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="date" style={{ ...inputStyle, width: 150, padding: "7px 10px", fontSize: 12 }} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              <button onClick={addRow} style={{ ...btnStyle("primary"), fontSize: 12, padding: "7px 14px" }}>+ 날짜 추가</button>
            </span>
          )}
        </div>
        {list.length === 0 && <Empty>아직 입력된 시세가 없습니다 — 위에 신한은행 표를 붙여넣거나 "+ 날짜 추가"로 시작하세요</Empty>}
        {list.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: showBank ? 1750 : 1400 }}>
              <thead>
                <tr>
                  {canEdit && (
                    <th style={{ ...thStyle, width: 34 }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ cursor: "pointer" }} title="전체 선택/해제" />
                    </th>
                  )}
                  <th style={{ ...thStyle, textAlign: "left" }}>날짜</th>
                  <th style={thStyle}>매매기준율</th>
                  <th style={thStyle}>전일대비</th>
                  {showBank && <th style={thStyle}>실물 살 때</th>}
                  {showBank && <th style={thStyle}>실물 팔 때</th>}
                  {showBank && <th style={thStyle}>계좌입금</th>}
                  {showBank && <th style={thStyle}>계좌해지</th>}
                  <th style={thStyle}>국제 금시세</th>
                  <th style={thStyle}>원달러 환율</th>
                  <th style={{ ...thStyle, background: T.tealDark }}>PGC</th>
                  <th style={{ ...thStyle, background: T.tealDark }}>구매량</th>
                  <th style={{ ...thStyle, background: T.tealDark }}>비율</th>
                  <th style={{ ...thStyle, background: T.tealDark }}>PGC 참고자료</th>
                  <th style={{ ...thStyle, background: T.tealDark }}>구매대금</th>
                  <th style={{ ...thStyle, background: "#A5853B" }}>청화은</th>
                  <th style={{ ...thStyle, background: "#A5853B" }}>은수량</th>
                  <th style={{ ...thStyle, background: "#A5853B" }}>은구매액</th>
                  {canEdit && <th style={thStyle}></th>}
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const up = Number(r.change) > 0, down = Number(r.change) < 0;
                  return (
                    <tr key={r.date} style={selected.has(r.date) ? { background: "#FDECEA" } : undefined}>
                      {canEdit && (
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <input type="checkbox" checked={selected.has(r.date)} onChange={() => toggleSelect(r.date)} style={{ cursor: "pointer" }} />
                        </td>
                      )}
                      <td style={{ ...tdStyle, textAlign: "left", fontWeight: 700 }}>{r.date}</td>
                      {editCell(r, "close")}
                      <td style={{ ...tdStyle, color: up ? T.danger : down ? "#2563EB" : T.sub, fontSize: 11, fontWeight: 700 }}>
                        {r.change == null ? "-" : `${up ? "▲" : down ? "▼" : "—"}${won(Math.abs(r.change))}${r.change_rate != null ? ` (${r.change_rate > 0 ? "+" : ""}${r.change_rate}%)` : ""}`}
                      </td>
                      {showBank && editCell(r, "buy_physical")}
                      {showBank && editCell(r, "sell_physical")}
                      {showBank && editCell(r, "deposit")}
                      {showBank && editCell(r, "withdraw")}
                      {editCell(r, "intl_gold")}
                      {editCell(r, "usd_krw")}
                      {editCell(r, "pgc", { bg: PGC_BG })}
                      {editCell(r, "pgc_qty", { width: 64, bg: PGC_BG })}
                      {editCell(r, "pgc_ratio", { width: 56, bg: PGC_BG })}
                      {editCell(r, "pgc_note", { text: true, width: 120, bg: PGC_BG })}
                      {editCell(r, "pgc_amount", { width: 92, bg: PGC_BG })}
                      {editCell(r, "agcn", { bg: AG_BG })}
                      {editCell(r, "agcn_qty", { width: 64, bg: AG_BG })}
                      {editCell(r, "agcn_amount", { width: 92, bg: AG_BG })}
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
            모든 칸은 표에서 바로 입력·수정됩니다 (Enter 또는 칸 벗어나면 저장) · 전일대비는 붙여넣기에서 자동 계산 · 실물·계좌 열은 위 체크박스로 표시 · 왼쪽 체크박스로 여러 날을 선택해 한 번에 삭제할 수 있습니다 · PGC·청화은 월 평균은 위의 "기준 정보 반영"으로 견적 기준가에 적용됩니다
          </div>
        )}
      </div>
    </div>
  );
}
