// 표 셀 공통 스타일 — 6개 화면에 복붙돼 있던 th/td 인라인 상수의 단일 원본.
// 화면별 미세 차이(정렬·패딩·sticky 여부)는 사용처에서 spread로 오버라이드한다.
export const thBase: React.CSSProperties = {
  background: "#f1f3f7", color: "#374151", fontSize: 12, fontWeight: 700,
  padding: "6px 8px", textAlign: "right", position: "sticky", top: 0,
};
export const tdBase: React.CSSProperties = {
  padding: "5px 8px", borderBottom: "1px solid var(--line2)", fontSize: 13, textAlign: "right",
};

// 폼 입력 공통 스타일 (GrantDocs 등)
export const inp: React.CSSProperties = { padding: 7, border: "1px solid var(--line)", borderRadius: 6, width: "100%", fontSize: 13 };
export const lbl: React.CSSProperties = { fontSize: 11.5, color: "var(--muted)", display: "block", marginBottom: 2 };
