import { useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { Order } from "./lib/types";
import { listOrders, backendName } from "./lib/db";
import { supabase, hasSupabase } from "./lib/supabase";
import { ToastHost } from "./lib/toast";
import { loadPerms, useCaps } from "./lib/perm";
import { useIsMobile } from "./lib/useIsMobile";
import Today from "./components/Today";
import ImportOrders from "./components/ImportOrders";
import ProductionPlan from "./components/ProductionPlan";
import CocIssue from "./components/CocIssue";
import Dashboard from "./components/Dashboard";
import Audit from "./components/Audit";
import Receipts from "./components/Receipts";
import Admin from "./components/Admin";
import Login from "./components/Login";

type Tab = "today" | "import" | "plan" | "coc" | "report" | "audit" | "receipt" | "admin";

export default function App() {
  const [tab, setTab] = useState<Tab>("today");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!hasSupabase);
  const [drawer, setDrawer] = useState(false);
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

  const signedIn = !hasSupabase || !!session;
  useEffect(() => { if (signedIn) { refresh(); loadPerms(); } }, [signedIn, refresh]);

  if (!authReady) return <div className="wrap muted">불러오는 중…</div>;
  if (hasSupabase && !session) return <Login />;
  if (hasSupabase && !permLoaded) return <div className="wrap muted">권한 확인 중…</div>;

  const ALL: { key: Tab; label: string; icon: string; show: boolean }[] = [
    { key: "today", label: "POP", icon: "📋", show: can("menu.pop") },
    { key: "import", label: "주문 가져오기", icon: "📥", show: can("menu.import") },
    { key: "plan", label: "생산계획", icon: "📅", show: can("menu.plan") },
    { key: "coc", label: "COC 발행", icon: "📄", show: can("coc.issue") && can("menu.coc") },
    { key: "report", label: "리포트", icon: "📊", show: can("report.view") && can("menu.report") },
    { key: "audit", label: "기록", icon: "🕘", show: can("audit.view") && can("menu.audit") },
    { key: "receipt", label: "증빙", icon: "🧾", show: can("menu.receipt") },
    { key: "admin", label: "관리자", icon: "⚙️", show: role === "master" },
  ];
  const tabs = ALL.filter(t => t.show);
  const curLabel = (ALL.find(t => t.key === tab)?.label) || "";
  const GROUPS: { name: string; keys: Tab[] }[] = [
    { name: "현장", keys: ["today", "plan", "coc", "receipt"] },
    { name: "데이터", keys: ["import", "report", "audit"] },
    { name: "관리", keys: ["admin"] },
  ];

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
            {GROUPS.map(g => {
              const items = tabs.filter(t => g.keys.includes(t.key));
              if (!items.length) return null;
              return (
                <div key={g.name}>
                  <div className="drawer-group">{g.name}</div>
                  {items.map(t => (
                    <button key={t.key} className={"drawer-item" + (tab === t.key ? " active" : "")}
                      onClick={() => { setTab(t.key); setDrawer(false); }}>
                      <span className="ic">{t.icon}</span> {t.label}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>}

      <div className="wrap">
        {loading ? <div className="muted">불러오는 중…</div> :
          tab === "today" ? <Today orders={orders} /> :
          tab === "import" ? <ImportOrders orders={orders} onChange={refresh} /> :
          tab === "plan" ? <ProductionPlan orders={orders} /> :
          tab === "coc" ? <CocIssue orders={orders} /> :
          tab === "report" ? <Dashboard orders={orders} /> :
          tab === "audit" ? <Audit /> :
          tab === "receipt" ? <Receipts /> :
          <Admin onRoleChange={loadPerms} />}
      </div>
      <ToastHost />
    </>
  );
}
