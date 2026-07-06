import { useEffect, useState } from "react";

type Toast = { id: number; msg: string; type: "info" | "success" | "error" };
let items: Toast[] = [];
let subs: (() => void)[] = [];
let nid = 1;
function emit() { subs.forEach(f => f()); }
function dismiss(id: number) { items = items.filter(x => x.id !== id); emit(); }

export const toast = {
  show(msg: string, type: Toast["type"] = "info") {
    const t = { id: nid++, msg, type };
    items = [...items, t]; emit();
    // 에러는 오래 보여주고 수동으로도 닫을 수 있게 함
    setTimeout(() => dismiss(t.id), type === "error" ? 8000 : 3500);
  },
  success(m: string) { this.show(m, "success"); },
  error(m: string) { this.show(m, "error"); },
  info(m: string) { this.show(m, "info"); },
};

export function ToastHost() {
  const [, setN] = useState(0);
  useEffect(() => { const f = () => setN(n => n + 1); subs.push(f); return () => { subs = subs.filter(x => x !== f); }; }, []);
  return (
    <div style={{ position: "fixed", right: 16, bottom: 16, display: "flex", flexDirection: "column", gap: 8, zIndex: 9999 }}>
      {items.map(t => (
        <div key={t.id} style={{
          background: t.type === "error" ? "#c0392b" : t.type === "success" ? "#1aa260" : "#333",
          color: "#fff", padding: "10px 14px", borderRadius: 8, fontSize: 13, boxShadow: "0 2px 8px rgba(0,0,0,.25)", maxWidth: 360,
          display: "flex", alignItems: "flex-start", gap: 10
        }}>
          <span style={{ flex: 1 }}>{t.msg}</span>
          <button onClick={() => dismiss(t.id)} aria-label="알림 닫기"
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 14, padding: 0, lineHeight: "18px", opacity: .8 }}>✕</button>
        </div>
      ))}
    </div>
  );
}
