import { useEffect, useState } from "react";

type Toast = { id: number; msg: string; type: "info" | "success" | "error" };
let items: Toast[] = [];
let subs: (() => void)[] = [];
let nid = 1;
function emit() { subs.forEach(f => f()); }

export const toast = {
  show(msg: string, type: Toast["type"] = "info") {
    const t = { id: nid++, msg, type };
    items = [...items, t]; emit();
    setTimeout(() => { items = items.filter(x => x.id !== t.id); emit(); }, 3500);
  },
  success(m: string) { this.show(m, "success"); },
  error(m: string) { this.show(m, "error"); },
};

export function ToastHost() {
  const [, setN] = useState(0);
  useEffect(() => { const f = () => setN(n => n + 1); subs.push(f); return () => { subs = subs.filter(x => x !== f); }; }, []);
  return (
    <div style={{ position: "fixed", right: 16, bottom: 16, display: "flex", flexDirection: "column", gap: 8, zIndex: 9999 }}>
      {items.map(t => (
        <div key={t.id} style={{
          background: t.type === "error" ? "#c0392b" : t.type === "success" ? "#1aa260" : "#333",
          color: "#fff", padding: "10px 14px", borderRadius: 8, fontSize: 13, boxShadow: "0 2px 8px rgba(0,0,0,.25)", maxWidth: 360
        }}>{t.msg}</div>
      ))}
    </div>
  );
}
