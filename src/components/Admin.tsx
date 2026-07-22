import { errMsg } from "../lib/errmsg";
import { useEffect, useState } from "react";
import { SCREEN_PERMS, SCREEN_PERM_KEYS, ScreenPerm, listProfiles, setRole, getMatrix, setPermission, adminCreateUser, adminResetPassword, myRole } from "../lib/perm";
import { logAudit } from "../lib/db";
import { toast } from "../lib/toast";
import { useIsMobile } from "../lib/useIsMobile";
import { TAB_DEFS, groupIcon } from "../lib/tabs";
import { getMenuConfig, saveMenuConfig, deleteMenuGroup, MenuGroupRow, listTrash, restoreOrder, restoreReceipt, purgeOrder, purgeReceipt } from "../lib/db";
import { confirmDialog, promptDialog } from "../lib/confirm";
import { money } from "../lib/fmt";

const ROLES = ["master", "manager", "user"];

// 메뉴 구성의 현재 상태를 문자열로 요약 — 저장 시점과 비교해 '저장 안 된 변경' 표시
type PlaceMap = Record<string, { group_id: string | null; sort: number }>;
function menuSig(gs: MenuGroupRow[], pl: PlaceMap) {
  const of = (gid: string | null) => TAB_DEFS
    .filter(t => (pl[t.key]?.group_id ?? null) === gid)
    .sort((a, b) => (pl[a.key]?.sort || 0) - (pl[b.key]?.sort || 0)).map(t => t.key);
  return JSON.stringify([gs.map(g => [g.id, g.name]), [...gs.map(g => g.id), null].map(of)]);
}

// 접을 수 있는 섹션 카드 — 관리자 페이지가 길어 스크롤 부담을 줄임
function Sec({ title, sub, defaultOpen = false, children }: { title: React.ReactNode; sub?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card">
      <h3 style={{ marginTop: 0, marginBottom: open ? undefined : 0, cursor: "pointer", userSelect: "none" }} onClick={() => setOpen(o => !o)}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{open ? "▼" : "▶"}</span> {title} {sub && <span className="muted" style={{ fontWeight: 400 }}>{sub}</span>}
      </h3>
      {open && children}
    </div>
  );
}

export default function Admin({ onRoleChange, onMenuOrderChange, onDataChange }: { onRoleChange: () => void; onMenuOrderChange: () => void; onDataChange?: () => void }) {
  const isMobile = useIsMobile();
  const [mgroups, setMgroups] = useState<MenuGroupRow[]>([]);
  const [place, setPlace] = useState<PlaceMap>({});
  const [selMenuG, setSelMenuG] = useState("");           // 선택된 그룹 id ("_etc" = 미분류)
  const [editingG, setEditingG] = useState<string | null>(null); // 이름 인라인 편집 중인 그룹
  const [menuSnap, setMenuSnap] = useState<{ gs: MenuGroupRow[]; pl: PlaceMap; sig: string } | null>(null); // 저장 시점 상태
  useEffect(() => {
    getMenuConfig().then(c => {
      const gs = [...c.groups].sort((a, b) => a.sort - b.sort);
      const gids = new Set(gs.map(g => g.id));
      const p: any = { ...c.placement };
      Object.keys(p).forEach(k => { if (p[k].group_id && !gids.has(p[k].group_id)) p[k] = { ...p[k], group_id: null }; });
      TAB_DEFS.forEach((t, i) => { if (!p[t.key]) p[t.key] = { group_id: null, sort: 100 + i }; });
      setMgroups(gs); setPlace(p);
      setMenuSnap({ gs: gs.map(g => ({ ...g })), pl: JSON.parse(JSON.stringify(p)), sig: menuSig(gs, p) });
    }).catch(e => toast.error("메뉴 불러오기 실패: " + errMsg(e)));
  }, []);
  const menuDirty = !!menuSnap && menuSig(mgroups, place) !== menuSnap.sig;
  function undoMenu() {
    if (!menuSnap) return;
    setMgroups(menuSnap.gs.map(g => ({ ...g })));
    setPlace(JSON.parse(JSON.stringify(menuSnap.pl)));
    setEditingG(null);
    toast.success("저장 시점으로 되돌렸습니다");
  }
  // 화면별 권한에서 보기가 꺼진 역할 — 메뉴 구성 편집기에 🔒 배지로 표시
  function hiddenRoles(tabKey: string): string[] {
    if (tabKey === "admin" || !loaded) return [];
    const s = SCREEN_PERMS.find(x => x.view[0] === "menu." + (tabKey === "today" ? "pop" : tabKey));
    if (!s) return [];
    return ["manager", "user"].filter(r => s.view.some(k => !matrix[`${r}:${k}`]));
  }
  const itemsOf = (gid: string | null) => TAB_DEFS.filter(t => (place[t.key]?.group_id ?? null) === gid).sort((a, b) => (place[a.key]?.sort || 0) - (place[b.key]?.sort || 0));
  const renameGroup = (id: string, name: string) => setMgroups(gs => gs.map(g => g.id === id ? { ...g, name } : g));
  const moveGroup = (i: number, dir: number) => { const j = i + dir; if (j < 0 || j >= mgroups.length) return; const n = [...mgroups]; [n[i], n[j]] = [n[j], n[i]]; setMgroups(n); };
  const addGroup = () => {
    const id = (crypto as any).randomUUID?.() || String(Date.now());
    setMgroups(gs => [...gs, { id, name: "새 그룹", sort: gs.length }]);
    setSelMenuG(id); setEditingG(id);
  };
  async function removeGroup(id: string) {
    const g = mgroups.find(x => x.id === id);
    if (!(await confirmDialog({ title: "그룹 삭제", message: `'${g?.name || ""}' 그룹을 삭제할까요?\n속한 메뉴는 '미분류'로 이동합니다.`, danger: true, confirmLabel: "삭제" }))) return;
    try {
      await deleteMenuGroup(id);
      setMgroups(gs => gs.filter(g => g.id !== id));
      const drop = (p: PlaceMap) => { const n: any = { ...p }; Object.keys(n).forEach(k => { if (n[k].group_id === id) n[k] = { ...n[k], group_id: null }; }); return n as PlaceMap; };
      setPlace(drop);
      // 삭제는 DB에 즉시 반영되므로 저장 시점 스냅샷에도 같은 변화를 적용 (다른 미저장 변경은 dirty 유지)
      setMenuSnap(s => { if (!s) return s; const gs2 = s.gs.filter(g => g.id !== id); const pl2 = drop(s.pl); return { gs: gs2, pl: pl2, sig: menuSig(gs2, pl2) }; });
      toast.success("그룹 삭제됨"); onMenuOrderChange();
    }
    catch (e: any) { toast.error("삭제 실패: " + errMsg(e)); }
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
      setMenuSnap({ gs: mgroups.map(g => ({ ...g })), pl: JSON.parse(JSON.stringify(place)), sig: menuSig(mgroups, place) });
      toast.success("메뉴 구성 저장됨 (새로고침/로그인 시 반영)"); onMenuOrderChange();
    } catch (e: any) { toast.error("저장 실패: " + errMsg(e)); }
  }
  const [users, setUsers] = useState<any[]>([]);
  const [matrix, setMatrix] = useState<Record<string, boolean>>({}); // `${role}:${cap}` -> bool
  const [busy, setBusy] = useState(false);
  const [nf, setNf] = useState({ email: "", password: "", role: "user" });
  const [showPw, setShowPw] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      const [u, m] = [await listProfiles(), await getMatrix()];
      setUsers(u);
      const mm: Record<string, boolean> = {}; m.forEach((r: any) => { mm[`${r.role}:${r.capability}`] = r.allowed; });
      setMatrix(mm);
    } catch (e: any) { toast.error("불러오기 실패: " + errMsg(e)); }
    setLoaded(true);
  }
  useEffect(() => { load(); }, []);

  // ---- 휴지통 ----
  const [trash, setTrash] = useState<{ orders: any[]; receipts: any[] }>({ orders: [], receipts: [] });
  const loadTrash = () => listTrash().then(setTrash).catch(e => toast.error("휴지통 불러오기 실패: " + errMsg(e)));
  useEffect(() => { loadTrash(); }, []);
  async function restoreItem(kind: "order" | "receipt", it: any) {
    setBusy(true);
    try {
      if (kind === "order") await restoreOrder(it.id); else await restoreReceipt(it.id);
      await logAudit("휴지통 복구", kind, it.id, { name: it.name || it.vendor });
      toast.success("복구됨"); await loadTrash(); onDataChange?.();
    } catch (e: any) { toast.error("복구 실패: " + errMsg(e)); }
    setBusy(false);
  }
  async function purgeItem(kind: "order" | "receipt", it: any) {
    const label = kind === "order" ? `${it.order_date} · ${it.name} · ${money(it.qty)}g` : `${it.rdate} · ${it.vendor} · ${money(it.total)}원`;
    const ok = await confirmDialog({
      title: "영구 삭제", danger: true, confirmLabel: "영구 삭제",
      message: `${label}\n완전히 삭제합니다. ${kind === "receipt" ? "보관 중인 원본 사진도 함께 삭제되며 " : kind === "order" ? "연결된 생산계획·COC도 함께 삭제되며 " : ""}복구할 수 없습니다.`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      if (kind === "order") await purgeOrder(it.id);
      else await purgeReceipt(it.id, (it.image_paths && it.image_paths.length ? it.image_paths : (it.image_path ? [it.image_path] : [])));
      await logAudit("휴지통 영구삭제", kind, it.id, { name: it.name || it.vendor });
      toast.success("영구 삭제됨"); await loadTrash();
    } catch (e: any) { toast.error("영구 삭제 실패: " + errMsg(e)); }
    setBusy(false);
  }

  if (myRole() !== "master") return <div className="card nodata">이 페이지는 Master만 접근할 수 있습니다.</div>;

  async function changeRole(u: any, role: string) {
    setBusy(true);
    try { await setRole(u.id, role); await logAudit("역할 변경", "profile", u.id, { email: u.email, role }); toast.success(`${u.email} → ${role}`); await load(); onRoleChange(); }
    catch (e: any) { toast.error("실패: " + errMsg(e)); }
    setBusy(false);
  }
  // 키 여러 개(예: 리포트 보기 = menu.report + report.view)를 스위치 하나로 함께 토글
  async function toggleKeys(role: string, keys: string[], val: boolean, label: string) {
    setMatrix(m => { const n = { ...m }; keys.forEach(k => { n[`${role}:${k}`] = val; }); return n; });
    try {
      for (const k of keys) await setPermission(role, k, val);
      await logAudit("권한 변경", "perm", `${role}.${keys.join("+")}`, { allowed: val, label });
    } catch (e: any) { toast.error("권한 저장 실패: " + errMsg(e)); load(); }
  }
  async function applyPreset(role: string, kind: "viewer" | "field" | "full") {
    const NAMES = { viewer: "보기 전용", field: "현장 작업자", full: "전체 허용(삭제 제외)" } as const;
    if (!(await confirmDialog({ title: "프리셋 적용", message: `${role} 역할의 화면별 권한 전체를 '${NAMES[kind]}' 구성으로 덮어씁니다.\n기존 개별 설정은 사라집니다.`, confirmLabel: "적용" }))) return;
    const next: Record<string, boolean> = Object.fromEntries(SCREEN_PERM_KEYS.map(k => [k, false]));
    if (kind === "viewer") SCREEN_PERMS.forEach(s => s.view.forEach(k => { next[k] = true; }));
    if (kind === "field") {
      ["menu.pop", "menu.plan", "menu.delivery", "menu.coc", "menu.dash"].forEach(k => { next[k] = true; });
      next["plan.edit"] = true; next["coc.issue"] = true;
    }
    if (kind === "full") { SCREEN_PERM_KEYS.forEach(k => { next[k] = true; }); next["order.delete"] = false; }
    setBusy(true);
    setMatrix(m => { const n = { ...m }; SCREEN_PERM_KEYS.forEach(k => { n[`${role}:${k}`] = next[k]; }); return n; });
    try {
      for (const k of SCREEN_PERM_KEYS) await setPermission(role, k, next[k]);
      await logAudit("권한 프리셋 적용", "perm", role, { preset: kind });
      toast.success(`${role} → '${NAMES[kind]}' 프리셋 적용됨`);
    } catch (e: any) { toast.error("프리셋 적용 실패: " + errMsg(e)); load(); }
    setBusy(false);
  }
  async function createUser() {
    if (!nf.email || !nf.password) { toast.error("이메일과 비밀번호를 입력하세요."); return; }
    if (nf.password.length < 6) { toast.error("비밀번호는 6자 이상."); return; }
    setBusy(true);
    try {
      await adminCreateUser(nf.email.trim(), nf.password, nf.role);
      await logAudit("사용자 생성", "user", nf.email, { role: nf.role });
      toast.success(`사용자 생성 완료: ${nf.email}`); setNf({ email: "", password: "", role: "user" }); await load();
    } catch (e: any) { toast.error("생성 실패: " + errMsg(e)); }
    setBusy(false);
  }
  async function resetPw(u: any) {
    const pw = await promptDialog({ title: "비밀번호 재설정", label: `${u.email} 의 새 비밀번호 (6자 이상)`, type: "password" });
    if (!pw) return;
    if (pw.length < 6) { toast.error("비밀번호는 6자 이상."); return; }
    setBusy(true);
    try { await adminResetPassword(u.id, pw); await logAudit("비번 재설정", "user", u.id, { email: u.email }); toast.success("비밀번호 변경됨"); }
    catch (e: any) { toast.error("실패: " + errMsg(e)); }
    setBusy(false);
  }

  const TH: React.CSSProperties = { background: "#f1f3f7", color: "#374151", padding: "6px 8px", fontSize: 12, textAlign: "left" };
  const TD: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #eef2f7", fontSize: 13 };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Sec title={<>메뉴 구성{menuDirty && <span className="medit-dirty">● 저장 안 된 변경</span>}</>} sub="(그룹·순서 — PC 사이드바·모바일 메뉴 공통)">
        {(() => {
          // 선택 그룹 확정: 지워졌거나 미지정이면 첫 그룹으로
          const etcCount = itemsOf(null).length;
          const eff = mgroups.some(g => g.id === selMenuG) ? selMenuG
            : (selMenuG === "_etc" && etcCount > 0 ? "_etc" : (mgroups[0]?.id || "_etc"));
          const effGid = eff === "_etc" ? null : eff;
          const curG = mgroups.find(g => g.id === eff);
          const panelItems = itemsOf(effGid);
          const iconG = (g: MenuGroupRow) => groupIcon(g.name, itemsOf(g.id)[0]?.icon);
          return (
            <div style={{ display: "grid", gap: 10 }}>
              <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
                왼쪽에서 <b>메인 메뉴(그룹)</b>를 선택하면 오른쪽에 그 그룹의 <b>보조탭</b>이 실제 순서대로 보입니다. 아이콘은 그룹 이름으로 자동 결정됩니다(현장 🏭 · 데이터/가져오기 📥 · 분석/대시보드 📊 · 관리/경영지원 📁 · 시스템 ⚙️ · 기록 🗂️).
              </p>
              <div className="medit">
                <div className="medit-rail">
                  <div className="medit-cap">메인 메뉴 (PC 왼쪽 레일)</div>
                  {mgroups.map((g, gi) => (
                    <div key={g.id} className={"medit-g" + (eff === g.id ? " on" : "")}
                      onClick={() => { setSelMenuG(g.id); if (editingG !== g.id) setEditingG(null); }}>
                      <span className="medit-ic">{iconG(g)}</span>
                      {editingG === g.id
                        ? <input className="medit-rn" autoFocus value={g.name} maxLength={10}
                            onChange={e => renameGroup(g.id, e.target.value)}
                            onClick={e => e.stopPropagation()}
                            onBlur={() => setEditingG(null)}
                            onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setEditingG(null); }} />
                        : <span className="medit-nm">{g.name}</span>}
                      <span className="medit-cnt">{itemsOf(g.id).length}</span>
                      {eff === g.id && (
                        <div className="medit-tools" onClick={e => e.stopPropagation()}>
                          <button className="btn ghost medit-mini" disabled={gi === 0} onClick={() => moveGroup(gi, -1)}>▲ 위로</button>
                          <button className="btn ghost medit-mini" disabled={gi === mgroups.length - 1} onClick={() => moveGroup(gi, 1)}>▼ 아래로</button>
                          <button className="btn ghost medit-mini" onClick={() => setEditingG(g.id)}>✏️ 이름</button>
                          <button className="btn danger medit-mini" onClick={() => removeGroup(g.id)}>삭제</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {etcCount > 0 && (
                    <div className={"medit-g etc" + (eff === "_etc" ? " on" : "")} onClick={() => setSelMenuG("_etc")}>
                      <span className="medit-ic">⚠️</span><span className="medit-nm">미분류</span><span className="medit-cnt">{etcCount}</span>
                      {eff === "_etc" && <div className="medit-tools"><span style={{ fontSize: 11.5, color: "var(--danger)" }}>그룹을 지정해 주세요 — 사이드바에는 '기타'로 표시됩니다</span></div>}
                    </div>
                  )}
                  <button className="medit-add" onClick={addGroup}>＋ 그룹 추가</button>
                </div>
                <div className="medit-panel">
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    <b style={{ fontSize: 14 }}>{eff === "_etc" ? "⚠️ 미분류" : curG ? `${iconG(curG)} ${curG.name}` : ""}</b>
                    <span className="muted" style={{ fontSize: 12 }}>{eff === "_etc" ? "그룹이 없는 화면 — '이동'으로 그룹을 지정해 주세요" : "이 그룹을 누르면 위에 이렇게 보조탭이 나옵니다"}</span>
                  </div>
                  {eff !== "_etc" && (
                    <div className="medit-sub">
                      {panelItems.length === 0
                        ? <span className="muted" style={{ fontSize: 12 }}>메뉴 없음</span>
                        : panelItems.map((t, i) => <span key={t.key} className={"medit-chip" + (i === 0 ? " first" : "")}>{t.icon} {t.label}</span>)}
                    </div>
                  )}
                  {panelItems.length === 0 && <div className="muted" style={{ fontSize: 12.5, padding: "10px 2px", textAlign: "center" }}>이 그룹에 화면이 없습니다. 다른 그룹에서 '이동'으로 옮기거나, 빈 그룹이면 삭제하세요.</div>}
                  {panelItems.map((t, ii, arr) => {
                    const hid = t.key === "admin" ? null : hiddenRoles(t.key);
                    return (
                      <div key={t.key} className={"medit-item" + (hid && hid.length >= 2 ? " dim" : "")}>
                        <span style={{ fontSize: 16 }}>{t.icon}</span>
                        <span className="medit-lb">{t.label}
                          {t.key === "admin"
                            ? <span className="medit-lock" title="관리자 화면은 master 역할만 볼 수 있습니다">🔒 master 전용</span>
                            : hid && hid.length > 0 && <span className="medit-lock" title={`아래 '화면별 권한'에서 보기 꺼짐 — ${hid.join("·")} 역할의 메뉴에는 안 보입니다`}>🔒 {hid.join("·")} 숨김</span>}
                        </span>
                        <span className="medit-it-tools">
                          <button className="btn ghost medit-mini" disabled={ii === 0} onClick={() => moveItem(t.key, -1)}>▲</button>
                          <button className="btn ghost medit-mini" disabled={ii === arr.length - 1} onClick={() => moveItem(t.key, 1)}>▼</button>
                          <select className="medit-mv" value="" onChange={e => { if (e.target.value) setItemGroup(t.key, e.target.value); }}>
                            <option value="" disabled>이동…</option>
                            {mgroups.filter(gg => gg.id !== effGid).map(gg => <option key={gg.id} value={gg.id}>{iconG(gg)} {gg.name}</option>)}
                          </select>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn ghost" disabled={!menuDirty} style={{ opacity: menuDirty ? 1 : .5 }} onClick={undoMenu}>↩ 되돌리기</button>
                <button className="btn green" disabled={!menuDirty} style={{ opacity: menuDirty ? 1 : .5 }} onClick={saveMenu}>메뉴 구성 저장</button>
                {menuDirty && <span className="muted" style={{ fontSize: 12 }}>변경사항이 아직 저장되지 않았습니다.</span>}
              </div>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>저장 후 각 사용자는 새로고침/로그인 때 반영됩니다. (아래 '화면별 권한'에서 보기를 끈 화면은 🔒로 표시되고 해당 역할의 메뉴에서 숨겨집니다)</p>
            </div>
          );
        })()}
      </Sec>

      <Sec title="사용자 / 역할" defaultOpen>
        {!loaded && <div className="muted" style={{ padding: 8 }}>불러오는 중…</div>}
        {loaded && users.length === 0 && <div className="muted" style={{ padding: 8 }}>사용자가 없습니다.</div>}
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
      </Sec>

      <Sec title="신규 사용자 추가">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input placeholder="이메일" value={nf.email} onChange={e => setNf({ ...nf, email: e.target.value })} style={{ padding: 8, border: "1px solid var(--line)", borderRadius: 6 }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input placeholder="비밀번호(6자+)" type={showPw ? "text" : "password"} autoComplete="new-password" value={nf.password} onChange={e => setNf({ ...nf, password: e.target.value })} style={{ padding: 8, border: "1px solid var(--line)", borderRadius: 6 }} />
            <button className="btn ghost" style={{ padding: "6px 8px" }} aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보기"} onClick={() => setShowPw(s => !s)}>{showPw ? "🙈" : "👁"}</button>
          </span>
          <select value={nf.role} onChange={e => setNf({ ...nf, role: e.target.value })} style={{ padding: 8 }}>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button className="btn green" disabled={busy} onClick={createUser}>추가</button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>계정은 즉시 생성되고 이메일 인증 없이 바로 로그인 가능합니다. 비밀번호는 서버에서 암호화 저장됩니다.</p>
      </Sec>

      <Sec key={trash.orders.length + trash.receipts.length > 0 ? "trash-y" : "trash-n"}
        title={`🗑 휴지통${trash.orders.length + trash.receipts.length > 0 ? ` (${trash.orders.length + trash.receipts.length})` : ""}`}
        sub="(삭제된 주문·증빙 — 복구하거나 영구 삭제)" defaultOpen={trash.orders.length + trash.receipts.length > 0}>
        {trash.orders.length === 0 && trash.receipts.length === 0 ? <p className="muted">휴지통이 비어 있습니다.</p> :
          <div style={{ display: "grid", gap: 6 }}>
            {trash.orders.map(o => (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 6, fontSize: 13, flexWrap: "wrap" }}>
                <span style={{ background: "var(--tint)", borderRadius: 4, padding: "1px 6px", fontSize: 11 }}>주문</span>
                <b>{o.name}</b><span className="muted">{o.order_date} · {money(o.qty)}g · {o.customer} · 삭제 {String(o.deleted_at || "").slice(0, 10)}</span>
                <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
                  <button className="btn ghost" style={{ padding: "2px 10px", fontSize: 12 }} disabled={busy} onClick={() => restoreItem("order", o)}>↩ 복구</button>
                  <button className="btn danger" style={{ padding: "2px 10px", fontSize: 12 }} disabled={busy} onClick={() => purgeItem("order", o)}>영구 삭제</button>
                </span>
              </div>
            ))}
            {trash.receipts.map(r => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 6, fontSize: 13, flexWrap: "wrap" }}>
                <span style={{ background: "#e6f0ea", borderRadius: 4, padding: "1px 6px", fontSize: 11 }}>증빙</span>
                <b>{r.vendor}</b><span className="muted">{r.rdate} · {money(r.total)}원 · {r.account} · 삭제 {String(r.deleted_at || "").slice(0, 10)}</span>
                <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
                  <button className="btn ghost" style={{ padding: "2px 10px", fontSize: 12 }} disabled={busy} onClick={() => restoreItem("receipt", r)}>↩ 복구</button>
                  <button className="btn danger" style={{ padding: "2px 10px", fontSize: 12 }} disabled={busy} onClick={() => purgeItem("receipt", r)}>영구 삭제</button>
                </span>
              </div>
            ))}
          </div>}
        <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>주문을 복구하면 연결된 생산계획·COC도 함께 돌아옵니다. 증빙 원본 사진은 영구 삭제 전까지 보존됩니다.</p>
      </Sec>

      <Sec title="화면별 권한" sub="(보기 + 작업 — Master는 항상 전체)" defaultOpen>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10, fontSize: 12 }}>
          {ROLES.filter(r => r !== "master").map(role => (
            <span key={role} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <b>{role} 프리셋:</b>
              <button className="btn ghost" style={{ padding: "3px 9px", fontSize: 12 }} disabled={busy} onClick={() => applyPreset(role, "viewer")}>보기 전용</button>
              <button className="btn ghost" style={{ padding: "3px 9px", fontSize: 12 }} disabled={busy} onClick={() => applyPreset(role, "field")}>현장 작업자</button>
              <button className="btn ghost" style={{ padding: "3px 9px", fontSize: 12 }} disabled={busy} onClick={() => applyPreset(role, "full")}>전체(삭제 제외)</button>
            </span>
          ))}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
            <thead><tr>
              <th style={TH}>화면</th>
              <th style={{ ...TH, textAlign: "center", width: 60 }}>Master</th>
              <th style={{ ...TH, width: "36%" }}>Manager</th>
              <th style={{ ...TH, width: "36%" }}>User</th>
            </tr></thead>
            <tbody>
              {(() => {
                const rows: React.ReactNode[] = [];
                // 그룹핑·행 이름은 위 '메뉴 구성'(menu_groups/menu_placement)을 그대로 따른다 —
                // 메뉴에서 화면을 옮기면 권한 표에서도 같은 그룹 아래·같은 이름(아이콘+라벨)으로 보이도록.
                // 권한 항목이 없는 화면(관리자)은 master 전용 자리표시 행으로 넣어 그룹이 사라지지 않게 한다.
                // 메뉴 구성이 없으면(로컬 모드 등) 기본 분류(s.group)로 폴백.
                type TabDef = typeof TAB_DEFS[number];
                type PermRow = { tab?: TabDef; s?: ScreenPerm };
                const tabKeyOf = (s: ScreenPerm) => { const k = (s.view[0] || "").replace("menu.", ""); return k === "pop" ? "today" : k; };
                const byTab = new Map(SCREEN_PERMS.map(s => [tabKeyOf(s), s] as const));
                const seen = new Set<string>();
                const collect = (ts: TabDef[]): PermRow[] => ts.map((t): PermRow | null => {
                  const s = byTab.get(t.key);
                  if (s) return !seen.has(s.name) && (seen.add(s.name), true) ? { tab: t, s } : null;
                  return t.key === "admin" ? { tab: t } : null;
                }).filter((r): r is PermRow => !!r);
                let grps: { label: string; items: PermRow[] }[];
                if (mgroups.length) {
                  grps = [...mgroups].sort((a, b) => a.sort - b.sort)
                    .map(g => ({ label: `${groupIcon(g.name, itemsOf(g.id)[0]?.icon)} ${g.name}`, items: collect(itemsOf(g.id)) }))
                    .filter(g => g.items.length > 0);
                  const etc = [...collect(itemsOf(null)), ...SCREEN_PERMS.filter(s => !seen.has(s.name)).map(s => ({ s } as PermRow))];
                  if (etc.length) grps.push({ label: "⚠️ 미분류", items: etc });
                } else {
                  grps = [];
                  SCREEN_PERMS.forEach(s => {
                    const last = grps[grps.length - 1];
                    if (!last || last.label !== s.group) grps.push({ label: s.group, items: [] });
                    grps[grps.length - 1].items.push({ s, tab: TAB_DEFS.find(t => byTab.get(t.key) === s) });
                  });
                  grps.push({ label: "📁 관리", items: [{ tab: TAB_DEFS.find(t => t.key === "admin")! }] });
                }
                const screenRow = (r: PermRow) => {
                  const label = r.tab ? `${r.tab.icon} ${r.tab.label}` : r.s!.name;
                  if (!r.s) return (
                    <tr key={r.tab!.key}>
                      <td style={{ ...TD, fontWeight: 700, whiteSpace: "nowrap" }}>{label}</td>
                      <td style={{ ...TD, textAlign: "center", color: "var(--ok)", fontWeight: 700 }}>✓</td>
                      <td colSpan={2} style={{ ...TD, color: "var(--muted)", fontSize: 12 }}>🔒 master 전용 — 다른 역할은 권한 설정과 무관하게 접근할 수 없습니다</td>
                    </tr>
                  );
                  const s = r.s;
                  const shared = s.acts.find(a => a.shared);
                  return (
                    <tr key={s.name}>
                      <td style={{ ...TD, fontWeight: 700, whiteSpace: "nowrap" }} title={s.name !== label ? s.name : undefined}>{label}
                        {shared && <span title={`'${shared.shared}'와 같은 권한을 사용합니다 — 한쪽을 바꾸면 함께 바뀝니다`}
                          style={{ fontWeight: 400, fontSize: 10.5, color: "var(--warn)", background: "#fff7e6", borderRadius: 5, padding: "0 6px", marginLeft: 6, cursor: "help" }}>공유</span>}
                      </td>
                      <td style={{ ...TD, textAlign: "center", color: "var(--ok)", fontWeight: 700 }}>✓</td>
                      {["manager", "user"].map(role => {
                        const viewOn = s.view.every(k => !!matrix[`${role}:${k}`]);
                        return (
                          <td key={role} style={TD}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              <PermPill strong on={viewOn} label="보기" onChange={v => toggleKeys(role, s.view, v, `${s.name} 보기`)} />
                              {s.acts.map(a => (
                                <PermPill key={a.k} on={!!matrix[`${role}:${a.k}`]} disabled={!viewOn} label={a.label}
                                  title={a.shared ? `'${a.shared}'와 공유되는 권한` : undefined}
                                  onChange={v => toggleKeys(role, [a.k], v, `${s.name} ${a.label}`)} />
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                };
                grps.forEach(g => {
                  rows.push(<tr key={"g" + g.label}><td colSpan={4} style={{ ...TD, background: "#eef2f6", fontWeight: 800, fontSize: 12 }}>{g.label}</td></tr>);
                  g.items.forEach(r => rows.push(screenRow(r)));
                });
                return rows;
              })()}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          그룹·순서·화면 이름은 위 <b>'메뉴 구성'</b>을 그대로 따릅니다 — 메뉴에서 화면을 옮기면 이 표에서도 같은 그룹 아래로 이동합니다.
          관리자 화면은 master 전용이라 권한 스위치가 없습니다.
          '보기'를 끄면 사이드바에서 화면이 숨겨지고 작업도 함께 비활성화됩니다. 리포트·기록은 보기 스위치 하나가 내부 권한까지 함께 처리합니다.
          COC는 '보기'만 켜면 읽기 전용으로 열람할 수 있습니다. 변경은 즉시 저장되며 대상자는 새로고침 후 반영됩니다.
        </p>
      </Sec>
    </div>
  );
}

// 통합 권한표의 체크 필 (보기/작업)
function PermPill({ on, disabled, label, title, onChange, strong }: {
  on: boolean; disabled?: boolean; label: string; title?: string; strong?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label title={title} style={{
      display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 16, padding: "2px 10px 2px 7px",
      fontSize: 12, whiteSpace: "nowrap", cursor: disabled ? "default" : "pointer",
      border: "1px solid " + (on ? "var(--accent)" : "var(--line)"),
      background: on ? "var(--tint2)" : "#fff", color: on ? "var(--accent)" : "inherit",
      opacity: disabled ? .38 : 1, fontWeight: strong ? 700 : 400,
    }}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={e => onChange(e.target.checked)} style={{ margin: 0, accentColor: "var(--accent)" }} />
      {label}
    </label>
  );
}

