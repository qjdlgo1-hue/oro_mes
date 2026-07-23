// 이카운트(ERP) 연동 설정 — 관리자 화면(master 전용) 섹션.
// 인증키는 Edge Function(service role)만 접근하는 서버 테이블에 저장되고 브라우저로는 내려오지 않는다
// (저장된 여부 has_key 만 표시). 연결 테스트로 존(Zone) 확인 + 로그인까지 왕복 검증.
import { useEffect, useState } from "react";
import { getEcountConfig, saveEcountConfig, testEcount, checkEcountIp, listEcountLogs, EcountLog } from "../lib/ecount";
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
  const [myIp, setMyIp] = useState("");
  const [ipBusy, setIpBusy] = useState(false);
  async function fetchIp() {
    setIpBusy(true);
    try { setMyIp((await checkEcountIp()).ip); }
    catch (e: any) { toast.error("발신 IP 확인 실패: " + errMsg(e)); }
    setIpBusy(false);
  }

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
      <details style={{ background: "var(--tint2)", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, lineHeight: 1.8 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>📘 이카운트 연동 절차 (처음 설정할 때 순서대로)</summary>
        <ol style={{ margin: "6px 0 0", paddingLeft: 20 }}>
          <li>ERP(login.ecount.com) 마스터 ID로 <b>Self-Customizing → 정보관리 → API인증키발급</b>에서 <b>테스트 인증키</b> 발급 (2주 유효)</li>
          <li>같은 화면 <b>[IP등록]</b>에 아래 <b>발신 IP</b>를 등록 (최대 20개){" "}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {myIp && <code style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 5, padding: "1px 8px", fontWeight: 700 }}>{myIp}</code>}
              <button className="btn ghost" style={{ padding: "2px 10px", fontSize: 12 }} disabled={ipBusy} onClick={fetchIp}>{ipBusy ? "확인 중…" : "발신 IP 확인"}</button>
              {myIp && <button className="btn ghost" style={{ padding: "2px 10px", fontSize: 12 }} onClick={() => { navigator.clipboard?.writeText(myIp); toast.success("복사됨: " + myIp); }}>복사</button>}
            </span>
            <br /><span className="muted">연동 서버의 발신 IP는 바뀔 수 있습니다 — 연결이 거부되면 다시 확인해 추가 등록하세요.</span></li>
          <li>아래에 테스트 인증키 입력 + <b>테스트존 체크</b> → 저장 → <b>[연결 테스트]</b> → 품목/재고 조회를 1회씩 실행 (테스트존 요청이 곧 이카운트의 <b>개발 검증</b>입니다)</li>
          <li>검증 완료 후 <b>정식 인증키</b>(1년 유효)를 발급받아 교체 입력하고 테스트존 체크를 해제</li>
          <li>생산입고·구매입력 전표 전송을 쓰려면 ERP 각 입력메뉴 하단 <b>웹자료올리기 → 자료올리기 항목추가</b>가 선행돼야 합니다</li>
        </ol>
      </details>
      <p className="muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.7 }}>
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
        이카운트 공식 전송 제한(운영서버: 조회·로그인 <b>10분에 1회</b>, 전표 저장 10초에 1회 / 테스트서버: 10초에 1회)에 맞춰
        MES가 호출 간격을 자동으로 지켜줍니다 — 간격이 안 지났으면 남은 시간을 알려주고 호출하지 않습니다.
        1일 최대 5,000건·1회 최대 300건 한도도 있으니 조회는 필요할 때만 실행하세요.
      </p>
    </div>
  );
}
