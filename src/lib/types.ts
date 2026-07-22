export type Order = {
  id: string;
  order_no: string;
  order_date: string; // YYYY-MM-DD
  ym: string;         // YYYY-MM
  item_code: string;
  gubun: string;      // 제품 / 무형상품 / 원재료
  name: string;
  spec: string;
  qty: number;
  customer: string;
  note: string;
  deleted_at?: string | null; // 소프트 삭제(휴지통)
};
export type PlanEntry = {
  order_id: string;
  start_date: string; // YYYY-MM-DD (생산 시작일)
  span: number;       // 생산 일수
  done: boolean;
  qty?: number | null;   // 생산수량(미지정 시 수주량 사용)
  deliver_date?: string | null; // 배송일 수동 지정(없으면 생산완료일 다음 영업일)
  ecount_slip?: string | null;  // 이카운트 생산입고 전송 완료 표시(전표번호) — 중복 전송 방지
};
export type CocData = {
  order_id: string;
  data: Record<string, string>;
};

export type FormatSettings = {
  paper?: "A4" | "Letter";
  marginMm?: number;
  logoH?: number;
  fontScale?: number;
  header?: string;
  footer1?: string;
  footer2?: string;
};
export type Settings = {
  logo?: string;   // dataURL
  stamp?: string;  // dataURL
  company?: string;
  format?: FormatSettings;
  label_packs?: Record<string, number>; // 거래처별 라벨 포장단위(New wt, g)
};

export type Receipt = {
  id?: string;
  rdate: string; vendor: string; bizno: string;
  supply: number; vat: number; total: number;
  rtype: string; account: string; memo: string;
  company?: string; period?: string;
  image_path?: string | null;
  image_paths?: string[] | null;
  deleted_at?: string | null; // 소프트 삭제(휴지통)
  // 해외출장 지출 (해외영수증/여비교통비(해외)): 외화·환율·출장 단위
  currency?: string | null;   // 통화 코드 (USD/JPY/EUR …)
  fx_amount?: number | null;  // 외화 금액
  fx_rate?: number | null;    // 적용 환율 (지출일 매매기준율)
  trip?: string | null;       // 출장명 (예: 2026-08 일본 전시회)
  subcat?: string | null;     // 세부항목 (항공료/숙박비/식대 …)
};
