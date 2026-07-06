import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) { setErr("서버(Supabase)가 설정되지 않아 로그인할 수 없습니다. 관리자에게 문의하세요."); return; }
    setBusy(true); setErr("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("invalid login credentials")) setErr("이메일 또는 비밀번호가 올바르지 않습니다.");
        else if (msg.includes("network") || msg.includes("fetch")) setErr("네트워크 오류 — 인터넷 연결을 확인하세요.");
        else if (msg.includes("rate")) setErr("시도 횟수가 많습니다. 잠시 후 다시 시도하세요.");
        else setErr("로그인 실패 — 이메일/비밀번호를 확인하세요.");
      }
    } catch { setErr("네트워크 오류 — 인터넷 연결을 확인하세요."); }
    setBusy(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <form onSubmit={submit} className="card" style={{ width: 340, padding: 28 }}>
        <h1 style={{ margin: "0 0 4px", color: "var(--navy)", fontSize: 24 }}>ORO MES</h1>
        <p className="muted" style={{ marginTop: 0 }}>로그인이 필요합니다.</p>
        <label htmlFor="login-email" style={{ fontSize: 13, fontWeight: 700 }}>이메일</label>
        <input id="login-email" type="email" name="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
          style={{ width: "100%", padding: 9, margin: "4px 0 12px", border: "1px solid var(--line)", borderRadius: 6 }} />
        <label htmlFor="login-pw" style={{ fontSize: 13, fontWeight: 700 }}>비밀번호</label>
        <div style={{ position: "relative", margin: "4px 0 12px" }}>
          <input id="login-pw" type={showPw ? "text" : "password"} name="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} required
            style={{ width: "100%", padding: "9px 40px 9px 9px", border: "1px solid var(--line)", borderRadius: 6 }} />
          <button type="button" aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보기"} onClick={() => setShowPw(s => !s)}
            style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: 4 }}>{showPw ? "🙈" : "👁"}</button>
        </div>
        {err && <p style={{ color: "var(--danger)", fontSize: 13, margin: "0 0 10px" }}>{err}</p>}
        <button className="btn" type="submit" disabled={busy} style={{ width: "100%", padding: 10, fontSize: 15 }}>
          {busy ? "로그인 중…" : "로그인"}
        </button>
        <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>계정은 관리자가 발급합니다. 로그인이 안 되면 담당자에게 문의하세요.</p>
      </form>
    </div>
  );
}
