// 숫자 표기 공통 유틸 — 화면마다 제각각이던 포맷 통일
export const nf = (n: number) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
export const nf1 = (n: number) => (Math.round((Number(n) || 0) * 10) / 10).toLocaleString("ko-KR");
export const nf3 = (n: number) => (Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 3 });
export const money = (n: any) => (Number(n) || 0).toLocaleString("ko-KR");
