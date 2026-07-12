// 해외출장 지출 헬퍼 — 외화 환산·해외 여부 판정 (증빙 탭)
// 회계 기준: 국외 지출은 법정지출증빙(세금계산서·현금영수증) 수취의무 제외 대상이며
// 부가세 매입세액공제 불가 → vat=0. 원화 환산은 지출일 기준 매매기준율 적용.
export const OVERSEA_ACCOUNT = "여비교통비(해외)";
export const OVERSEA_RTYPE = "해외영수증(인보이스)";
export const TRIP_SUBCATS = ["항공료", "숙박비", "현지교통비", "식대", "일비", "비자·보험", "통신(로밍)", "기타"] as const;
export const CURRENCIES = ["USD", "JPY", "EUR", "CNY", "TWD", "VND", "THB", "SGD", "기타"] as const;
// 출장 정산서에 표시할 증빙 체크리스트
export const TRIP_CHECKLIST = [
  "출장명령서(품의) — 목적·기간·국가 명시",
  "항공권 e-티켓 + 탑승권(보딩패스)",
  "숙박 인보이스(호텔 영수증)",
  "법인카드 매출전표·카드사 이용대금 명세서",
  "현지 지출 영수증(식대·교통 등)",
  "출장보고서(결과 보고)",
];

export const isOversea = (r: { account?: string; rtype?: string }) =>
  r.account === OVERSEA_ACCOUNT || r.rtype === OVERSEA_RTYPE;

// 외화 × 환율 → 원화(원 단위 반올림). 값이 유효하지 않으면 null
export function fxToKrw(fxAmount: any, fxRate: any): number | null {
  const a = Number(String(fxAmount ?? "").replace(/[^\d.-]/g, ""));
  const r = Number(String(fxRate ?? "").replace(/[^\d.-]/g, ""));
  if (!isFinite(a) || !isFinite(r) || a <= 0 || r <= 0) return null;
  return Math.round(a * r);
}
