import { useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { Order } from "./lib/types";
import { listOrders, backendName, getMenuOrder } from "./lib/db";
import { supabase, hasSupabase } from "./lib/supabase";
import { ToastHost } from "./lib/toast";
import { loadPerms, useCaps } from "./lib/perm";
import { useIsMobile } from "./lib/useIsMobile";
import { TAB_DEFS, TabKey } from "./lib/tabs";
import Today from "./components/Today";
import ImportOrders from "./components/ImportOrders";
import ProductionPlan from "./components/ProductionPlan";
import CocIssue from "./components/CocIssue";
import Dashboard from "./components/Dashboard";
import Audit from "./components/Audit";
import Receipts from "./components/Receipts";
import MaterialBom from "./components/MaterialBom";
import Admin from "./components/Admin";
import Login from "./components/Login";

export default function App() {
  const [tab, setTab] = useState<TabKey>("today");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!hasSupabase);
  const [drawer, setDrawer] = useState(false);
  const [menuOrder, setMenuOrder] = useState<string[]>([]);
  const { can, role, loaded: permLoaded } = useCaps();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setOrders(await listOrders()); } catch (e) { console.error(e); }
    setLoading(false);
  }, []);
  const reloadMenu = useCallback(() => { getMenuOrder().then(setMenuOrder).catch(() => {}); }, []);

  const signedIn = !hasSupabase || !!session;
  useEffect(() => { if (signedIn) { refresh(); loadPerms(); reloadMenu(); } }, [signedIn, refresh, reloadMenu]);

  if (!authReady) return <div className="wrap muted">불러오는 중…</div>;
  if (hasSupabase && !session) return <Login />;
  if (hasSupabase && !permLoaded) return <div className="wrap muted">권한 확인 중…</div>;

  const showFor = (k: TabKey): boolean => {
    switch (k) {
      case "today": return can("menu.pop");
      case "import": return can("menu.import");
      case "plan": return can("menu.plan");
      case "coc": return can("coc.issue") && can("menu.coc");
      case "report": return can("report.view") && can("menu.report");
      case "audit": return can("audit.view") && can("menu.audit");
      case "receipt": return can("menu.receipt");
      case "bom": return can("menu.bom");
      case "admin": return role === "master";
    }
  };
  const ord = (k: string) => { const i = menuOrder.indexOf(k); return i < 0 ? 999 : i; };
  const tabs = TAB_DEFS.filter(t => showFor(t.key)).sort((a, b) => ord(a.key) - ord(b.key));
  const curLabel = (TAB_DEFS.find(t => t.key === tab)?.label) || "";

  const render = () => {
    switch (tab) {
      case "today": return <Today orders={orders} />;
      case "import": return <ImportOrders orders={orders} onChange={refresh} />;
      case "plan": return <ProductionPlan orders={orders} />;
      case "coc": return <CocIssue orders={orders} />;
      case "report": return <Dashboard orders={orders} />;
      case "audit": return <Audit />;
      case "receipt": return <Receipts />;
      case "bom": return <MaterialBom orders={orders} />;
      case "admin": return <Admin onRoleChange={loadPerms} onMenuOrderChange={reloadMenu} />;
    }
  };

  return (
    <>
      <header className="app">
        {isMobile && <button className="hamb" onClick={() => setDrawer(true)} aria-label="메뉴">☰</button>}
        <h1>ORO MES</h1>
        {isMobile && <span className="curtab">{curLabel}</span>}
        <nav className="tabs">
          {tabs.map(t => <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>{t.label}</button>)}
        </nav>
        <span className="badge">
          {!isMobile && <>{backendName} · 주문 {orders.length}건 </>}
          {session?.user?.email && <>{isMobile ? role : `· ${session.user.email} (${role})`}</>}
          {supabase && session && <button className="btn ghost" style={{ marginLeft: 10, padding: "3px 10px", fontSize: 12 }}
            onClick={() => supabase!.auth.signOut()}>로그아웃</button>}
        </span>
      </header>

      {isMobile && drawer &&
        <div className="drawer-overlay" onClick={() => setDrawer(false)}>
          <div className="drawer" onClick={e => e.stopPropagation()}>
            <div className="drawer-head"><b>메뉴</b><button onClick={() => setDrawer(false)}>✕</button></div>
            {tabs.map(t => (
              <button key={t.key} className={"drawer-item" + (tab === t.key ? " active" : "")}
                onClick={() => { setTab(t.key); setDrawer(false); }}>
                <span className="ic">{t.icon}</span> {t.label}
              </button>
            ))}
          </div>
        </div>}

      <div className="wrap">{loading ? <div className="muted">불러오는 중…</div> : render()}</div>
      <ToastHost />
    </>
  );
}
