import React, { useState } from "react";
import { T, CHANNELS, stageInfo } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";
import { Header, SectionHead, InfoRow, TierBadge, FilterChip, IconBtn, Empty, btnStyle } from "../components/ui";

// ===========================================================================
// 화면 3: 거래처 상세 (CRM의 심장)
// ===========================================================================
export function CompanyDetail({
  company, contacts, deals, activities, back, onAddActivity, onAddContact, onAddDeal,
  onEditCompany, onDeleteCompany, onEditContact, onDeleteContact,
  onEditDeal, onDeleteDeal, onEditActivity, onDeleteActivity,
}) {
  const [filter, setFilter] = useState("all"); // 타임라인 채널 필터
  const isMobile = useIsMobile();

  if (!company) return null;

  // 필터 적용된 활동 목록 (최신순 정렬)
  const filtered = activities
    .filter((a) => filter === "all" || a.channel === filter)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      <Header
        title={company.name}
        sub={`${company.country} · ${company.domain} · ${company.tier} 거래처`}
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => onEditCompany(company)} style={btnStyle("ghost")}>✎ 수정</button>
            <button onClick={() => onDeleteCompany(company)} style={{ ...btnStyle("ghost"), color: T.danger }}>🗑 삭제</button>
            <button onClick={back} style={btnStyle("ghost")}>← 목록으로</button>
          </div>
        }
      />
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 14 : 20, padding: isMobile ? 14 : 28 }}>
        {/* 왼쪽 정보 (모바일에선 위쪽) */}
        <div style={{ width: isMobile ? "auto" : 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: isMobile ? 14 : 20 }}>
          {/* 회사 정보 */}
          <div style={{ background: T.card, borderRadius: 12, padding: 20, border: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: T.navy, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800 }}>
                {company.name.slice(0, 2)}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{company.name}</div>
                <TierBadge tier={company.tier} />
              </div>
            </div>
            <InfoRow label="국가" value={company.country} />
            <InfoRow label="도메인" value={company.domain} />
            <InfoRow label="제품군" value={company.product} />
            <InfoRow label="총 대화" value={`${activities.length}건`} />
            {company.memo && (
              <div style={{ marginTop: 10, padding: 10, background: T.bg, borderRadius: 8, fontSize: 12, color: T.sub, lineHeight: 1.5 }}>
                {company.memo}
              </div>
            )}
          </div>

          {/* 담당자 */}
          <div style={{ background: T.card, borderRadius: 12, padding: 20, border: `1px solid ${T.border}` }}>
            <SectionHead label="담당자" onAdd={onAddContact} />
            {contacts.length === 0 && <Empty small>담당자를 추가하세요</Empty>}
            {contacts.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: T.navy }}>
                  {c.name[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: T.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.role} · {c.contact}
                  </div>
                </div>
                <IconBtn onClick={() => onEditContact(c)}>✎</IconBtn>
                <IconBtn danger onClick={() => onDeleteContact(c)}>🗑</IconBtn>
              </div>
            ))}
          </div>

          {/* 딜 */}
          <div style={{ background: T.card, borderRadius: 12, padding: 20, border: `1px solid ${T.border}` }}>
            <SectionHead label="진행 중인 딜" onAdd={onAddDeal} />
            {deals.length === 0 && <Empty small>딜을 추가하세요</Empty>}
            {deals.map((d) => {
              const s = stageInfo(d.stage);
              return (
                <div key={d.id} style={{ padding: "10px 12px", background: T.bg, borderRadius: 8, marginTop: 8 }}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <div style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 0 }}>{d.title}</div>
                    <IconBtn onClick={() => onEditDeal(d)}>✎</IconBtn>
                    <IconBtn danger onClick={() => onDeleteDeal(d)}>🗑</IconBtn>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: T.sub }}>{d.spec}</span>
                    <span style={{ fontSize: 11, color: s.color, fontWeight: 700 }}>{s.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 오른쪽 타임라인 */}
        <div style={{ flex: 1 }}>
          <div style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>대화 타임라인</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>전체</FilterChip>
                {Object.entries(CHANNELS).map(([key, ch]) => (
                  <FilterChip key={key} active={filter === key} onClick={() => setFilter(key)}>
                    {ch.icon} {ch.label}
                  </FilterChip>
                ))}
                <button onClick={onAddActivity} style={{ ...btnStyle("primary"), fontSize: 12, padding: "7px 14px", marginLeft: 4 }}>
                  + 대화 기록
                </button>
              </div>
            </div>

            <div style={{ padding: "8px 0" }}>
              {filtered.length === 0 && (
                <Empty>
                  {filter === "all" ? "아직 기록된 대화가 없습니다" : `${CHANNELS[filter].label} 대화가 없습니다`}
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    이메일·LINE·WeChat 대화를 "+ 대화 기록"으로 남겨보세요
                  </div>
                </Empty>
              )}
              {filtered.map((a, i) => (
                <ActivityItem
                  key={a.id}
                  activity={a}
                  deal={deals.find((d) => d.id === a.dealId)}
                  last={i === filtered.length - 1}
                  onEdit={() => onEditActivity(a)}
                  onDelete={() => onDeleteActivity(a)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 타임라인 개별 항목
function ActivityItem({ activity, deal, last, onEdit, onDelete }) {
  const ch = CHANNELS[activity.channel] || CHANNELS.memo; // 알 수 없는 채널값 방어 (크래시 방지)
  const isSent = activity.direction === "sent";
  return (
    <div style={{ display: "flex", gap: 14, padding: "16px 20px", borderBottom: last ? "none" : `1px solid ${T.border}` }}>
      <div style={{ flexShrink: 0, paddingTop: 2 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: ch.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
          {ch.icon}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{activity.person}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: ch.color, background: ch.bg, padding: "1px 7px", borderRadius: 4 }}>
              {ch.label}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, color: isSent ? T.tealDark : T.navy, background: isSent ? T.tint2 : "#E8EEF4", padding: "1px 7px", borderRadius: 4 }}>
              {isSent ? "보냄 ↑" : "받음 ↓"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: 11, color: T.sub }}>{activity.date}</span>
            {onEdit && <IconBtn onClick={onEdit}>✎</IconBtn>}
            {onDelete && <IconBtn danger onClick={onDelete}>🗑</IconBtn>}
          </div>
        </div>
        <div style={{ fontWeight: 600, fontSize: 14, margin: "5px 0" }}>{activity.title}</div>
        <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{activity.body}</div>
        {deal && (
          <div style={{ marginTop: 8 }}>
            <span style={{ fontSize: 11, color: T.teal, fontWeight: 600 }}>🔗 {deal.title}</span>
          </div>
        )}
      </div>
    </div>
  );
}
