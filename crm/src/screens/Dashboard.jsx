import React from "react";
import { T, CHANNELS, STAGES, stageInfo } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";
import { Header, Panel, Empty } from "../components/ui";
import { parseDealValue, fmtWonShort } from "./Pipeline";

// ===========================================================================
// 화면 1: 대시보드
// ===========================================================================
export function Dashboard({ companies, deals, activities, openCompany }) {
  const isMobile = useIsMobile();
  // 답장 필요한 메일 찾기 (회사별 최근 활동이 "받음"인 경우)
  const byCompany = {};
  activities.forEach((a) => {
    if (!byCompany[a.companyId] || a.date > byCompany[a.companyId].date) byCompany[a.companyId] = a;
  });
  // 무응답 경과일 계산 — 오래 기다린 거래처가 위로
  const today = new Date();
  const daysSince = (dateStr) => {
    const d = new Date((dateStr || "").slice(0, 10));
    if (isNaN(d)) return 0;
    return Math.max(0, Math.floor((today - d) / 86400000));
  };
  const needReply = Object.values(byCompany)
    .filter((a) => a.direction === "received")
    .map((a) => ({ ...a, waitDays: daysSince(a.date) }))
    .sort((x, y) => y.waitDays - x.waitDays);

  const openDeals = deals.filter((d) => d.stage !== "mass"); // 양산 전 = 진행 중

  // 이번 달 활동 수 (오늘 날짜 기준 YYYY-MM)
  const ym = new Date().toISOString().slice(0, 7);
  const thisMonth = activities.filter((a) => a.date.startsWith(ym)).length;

  return (
    <div>
      <Header title="대시보드" sub="오늘 챙겨야 할 것들" />
      <div style={{ padding: isMobile ? 14 : 28 }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: isMobile ? 10 : 16, marginBottom: isMobile ? 16 : 24 }}>
          <StatCard label="답장 필요" value={needReply.length} unit="건" color={T.danger} hint="받고 아직 회신 안 함" />
          <StatCard label="진행 중인 딜" value={openDeals.length} unit="건" color={T.teal} hint="양산 전 단계" />
          <StatCard label="전체 거래처" value={companies.length} unit="개사" color={T.navy} hint="등록됨" />
          <StatCard label="이번 달 대화" value={thisMonth} unit="건" color={T.warn} hint="모든 채널" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 14 : 20 }}>
          {/* 답장 필요한 메일 — 무응답 경과일이 긴 순서 */}
          <Panel title="답장이 필요한 대화">
            {needReply.length === 0 && <Empty>답장 필요한 대화가 없습니다 👍</Empty>}
            {needReply.map((a, i) => {
              const company = companies.find((c) => c.id === a.companyId);
              const ch = CHANNELS[a.channel] || CHANNELS.memo; // 알 수 없는 채널값 방어
              const urgent = a.waitDays >= 7;
              return (
                <div key={a.id} onClick={() => openCompany(a.companyId)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: i < needReply.length - 1 ? `1px solid ${T.border}` : "none", cursor: "pointer" }}>
                  <span style={{ fontSize: 18 }}>{ch.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: T.sub }}>{company?.name} · {a.person}</div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 10,
                    background: urgent ? "#FDECEA" : T.tint, color: urgent ? T.danger : T.sub,
                  }}>
                    {a.waitDays === 0 ? "오늘" : `${a.waitDays}일 경과`}
                  </span>
                  <span style={{ fontSize: 11, color: T.sub }}>{a.date.slice(5, 10)}</span>
                </div>
              );
            })}
          </Panel>

          {/* 채널별 이번 달 대화량 */}
          <Panel title="채널별 대화 현황">
            {Object.entries(CHANNELS).map(([key, ch]) => {
              const count = activities.filter((a) => a.channel === key).length;
              const max = Math.max(1, ...Object.keys(CHANNELS).map((k) => activities.filter((a) => a.channel === k).length));
              return (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px" }}>
                  <span style={{ fontSize: 16, width: 24 }}>{ch.icon}</span>
                  <span style={{ width: 60, fontSize: 13, fontWeight: 600 }}>{ch.label}</span>
                  <div style={{ flex: 1, height: 8, background: T.bg, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${(count / max) * 100}%`, height: "100%", background: ch.color, borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.sub, width: 30, textAlign: "right" }}>{count}</span>
                </div>
              );
            })}
          </Panel>
        </div>

        <div style={{ height: isMobile ? 14 : 20 }} />

        {/* 단계별 딜 현황 — 파이프라인 요약 (수 + 금액 합계) */}
        <Panel title="단계별 딜 현황">
          {deals.length === 0 && <Empty>등록된 딜이 없습니다</Empty>}
          {deals.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : `repeat(${STAGES.length}, 1fr)`, gap: isMobile ? 8 : 12, paddingTop: 4 }}>
              {STAGES.map((stage) => {
                const cards = deals.filter((d) => stageInfo(d.stage).key === stage.key);
                const sum = cards.reduce((acc, c) => acc + (parseDealValue(c.value) || 0), 0);
                return (
                  <div key={stage.key} style={{ borderTop: `3px solid ${stage.color}`, background: T.bg, borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.sub }}>{stage.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: T.navy, margin: "2px 0" }}>{cards.length}<span style={{ fontSize: 11, color: T.sub, fontWeight: 600 }}> 건</span></div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: sum > 0 ? stage.color : T.sub }}>{sum > 0 ? `₩${fmtWonShort(sum)}` : "-"}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function StatCard({ label, value, unit, color, hint }) {
  return (
    <div style={{ background: T.card, borderRadius: 12, padding: 20, border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 12, color: T.sub, fontWeight: 600 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, margin: "8px 0 4px" }}>
        <span style={{ fontSize: 32, fontWeight: 800, color }}>{value}</span>
        <span style={{ fontSize: 14, color: T.sub, fontWeight: 600 }}>{unit}</span>
      </div>
      <div style={{ fontSize: 11, color: T.sub }}>{hint}</div>
    </div>
  );
}
