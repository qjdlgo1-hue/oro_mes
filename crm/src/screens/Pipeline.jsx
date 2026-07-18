import React from "react";
import { T, STAGES, stageInfo } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";
import { Header, IconBtn } from "../components/ui";

// ===========================================================================
// 화면 4: 파이프라인 (칸반)
// ===========================================================================
export function Pipeline({ deals, companies, moveDeal, onEditDeal }) {
  const isMobile = useIsMobile();
  const companyName = (id) => companies.find((c) => c.id === id)?.name || "?";

  return (
    <div>
      <Header title="영업 파이프라인" sub="◀ ▶ 버튼으로 딜의 단계를 옮기세요" />
      <div style={{ padding: isMobile ? 14 : 28, overflowX: "auto" }}>
        <div style={{ display: "flex", gap: 14, minWidth: "max-content" }}>
          {STAGES.map((stage) => {
            // stageInfo로 매칭 — 알 수 없는 단계값의 딜도 '문의' 칸에 표시 (사라지지 않게)
            const cards = deals.filter((d) => stageInfo(d.stage).key === stage.key);
            return (
              <div key={stage.key} style={{ width: 230, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "0 4px" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: stage.color }} />
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{stage.label}</span>
                  <span style={{ fontSize: 12, color: T.sub, fontWeight: 600 }}>{cards.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {cards.map((card) => {
                    const idx = STAGES.findIndex((s) => s.key === stage.key);
                    return (
                      <div key={card.id} style={{ background: T.card, borderRadius: 10, padding: 14, border: `1px solid ${T.border}`, borderTop: `3px solid ${stage.color}` }}>
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
                      비어 있음
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
