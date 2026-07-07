export type TabKey = "today" | "import" | "plan" | "coc" | "delivery" | "support" | "prodin" | "sales" | "dash" | "prodcon" | "report" | "audit" | "receipt" | "bom" | "admin";

// 메인 메뉴(그룹) 아이콘 — 이름 매핑, 없으면 첫 항목 아이콘 (레일·관리자 메뉴 구성 편집기 공용)
export const GROUP_ICONS: Record<string, string> = {
  "현장": "🏭", "가져오기": "📥", "데이터": "📥", "분석": "📊", "대시보드": "📊",
  "경영지원": "📁", "관리": "📁", "시스템": "⚙️", "기록": "🗂️", "기타": "📂", "메뉴": "📂",
};
export const groupIcon = (name: string, fallbackIcon?: string) => GROUP_ICONS[name] || fallbackIcon || "📂";
export const TAB_DEFS: { key: TabKey; label: string; icon: string }[] = [
  { key: "today", label: "POP", icon: "📋" },
  { key: "import", label: "주문 가져오기", icon: "📥" },
  { key: "plan", label: "생산계획", icon: "📅" },
  { key: "coc", label: "COC 발행", icon: "📄" },
  { key: "delivery", label: "배송 스케줄", icon: "🚚" },
  { key: "support", label: "지원사업", icon: "🏛️" },
  { key: "prodin", label: "생산 가져오기", icon: "🏭" },
  { key: "sales", label: "판매 가져오기", icon: "💰" },
  { key: "dash", label: "대시보드", icon: "📈" },
  { key: "prodcon", label: "생산·소모", icon: "🧪" },
  { key: "report", label: "리포트", icon: "📊" },
  { key: "audit", label: "기록", icon: "🕘" },
  { key: "receipt", label: "증빙", icon: "🧾" },
  { key: "bom", label: "원재료", icon: "⚗️" },
  { key: "admin", label: "관리자", icon: "⚙️" },
];
