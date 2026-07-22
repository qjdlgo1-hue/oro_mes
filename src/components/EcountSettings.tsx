// 이카운트(ERP) 연동 설정 — 관리자 화면(master 전용) 섹션.
// 인증키는 Edge Function(service role)만 접근하는 서버 테이블에 저장되고 브라우저로는 내려오지 않는다
// (저장된 여부 has_key 만 표시). 연결 테스트로 존(Zone) 확인 + 로그인까지 왕복 검증.
import { useEffect, useState } from "react";
import { getEcountConfig, saveEcountConfig, testEcount, listEcountLogs, EcountLog } from "../lib/ecount";
import { hasSupabase } from "../lib/supabase";
import { toast } from "../lib/toast";
import { errMsg } from "../lib/errmsg";

export default function EcountSettings() {
  const [f, setF] = useState({ com_code: "", user_id: "", api_cert_key: "", use_test: true });
  const [hasKey, setHasKey] = useState(false);
  const [zone, setZone] = useState("");
  const [logs, setLogs] = useState<EcountLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  function loadAll() {
    if (!hasSupabase) { setLoaded(true); return; }
    Promise.all([getEcountConfig(), listEcountLogs()]).then(([c, l]) => {
      setF({ com_code: c.com_code, user_id: c.user_id, api_cert_key: "", use_test: c.use_test });
      setHasKey(c.has_key); setZone(c.zone); setLogs(l);
    }).catch(e => toast.error("이카운트 설정 불러오기 실패: " + errMsg(e))).finally(() => setLoaded(true));
  }
  useEffect(loadAll, []);

  async function save() {
    if (!f.com_code.trim() || !f.user_id.trim()) { toast.error("회사코드와 로그인 ID를 입력하세요."); return; }
    if (!hasKey && !f.api_cert_key.trim()) { toast.error("API 인증키를 입력하세요."); return; }
    setBusy(true);
    try {
      await saveEcountConfig({ com_code: f.com_code.trim(), user_id: f.user_id.trim(), api_cert_key: f.api_cert_key.trim() || undefined, use_test: f.use_test });
      toast.success("이카운트 연동 정보 저장됨 — [연결 테스트]로 확인하세요.");
      loadAll();
    } catch (e: any) { toast.error("저장 실패: " + errMsg(e)); }
    setBusy(false);
  }
  async function test() {
    setBusy(true);
    try {
      const r = await testEcount();
      toast.success(`이카운트 연결 성공 — 존 ${r.zone} (${r.use_test ? "테스트존" : "운영존"})`);
      loadAll();
    } catch (e: any) { toast.error("연결 실패: " + errMsg(e)); loadAll(); }
    setBusy(false);
  }

  if (!hasSupabase) return <p className="muted" style={{ margin: 0 }}>이카운트 연동은 클라우드(Supabase) 연결에서만 사용할 수 있습니다.</p>;
  if (!loaded) return <p className="muted" style={{ margin: 0 }}>불러오는 중…</p>;

  const inp: React.CSSProperties = { padding: 8, border: "1px solid var(--line)", borderRadius: 6 };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p className="muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.7 }}>
        이카운트 <b>[Self-Service → API 인증키 발급]</b>에서 발급한 키를 등록하면 품목·재고를 이카운트에서 직접 가져올 수 있습니다.
        인증키는 서버에만 저장되며 화면에 다시 표시되지 않습니다.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", fontSize: 12.5 }}>
        <label>회사코드<br /><input value={f.com_code} onChange={e => setF(o => ({ ...o, com_code: e.target.value }))} style={{ ...inp, width: 110 }} /></label>
        <label>로그인 ID<br /><input value={f.user_id} onChange={e => setF(o => ({ ...o, user_id: e.target.value }))} style={{ ...inp, width: 130 }} /></label>
        <label>API 인증키{hasKey && <span className="muted"> (등록됨)</span>}<br />
          <input type="password" autoComplete="new-password" value={f.api_cert_key} onChange={e => setF(o => ({ ...o, api_cert_key: e.target.value }))}
            placeholder={hasKey ? "변경할 때만 입력" : "인증키 입력"} style={{ ...inp, width: 220 }} /></label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, paddingBottom: 8 }}>
          <input type="checkbox" checked={f.use_test} onChange={e => setF(o => ({ ...o, use_test: e.target.checked }))} />테스트존(sboapi)
        </label>
        <button className="btn green" disabled={busy} onClick={save}>저장</button>
        <button className="btn ghost" disabled={busy} onClick={test}>{busy ? "확인 중…" : "🔌 연결 테스트"}</button>
        {zone && <span className="muted" style={{ fontSize: 12, paddingBottom: 8 }}>존: {zone}</span>}
      </div>
      {logs.length > 0 && (
        <div style={{ fontSize: 12 }}>
          <b style={{ fontSize: 12.5 }}>최근 호출 기록</b>
          <div style={{ display: "grid", gap: 3, marginTop: 4 }}>
            {logs.map(l => (
              <div key={l.id} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <span className="muted" style={{ whiteSpace: "nowrap" }}>{String(l.at).slice(0, 16).replace("T", " ")}</span>
                <span>{l.ok ? "✅" : "❌"} {l.action}</span>
                <span className="muted" style={{ overflowWrap: "anywhere" }}>
                  {l.detail?.error ? String(l.detail.error).slice(0, 120)
                    : l.detail ? Object.entries(l.detail).filter(([k]) => k !== "error").map(([k, v]) => `${k}=${v}`).join(" · ") : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="muted" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.6 }}>
        호출량 한도(조회 시간당 약 6,000건)가 있어 조회는 버튼을 눌렀을 때만 실행됩니다.
        처음에는 <b>테스트존</b>으로 연결을 확인한 뒤 운영존으로 전환하는 것을 권장합니다.
      </p>
    </div>
  );
}
