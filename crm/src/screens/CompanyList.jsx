import React from "react";
import { T } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";
import { Header, TierBadge, btnStyle } from "../components/ui";

// ===========================================================================
// 화면 2: 거래처 목록
// ===========================================================================
export function CompanyList({ companies, deals, activities, openCompany, onAdd }) {
  const isMobile = useIsMobile();
  return (
    <div>
      <Header
        title="거래처"
        sub={`${companies.length}개사 등록됨`}
        right={<button onClick={onAdd} style={btnStyle("primary")}>+ 거래처 추가</button>}
      />
      <div style={{ padding: isMobile ? 14 : 28 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {companies.map((c) => {
            const dealCount = deals.filter((d) => d.companyId === c.id && d.stage !== "mass").length;
            const lastActivity = activities.filter((a) => a.companyId === c.id).sort((a, b) => b.date.localeCompare(a.date))[0];
            return (
              <div key={c.id} onClick={() => openCompany(c.id)}
                style={{ background: T.card, borderRadius: 12, padding: 20, border: `1px solid ${T.border}`, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: T.navy, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>
                    {c.name.slice(0, 2)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: T.sub }}>{c.country} · {c.domain}</div>
                  </div>
                  <TierBadge tier={c.tier} />
                </div>
                <div style={{ fontSize: 12, color: T.sub, marginBottom: 10 }}>{c.product}</div>
                <div style={{ display: "flex", gap: 8, fontSize: 11, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                  <span style={{ color: T.teal, fontWeight: 700 }}>진행 딜 {dealCount}</span>
                  <span style={{ color: T.sub, marginLeft: "auto" }}>
                    {lastActivity ? `최근 ${lastActivity.date.slice(5, 10)}` : "대화 없음"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
