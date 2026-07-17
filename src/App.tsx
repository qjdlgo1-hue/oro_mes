import { useEffect, useMemo, useRef, useState, useCallback, lazy, Suspense } from "react";
import { todayIso } from "./lib/fmt";
import type { Session } from "@supabase/supabase-js";
import { Order, PlanEntry } from "./lib/types";
import { listOrders, listPlans, backendName, getMenuConfig, MenuGroupRow, MenuPlacement, logAudit } from "./lib/db";
import { completionDate } from "./lib/plan";
import { supabase, hasSupabase } from "./lib/supabase";
import { ToastHost } from "./lib/toast";
import { ConfirmHost } from "./lib/confirm";
import ErrorBoundary from "./lib/ErrorBoundary";
import { loadPerms, useCaps } from "./lib/perm";
import { useIsMobile } from "./lib/useIsMobile";
import { TAB_DEFS, TabKey, groupIcon } from "./lib/tabs";

// URL 해시 ↔ 탭 동기화 (#plan, #coc/<주문id>) — 새로고침·뒤로가기·북마크 지원
const TAB_KEY_SET = new Set<string>(TAB_DEFS.map(t => t.key));
function parseHash(): { tab: TabKey | null; param: string | null } {
  const [t, param] = window.location.hash.replace(/^#/, "").split("/");
  return { tab: TAB_KEY_SET.has(t) ? (t as TabKey) : null, param: param || null };
}
// 첫 화면(Today)과 로그인만 정적 로드 — 나머지 탭은 lazy로 분리해 초기 번들을 줄인다
// (xlsx·recharts·지원사업 서식 등 무거운 의존성이 해당 탭을 열 때만 내려받아짐)
import Today from "./components/Today";
import Login from "./components/Login";
const ImportOrders = lazy(() => import("./components/ImportOrders"));
const ProductionPlan = lazy(() => import("./components/ProductionPlan"));
const CocIssue = lazy(() => import("./components/CocIssue"));
const DataImport = lazy(() => import("./components/DataImport"));
const Insights = lazy(() => import("./components/Insights"));
const ProdConsumeView = lazy(() => import("./components/ProdConsume"));
const DeliverySchedule = lazy(() => import("./components/DeliverySchedule"));
const Support = lazy(() => import("./components/Support"));
const Dashboard = lazy(() => import("./components/Dashboard"));
const Audit = lazy(() => import("./components/Audit"));
const Receipts = lazy(() => import("./components/Receipts"));
const MaterialBom = lazy(() => import("./components/MaterialBom"));
const Admin = lazy(() => import("./components/Admin"));

// 모바일 보조 탭: 내리면 숨고, 살짝 올리면 표시 — 스크롤 상태를 여기에 가둬서 앱 전체가 스크롤마다 리렌더되지 않게 함
function MobileSubnav({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onS = () => {
      const y = window.scrollY;
      if (y < 40) setHidden(false);
      else if (y > last + 6) setHidden(true);
      else if (y < last - 6) setHidden(false);
      last = y;
    };
    window.addEventListener("scroll", onS, { passive: true });
    return () => window.removeEventListener("scroll", onS);
  }, []);
  return <nav className={"subnav subnav-m" + (hidden ? " hide" : "")} aria-label="보조 메뉴">{children}</nav>;
}

export default function App() {
  const [tab, setTab] = useState<TabKey>(() => parseHash().tab || "today");
  const [cocFocus, setCocFocus] = useState<string | null>(() => parseHash().param);
  const [orders, setOrders] = useState<Order[]>([]);
  const [plans, setPlans] = useState<Record<string, PlanEntry>>({});
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!hasSupabase);
  const [drawer, setDrawer] = useState(false);
  const [groups, setGroups] = useState<MenuGroupRow[]>([]);
  const [placement, setPlacement] = useState<MenuPlacement>({});
  const { can, role, loaded: permLoaded } = useCaps();
  const isMobile = useIsMobile();

  // 레일: 📌 고정(기억) + 호버 인텐트(스침 오작동 방지: 열림 150ms / 닫힘 300ms 지연)
  const [pinned, setPinned] = useState(() => { try { return localStorage.getItem("oro_rail_pin") === "1"; } catch { return false; } });
  const [railOpen, setRailOpen] = useState(false);
  const tOpen = useRef<number | null>(null);
  const tClose = useRef<number | null>(null);
  const railEnter = () => { if (tClose.current) window.clearTimeout(tClose.current); tOpen.current = window.setTimeout(() => setRailOpen(true), 150); };
  const railLeave = () => { if (tOpen.current) window.clearTimeout(tOpen.current); tClose.current = window.setTimeout(() => setRailOpen(false), 300); };
  const togglePin = () => setPinned(p => { try { localStorage.setItem("oro_rail_pin", p ? "0" : "1"); } catch { /* 무시 */ } return !p; });

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [os, pl] = await Promise.all([listOrders(), listPlans().catch(() => ({}))]);
      setOrders(os); setPlans(pl as Record<string, PlanEntry>);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);
  const reloadMenu = useCallback(() => { getMenuConfig().then(c => { setGroups(c.groups); setPlacement(c.placement); }).catch(e => console.warn("메뉴 구성 불러오기 실패(기본 구성 사용):", e)); }, []);

  const signedIn = !hasSupabase || !!session;
  useEffect(() => { if (signedIn) { refresh(); loadPerms(); reloadMenu(); } }, [signedIn, refresh, reloadMenu]);

  useEffect(() => {
    const onHash = () => { const { tab: t, param } = parseHash(); if (t) { setTab(t); setCocFocus(t === "coc" ? param : null); } };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const nav = (t: TabKey) => { if (window.location.hash === "#" + t) { setTab(t); return; } window.location.hash = t; };
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  const curLabel = (TAB_DEFS.find(t => t.key === tab)?.label) || "";
  useEffect(() => { document.title = curLabel ? `${curLabel} · ORO MES` : "ORO MES"; }, [curLabel]);

  // 지연 생산 배지(현장): 완료 전인데 완료예정일이 지난 계획 수
  const lateCount = useMemo(() => {
    const today = todayIso();
    const oset = new Set(orders.map(o => o.id));
    return Object.values(plans).filter(pl => !pl.done && oset.has(pl.order_id) && (completionDate(pl) || "9999") < today).length;
  }, [plans, orders]);

  if (!authReady) return <div className="wrap muted">불러오는 중…</div>;
  if (hasSupabase && !session) return <Login />;
  if (hasSupabase && !permLoaded) return <div className="wrap muted">권한 확인 중…</div>;

  const showFor = (k: TabKey): boolean => {
    switch (k) {
      case "today": return can("menu.pop");
      case "import": return can("menu.import");
      case "plan": return can("menu.plan");
      case "coc": return can("menu.coc"); // 보기만으로 열람 가능(발행은 화면 안에서 coc.issue로 제어)
      case "delivery": return can("menu.delivery");
      case "support": return can("menu.support");
      case "prodin": return can("menu.prodin");
      case "sales": return can("menu.sales");
      case "dash": return can("menu.dash");
      case "prodcon": return can("menu.prodcon");
      case "report": return can("menu.report"); // 보기 스위치가 report.view와 함께 토글됨
      case "audit": return can("menu.audit");
      case "receipt": return can("menu.receipt");
      case "bom": return can("menu.bom");
      case "admin": return role === "master";
    }
  };
  const visible = TAB_DEFS.filter(t => showFor(t.key));
  let navGroups = [...groups].sort((a, b) => a.sort - b.sort).map(g => ({
    id: g.id, name: g.name,
    items: visible.filter(t => placement[t.key]?.group_id === g.id).sort((a, b) => (placement[a.key]?.sort || 0) - (placement[b.key]?.sort || 0)),
  })).filter(g => g.items.length > 0);
  const placed = new Set(navGroups.flatMap(g => g.items.map(i => i.key)));
  const unplaced = visible.filter(t => !placed.has(t.key));
  if (navGroups.length === 0) navGroups = [{ id: "_all", name: "메뉴", items: visible }];
  else if (unplaced.length) navGroups = [...navGroups, { id: "_etc", name: "기타", items: unplaced }];

  const iconOf = (g: { name: string; items: { icon: string }[] }) => groupIcon(g.name, g.items[0]?.icon);
  const curGroup = navGroups.find(g => g.items.some(i => i.key === tab)) || navGroups[0];
  const hasPop = (g: { items: { key: string }[] }) => g.items.some(i => i.key === "today");

  const NavList = ({ onPick }: { onPick: () => void }) => (
    <>
      {navGroups.map(g => (
        <div key={g.id} className="nav-group-block">
          <div className="nav-group">{g.name}</div>
          {g.items.map(t => (
            <button key={t.key} className={"nav-item" + (tab === t.key ? " active" : "")} onClick={() => { nav(t.key); onPick(); }}>
              <span className="ic">{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
      ))}
    </>
  );

  const SubTabs = () => (
    <>
      <span className="subnav-grp">{iconOf(curGroup)} {curGroup?.name}</span>
      {curGroup?.items.map(t => (
        <button key={t.key} className={tab === t.key ? "on" : ""} onClick={() => nav(t.key)}>{t.label}</button>
      ))}
    </>
  );

  const render = () => {
    switch (tab) {
      case "today": return <Today orders={orders} />;
      case "import": return <ImportOrders orders={orders} onChange={refresh} />;
      case "plan": return <ProductionPlan orders={orders} onChange={refresh} />;
      case "coc": return <CocIssue orders={orders} focusOrderId={cocFocus} />;
      case "delivery": return <DeliverySchedule orders={orders} />;
      case "support": return <Support />;
      case "prodin": return <DataImport kind="in" />;
      case "sales": return <DataImport kind="out" />;
      case "dash": return <Insights orders={orders} />;
      case "prodcon": return <ProdConsumeView />;
      case "report": return <Dashboard orders={orders} />;
      case "audit": return <Audit />;
      case "receipt": return <Receipts />;
      case "bom": return <MaterialBom orders={orders} />;
      case "admin": return <Admin onRoleChange={loadPerms} onMenuOrderChange={reloadMenu} onDataChange={refresh} />;
    }
  };

  // ===== 모바일: 상단 헤더(햄버거) + 보조 탭(스크롤 올리면 표시) + 드로어 =====
  if (isMobile) {
    return (
      <>
        <header className="app">
          <button className="hamb" onClick={() => setDrawer(true)} aria-label="메뉴">☰</button>
          <h1>ORO MES</h1>
          <span className="curtab">{curLabel}</span>
          <span className="badge" style={{ marginLeft: "auto" }}>
            {session?.user?.email && role}
            {supabase && session && <button className="btn ghost" style={{ marginLeft: 8, padding: "3px 10px", fontSize: 12 }}
              onClick={async () => { await logAudit("로그아웃", "auth", "", {}); supabase!.auth.signOut(); }}>로그아웃</button>}
          </span>
        </header>

        <MobileSubnav><SubTabs /></MobileSubnav>

        {drawer &&
          <div className="drawer-overlay" onClick={() => setDrawer(false)}>
            <div className="drawer" onClick={e => e.stopPropagation()}>
              <div className="drawer-head"><b>메뉴</b><button onClick={() => setDrawer(false)}>✕</button></div>
              <NavList onPick={() => setDrawer(false)} />
              <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)", marginTop: 8 }}>
                <a className="xlink" href="https://hr.orocorp.kr">HR 연차 ↗</a>
              </div>
            </div>
          </div>}

        <div className="wrap"><ErrorBoundary><Suspense fallback={<div className="muted">화면 불러오는 중…</div>}>{loading ? <div className="muted">불러오는 중…</div> : render()}</Suspense></ErrorBoundary></div>
        <ToastHost />
        <ConfirmHost />
      </>
    );
  }

  // ===== PC: 아이콘 레일(호버 펼침 + 📌고정) + 상단 보조 탭(항상 고정) =====
  const railWide = pinned || railOpen;
  return (
    <>
      <nav className={"mrail" + (railWide ? " open" : "")} aria-label="메인 메뉴"
        onMouseEnter={railEnter} onMouseLeave={railLeave}>
        <div className="mrail-brand">{railWide ? "ORO MES" : "ORO"}</div>
        {navGroups.map(g => (
          <button key={g.id} className={"mrail-item" + (g.id === curGroup?.id ? " on" : "")} title={g.name}
            onClick={() => { if (!g.items.some(i => i.key === tab) && g.items[0]) nav(g.items[0].key); }}>
            <span className="ic">{iconOf(g)}{hasPop(g) && lateCount > 0 && <span className="bdg" title={`지연 생산 ${lateCount}건`}>{lateCount}</span>}</span>
            <span className="lb">{g.name}</span>
          </button>
        ))}
        <div className="mrail-pin">
          <button className={pinned ? "on" : ""} onClick={togglePin} title="메뉴를 항상 펼쳐두기">{pinned ? "📌 고정됨" : railWide ? "📌 고정" : "📌"}</button>
        </div>
      </nav>

      <div className={"mrail-main" + (pinned ? " wide" : "")}>
        <div className="subnav" role="navigation" aria-label="보조 메뉴">
          <SubTabs />
          <span className="subnav-right">
            <span className="muted">{backendName} · 주문 {orders.length}건{session?.user?.email ? ` · ${session.user.email} (${role})` : ""}</span>
            <a className="xlink" href="https://hr.orocorp.kr">HR ↗</a>
            {supabase && session && <button className="btn ghost" style={{ padding: "3px 10px", fontSize: 12 }}
              onClick={async () => { await logAudit("로그아웃", "auth", "", {}); supabase!.auth.signOut(); }}>로그아웃</button>}
          </span>
        </div>
        <div className="wrap"><ErrorBoundary><Suspense fallback={<div className="muted">화면 불러오는 중…</div>}>{loading ? <div className="muted">불러오는 중…</div> : render()}</Suspense></ErrorBoundary></div>
      </div>
      <ToastHost />
      <ConfirmHost />
    </>
  );
}
