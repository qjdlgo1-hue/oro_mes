import React, { useState, useEffect } from "react";
import { T, CHANNELS, stageInfo } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";
import { Empty } from "../components/ui";

// ===========================================================================
// 통합 검색 오버레이 — 거래처/담당자/딜/대화를 한 번에 검색
// ===========================================================================
export function SearchOverlay({ companies, contacts, deals, activities, onOpenCompany, onClose }) {
  const [q, setQ] = useState("");
  const isMobile = useIsMobile();

  // ESC 키로 닫기
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const query = q.trim().toLowerCase();
  const has = (s) => (s || "").toLowerCase().includes(query);
  const companyName = (id) => companies.find((c) => c.id === id)?.name || "?";

  const results = query
    ? {
        companies: companies.filter((c) => has(c.name) || has(c.domain) || has(c.product) || has(c.memo)).slice(0, 5),
        contacts: contacts.filter((p) => has(p.name) || has(p.contact) || has(p.role)).slice(0, 5),
        deals: deals.filter((d) => has(d.title) || has(d.spec)).slice(0, 5),
        activities: activities.filter((a) => has(a.title) || has(a.body) || has(a.person)).slice(0, 8),
      }
    : null;
  const total = results ? results.companies.length + results.contacts.length + results.deals.length + results.activities.length : 0;

  const Row = ({ icon, title, sub, companyId }) => (
    <div onClick={() => onOpenCompany(companyId)}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, cursor: "pointer" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = T.tint)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      <span style={{ fontSize: 15, width: 20 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ fontSize: 11, color: T.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
      </div>
    </div>
  );

  const Section = ({ label, children }) =>
    children.length > 0 && (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, padding: "6px 12px 2px", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
        {children}
      </div>
    );

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(10,31,61,0.5)", zIndex: 120, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: isMobile ? "16px 10px" : "80px 20px" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 560, maxHeight: isMobile ? "85vh" : "70vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 15 }}>🔍</span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="거래처, 담당자, 딜, 대화 내용 검색..."
            style={{ flex: 1, border: "none", outline: "none", fontSize: 15, fontFamily: "inherit", background: "transparent" }}
          />
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: T.sub, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ overflow: "auto", padding: "8px 6px" }}>
          {!query && <Empty small>검색어를 입력하세요</Empty>}
          {query && total === 0 && <Empty small>'{q}' 검색 결과가 없습니다</Empty>}
          {results && (
            <>
              <Section label={`거래처 (${results.companies.length})`}>
                {results.companies.map((c) => (
                  <Row key={c.id} icon="🏢" title={c.name} sub={`${c.country || ""} · ${c.domain || ""} · ${c.product || ""}`} companyId={c.id} />
                ))}
              </Section>
              <Section label={`담당자 (${results.contacts.length})`}>
                {results.contacts.map((p) => (
                  <Row key={p.id} icon="👤" title={p.name} sub={`${companyName(p.companyId)} · ${p.role || ""} · ${p.contact || ""}`} companyId={p.companyId} />
                ))}
              </Section>
              <Section label={`딜 (${results.deals.length})`}>
                {results.deals.map((d) => (
                  <Row key={d.id} icon="▤" title={d.title} sub={`${companyName(d.companyId)} · ${stageInfo(d.stage).label} · ${d.spec || ""}`} companyId={d.companyId} />
                ))}
              </Section>
              <Section label={`대화 기록 (${results.activities.length})`}>
                {results.activities.map((a) => (
                  <Row key={a.id} icon={CHANNELS[a.channel]?.icon || "📝"} title={a.title} sub={`${companyName(a.companyId)} · ${a.person || ""} · ${a.date}`} companyId={a.companyId} />
                ))}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
