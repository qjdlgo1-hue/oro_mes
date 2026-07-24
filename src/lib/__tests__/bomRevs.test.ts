// @vitest-environment jsdom
// BOM 리비전(로컬 모드) — 신규→draft 편집→확정, 복제 발행, active 유일성, 가져오기 리비전화
import { describe, it, expect, beforeEach, vi } from "vitest";
vi.mock("../supabase", () => ({ hasSupabase: false, supabase: null }));
import {
  BomRow, listBomRows, listBomRevs, listBomRowsByRev,
  bomNextRev, bomPublish, discardBomRev, importBomRevs, upsertBomRow,
} from "../db";
import { buildBomIndex, explodeByItem } from "../bom";

const row = (p: Partial<BomRow>): BomRow =>
  ({ prod_code: "C1", prod_name: "제품A", process: "도금", version: "기본", mat_code: "A1", mat_name: "원료X", batch_qty: 50, qty: 10, ...p });

beforeEach(() => localStorage.clear());

describe("BOM 리비전 (로컬 모드)", () => {
  it("신규 등록: Rev1 draft는 전개에 안 보이고, 확정하면 active로 반영", async () => {
    const revId = await bomNextRev("C1", "제품A");
    await upsertBomRow(row({ rev_id: revId }));
    expect(await listBomRows()).toHaveLength(0);            // draft는 미반영
    expect((await listBomRowsByRev(revId))).toHaveLength(1);
    await bomPublish(revId, "최초 등록");
    const active = await listBomRows();
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ prod_name: "제품A", mat_name: "원료X", qty: 10 });
    const revs = await listBomRevs();
    expect(revs).toHaveLength(1);
    expect(revs[0]).toMatchObject({ revision: 1, status: "active", description: "최초 등록" });
  });
  it("새 리비전 발행: active 복제 → 수정 → 확정 시 이전 rev는 obsolete, 전개는 새 값", async () => {
    const r1 = await bomNextRev("C1", "제품A");
    await upsertBomRow(row({ rev_id: r1 }));
    await bomPublish(r1);
    const r2 = await bomNextRev("C1", "제품A");
    const cloned = await listBomRowsByRev(r2);
    expect(cloned).toHaveLength(1);                          // active에서 복제됨
    await upsertBomRow({ ...cloned[0], qty: 20 });
    expect((await listBomRows())[0].qty).toBe(10);           // 확정 전엔 기존 active 유지
    await bomPublish(r2);
    const revs = await listBomRevs();
    expect(revs.map(v => [v.revision, v.status])).toEqual([[2, "active"], [1, "obsolete"]]);
    const idx = buildBomIndex(await listBomRows());
    expect(explodeByItem(idx, { code: "C1", name: "제품A" }, 50)[0].qty).toBe(20); // 새 리비전 기준 전개
  });
  it("draft 폐기: 리비전과 행이 삭제되고 active는 영향 없음", async () => {
    const r1 = await bomNextRev("C1", "제품A");
    await upsertBomRow(row({ rev_id: r1 }));
    await bomPublish(r1);
    const r2 = await bomNextRev("C1", "제품A");
    await discardBomRev(r2);
    expect((await listBomRevs()).map(v => v.status)).toEqual(["active"]);
    expect(await listBomRows()).toHaveLength(1);
    await expect(discardBomRev(r1)).rejects.toThrow();       // active는 폐기 불가
  });
  it("리비전 없이 쌓인 기존 행은 Rev1 active로 자동 승계", async () => {
    localStorage.setItem("oro_bom_rows", JSON.stringify([row({ id: "legacy1" })]));
    expect(await listBomRows()).toHaveLength(1);
    const revs = await listBomRevs();
    expect(revs).toHaveLength(1);
    expect(revs[0]).toMatchObject({ prod_name: "제품A", revision: 1, status: "active" });
  });
  it("가져오기: 포함된 제품만 새 리비전 발행(active), 미포함 제품은 유지", async () => {
    const r1 = await bomNextRev("C1", "제품A");
    await upsertBomRow(row({ rev_id: r1 }));
    await bomPublish(r1);
    const rB = await bomNextRev("C2", "제품B");
    await upsertBomRow(row({ prod_code: "C2", prod_name: "제품B", rev_id: rB, qty: 5 }));
    await bomPublish(rB);
    await importBomRevs([row({ qty: 33 })]);                 // 제품A만 포함
    const revs = await listBomRevs();
    expect(revs.filter(v => v.prod_name === "제품A").map(v => [v.revision, v.status])).toEqual([[2, "active"], [1, "obsolete"]]);
    expect(revs.filter(v => v.prod_name === "제품B").map(v => [v.revision, v.status])).toEqual([[1, "active"]]);
    const act = await listBomRows();
    expect(act.find(r => r.prod_name === "제품A")!.qty).toBe(33);
    expect(act.find(r => r.prod_name === "제품B")!.qty).toBe(5);
  });
});
