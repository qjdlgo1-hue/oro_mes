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
};
export type PlanEntry = {
  order_id: string;
  start_date: string; // YYYY-MM-DD (생산 시작일)
  span: number;       // 생산 일수
  done: boolean;
};
export type CocData = {
  order_id: string;
  data: Record<string, string>;
};

export type Settings = {
  logo?: string;   // dataURL
  stamp?: string;  // dataURL
  company?: string;
};
