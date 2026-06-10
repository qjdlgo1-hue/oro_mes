import { useEffect, useState } from "react";
import { CAPS, MENUS, listProfiles, setRole, getMatrix, setPermission, adminCreateUser, adminResetPassword, myRole } from "../lib/perm";
import { logAudit } from "../lib/db";
import { toast } from "../lib/toast";
import { useIsMobile } from "../lib/useIsMobile";

const ROLES = ["master", "manager", "user"];

export default function Admin({ onRoleChange }: { onRoleChange: () => void }) {
  const isMobile = useIsMobile();
  const [users, setUsers] = useState<any[]>([]);
  const [matrix, setMatrix] = useState<Record<string, boolean>>({}); // `${role}:${cap}` -> bool
  const [busy, setBusy] = useState(false);
  const [nf, setNf] = useState({ email: "", password: "", role: "user" });

  async function load() {
    try {
      const [u, m] = [await listProfiles(), await getMatrix()];
      setUsers(u);
      const mm: Record<string, boolean> = {}; m.forEach((r: any) => { mm[`${r.role}:${r.capability}`] = r.allowed; });
      setMatrix(mm);
    } catch (e: any) { toast.error("불러오기 실패: " + (e.message || e)); }
  }
  useEffect(() => { load(); }, []);

  if (myRole() !== "master") return <div className="card nodata">이 페이지는 Master만 접근할 수 있습니다.</div>;

  async function changeRole(u: any, role: string) {
    setBusy(true);
    try { await setRole(u.id, role); await logAudit("역할 변경", "profile", u.id, { email: u.email, role }); toast.success(`${u.email} → ${role}`); await load(); onRoleChange(); }
    catch (e: any) { toast.error("실패: " + (e.message || e)); }
    setBusy(false);
  }
  async function toggle(role: string, cap: string, val: boolean) {
    setMatrix(m => ({ ...m, [`${role}:${cap}`]: val }));
    try { await setPermission(role, cap, val); await logAudit("권한 변경", "perm", `${role}.${cap}`, { allowed: val }); }
    catch (e: any) { toast.error("권한 저장 실패: " + (e.message || e)); load(); }
  }
  async function createUser() {
    if (!nf.email || !nf.password) { toast.error("이메일과 비밀번호를 입력하세요."); return; }
    if (nf.password.length < 6) { toast.error("비밀번호는 6자 이상."); return; }
    setBusy(true);
    try {
      await adminCreateUser(nf.email.trim(), nf.password, nf.role);
      await logAudit("사용자 생성", "user", nf.email, { role: nf.role });
      toast.success(`사용자 생성 완료: ${nf.email}`); setNf({ email: "", password: "", role: "user" }); await load();
    } catch (e: any) { toast.error("생성 실패: " + (e.message || e)); }
    setBusy(false);
  }
  async function resetPw(u: any) {
    const pw = prompt(`${u.email} 새 비밀번호 (6자 이상):`);
    if (!pw) return;
    if (pw.length < 6) { toast.error("비밀번호는 6자 이상."); return; }
    setBusy(true);
    try { await adminResetPassword(u.id, pw); await logAudit("비번 재설정", "user", u.id, { email: u.email }); toast.success("비밀번호 변경됨"); }
    catch (e: any) { toast.error("실패: " + (e.message || e)); }
    setBusy(false);
  }

  const TH: React.CSSProperties = { background: "var(--navy)", color: "#fff", padding: "6px 8px", fontSize: 12, textAlign: "left" };
  const TD: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #eef2f7", fontSize: 13 };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>사용자 / 역할</h3>
        {isMobile ? (
          <div>{users.map(u => (
            <div className="mcard" key={u.id}>
              <div className="mrow"><span className="k">{u.email}</span></div>
              <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                <select value={u.role} disabled={busy} onChange={e => changeRole(u, e.target.value)} style={{ padding: 6, flex: 1 }}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select>
                <button className="btn ghost" disabled={busy} onClick={() => resetPw(u)}>비번 재설정</button>
              </div>
            </div>))}
          </div>
        ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr>{["이메일", "역할", "관리"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td style={TD}>{u.email}</td>
                <td style={TD}>
                  <select value={u.role} disabled={busy} onChange={e => changeRole(u, e.target.value)} style={{ padding: 4 }}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td style={TD}><button className="btn ghost" style={{ padding: "3px 10px", fontSize: 12 }} disabled={busy} onClick={() => resetPw(u)}>비번 재설정</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>신규 사용자 추가</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input placeholder="이메일" value={nf.email} onChange={e => setNf({ ...nf, email: e.target.value })} style={{ padding: 8, border: "1px solid var(--line)", borderRadius: 6 }} />
          <input placeholder="비밀번호(6자+)" type="text" value={nf.password} onChange={e => setNf({ ...nf, password: e.target.value })} style={{ padding: 8, border: "1px solid var(--line)", borderRadius: 6 }} />
          <select value={nf.role} onChange={e => setNf({ ...nf, role: e.target.value })} style={{ padding: 8 }}>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button className="btn green" disabled={busy} onClick={createUser}>추가</button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>계정은 즉시 생성되고 이메일 인증 없이 바로 로그인 가능합니다. 비밀번호는 서버에서 암호화 저장됩니다.</p>
      </div>

      <Matrix title="권한 매트릭스 (작업 허용)" items={CAPS} matrix={matrix} TH={TH} TD={TD} toggle={toggle} />
      <Matrix title="메뉴 표시 (탭 보이기)" items={MENUS} matrix={matrix} TH={TH} TD={TD} toggle={toggle} note="권한이 없으면 자동으로 숨겨지고, 여기서 추가로 수동 숨김도 됩니다." />
    </div>
  );
}

function Matrix({ title, items, matrix, TH, TD, toggle, note }: {
  title: string; items: { key: string; label: string }[]; matrix: Record<string, boolean>;
  TH: React.CSSProperties; TD: React.CSSProperties; toggle: (role: string, cap: string, val: boolean) => void; note?: string;
}) {
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{title} <span className="muted">(Master는 항상 전체)</span></h3>
      <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 320 }}>
        <thead><tr>
          <th style={TH}>항목</th>
          <th style={{ ...TH, textAlign: "center" }}>Master</th>
          <th style={{ ...TH, textAlign: "center" }}>Manager</th>
          <th style={{ ...TH, textAlign: "center" }}>User</th>
        </tr></thead>
        <tbody>
          {items.map(c => (
            <tr key={c.key}>
              <td style={TD}>{c.label} <span className="muted" style={{ fontSize: 10 }}>({c.key})</span></td>
              <td style={{ ...TD, textAlign: "center", color: "#1aa260" }}>\u2713</td>
              {["manager", "user"].map(role => (
                <td key={role} style={{ ...TD, textAlign: "center" }}>
                  <input type="checkbox" checked={!!matrix[`${role}:${c.key}`]} onChange={e => toggle(role, c.key, e.target.checked)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {note && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{note}</p>}
    </div>
  );
}
