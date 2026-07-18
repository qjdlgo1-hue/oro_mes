import React from "react";
import { T } from "../theme";
import { btnStyle } from "../components/ui";

// ===========================================================================
// 사이드바
// ===========================================================================
export function Sidebar({ screen, setScreen, unreplied, mode, email, onLogout, onSwitchToCloud, onSearch }) {
  const menus = [
    { key: "dashboard", label: "대시보드", icon: "▦" },
    { key: "companies", label: "거래처", icon: "🏢" },
    { key: "pipeline", label: "영업 파이프라인", icon: "▤" },
    { key: "quotes", label: "견적", icon: "₩" },
    { key: "settings", label: "설정", icon: "⚙" },
  ];

  return (
    <div style={{ width: 220, background: T.card, color: T.text, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "22px 20px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, color: T.navy }}>
          ORO <span style={{ color: T.teal }}>CRM</span>
        </div>
        <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>오알오 주식회사</div>
      </div>

      <div style={{ padding: "12px 10px 0" }}>
        <button onClick={onSearch}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.tint, color: T.sub, cursor: "pointer", fontSize: 13, textAlign: "left" }}>
          🔍 검색...
        </button>
      </div>

      <div style={{ padding: "12px 10px", flex: 1 }}>
        {menus.map((m) => {
          const active = screen === m.key || (m.key === "companies" && screen === "company");
          return (
            <button
              key={m.key}
              onClick={() => setScreen(m.key)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "11px 14px", marginBottom: 4, border: "none", borderRadius: 8,
                cursor: "pointer", textAlign: "left", fontSize: 14,
                fontWeight: active ? 700 : 500,
                background: active ? T.tint2 : "transparent",
                color: active ? T.teal : T.sub,
                borderLeft: active ? `3px solid ${T.teal}` : "3px solid transparent",
              }}
            >
              <span style={{ fontSize: 15, width: 18 }}>{m.icon}</span>
              <span style={{ flex: 1 }}>{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* LINE 공식계정 연동 - 나중 옵션 자리 */}
      <div style={{ padding: "0 14px 12px" }}>
        <div style={{ background: T.tint, borderRadius: 8, padding: "12px 14px", fontSize: 11, color: T.sub, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: T.navy, marginBottom: 4 }}>💬 LINE 자동 연동</div>
          공식계정 전환 시 활성화 예정<br />(현재는 수동 기록 사용)
        </div>
      </div>

      <div style={{ padding: "16px 20px", borderTop: `1px solid ${T.border}`, fontSize: 12, color: T.sub }}>
        {mode === "cloud" ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.teal, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>
                {(email || "?")[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: T.navy, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>{email}</div>
                <div style={{ fontSize: 10, color: T.teal, fontWeight: 700 }}>☁️ 서버 저장 (팀 공유)</div>
              </div>
            </div>
            <button onClick={onLogout} style={{ width: "100%", padding: "6px", borderRadius: 6, border: `1px solid ${T.border}`, background: "#fff", color: T.sub, fontSize: 11, cursor: "pointer" }}>
              로그아웃
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 11, marginBottom: 8, color: T.navy }}>💾 로컬 모드<br /><span style={{ fontSize: 10, color: T.sub }}>이 브라우저에만 저장됨</span></div>
            <button onClick={onSwitchToCloud} style={{ width: "100%", padding: "6px", borderRadius: 6, border: "none", background: T.teal, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              ☁️ 서버 모드로 전환 (로그인)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


// ===========================================================================
// 모바일 상단 바 + 하단 탭바
// ===========================================================================
export function MobileTopBar({ mode, email, onLogout, onSwitchToCloud, onSearch }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: T.card, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
      <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.5, color: T.navy }}>
        ORO <span style={{ color: T.teal }}>CRM</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={onSearch} style={{ border: "none", background: "transparent", fontSize: 17, cursor: "pointer", padding: "2px 4px" }}>🔍</button>
        {mode === "cloud" ? (
          <>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: T.teal, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11 }}>
              {(email || "?")[0].toUpperCase()}
            </div>
            <button onClick={onLogout} style={{ ...btnStyle("ghost"), fontSize: 11, padding: "5px 10px" }}>로그아웃</button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 11, color: T.sub }}>💾 로컬</span>
            <button onClick={onSwitchToCloud} style={{ ...btnStyle("primary"), fontSize: 11, padding: "5px 10px" }}>☁ 로그인</button>
          </>
        )}
      </div>
    </div>
  );
}

export function MobileTabBar({ screen, setScreen }) {
  const tabs = [
    { key: "dashboard", label: "대시보드", icon: "▦" },
    { key: "companies", label: "거래처", icon: "🏢" },
    { key: "pipeline", label: "파이프라인", icon: "▤" },
    { key: "quotes", label: "견적", icon: "₩" },
    { key: "settings", label: "설정", icon: "⚙" },
  ];
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, display: "flex", background: T.card, borderTop: `1px solid ${T.border}`, zIndex: 50 }}>
      {tabs.map((t) => {
        const active = screen === t.key || (t.key === "companies" && screen === "company");
        return (
          <button key={t.key} onClick={() => setScreen(t.key)}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "8px 0 10px", border: "none", background: "transparent", cursor: "pointer", color: active ? T.teal : T.sub, fontWeight: active ? 700 : 500, fontSize: 11 }}>
            <span style={{ fontSize: 16 }}>{t.icon}</span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
