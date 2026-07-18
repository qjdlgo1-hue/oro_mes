import React, { useState } from "react";
import { T, STAGES, stageInfo } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";
import { Header, IconBtn } from "../components/ui";

// 딜 금액 텍스트("5,000만원", "2억", "3000000" 등)에서 숫자(원)를 추출 — 못 읽으면 null
export function parseDealValue(text) {
  const s = String(text || "").replace(/[,\s원₩]/g, "");
  if (!s) return null;
  const eok = s.match(/([\d.]+)억/);
  const man = s.match(/([\d.]+)만/);
  if (eok || man) {
    let n = 0;
    if (eok) n += parseFloat(eok[1]) * 1e8;
    if (man) n += parseFloat(man[1]) * 1e4;
    return isNaN(n) ? null : n;
  }
  const plain = parseFloat(s);
  return isNaN(plain) ? null : plain;
}

// 원 단위 금액을 짧게 표시 (1.5억 / 5,000만 / 9,900)
export function fmtWonShort(n) {
  if (n >= 1e8) return `${(n / 1e8).toFixed(n % 1e8 === 0 ? 0 : 1)}억`;
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만`;
  return n.toLocaleString("ko-KR");
}

// ===========================================================================
// 화면 4: 파이프라인 (칸반) — 드래그앤드롭 + 단계별 금액 합계
// ===========================================================================
export function Pipeline({ deals, companies, moveDeal, onEditDeal }) {
  const isMobile = useIsMobile();
  const companyName = (id) => companies.find((c) => c.id === id)?.name || "?";
  const [dragOver, setDragOver] = useState(null); // 드래그 중인 칸의 stage key (하이라이트용)

  return (
    <div>
      <Header title="영업 파이프라인" sub={isMobile ? "◀ ▶ 버튼으로 딜의 단계를 옮기세요" : "카드를 끌어다 놓거나 ◀ ▶ 버튼으로 단계를 옮기세요"} />
      <div style={{ padding: isMobile ? 14 : 28, overflowX: "auto" }}>
        <div style={{ display: "flex", gap: 14, minWidth: "max-content" }}>
          {STAGES.map((stage) => {
            // stageInfo로 매칭 — 알 수 없는 단계값의 딜도 '문의' 칸에 표시 (사라지지 않게)
            const cards = deals.filter((d) => stageInfo(d.stage).key === stage.key);
            const sum = cards.reduce((acc, c) => acc + (parseDealValue(c.value) || 0), 0);
            const isOver = dragOver === stage.key;
            return (
              <div
                key={stage.key}
                style={{ width: 230, flexShrink: 0 }}
                onDragOver={(e) => { e.preventDefault(); if (dragOver !== stage.key) setDragOver(stage.key); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const dealId = e.dataTransfer.getData("text/plain");
                  const deal = deals.find((d) => d.id === dealId);
                  if (deal && stageInfo(deal.stage).key !== stage.key) moveDeal(dealId, stage.key);
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, padding: "0 4px" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: stage.color }} />
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{stage.label}</span>
                  <span style={{ fontSize: 12, color: T.sub, fontWeight: 600 }}>{cards.length}</span>
                </div>
                <div style={{ fontSize: 11, color: sum > 0 ? T.navy : T.sub, fontWeight: 700, marginBottom: 10, padding: "0 4px", minHeight: 14 }}>
                  {sum > 0 ? `₩${fmtWonShort(sum)}` : ""}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, borderRadius: 10, transition: "background 0.15s", background: isOver ? T.tint2 : "transparent", padding: isOver ? 4 : 0, border: isOver ? `2px dashed ${T.teal}` : "none" }}>
                  {cards.map((card) => {
                    const idx = STAGES.findIndex((s) => s.key === stage.key);
                    return (
                      <div
                        key={card.id}
                        draggable={!isMobile}
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", card.id); e.dataTransfer.effectAllowed = "move"; }}
                        style={{ background: T.card, borderRadius: 10, padding: 14, border: `1px solid ${T.border}`, borderTop: `3px solid ${stage.color}`, cursor: isMobile ? "default" : "grab" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                          <div style={{ width: 22, height: 22, borderRadius: 6, background: T.navy, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 9 }}>
                            {companyName(card.companyId).slice(0, 2)}
                          </div>
                          <span style={{ fontWeight: 700, fontSize: 12, flex: 1 }}>{companyName(card.companyId)}</span>
                          <IconBtn onClick={() => onEditDeal(card)}>✎</IconBtn>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{card.title}</div>
                        <div style={{ fontSize: 11, color: T.sub, marginBottom: 8 }}>{card.spec}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.navy, paddingBottom: 8, borderBottom: `1px solid ${T.border}`, marginBottom: 8 }}>
                          {card.value}
                        </div>
                        {/* 단계 이동 버튼 */}
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => idx > 0 && moveDeal(card.id, STAGES[idx - 1].key)}
                            disabled={idx === 0}
                            style={{ flex: 1, fontSize: 11, padding: "5px", borderRadius: 6, border: `1px solid ${T.border}`, background: idx === 0 ? T.bg : "#fff", color: idx === 0 ? "#B4BEC8" : T.sub, cursor: idx === 0 ? "default" : "pointer", fontWeight: 600 }}
                          >
                            ◀ 이전
                          </button>
                          <button
                            onClick={() => idx < STAGES.length - 1 && moveDeal(card.id, STAGES[idx + 1].key)}
                            disabled={idx === STAGES.length - 1}
                            style={{ flex: 1, fontSize: 11, padding: "5px", borderRadius: 6, border: "none", background: idx === STAGES.length - 1 ? T.bg : T.teal, color: idx === STAGES.length - 1 ? "#B4BEC8" : "#fff", cursor: idx === STAGES.length - 1 ? "default" : "pointer", fontWeight: 700 }}
                          >
                            다음 ▶
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {cards.length === 0 && (
                    <div style={{ border: `2px dashed ${T.border}`, borderRadius: 10, padding: 20, textAlign: "center", fontSize: 12, color: T.sub }}>
                      {isOver ? "여기에 놓기" : "비어 있음"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
