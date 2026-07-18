import React from "react";
import { T } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";

// 가운데 안내 문구 (로딩/오류 등)
export function CenterMessage({ children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", alignItems: "center", justifyContent: "center", background: T.bg, fontFamily: "sans-serif", color: T.sub, textAlign: "center", padding: 20 }}>
      <div>{children}</div>
    </div>
  );
}


// ===========================================================================
// 공통 헤더
// ===========================================================================
export function Header({ title, sub, right }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, padding: isMobile ? "14px 14px" : "22px 28px", background: T.card, borderBottom: `1px solid ${T.border}` }}>
      <div>
        <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 800 }}>{title}</div>
        {sub && <div style={{ fontSize: isMobile ? 12 : 13, color: T.sub, marginTop: 3 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}


// ===========================================================================
// 팝업(모달)들
// ===========================================================================

// 모달 껍데기 (배경 어둡게 + 가운데 흰 박스)
export function Modal({ title, onClose, children }) {
  const isMobile = useIsMobile();
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,42,67,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 10 : 20 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: isMobile ? 12 : 16, width: "100%", maxWidth: 480, maxHeight: "92vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ padding: isMobile ? "14px 16px" : "20px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{title}</div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", color: T.sub, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: isMobile ? 16 : 24 }}>{children}</div>
      </div>
    </div>
  );
}

// 입력 필드 (라벨 + 인풋)
export function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: T.text }}>{label}</label>
      {children}
    </div>
  );
}

export const inputStyle = {
  width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 8,
  border: `1px solid ${T.border}`, outline: "none", boxSizing: "border-box",
  fontFamily: "inherit",
};


// 모달 하단 버튼 (취소 / 저장)
export function ModalActions({ onClose, onSave, disabled, saveLabel = "저장" }) {
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
      <button onClick={onClose} style={{ ...btnStyle("ghost"), flex: 1, padding: "11px" }}>취소</button>
      <button onClick={onSave} disabled={disabled} style={{ ...btnStyle("primary"), flex: 1, padding: "11px", opacity: disabled ? 0.4 : 1, cursor: disabled ? "default" : "pointer" }}>
        {saveLabel}
      </button>
    </div>
  );
}


// ===========================================================================
// 작은 재사용 부품들
// ===========================================================================
export function Panel({ title, children }) {
  return (
    <div style={{ background: T.card, borderRadius: 12, padding: 20, border: `1px solid ${T.border}` }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

export function SectionHead({ label, onAdd }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      {onAdd && <button onClick={onAdd} style={{ border: "none", background: T.bg, color: T.teal, borderRadius: 6, width: 24, height: 24, cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1 }}>+</button>}
    </div>
  );
}

export function InfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
      <span style={{ color: T.sub }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: "right", maxWidth: "60%" }}>{value}</span>
    </div>
  );
}

export function TierBadge({ tier }) {
  // 핵심 = ORO 골드, 일반 = 스틸 네이비, 잠재 = 실버
  const colors = {
    핵심: { bg: "#F5EFDF", color: "#8A6D2B" },
    일반: { bg: "#E8EEF4", color: "#3A5578" },
    잠재: { bg: "#EBF0F3", color: "#66717D" },
  };
  const c = colors[tier] || colors.일반;
  return <span style={{ fontSize: 11, background: c.bg, color: c.color, padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>{tier}</span>;
}

export function FilterChip({ children, active, onClick }) {
  return (
    <span onClick={onClick} style={{ fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 20, cursor: "pointer", background: active ? T.navy : T.bg, color: active ? "#fff" : T.sub, border: `1px solid ${active ? T.navy : T.border}`, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

// 수정/삭제용 작은 아이콘 버튼
export function IconBtn({ onClick, danger, children }) {
  return (
    <button
      onClick={onClick}
      style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 13, color: danger ? T.danger : T.sub, padding: "2px 4px", flexShrink: 0, lineHeight: 1 }}
    >
      {children}
    </button>
  );
}

export function Empty({ children, small }) {
  return (
    <div style={{ textAlign: "center", padding: small ? "16px 0" : "40px 20px", color: T.sub, fontSize: small ? 12 : 14 }}>
      {children}
    </div>
  );
}

export function btnStyle(variant) {
  // MES button.btn과 동일한 톤: 틸 배경 + 흰 글씨, 모서리 6px
  const base = { border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13, padding: "9px 16px" };
  if (variant === "primary") return { ...base, background: T.teal, color: "#fff" };
  if (variant === "ghost") return { ...base, background: T.tint, color: T.text, border: `1px solid ${T.border}` };
  return base;
}
