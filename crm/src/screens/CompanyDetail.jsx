import React, { useState } from "react";
import { T, CHANNELS, stageInfo } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";
import { supabase } from "../lib/supabase";
import { Header, SectionHead, InfoRow, TierBadge, FilterChip, IconBtn, Empty, btnStyle } from "../components/ui";

// 메일 제목 정규화 — Re:/Fwd:/답장:/전달: 접두를 반복 제거해 같은 스레드를 묶는 키로 사용
export function normSubject(title) {
  let s = String(title || "").trim();
  const re = /^\s*((re|fw|fwd|답장|전달|회신)\s*:|\[(re|fw|fwd)\])\s*/i;
  while (re.test(s)) s = s.replace(re, "");
  return s.toLowerCase().trim();
}

// 첨부파일 열기 — 비공개 버킷이라 서명 URL 발급 후 새 탭
async function openAttachment(att) {
  try {
    const { data, error } = await supabase.storage.from("crm-mail-files").createSignedUrl(att.path, 300);
    if (error) throw error;
    window.open(data.signedUrl, "_blank");
  } catch (e) { alert(`파일 열기 실패: ${e.message}`); }
}

const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

// ===========================================================================
// 화면 3: 거래처 상세 (CRM의 심장)
// ===========================================================================
export function CompanyDetail({
  company, contacts, deals, activities, back, onAddActivity, onAddContact, onAddDeal,
  onEditCompany, onDeleteCompany, onEditContact, onDeleteContact,
  onEditDeal, onDeleteDeal, onEditActivity, onDeleteActivity,
}) {
  const [filter, setFilter] = useState("all"); // 타임라인 채널 필터
  const [openThreads, setOpenThreads] = useState(() => new Set()); // 펼쳐진 스레드 키
  const isMobile = useIsMobile();

  if (!company) return null;

  // 필터 적용된 활동 목록 (최신순 정렬)
  const filtered = activities
    .filter((a) => filter === "all" || a.channel === filter)
    .sort((a, b) => b.date.localeCompare(a.date));

  // 이메일은 같은 제목(Re:/Fwd: 제거)끼리 스레드로 묶음 — 최신 메일만 보이고 이전 것은 접힘
  const entries = [];
  const threadOf = new Map(); // normSubject key -> entry
  for (const a of filtered) {
    if (a.channel === "email") {
      const key = normSubject(a.title);
      if (key && threadOf.has(key)) { threadOf.get(key).thread.push(a); continue; }
      const entry = { main: a, thread: [], key: key || a.id };
      if (key) threadOf.set(key, entry);
      entries.push(entry);
    } else {
      entries.push({ main: a, thread: [], key: a.id });
    }
  }
  const toggleThread = (key) =>
    setOpenThreads((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <div>
      <Header
        title={company.name}
        sub={`${company.country} · ${company.domain} · ${company.tier} 거래처`}
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {onEditCompany && <button onClick={() => onEditCompany(company)} style={btnStyle("ghost")}>✎ 수정</button>}
            {onDeleteCompany && <button onClick={() => onDeleteCompany(company)} style={{ ...btnStyle("ghost"), color: T.danger }}>🗑 삭제</button>}
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
                {onEditContact && <IconBtn onClick={() => onEditContact(c)}>✎</IconBtn>}
                {onDeleteContact && <IconBtn danger onClick={() => onDeleteContact(c)}>🗑</IconBtn>}
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
                    {onEditDeal && <IconBtn onClick={() => onEditDeal(d)}>✎</IconBtn>}
                    {onDeleteDeal && <IconBtn danger onClick={() => onDeleteDeal(d)}>🗑</IconBtn>}
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
                {onAddActivity && (
                  <button onClick={onAddActivity} style={{ ...btnStyle("primary"), fontSize: 12, padding: "7px 14px", marginLeft: 4 }}>
                    + 대화 기록
                  </button>
                )}
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
              {entries.map((en, i) => (
                <div key={en.main.id}>
                  <ActivityItem
                    activity={en.main}
                    deal={deals.find((d) => d.id === en.main.dealId)}
                    last={i === entries.length - 1 && en.thread.length === 0}
                    onEdit={() => onEditActivity(en.main)}
                    onDelete={() => onDeleteActivity(en.main)}
                  />
                  {en.thread.length > 0 && (
                    <div style={{ padding: "0 20px 10px 70px" }}>
                      <button
                        onClick={() => toggleThread(en.key)}
                        style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: T.teal, padding: 0, fontFamily: "inherit" }}
                      >
                        {openThreads.has(en.key) ? "▾ 이전 메일 접기" : `▸ 같은 스레드의 이전 메일 ${en.thread.length}개 보기`}
                      </button>
                      {openThreads.has(en.key) && (
                        <div style={{ marginTop: 6, borderLeft: `3px solid ${T.tint2}`, background: "#FAFCFC", borderRadius: 8 }}>
                          {en.thread.map((a, ti) => (
                            <ActivityItem
                              key={a.id}
                              activity={a}
                              deal={deals.find((d) => d.id === a.dealId)}
                              last={ti === en.thread.length - 1}
                              onEdit={() => onEditActivity(a)}
                              onDelete={() => onDeleteActivity(a)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 타임라인 개별 항목
const BODY_CLAMP = 400; // 본문이 길면 여기까지만 보여주고 '더보기'
function ActivityItem({ activity, deal, last, onEdit, onDelete }) {
  const ch = CHANNELS[activity.channel] || CHANNELS.memo; // 알 수 없는 채널값 방어 (크래시 방지)
  const isSent = activity.direction === "sent";
  const [bodyOpen, setBodyOpen] = useState(false);
  const body = activity.body || "";
  const isLong = body.length > BODY_CLAMP;
  const shownBody = bodyOpen || !isLong ? body : body.slice(0, BODY_CLAMP) + "…";
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
        <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{shownBody}</div>
        {isLong && (
          <button
            onClick={() => setBodyOpen((v) => !v)}
            style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: T.teal, padding: "4px 0 0", fontFamily: "inherit" }}
          >
            {bodyOpen ? "▾ 본문 접기" : "▸ 본문 더보기"}
          </button>
        )}
        {Array.isArray(activity.attachments) && activity.attachments.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {activity.attachments.map((att) => (
              <button
                key={att.path}
                onClick={() => openAttachment(att)}
                title={att.name}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 14, border: `1px solid ${T.border}`, background: T.bg, fontSize: 11, fontWeight: 600, color: T.navy, cursor: "pointer", fontFamily: "inherit", maxWidth: 220 }}
              >
                📎 <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</span>
                <span style={{ color: T.sub, fontWeight: 500 }}>{fmtSize(att.size)}</span>
              </button>
            ))}
          </div>
        )}
        {deal && (
          <div style={{ marginTop: 8 }}>
            <span style={{ fontSize: 11, color: T.teal, fontWeight: 600 }}>🔗 {deal.title}</span>
          </div>
        )}
      </div>
    </div>
  );
}
