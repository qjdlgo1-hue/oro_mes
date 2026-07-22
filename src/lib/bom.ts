// BOM 소요량 전개 — 완제품 생산량으로부터 원재료(말단) 소요량을 계산한다.
// 다단계 지원: 소모품목이 다른 행의 생산품목(반제품, 예: 도금품이 시빙품을 소모)이면
// 그 반제품의 BOM으로 재귀 전개해 원분말 등 말단 원재료까지 내려간다.
// 소요량 비례식: 필요량 × (소요량 ÷ 생산수량[기준수량])
import { BomRow } from "./db";

export type BomIndex = {
  byProd: Map<string, BomRow[]>;   // 생산품목명 → 원재료 행들
  byCode: Map<string, string>;     // 품목코드 → 생산품목명 (반제품 참조 해석용)
  prodNames: Set<string>;          // 생산품목명 집합
};

export function buildBomIndex(rows: BomRow[]): BomIndex {
  const byProd = new Map<string, BomRow[]>();
  const byCode = new Map<string, string>();
  rows.forEach(r => {
    const list = byProd.get(r.prod_name) || [];
    list.push(r);
    byProd.set(r.prod_name, list);
    if (r.prod_code) byCode.set(r.prod_code, r.prod_name);
  });
  return { byProd, byCode, prodNames: new Set(byProd.keys()) };
}

// 소모품목이 반제품인지 — 이름 또는 코드가 다른 BOM의 생산품목과 일치하면 반제품
function subProdName(idx: BomIndex, r: BomRow): string | null {
  if (idx.prodNames.has(r.mat_name)) return r.mat_name;
  const byCode = r.mat_code ? idx.byCode.get(r.mat_code) : undefined;
  return byCode || null;
}

export type ExplodedMat = { key: string; code: string; name: string; qty: number };

// 제품 prodName을 qtyG만큼 생산할 때 말단 원재료별 소요량.
// 깊이 8 제한 + 방문 중 경로 추적으로 순환 참조 방지. BOM 미등록 제품이면 빈 배열.
export function explode(idx: BomIndex, prodName: string, qtyG: number): ExplodedMat[] {
  const acc = new Map<string, ExplodedMat>();
  const walk = (name: string, need: number, depth: number, path: Set<string>) => {
    if (depth > 8 || need <= 0 || path.has(name)) return;
    const rows = idx.byProd.get(name);
    if (!rows) return;
    const nextPath = new Set(path); nextPath.add(name);
    for (const r of rows) {
      const amount = need * (Number(r.qty) || 0) / (Number(r.batch_qty) || 1);
      if (amount <= 0) continue;
      const sub = subProdName(idx, r);
      if (sub && !nextPath.has(sub) && depth < 8) {
        walk(sub, amount, depth + 1, nextPath);       // 반제품 → 하위 BOM으로 전개
      } else {
        const key = r.mat_code || r.mat_name;         // 말단 원재료로 집계
        const e = acc.get(key) || { key, code: r.mat_code, name: r.mat_name, qty: 0 };
        e.qty += amount;
        acc.set(key, e);
      }
    }
  };
  walk(prodName, qtyG, 0, new Set());
  return [...acc.values()].map(m => ({ ...m, qty: Math.round(m.qty * 1000) / 1000 }));
}

// 여러 제품×수량을 한 번에 전개해 원재료별 합계 (월별 소비 표 등에서 사용)
export function explodeAll(idx: BomIndex, demands: { name: string; qty: number }[]): Map<string, ExplodedMat> {
  const acc = new Map<string, ExplodedMat>();
  demands.forEach(d => {
    explode(idx, d.name, d.qty).forEach(m => {
      const e = acc.get(m.key) || { ...m, qty: 0 };
      e.qty += m.qty;
      acc.set(m.key, e);
    });
  });
  for (const m of acc.values()) m.qty = Math.round(m.qty * 1000) / 1000;
  return acc;
}
