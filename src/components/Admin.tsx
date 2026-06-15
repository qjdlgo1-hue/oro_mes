import { useEffect, useState } from "react";
import { CAPS, MENUS, listProfiles, setRole, getMatrix, setPermission, adminCreateUser, adminResetPassword, myRole } from "../lib/perm";
import { logAudit } from "../lib/db";
import { toast } from "../lib/toast";
import { useIsMobile } from "../lib/useIsMobile";
import { TAB_DEFS } from "../lib/tabs";
import { getMenuConfig, saveMenuConfig, deleteMenuGroup, MenuGroupRow } from "../lib/db";

const ROLES = ["master", "manager", "user"];

export default function Admin({ onRoleChange, onMenuOrderChange }: { onRoleChange: () => void; onMenuOrderChange: () => void }) {
  const isMobile = useIsMobile();
  const [mgroups, setMgroups] = useState<MenuGroupRow[]>([]);
  const [place, setPlace] = useState<Record<string, { group_id: string | null; sort: number }>>({});
  useEffect(() => {
    getMenuConfig().then(c => {
      const gs = [...c.groups].sort((a, b) => a.sort - b.sort);
      const p: any = { ...c.placement }; const firstG = gs[0]?.id || null;
      TAB_DEFS.forEach((t, i) => { if (!p[t.key]) p[t.key] = { group_id: firstG, sort: 100 + i }; });
      setMgroups(gs); setPlace(p);
    }).catch(e => toast.error("메뉴 불러오기 실패: " + (e.message || e)));
  }, []);
  const itemsOf = (gid: string | null) => TAB_DEFS.filter(t => (place[t.key]?.group_id ?? null) === gid).sort((a, b) => (place[a.key]?.sort || 0) - (place[b.key]?.sort || 0));
  const renameGroup = (id: string, name: string) => setMgroups(gs => gs.map(g => g.id === id ? { ...g, name } : g));
  const moveGroup = (i: number, dir: number) => { const j = i + dir; if (j < 0 || j >= mgroups.length) return; const n = [...mgroups]; [n[i], n[j]] = [n[j], n[i]]; setMgroups(n); };
  const addGroup = () => { const id = (crypto as any).randomUUID?.() || String(Date.now()); setMgroups(gs => [...gs, { id, name: "새 그룹", sort: gs.length }]); };
  async function removeGroup(id: string) {
    if (!confirm("그룹을 삭제할까요? 속한 메뉴는 '미분류'로 이동합니다.")) return;
    try { await deleteMenuGroup(id); setMgroups(gs => gs.filter(g => g.id !== id)); setPlace(p => { const n: any = { ...p }; Object.keys(n).forEach(k => { if (n[k].group_id === id) n[k] = { ...n[k], group_id: null }; }); return n; }); toast.success("그룹 삭제됨"); onMenuOrderChange(); }
    catch (e: any) { toast.error("삭제 실패: " + (e.message || e)); }
  }
  function moveItem(key: string, dir: number) {
    const gid = place[key]?.group_id ?? null; const arr = itemsOf(gid); const i = arr.findIndex(t => t.key === key); const j = i + dir; if (j < 0 || j >= arr.length) return;
    setPlace(p => { const n: any = { ...p }; const a = arr[i].key, b = arr[j].key; const sa = n[a].sort, sb = n[b].sort; n[a] = { ...n[a], sort: sb }; n[b] = { ...n[b], sort: sa }; return n; });
  }
  function setItemGroup(key: string, gid: string) { setPlace(p => { const cnt = Object.values(p).filter((x: any) => x.group_id === gid).length; return { ...p, [key]: { group_id: gid, sort: cnt } }; }); }
  async function saveMenu() {
    try {
      const gs = mgroups.map((g, i) => ({ id: g.id, name: g.name, sort: i }));
      const placements: { item_key: string; group_id: string | null; sort: number }[] = [];
      [...gs.map(g => g.id), null].forEach(gid => { itemsOf(gid).forEach((t, idx) => placements.push({ item_key: t.key, group_id: gid, sort: idx })); });
      await saveMenuConfig(gs, placements);
      await logAudit("메뉴 구성 변경", "menu", "", { groups: gs.length });
      toast.success("메뉴 구성 저장됨 (새로고침/로그인 시 반영)"); onMenuOrderChange();
    } catch (e: any) { toast.error("저장 실패: " + (e.message || e)); }
  }
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

  const TH: React.CSSProperties = { background: "#f1f3f7", color: "#374151", padding: "6px 8px", fontSize: 12, textAlign: "left" };
  const TD: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #eef2f7", fontSize: 13 };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>메뉴 구성 <span className="muted">(그룹·순서 — PC 사이드바·모바일 메뉴 공통)</span></h3>
        <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
          {mgroups.map((g, gi) => (
            <div key={g.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <input value={g.name} onChange={e => renameGroup(g.id, e.target.value)} style={{ fontWeight: 700, padding: 6, border: "1px solid var(--line)", borderRadius: 6, flex: 1 }} />
                <button className="btn ghost" style={{ padding: "2px 9px" }} disabled={gi === 0} onClick={() => moveGroup(gi, -1)}>▲</button>
                <button className="btn ghost" style={{ padding: "2px 9px" }} disabled={gi === mgroups.length - 1} onClick={() => moveGroup(gi, 1)}>▼</button>
                <button className="btn" style={{ background: "#c0392b", padding: "2px 9px" }} onClick={() => removeGroup(g.id)}>삭제</button>
              </div>
              {itemsOf(g.id).map((t, ii, arr) => (
                <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                  <span style={{ fontSize: 16 }}>{t.icon}</span><span style={{ flex: 1 }}>{t.label}</span>
                  <button className="btn ghost" style={{ padding: "1px 8px" }} disabled={ii === 0} onClick={() => moveItem(t.key, -1)}>▲</button>
                  <button className="btn ghost" style={{ padding: "1px 8px" }} disabled={ii === arr.length - 1} onClick={() => moveItem(t.key, 1)}>▼</button>
                  <select value={g.id} onChange={e => setItemGroup(t.key, e.target.value)} style={{ padding: 4 }}>{mgroups.map(gg => <option key={gg.id} value={gg.id}>{gg.name}</option>)}</select>
                </div>
              ))}
              {itemsOf(g.id).length === 0 && <div className="muted" style={{ fontSize: 12 }}>메뉴 없음</div>}
            </div>
          ))}
          {itemsOf(null).length > 0 &&
            <div style={{ border: "1px dashed #c0392b", borderRadius: 8, padding: 10 }}>
              <div style={{ fontWeight: 700, color: "#c0392b", marginBottom: 6 }}>미분류 (그룹 지정 필요)</div>
              {itemsOf(null).map(t => (
                <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                  <span style={{ fontSize: 16 }}>{t.icon}</span><span style={{ flex: 1 }}>{t.label}</span>
                  <select defaultValue="" onChange={e => setItemGroup(t.key, e.target.value)} style={{ padding: 4 }}><option value="" disabled>그룹 선택</option>{mgroups.map(gg => <option key={gg.id} value={gg.id}>{gg.name}</option>)}</select>
                </div>
              ))}
            </div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn ghost" onClick={addGroup}>＋ 그룹 추가</button>
            <button className="btn green" onClick={saveMenu}>메뉴 구성 저장</button>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>저장 후 각 사용자는 새로고침/로그인 때 반영됩니다. (권한·메뉴표시로 숨긴 메뉴는 안 보입니다)</p>
        </div>
      </div>

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
