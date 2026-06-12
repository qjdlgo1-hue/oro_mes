export type TabKey = "today" | "import" | "plan" | "coc" | "report" | "audit" | "receipt" | "bom" | "admin";
export const TAB_DEFS: { key: TabKey; label: string; icon: string }[] = [
  { key: "today", label: "POP", icon: "📋" },
  { key: "import", label: "주문 가져오기", icon: "📥" },
  { key: "plan", label: "생산계획", icon: "📅" },
  { key: "coc", label: "COC 발행", icon: "📄" },
  { key: "report", label: "리포트", icon: "📊" },
  { key: "audit", label: "기록", icon: "🕘" },
  { key: "receipt", label: "증빙", icon: "🧾" },
  { key: "bom", label: "원재료", icon: "⚗️" },
  { key: "admin", label: "관리자", icon: "⚙️" },
];
