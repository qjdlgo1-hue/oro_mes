import { useEffect, useState, useCallback } from "react";
import { Order } from "./lib/types";
import { listOrders, backendName } from "./lib/db";
import ImportOrders from "./components/ImportOrders";
import ProductionPlan from "./components/ProductionPlan";
import CocIssue from "./components/CocIssue";

type Tab = "import" | "plan" | "coc";

export default function App() {
  const [tab, setTab] = useState<Tab>("plan");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setOrders(await listOrders()); } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <>
      <header className="app">
        <h1>ORO MES</h1>
        <nav className="tabs">
          <button className={tab === "import" ? "active" : ""} onClick={() => setTab("import")}>주문 가져오기</button>
          <button className={tab === "plan" ? "active" : ""} onClick={() => setTab("plan")}>생산계획</button>
          <button className={tab === "coc" ? "active" : ""} onClick={() => setTab("coc")}>COC 발행</button>
        </nav>
        <span className="badge">저장: {backendName} · 주문 {orders.length}건</span>
      </header>
      <div className="wrap">
        {loading ? <div className="muted">불러오는 중…</div> :
          tab === "import" ? <ImportOrders orders={orders} onChange={refresh} /> :
          tab === "plan" ? <ProductionPlan orders={orders} /> :
          <CocIssue orders={orders} />}
      </div>
    </>
  );
}
