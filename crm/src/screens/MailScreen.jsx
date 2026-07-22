import React, { useState } from "react";
import { T } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";
import { Header, FilterChip, Empty, inputStyle, btnStyle } from "../components/ui";
import { openAttachment, fmtSize } from "./CompanyDetail";

// ===========================================================================
// 화면: 메일 — 전 거래처의 이메일(자동 수집 + 수동 기록)을 한곳에서 봅니다
// 데이터는 기존 대화기록(activities)에서 channel=email만 골라 표시 — 별도 저장소 없음
// ===========================================================================
const PAGE = 50; // 한 번에 보여줄 개수 (더 보기로 추가 로드)

export function MailScreen({ activities, companies, openCompany }) {
  const isMobile = useIsMobile();
  const [dir, setDir] = useState("all"); // all | received | sent
  const [companyId, setCompanyId] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null); // 펼쳐진 메일 id
  const [limit, setLimit] = useState(PAGE);

  const nameOf = (cid) => companies.find((c) => c.id === cid)?.name || "?";
  const mails = activities.filter((a) => a.channel === "email");

  const q = search.trim().toLowerCase();
  const filtered = mails
    .filter((a) => (dir === "all" ? true : a.direction === dir))
    .filter((a) => (companyId ? a.companyId === companyId : true))
    .filter((a) => (q ? [a.title, a.body, a.person, nameOf(a.companyId)].some((s) => (s || "").toLowerCase().includes(q)) : true))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const shown = filtered.slice(0, limit);

  const received = mails.filter((a) => a.direction === "received").length;

  return (
    <div>
      <Header title="메일" sub={`전 거래처의 이메일 ${mails.length}건 (받은 ${received} · 보낸 ${mails.length - received}) — 자동 수집분과 수동 기록 모두 표시`} />
      <div style={{ padding: isMobile ? 14 : 28 }}>
        {/* 필터 바 */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          {[["all", "전체"], ["received", "📥 받은 메일"], ["sent", "📤 보낸 메일"]].map(([k, label]) => (
            <FilterChip key={k} active={dir === k} onClick={() => { setDir(k); setLimit(PAGE); }}>{label}</FilterChip>
          ))}
          <select style={{ ...inputStyle, width: 170, padding: "7px 10px", fontSize: 12 }} value={companyId} onChange={(e) => { setCompanyId(e.target.value); setLimit(PAGE); }}>
            <option value="">전체 거래처</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setLimit(PAGE); }}
            placeholder="🔍 제목·본문·보낸이·거래처 검색"
            style={{ ...inputStyle, width: isMobile ? "100%" : 260, padding: "7px 10px", fontSize: 12 }}
          />
          {(dir !== "all" || companyId || q) && (
            <span style={{ fontSize: 12, color: T.sub, fontWeight: 600 }}>{filtered.length}건</span>
          )}
        </div>

        {/* 메일 목록 */}
        <div style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>
          {shown.length === 0 && (
            <Empty>
              {mails.length === 0
                ? "아직 수집·기록된 이메일이 없습니다 — 설정에서 메일 계정을 등록하면 1시간마다 자동 수집됩니다"
                : "조건에 맞는 메일이 없습니다"}
            </Empty>
          )}
          {shown.map((a) => {
            const opened = openId === a.id;
            const inbound = a.direction === "received";
            return (
              <div key={a.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                {/* 행 (클릭 → 본문 펼치기) */}
                <div
                  onClick={() => setOpenId(opened ? null : a.id)}
                  style={{ display: "flex", gap: 10, alignItems: isMobile ? "flex-start" : "center", padding: "11px 16px", cursor: "pointer", background: opened ? T.tint : "transparent", flexDirection: isMobile ? "column" : "row" }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0, flex: 1, width: isMobile ? "100%" : undefined }}>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 10, background: inbound ? "#E8EEF4" : T.tint2, color: inbound ? T.navy : T.tealDark, flexShrink: 0 }}>
                      {inbound ? "받음" : "보냄"}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); openCompany(a.companyId); }}
                      title="거래처 상세로 이동"
                      style={{ border: "none", background: "none", padding: 0, fontSize: 12, fontWeight: 700, color: T.teal, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {nameOf(a.companyId)}
                    </button>
                    <span style={{ fontSize: 13, fontWeight: opened ? 700 : 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {a.title}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0, marginLeft: isMobile ? 0 : "auto" }}>
                    {Array.isArray(a.attachments) && a.attachments.length > 0 && <span style={{ fontSize: 11, color: T.sub }}>📎{a.attachments.length}</span>}
                    {a.person && <span style={{ fontSize: 11, color: T.sub, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.person}</span>}
                    <span style={{ fontSize: 11, color: T.sub, whiteSpace: "nowrap" }}>{(a.date || "").slice(0, 16)}</span>
                  </div>
                </div>
                {/* 본문 + 첨부 */}
                {opened && (
                  <div style={{ padding: "0 16px 14px 16px", background: T.tint }}>
                    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "12px 14px", fontSize: 12.5, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", color: T.text, maxHeight: 420, overflowY: "auto" }}>
                      {a.body || "(본문 없음)"}
                    </div>
                    {Array.isArray(a.attachments) && a.attachments.length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                        {a.attachments.map((att) => (
                          <button
                            key={att.path}
                            onClick={() => openAttachment(att)}
                            title={att.name}
                            style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 14, border: `1px solid ${T.border}`, background: T.card, fontSize: 11, fontWeight: 600, color: T.navy, cursor: "pointer", fontFamily: "inherit", maxWidth: 220 }}
                          >
                            📎 <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</span>
                            <span style={{ color: T.sub, fontWeight: 500 }}>{fmtSize(att.size)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {filtered.length > limit && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button onClick={() => setLimit((n) => n + PAGE)} style={btnStyle("ghost")}>
              더 보기 ({filtered.length - limit}건 남음)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
