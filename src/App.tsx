import { useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { Order } from "./lib/types";
import { listOrders, backendName, getMyRole } from "./lib/db";
import { supabase, hasSupabase } from "./lib/supabase";
import { ToastHost } from "./lib/toast";
import Today from "./components/Today";
import ImportOrders from "./components/ImportOrders";
import ProductionPlan from "./components/ProductionPlan";
import CocIssue from "./components/CocIssue";
import Dashboard from "./components/Dashboard";
import Audit from "./components/Audit";
import Login from "./components/Login";

type Tab = "today" | "import" | "plan" | "coc" | "report" | "audit";

export default function App() {
  const [tab, setTab] = useState<Tab>("today");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!hasSupabase);
  const [role, setRole] = useState<string>("user");
  const isAdmin = role === "admin";

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
  useEffect(() => { if (signedIn) { refresh(); getMyRole().then(setRole); } }, [signedIn, refresh]);

  if (!authReady) return <div className="wrap muted">불러오는 중…</div>;
  if (hasSupabase && !session) return <Login />;

  return (
    <>
      <header className="app">
        <h1>ORO MES</h1>
        <nav className="tabs">
          <button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}>POP</button>
          <button className={tab === "import" ? "active" : ""} onClick={() => setTab("import")}>주문 가져오기</button>
          <button className={tab === "plan" ? "active" : ""} onClick={() => setTab("plan")}>생산계획</button>
          <button className={tab === "coc" ? "active" : ""} onClick={() => setTab("coc")}>COC 발행</button>
          <button className={tab === "report" ? "active" : ""} onClick={() => setTab("report")}>리포트</button>
          <button className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}>기록</button>
        </nav>
        <span className="badge">
          {backendName} · 주문 {orders.length}건
          {session?.user?.email && <> · {session.user.email}{isAdmin ? " (관리자)" : ""}</>}
          {supabase && session && <button className="btn ghost" style={{ marginLeft: 10, padding: "3px 10px", fontSize: 12 }}
            onClick={() => supabase!.auth.signOut()}>로그아웃</button>}
        </span>
      </header>
      <div className="wrap">
        {loading ? <div className="muted">불러오는 중…</div> :
          tab === "today" ? <Today orders={orders} /> :
          tab === "import" ? <ImportOrders orders={orders} onChange={refresh} isAdmin={isAdmin} /> :
          tab === "plan" ? <ProductionPlan orders={orders} /> :
          tab === "coc" ? <CocIssue orders={orders} /> :
          tab === "report" ? <Dashboard orders={orders} /> :
          <Audit />}
      </div>
      <ToastHost />
    </>
  );
}
