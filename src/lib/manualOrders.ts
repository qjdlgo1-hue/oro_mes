// 주문 직접 추가 — 품목 선택 모달에서 고른 품목들을 주문 행으로 변환
import { Order } from "./types";

// Item.gubun(6종) → Order.gubun(3종): 원재료/무형상품은 그대로, 나머지(제품/반제품/상품/부재료)는 제품
export const mapItemGubun = (g: string): string => (g === "원재료" || g === "무형상품" ? g : "제품");

export type ItemPick = { code: string; name: string; spec?: string; gubun: string; qty: number };

// base(주문일자·거래처·적요 공통) + 품목별 수량 → 주문 배열 (order_no=수동입력, ym=주문일의 월)
export function buildManualOrders(base: Order, picks: ItemPick[], uid: () => string): Order[] {
  return picks.map(p => ({
    ...base,
    id: uid(),
    order_no: "수동입력",
    ym: base.order_date.slice(0, 7),
    item_code: p.code || "",
    name: p.name,
    spec: p.spec || "",
    gubun: mapItemGubun(p.gubun),
    qty: p.qty,
  }));
}
