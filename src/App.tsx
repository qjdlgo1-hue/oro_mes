import { useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { Order } from "./lib/types";
import { listOrders, backendName } from "./lib/db";
import { supabase, hasSupabase } from "./lib/supabase";
import { ToastHost } from "./lib/toast";
import { loadPerms, useCaps } from "./lib/perm";
import Today from "./components/Today";
import ImportOrders from "./components/ImportOrders";
import ProductionPlan from "./components/ProductionPlan";
import CocIssue from "./components/CocIssue";
import Dashboard from "./components/Dashboard";
import Audit from "./components/Audit";
import Admin from "./components/Admin";
import Login from "./components/Login";

type Tab = "today" | "import" | "plan" | "coc" | "report" | "audit" | "admin";

export default function App() {
  const [tab, setTab] = useState<Tab>("today");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!hasSupabase);
  const { can, role, loaded: permLoaded } = useCaps();

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

  const T = (key: Tab, label: string, show = true) =>
    show ? <button className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button> : null;

  return (
    <>
      <header className="app">
        <h1>ORO MES</h1>
        <nav className="tabs">
          {T("today", "POP")}
          {T("import", "주문 가져오기")}
          {T("plan", "생산계획")}
          {T("coc", "COC 발행", can("coc.issue"))}
          {T("report", "리포트", can("report.view"))}
          {T("audit", "기록", can("audit.view"))}
          {T("admin", "관리자", role === "master")}
        </nav>
        <span className="badge">
          {backendName} · 주문 {orders.length}건
          {session?.user?.email && <> · {session.user.email} ({role})</>}
          {supabase && session && <button className="btn ghost" style={{ marginLeft: 10, padding: "3px 10px", fontSize: 12 }}
            onClick={() => supabase!.auth.signOut()}>로그아웃</button>}
        </span>
      </header>
      <div className="wrap">
        {loading ? <div className="muted">불러오는 중…</div> :
          tab === "today" ? <Today orders={orders} /> :
          tab === "import" ? <ImportOrders orders={orders} onChange={refresh} /> :
          tab === "plan" ? <ProductionPlan orders={orders} /> :
          tab === "coc" ? <CocIssue orders={orders} /> :
          tab === "report" ? <Dashboard orders={orders} /> :
          tab === "audit" ? <Audit /> :
          <Admin onRoleChange={loadPerms} />}
      </div>
      <ToastHost />
    </>
  );
}
