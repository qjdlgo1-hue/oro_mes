// @vitest-environment jsdom
// 회귀 테스트: "권한 확인 중…" 멈춤 (PR #71 장애)
// useCaps가 모듈 전역을 렌더 중 직접 읽는 패턴이면 React Compiler가 loaded:false를 캐시에
// 고정해, loadPerms가 끝나도 구독 컴포넌트가 갱신되지 않는다. vitest는 vite 플러그인 체인
// (React Compiler 포함)으로 이 파일과 perm.ts를 컴파일하므로 프로덕션과 같은 조건이 재현된다.
import { describe, it, expect } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useCaps, loadPerms } from "../perm";
import { toast, ToastHost } from "../toast";
import { confirmDialog, ConfirmHost } from "../confirm";

function Probe() {
  const { loaded, role } = useCaps();
  return <div>{loaded ? `loaded:${role}` : "loading"}</div>;
}

async function mount(node: React.ReactNode) {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(node); });
  return { el, root };
}

describe("외부 스토어 — React Compiler 하에서 구독 갱신", () => {
  it("loadPerms 완료가 useCaps 컴포넌트에 반영된다", async () => {
    const { el, root } = await mount(<Probe />);
    expect(el.textContent).toBe("loading");
    // 세션 없는 환경: supabase.auth.getUser()가 네트워크 없이 null 사용자 반환 → loaded=true, role=user
    await act(async () => { await loadPerms(); });
    expect(el.textContent).toBe("loaded:user");
    await act(async () => { root.unmount(); });
  });
  it("toast.show가 ToastHost에 표시된다", async () => {
    const { el, root } = await mount(<ToastHost />);
    await act(async () => { toast.success("저장됨-테스트"); });
    expect(el.textContent).toContain("저장됨-테스트");
    await act(async () => { root.unmount(); });
  });
  it("confirmDialog 호출이 ConfirmHost 모달을 열고 확인 시 true로 해소된다", async () => {
    const { el, root } = await mount(<ConfirmHost />);
    let p: Promise<boolean> = Promise.resolve(false);
    await act(async () => { p = confirmDialog({ title: "삭제-테스트", message: "정말?" }); });
    expect(el.textContent).toContain("삭제-테스트");
    const ok = [...el.querySelectorAll("button")].find(b => b.textContent === "확인")!;
    await act(async () => { ok.click(); });
    expect(await p).toBe(true);
    expect(el.textContent).not.toContain("삭제-테스트");
    await act(async () => { root.unmount(); });
  });
});
