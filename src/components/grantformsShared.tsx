// 지원사업 서식 파일들(GrantForms/TD/SSP/SSP2)이 공유하는 렌더 조각 — 파일별 중복 정의의 단일 원본
export const kdate = (iso?: string, blank = "20  년   월   일") =>
  iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(0, 4)}년 ${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일` : blank;

export const TitleBox = ({ children }: { children: React.ReactNode }) => (
  <h2 style={{ textAlign: "center", fontSize: "18pt", fontWeight: 700, margin: "2mm 0 5mm" }}>{children}</h2>
);
