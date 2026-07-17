// 숫자 표기 공통 유틸 — 화면마다 제각각이던 포맷 통일
export const nf = (n: number) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
export const nf1 = (n: number) => (Math.round((Number(n) || 0) * 10) / 10).toLocaleString("ko-KR");
export const nf3 = (n: number) => (Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 3 });
export const money = (n: any) => (Number(n) || 0).toLocaleString("ko-KR");

// 오늘 날짜(YYYY-MM-DD) — 로컬(KST) 기준으로 통일.
// 과거 일부 화면은 toISOString(UTC)을 사용해 자정~09시 사이에 하루 어긋났음.
export const todayIso = () => {
  const t = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
};
