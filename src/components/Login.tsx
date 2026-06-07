import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    if (error) setErr("로그인 실패 — 이메일/비밀번호를 확인하세요.");
    setBusy(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <form onSubmit={submit} className="card" style={{ width: 340, padding: 28 }}>
        <h1 style={{ margin: "0 0 4px", color: "var(--navy)", fontSize: 24 }}>ORO MES</h1>
        <p className="muted" style={{ marginTop: 0 }}>로그인이 필요합니다.</p>
        <label style={{ fontSize: 13, fontWeight: 700 }}>이메일</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
          style={{ width: "100%", padding: 9, margin: "4px 0 12px", border: "1px solid var(--line)", borderRadius: 6 }} />
        <label style={{ fontSize: 13, fontWeight: 700 }}>비밀번호</label>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} required
          style={{ width: "100%", padding: 9, margin: "4px 0 12px", border: "1px solid var(--line)", borderRadius: 6 }} />
        {err && <p style={{ color: "#c0392b", fontSize: 13, margin: "0 0 10px" }}>{err}</p>}
        <button className="btn" type="submit" disabled={busy} style={{ width: "100%", padding: 10, fontSize: 15 }}>
          {busy ? "로그인 중…" : "로그인"}
        </button>
        <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>계정은 관리자가 발급합니다. 로그인이 안 되면 담당자에게 문의하세요.</p>
      </form>
    </div>
  );
}
