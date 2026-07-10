// 창업중심대학사업 서식 레지스트리 — 서식 목록·지출항목·항목별 기본 서식 매핑
// 서식 본문(문구)은 업로드된 HWP 원문에서 추출한 그대로 GrantForms.tsx에 재현됨.

export type FormKey = "f1" | "f2" | "f3" | "f4" | "f5" | "f6" | "f7" | "f8" | "f9" | "f10" | "f11" | "f12";

// 폼 입력 섹션: 선택된 서식이 요구하는 섹션만 편집 화면에 표시
export type FieldSection = "purchase" | "service" | "event" | "reason" | "inkind" | "advance" | "vendor";

export const FORMS: { key: FormKey; no: string; title: string; sections: FieldSection[] }[] = [
  { key: "f1", no: "1", title: "사업비 지급요청서", sections: [] },
  { key: "f2", no: "2", title: "과업지시서", sections: ["service"] },
  { key: "f3", no: "3", title: "검수조서 ①(기본)", sections: ["purchase"] },
  { key: "f4", no: "4", title: "검수조서 ②(증빙사진)", sections: ["purchase"] },
  { key: "f5", no: "5", title: "기자재(기계장치/재료) 활용계획서", sections: ["purchase"] },
  { key: "f6", no: "6", title: "외주용역 (최종)결과보고서", sections: ["service"] },
  { key: "f7", no: "7", title: "사유서(확인서)", sections: ["reason"] },
  { key: "f8", no: "8", title: "학회(전시회/박람회) 참가 보고서", sections: ["event"] },
  { key: "f9", no: "9", title: "현물납부확인서", sections: ["inkind"] },
  { key: "f10", no: "10", title: "자산관리번호 라벨", sections: ["purchase"] },
  { key: "f11", no: "11", title: "선금 지급/사용 각서", sections: ["service", "advance"] },
  { key: "f12", no: "12", title: "일반용역비 규정 확인서", sections: ["service", "vendor"] },
];

// 지급요청서의 지출항목 9종 (서식 원문 순서 그대로)
export const EXPENSE_ITEMS = [
  "재료비", "외주용역비", "기계장치비", "특허권 등 무형자산취득비", "인건비",
  "지급수수료", "여비", "교육훈련비", "광고선전비",
] as const;

// 지출항목 → 기본 추천 서식 (사용자 확정 매핑이 오면 이 상수만 교체)
// f7(사유서)·f9(현물)·f11(선금)은 상황에 따라 수동 추가
export const FORM_PRESETS: Record<string, FormKey[]> = {
  "재료비": ["f1", "f4", "f5"],
  "외주용역비": ["f1", "f2", "f12", "f4", "f6"],
  "기계장치비": ["f1", "f4", "f5", "f10"],
  "특허권 등 무형자산취득비": ["f1"],
  "인건비": ["f1"],
  "지급수수료": ["f1"],
  "여비": ["f1", "f8"],
  "교육훈련비": ["f1", "f8"],
  "광고선전비": ["f1", "f12"],
};

export const money = (v: any): string => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return isFinite(n) && String(v ?? "").trim() !== "" ? n.toLocaleString("ko-KR") : "";
};

// 문자열 금액 → 숫자 (콤마·원 등 제거, 숫자 아니면 0)
export const num = (v: any): number => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : 0;
};

// 건 하나의 집행액: 지급요청서 지급액 → 합계 → 단가×수량 → 용역금액 순으로 채택
export function docAmount(data: Record<string, any>): number {
  return num(data?.payAmount) || num(data?.total) || (calcTotal(data?.unitPrice, data?.qty) ?? 0) || num(data?.svcAmount);
}

// 정산 현황: 지출항목별 건수·집행액 집계 (+예산이 있으면 잔액/집행률)
export type SettleLine = { item: string; count: number; amount: number; budget: number };
export function settleSummary(
  docs: { expense_item?: string; data: Record<string, any> }[],
  budgets: Record<string, any> = {},
): { lines: SettleLine[]; totalAmount: number; totalBudget: number } {
  const by = new Map<string, { count: number; amount: number }>();
  for (const d of docs) {
    const k = d.expense_item || "기타";
    const cur = by.get(k) || { count: 0, amount: 0 };
    cur.count++; cur.amount += docAmount(d.data || {});
    by.set(k, cur);
  }
  // 서식 원문 순서(EXPENSE_ITEMS) 우선, 예산만 있는 항목도 표시, 그 외는 뒤에
  const keys = [
    ...EXPENSE_ITEMS.filter(i => by.has(i) || num(budgets[i]) > 0),
    ...[...by.keys()].filter(k => !(EXPENSE_ITEMS as readonly string[]).includes(k)),
  ];
  const lines = keys.map(item => ({
    item,
    count: by.get(item)?.count || 0,
    amount: by.get(item)?.amount || 0,
    budget: num(budgets[item]),
  }));
  return {
    lines,
    totalAmount: lines.reduce((s, l) => s + l.amount, 0),
    totalBudget: lines.reduce((s, l) => s + l.budget, 0),
  };
}

// 단가 × 수량 = 합계 (숫자 아닌 입력은 빈 값)
export function calcTotal(unitPrice: any, qty: any): number | null {
  const u = Number(String(unitPrice ?? "").replace(/[^\d.-]/g, ""));
  const q = Number(String(qty ?? "").replace(/[^\d.-]/g, ""));
  if (!isFinite(u) || !isFinite(q) || u === 0 || q === 0) return null;
  return u * q;
}

// "2026-07-09" → {y:"2026", m:"7", d:"9"} / 빈 값은 공백 유지(인쇄 후 수기 기입 가능)
export function dateParts(iso?: string): { y: string; m: string; d: string } {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { y: "", m: "", d: "" };
  return { y: iso.slice(0, 4), m: String(Number(iso.slice(5, 7))), d: String(Number(iso.slice(8, 10))) };
}
// "26.  07.  09." 형식 (검수조서 등)
export function shortDate(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "26.    .    .";
  return `${iso.slice(2, 4)}. ${iso.slice(5, 7)}. ${iso.slice(8, 10)}.`;
}
// "26년 07월 09일" 형식 (검수조서 납품일자)
export function korShortDate(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "26년 00월 00일";
  return `${iso.slice(2, 4)}년 ${iso.slice(5, 7)}월 ${iso.slice(8, 10)}일`;
}
