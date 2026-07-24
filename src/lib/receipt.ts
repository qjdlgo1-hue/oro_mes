// 생산입고 전표 페이로드 빌더 — 완제품 라인의 BOM 전개(다단계, 코드 우선)로 소모 라인을 만들고,
// 기존 sig 규칙(inoutSig/pcSig)을 부여해 자동기록·현황 가져오기와 중복되지 않게 한다.
import { BomIndex, explodeByItem } from "./bom";
import { inoutSig, pcSig } from "./db";

export type ReceiptProdLine = { item_code: string; name: string; spec?: string; qty: number; gubun?: string };
export type ReceiptConsumeLine = { prod_code: string; prod_name: string; mat_code: string; mat_name: string; prod_qty: number; act_qty: number };

// BOM풀기 — 완제품 라인별 말단 원재료 전개 (제품 표시를 유지하려고 라인별로 나열, 소수 3자리 반올림)
export function expandReceiptConsumes(idx: BomIndex, prods: ReceiptProdLine[]): ReceiptConsumeLine[] {
  const out: ReceiptConsumeLine[] = [];
  for (const p of prods) {
    if (!(p.qty > 0)) continue;
    for (const m of explodeByItem(idx, { code: p.item_code, name: p.name }, p.qty)) {
      out.push({
        prod_code: p.item_code || "", prod_name: p.name,
        mat_code: m.code || "", mat_name: m.name,
        prod_qty: p.qty, act_qty: Math.round(m.qty * 1000) / 1000,
      });
    }
  }
  return out;
}

export function buildReceiptPayload(rdate: string, note: string, prods: ReceiptProdLine[], consumes: ReceiptConsumeLine[]) {
  const ym = rdate.slice(0, 7);
  return {
    rdate, note,
    prods: prods.filter(p => p.name && p.qty > 0).map(p => ({
      item_code: p.item_code || "", name: p.name, spec: p.spec || "", qty: p.qty, gubun: p.gubun || "제품",
      sig: inoutSig({ kind: "in", ym, idate: rdate, item_code: p.item_code || "", name: p.name, spec: p.spec || "", qty: p.qty, gubun: p.gubun || "제품", note: "생산입고 전표" }),
    })),
    consumes: consumes.filter(c => c.mat_name && c.act_qty > 0).map(c => ({
      ...c,
      sig: pcSig({ ym, idate: rdate, prod_code: c.prod_code, prod_name: c.prod_name, mat_code: c.mat_code, mat_name: c.mat_name, prod_qty: c.prod_qty, act_qty: c.act_qty }),
    })),
  };
}
