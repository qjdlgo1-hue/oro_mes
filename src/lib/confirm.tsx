import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type ConfirmOpts = { title?: string; message: string; danger?: boolean; confirmLabel?: string; cancelLabel?: string };
type PromptOpts = { title?: string; label: string; type?: "text" | "password"; placeholder?: string; initial?: string };
type Req =
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (ok: boolean) => void }
  | { kind: "prompt"; opts: PromptOpts; resolve: (val: string | null) => void };

// 확인/입력 모달 스토어 — useSyncExternalStore 규약(subscribe + 스냅샷).
// 렌더 중 모듈 전역을 직접 읽으면 React Compiler가 값을 캐시해 모달이 열리지 않는다(perm 장애와 동일 위험).
let current: Req | null = null;
let subs: (() => void)[] = [];
const subscribe = (f: () => void) => { subs.push(f); return () => { subs = subs.filter(x => x !== f); }; };
const getSnap = () => current;
function emit() { subs.forEach(f => f()); }

export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise(resolve => { current = { kind: "confirm", opts, resolve }; emit(); });
}
export function promptDialog(opts: PromptOpts): Promise<string | null> {
  return new Promise(resolve => { current = { kind: "prompt", opts, resolve }; emit(); });
}

export function ConfirmHost() {
  const req = useSyncExternalStore(subscribe, getSnap);
  const [val, setVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!req) return;
    setVal((req.kind === "prompt" && req.opts.initial) || "");
    if (req.kind === "prompt") setTimeout(() => inputRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);
  if (!req) return null;

  function close(ok: boolean) {
    const r = current; current = null; emit();
    if (!r) return;
    if (r.kind === "confirm") r.resolve(ok);
    else r.resolve(ok ? val : null);
  }
  const danger = req.kind === "confirm" && req.opts.danger;
  return (
    <div onClick={() => close(false)}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 10, padding: "18px 20px", width: "100%", maxWidth: 400, boxShadow: "0 8px 30px rgba(0,0,0,.3)" }}>
        {req.opts.title && <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: danger ? "#c0392b" : "#1f2330" }}>{req.opts.title}</div>}
        <div style={{ fontSize: 13, color: "#374151", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
          {req.kind === "confirm" ? req.opts.message : req.opts.label}
        </div>
        {req.kind === "prompt" &&
          <input ref={inputRef} type={req.opts.type || "text"} value={val} placeholder={req.opts.placeholder}
            onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") close(true); }}
            style={{ width: "100%", marginTop: 10, padding: 8, border: "1px solid #d7dce3", borderRadius: 6, fontSize: 14, boxSizing: "border-box" }} />}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn ghost" onClick={() => close(false)}>{(req.kind === "confirm" && req.opts.cancelLabel) || "취소"}</button>
          <button className="btn" autoFocus={req.kind === "confirm"}
            style={danger ? { background: "#c0392b" } : undefined}
            onClick={() => close(true)}>{(req.opts as any).confirmLabel || "확인"}</button>
        </div>
      </div>
    </div>
  );
}
