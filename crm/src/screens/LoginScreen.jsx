import React, { useState } from "react";
import { T } from "../theme";
import { Field, inputStyle, btnStyle } from "../components/ui";
import { supabase } from "../lib/supabase";

// ===========================================================================
// 로그인 화면 (클라우드 모드 — MES와 같은 계정 사용)
// ===========================================================================
export function LoginScreen({ onLocalMode }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const login = async () => {
    if (!email.trim() || !pw) return;
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    if (error) setErr(error.message === "Invalid login credentials" ? "이메일 또는 비밀번호가 올바르지 않습니다." : error.message);
    setBusy(false);
    // 성공하면 onAuthStateChange가 session을 채워서 자동으로 앱 화면으로 넘어감
  };

  return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: T.bg, fontFamily: "-apple-system, 'Segoe UI', 'Malgun Gothic', '맑은 고딕', sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 10, padding: 32, width: "100%", maxWidth: 360, border: `1px solid ${T.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 0.5, marginBottom: 4, color: T.navy }}>
          ORO <span style={{ color: T.teal }}>CRM</span>
        </div>
        <div style={{ fontSize: 13, color: T.sub, marginBottom: 24 }}>MES와 같은 계정으로 로그인하세요</div>

        <Field label="이메일">
          <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="name@orocorp.kr" onKeyDown={(e) => e.key === "Enter" && login()} />
        </Field>
        <Field label="비밀번호">
          <input style={inputStyle} type="password" value={pw} onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()} />
        </Field>

        {err && <div style={{ color: T.danger, fontSize: 12, marginBottom: 12 }}>{err}</div>}

        <button onClick={login} disabled={busy || !email.trim() || !pw}
          style={{ ...btnStyle("primary"), width: "100%", padding: "12px", fontSize: 14, opacity: busy || !email.trim() || !pw ? 0.5 : 1 }}>
          {busy ? "로그인 중..." : "로그인"}
        </button>

        <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 20, paddingTop: 16, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: T.sub, marginBottom: 8 }}>계정 없이 이 브라우저에서만 써보고 싶다면</div>
          <button onClick={onLocalMode} style={{ ...btnStyle("ghost"), fontSize: 12 }}>
            💾 로컬 모드로 사용 (로그인 없이)
          </button>
        </div>
      </div>
    </div>
  );
}
