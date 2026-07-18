import React, { useState, useEffect } from "react";
import { T } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";
import { Header, inputStyle, Panel, IconBtn, Empty, btnStyle } from "../components/ui";
import { QuoteItemModal } from "../components/modals";
import { pgcPricesList, pgcPriceSave, quoteItemsList, quoteItemSave, quoteItemDelete } from "../lib/db";
import { TIER_LABELS, calcItem, marginOf, downloadQuoteXlsx } from "../lib/quote";

// ===========================================================================
// 화면: 견적 — 매월 PGC/AgCN 가격만 넣으면 거래처별 견적서 엑셀 자동 생성
// (계산식은 src/lib/quote.js — 기존 '국내' 엑셀과 동일)
// ===========================================================================
export function QuoteScreen({ mode, companies, onLogActivity }) {
  const isMobile = useIsMobile();
  const thisYm = new Date().toISOString().slice(0, 7);

  const [ym, setYm] = useState(thisYm);
  const [prices, setPrices] = useState([]); // 월별 가격 이력
  const [pgcPrice, setPgcPrice] = useState("");
  const [agcnPrice, setAgcnPrice] = useState("");
  const [etcCost, setEtcCost] = useState("1800"); // 재료비(기타) — 모든 품목에 동일 적용
  const [companyId, setCompanyId] = useState("");
  const [items, setItems] = useState([]); // 전체 거래처 품목 (검색은 전체 대상)
  const [search, setSearch] = useState("");
  const [overrides, setOverrides] = useState({}); // {itemId: {tierIdx: 수정판가}}
  const [editing, setEditing] = useState(null); // null | {} | item
  const [busy, setBusy] = useState(false);

  // 가격 이력 로드 + 해당 월 가격 채우기 (없으면 최신 값을 기본으로)
  const loadPrices = async () => {
    try {
      const list = await pgcPricesList();
      setPrices(list);
      const cur = list.find((p) => p.ym === ym);
      const row = cur || list[0];
      if (row) {
        setPgcPrice(String(cur?.price ?? row.price ?? ""));
        setAgcnPrice(String(cur?.agcn_price ?? list.find((p) => p.agcn_price != null)?.agcn_price ?? ""));
        setEtcCost(String(cur?.etc_cost ?? list.find((p) => p.etc_cost != null)?.etc_cost ?? 1800));
      }
    } catch (e) { alert(e.message); }
  };
  useEffect(() => { if (mode === "cloud") loadPrices(); }, [mode]);

  // 월 바꾸면 그 달 저장값(있으면)으로 갱신 — 저장값이 없으면 직전 값이 남음(아래 안내 표시)
  useEffect(() => {
    const row = prices.find((p) => p.ym === ym);
    if (row) {
      setPgcPrice(String(row.price ?? ""));
      setAgcnPrice(String(row.agcn_price ?? ""));
      if (row.etc_cost != null) setEtcCost(String(row.etc_cost));
    }
  }, [ym, prices]);
  const ymSaved = prices.some((p) => p.ym === ym); // 선택한 월의 기준 정보가 저장돼 있는지

  // 품목은 전체를 한 번에 로드 (거래처 구분 없이 검색할 수 있게)
  const loadItems = async () => {
    try { setItems(await quoteItemsList()); setOverrides({}); } catch (e) { alert(e.message); }
  };
  useEffect(() => { if (mode === "cloud") loadItems(); }, [mode]);

  if (mode !== "cloud") {
    return (
      <div>
        <Header title="견적" sub="거래처별 견적서 생성" />
        <div style={{ padding: 28 }}>
          <Empty>견적 기능은 서버(클라우드) 모드에서만 사용할 수 있습니다.</Empty>
        </div>
      </div>
    );
  }

  const company = companies.find((c) => c.id === companyId);
  const pgcN = Number(pgcPrice) || 0;
  const agcnN = Number(agcnPrice) || 0;
  const etcN = Number(etcCost) || 0;
  const prevRow = prices.find((p) => p.ym < ym); // 직전 저장 월 (참고 표시용)
  const won = (n) => (Number(n) || 0).toLocaleString("ko-KR");

  const nameOf = (cid) => companies.find((c) => c.id === cid)?.name || "?";
  const q = search.trim().toLowerCase();
  const companyItems = items.filter((it) => it.company_id === companyId); // 다운로드·건수 기준
  // 검색 중엔 전체 거래처에서 찾고, 아니면 선택 거래처 품목만
  const viewItems = q
    ? items.filter((it) => [it.model, it.spec, it.gubun, nameOf(it.company_id)].some((s) => (s || "").toLowerCase().includes(q)))
    : companyItems;

  const savePrices = async () => {
    if (!pgcN) { alert("PGC 평균가를 입력하세요."); return; }
    try {
      await pgcPriceSave({ ym, price: pgcN, agcn_price: agcnN || null, etc_cost: etcN || null });
      await loadPrices();
      alert(`${ym} 기준 정보가 저장되었습니다.`);
    } catch (e) { alert(e.message); }
  };

  const tierPrice = (item, calc, ti) => {
    const ov = overrides[item.id]?.[ti];
    return ov !== undefined && ov !== "" ? Number(ov) : calc.tiers[ti];
  };

  const download = async () => {
    if (!company || companyItems.length === 0 || busy) return;
    if (!pgcN) { alert("PGC 평균가를 먼저 입력하세요."); return; }
    setBusy(true);
    try {
      const rows = companyItems.map((it) => {
        const calc = calcItem(it, pgcN, agcnN, etcN);
        return { gubun: it.gubun, model: it.model, spec: it.spec, note: it.note || "", prices: TIER_LABELS.map((_, ti) => tierPrice(it, calc, ti)) };
      });
      await downloadQuoteXlsx({ companyName: company.name, ym, pgcPrice: pgcN, agcnPrice: agcnN, rows });
      onLogActivity(company.id, `${ym} 견적서 발행`, `PGC ₩${won(pgcN)}/g${agcnN ? `, AgCN ₩${won(agcnN)}/g` : ""} 기준 · 품목 ${companyItems.length}건 견적서 엑셀 생성`);
    } catch (e) { alert(`견적서 생성 실패: ${e.message}`); }
    setBusy(false);
  };

  const removeItem = async (it) => {
    if (!window.confirm(`'${it.model}' 품목을 삭제할까요?`)) return;
    try { await quoteItemDelete(it.id); loadItems(); } catch (e) { alert(e.message); }
  };

  // 표에서 구분(사급/도급)을 바로 바꾸면 저장 + 즉시 재계산
  const changeGubun = async (it, gubun) => {
    try {
      await quoteItemSave({ ...it, gubun });
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, gubun } : x)));
    } catch (e) { alert(e.message); }
  };

  // 재료비(Ni)를 표에서 바로 입력: 타이핑 중엔 화면만 갱신, 칸을 벗어나면 저장
  const changeNi = (it, val) => {
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, material_ni: val } : x)));
  };
  const saveNi = async (it) => {
    const ni = Number(it.material_ni) || 0;
    try {
      await quoteItemSave({ ...it, material_ni: ni });
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, material_ni: ni } : x)));
    } catch (e) { alert(e.message); }
  };

  const thStyle = { padding: "8px 8px", fontSize: 11, fontWeight: 700, color: "#fff", background: T.navy, whiteSpace: "nowrap", textAlign: "center" };
  const tdStyle = { padding: "7px 8px", fontSize: 12, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" };

  return (
    <div>
      <Header
        title="견적"
        sub="매월 PGC·AgCN 평균가만 입력하면 거래처별 견적 단가가 자동 계산됩니다"
        right={
          <button onClick={download} disabled={!company || companyItems.length === 0 || busy} style={{ ...btnStyle("primary"), opacity: !company || companyItems.length === 0 || busy ? 0.4 : 1 }}>
            {busy ? "생성 중..." : "📥 견적서 엑셀 다운로드"}
          </button>
        }
      />
      <div style={{ padding: isMobile ? 14 : 28 }}>
        {/* 기준 가격 + 거래처 선택 */}
        <Panel title="기준 정보">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 4 }}>기준 월</div>
              <input type="month" style={{ ...inputStyle, width: 150 }} value={ym} onChange={(e) => setYm(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 4 }}>PGC 평균가 (원/g)</div>
              <input type="number" style={{ ...inputStyle, width: 130 }} value={pgcPrice} onChange={(e) => setPgcPrice(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 4 }}>AgCN(청화은) 평균가 (원/g)</div>
              <input type="number" style={{ ...inputStyle, width: 130 }} value={agcnPrice} onChange={(e) => setAgcnPrice(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 4 }}>재료비(기타) (원, 전 품목 공통)</div>
              <input type="number" style={{ ...inputStyle, width: 130 }} value={etcCost} onChange={(e) => setEtcCost(e.target.value)} />
            </div>
            <button onClick={savePrices} style={{ ...btnStyle("ghost"), padding: "10px 14px" }}>기준 정보 저장</button>
            <div style={{ flex: 1 }} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 4 }}>거래처</div>
              <select style={{ ...inputStyle, width: 200 }} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">거래처를 선택하세요</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          {!ymSaved && prices.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: T.warn, fontWeight: 700 }}>
              ⚠ {ym}에 저장된 기준 정보가 없습니다 — 직전 값이 표시 중입니다. 이 월 가격으로 쓰려면 값을 확인하고 [기준 정보 저장]을 누르세요.
            </div>
          )}
          {prevRow && (
            <div style={{ marginTop: 10, fontSize: 11, color: T.sub }}>
              참고: {prevRow.ym} 저장값 — PGC ₩{won(prevRow.price)}/g{prevRow.agcn_price ? `, AgCN ₩${won(prevRow.agcn_price)}/g` : ""}
            </div>
          )}
        </Panel>

        <div style={{ height: 16 }} />

        {/* 품목 표 */}
        <div style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {q ? `검색 결과 (${viewItems.length}건)` : company ? `${company.name} 견적 품목 (${companyItems.length}건)` : "견적 품목"}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 모델명·사양·거래처 검색"
                style={{ ...inputStyle, width: isMobile ? 170 : 230, padding: "7px 10px", fontSize: 12 }}
              />
              {company && <button onClick={() => setEditing({})} style={{ ...btnStyle("primary"), fontSize: 12, padding: "7px 14px" }}>+ 품목 추가</button>}
            </div>
          </div>

          {!q && !company && <Empty>위에서 거래처를 선택하거나, 모델명·거래처명으로 검색하세요</Empty>}
          {!q && company && companyItems.length === 0 && <Empty>등록된 품목이 없습니다 — "+ 품목 추가"로 등록하세요</Empty>}
          {q && viewItems.length === 0 && <Empty>'{search.trim()}' 검색 결과가 없습니다</Empty>}

          {viewItems.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1380 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: "left" }}>거래처</th>
                    <th style={thStyle}>구분</th>
                    <th style={{ ...thStyle, textAlign: "left" }}>모델명</th>
                    <th style={{ ...thStyle, textAlign: "left" }}>사양</th>
                    <th style={thStyle}>PGC(g)</th>
                    <th style={thStyle}>AgCN(g)</th>
                    <th style={{ ...thStyle, background: T.navyLight }}>재료비(Ni)</th>
                    <th style={{ ...thStyle, background: T.navyLight }}>재료비(PGC)</th>
                    <th style={{ ...thStyle, background: T.navyLight }}>재료비(기타)</th>
                    <th style={{ ...thStyle, background: T.navyLight }}>재료비 합계</th>
                    <th style={thStyle}>수율(g)</th>
                    <th style={thStyle}>공정비용(원/g)</th>
                    <th style={thStyle}>마진</th>
                    {TIER_LABELS.map((t) => <th key={t} style={{ ...thStyle, background: T.tealDark }}>{t}</th>)}
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {viewItems.map((it) => {
                    const calc = calcItem(it, pgcN, agcnN, etcN);
                    const knownGubun = it.gubun === "사급" || it.gubun === "도급";
                    return (
                      <tr key={it.id}>
                        <td
                          onClick={() => { setCompanyId(it.company_id); setSearch(""); }}
                          title="클릭하면 이 거래처가 선택됩니다"
                          style={{ ...tdStyle, fontWeight: 700, color: T.teal, cursor: "pointer", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}
                        >
                          {nameOf(it.company_id)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <select
                            value={it.gubun || ""}
                            onChange={(e) => changeGubun(it, e.target.value)}
                            style={{ border: `1px solid ${T.border}`, borderRadius: 4, padding: "3px 4px", fontSize: 11, fontFamily: "inherit", background: "#fff", color: T.text, cursor: "pointer" }}
                          >
                            {!knownGubun && <option value={it.gubun || ""}>{it.gubun || "선택"}</option>}
                            <option value="사급">사급</option>
                            <option value="도급">도급</option>
                          </select>
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{it.model}</td>
                        <td style={{ ...tdStyle, color: T.sub, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{it.spec}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>{it.pgc_grams || "-"}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>{it.agcn_grams || "-"}</td>
                        <td style={{ ...tdStyle, textAlign: "right", color: calc.isSagup ? T.sub : undefined }}>
                          {calc.isSagup ? (
                            "사급 미적용"
                          ) : (
                            <input
                              type="number"
                              value={it.material_ni ?? 0}
                              onChange={(e) => changeNi(it, e.target.value)}
                              onBlur={() => saveNi(it)}
                              onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                              style={{ width: 76, border: `1px solid ${T.border}`, borderRadius: 4, padding: "3px 5px", fontSize: 12, textAlign: "right", fontFamily: "inherit" }}
                            />
                          )}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>{won(Math.round(calc.pgcCost))}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>{won(calc.etcCost)}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{won(Math.round(calc.total))}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>{it.yield_grams}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{won(Math.round(calc.cost))}</td>
                        <td style={{ ...tdStyle, textAlign: "right", color: T.teal, fontWeight: 700 }}>{((it.margin_rate || 0) * 100).toFixed(1)}%</td>
                        {TIER_LABELS.map((_, ti) => {
                          const val = tierPrice(it, calc, ti);
                          const m = marginOf(val, calc.cost);
                          const overridden = overrides[it.id]?.[ti] !== undefined && overrides[it.id][ti] !== "";
                          return (
                            <td key={ti} style={{ ...tdStyle, textAlign: "right", background: overridden ? "#FFF7E0" : undefined }}>
                              <input
                                type="number"
                                value={overridden ? overrides[it.id][ti] : calc.tiers[ti]}
                                onChange={(e) => setOverrides((prev) => ({ ...prev, [it.id]: { ...prev[it.id], [ti]: e.target.value } }))}
                                style={{ width: 76, border: `1px solid ${T.border}`, borderRadius: 4, padding: "3px 5px", fontSize: 12, textAlign: "right", fontFamily: "inherit" }}
                              />
                              <div style={{ fontSize: 9, color: m < 0.1 ? T.danger : T.sub, marginTop: 1 }}>{(m * 100).toFixed(1)}%</div>
                            </td>
                          );
                        })}
                        <td style={tdStyle}>
                          <IconBtn onClick={() => setEditing(it)}>✎</IconBtn>
                          <IconBtn danger onClick={() => removeItem(it)}>🗑</IconBtn>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {viewItems.length > 0 && (
            <div style={{ padding: "10px 20px", fontSize: 11, color: T.sub, borderTop: `1px solid ${T.border}` }}>
              거래처명을 클릭하면 그 거래처가 선택됩니다 · 구분·재료비(Ni)는 표에서 바로 고치면 저장·재계산됩니다 (사급 = Ni 재료비 미적용) · 재료비 = Ni자재 + 재료비PGC(PGC투입량×PGC평균가 + AgCN투입량×AgCN평균가) + 기타(기준 정보 입력값, 전 품목 공통) · 공정비용 = 재료비 합계 ÷ 수율 · 단가 = 공정비용 ÷ (1−마진율) 100원 올림, 수량 구간마다 마진 1.1%p 감소 · 단가 칸을 직접 고치면 노란색으로 표시되고 다운로드에 반영됩니다 · 엑셀 다운로드는 검색과 무관하게 선택한 거래처의 전체 품목 기준입니다
            </div>
          )}
        </div>
      </div>

      {editing !== null && company && (
        <QuoteItemModal
          companyId={company.id}
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadItems(); }}
        />
      )}
    </div>
  );
}
