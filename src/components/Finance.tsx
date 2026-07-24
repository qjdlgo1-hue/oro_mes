// 자산·현금흐름 — Clobe(회계·금융 연동)에서 수집한 스냅샷 조회 전용 화면.
// 데이터는 서버(fin_* 테이블)에만 있고 이 화면은 읽기만 한다. 수집·동기화 시각을 상단에 표기.
import { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from "recharts";
import {
  FinAccount, FinTrend, FinCashflow, FinRevenue, FinMeta,
  listFinAccounts, listFinTrend, listFinCashflow, listFinRevenue, getFinMeta,
} from "../lib/db";
import { finSummary } from "../lib/finance";
import { toast } from "../lib/toast";
import { errMsg } from "../lib/errmsg";

const won = (n: number) => Math.round(n).toLocaleString("ko-KR");
const man = (n: number) => (n >= 100000000 || n <= -100000000)
  ? (n / 100000000).toLocaleString("ko-KR", { maximumFractionDigits: 1 }) + "억"
  : Math.round(n / 10000).toLocaleString("ko-KR") + "만";

const BANKS: Record<string, string> = { "003": "IBK기업", "004": "KB국민", "088": "신한" };
const TYPE_LABEL: Record<string, string> = { CHECKING: "예금", FX: "외화", LOAN: "대출" };

function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card" style={{ padding: "12px 16px", minWidth: 150, flex: 1 }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || "inherit", marginTop: 2 }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11 }}>{sub}</div>}
    </div>
  );
}

export default function Finance() {
  const [accounts, setAccounts] = useState<FinAccount[]>([]);
  const [trend, setTrend] = useState<FinTrend[]>([]);
  const [cashflow, setCashflow] = useState<FinCashflow[]>([]);
  const [revenue, setRevenue] = useState<FinRevenue[]>([]);
  const [meta, setMeta] = useState<FinMeta | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showZero, setShowZero] = useState(false);

  useEffect(() => {
    Promise.all([listFinAccounts(), listFinTrend(), listFinCashflow(), listFinRevenue(), getFinMeta()])
      .then(([a, t, c, r, m]) => { setAccounts(a); setTrend(t); setCashflow(c); setRevenue(r); setMeta(m); })
      .catch(e => toast.error("재무 데이터 불러오기 실패: " + errMsg(e)))
      .finally(() => setLoaded(true));
  }, []);

  const sum = useMemo(() => finSummary(accounts), [accounts]);
  const trendData = useMemo(() => trend.map(t => ({ d: t.bdate.slice(5), balance: Number(t.balance) })), [trend]);
  const cfData = useMemo(() => cashflow.map(c => ({ ym: c.ym, 입금: Number(c.inflow), 출금: -Number(c.outflow), net: Number(c.inflow) - Number(c.outflow) })), [cashflow]);
  const visAccounts = useMemo(() => {
    const arr = accounts.filter(a => showZero || Math.abs(Number(a.krw_balance)) > 0);
    const rank: Record<string, number> = { CHECKING: 0, FX: 1, LOAN: 2 };
    return [...arr].sort((a, b) => (rank[a.acct_type] ?? 9) - (rank[b.acct_type] ?? 9) || Number(b.krw_balance) - Number(a.krw_balance));
  }, [accounts, showZero]);
  const zeroCount = accounts.length - accounts.filter(a => Math.abs(Number(a.krw_balance)) > 0).length;
  const syncedAt = meta?.synced_at ? new Date(meta.synced_at).toLocaleString("ko-KR") : null;

  const TH: React.CSSProperties = { background: "#f1f3f7", color: "#374151", padding: "6px 8px", fontSize: 12, position: "sticky", top: 0 };
  const TD: React.CSSProperties = { padding: "5px 8px", borderBottom: "1px solid #eef2f7", fontSize: 13 };

  if (!loaded) return <p className="muted">불러오는 중…</p>;
  if (accounts.length === 0) return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>🏦 자산·현금흐름</h3>
      <p className="muted" style={{ lineHeight: 1.8 }}>
        아직 동기화된 재무 데이터가 없습니다. Clobe(회계·금융 연동)에서 수집한 스냅샷이 서버에 적재되면 이 화면에 표시됩니다.
      </p>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>🏦 자산·현금흐름</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            Clobe 수집 스냅샷 기준 (실시간 아님){syncedAt ? ` · 동기화: ${syncedAt}` : ""}{meta?.note ? ` · ${meta.note}` : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Tile label="예금 (원화)" value={won(sum.checking) + "원"} sub={man(sum.checking)} />
          <Tile label="외화 (원화 환산)" value={won(sum.fx) + "원"} sub={man(sum.fx)} />
          <Tile label="대출 (부채)" value={won(sum.loan) + "원"} sub={man(sum.loan)} color="#c0392b" />
          <Tile label="순현금 (예금+외화−대출)" value={won(sum.net) + "원"} sub={man(sum.net)} color={sum.net >= 0 ? "#15663f" : "#c0392b"} />
        </div>
      </div>

      {trendData.length > 1 && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>예금 잔액 추이 <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>(일별 · 최근 {trendData.length}일)</span></h4>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <AreaChart data={trendData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="d" fontSize={11} minTickGap={28} />
                <YAxis fontSize={11} tickFormatter={(v: number) => man(v)} width={60} />
                <Tooltip formatter={(v: any) => won(Number(v)) + "원"} />
                <Area type="monotone" dataKey="balance" name="잔액" stroke="#2e6e4e" fill="#2e6e4e22" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {cfData.length > 0 && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>월별 현금흐름 <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>(은행 입출금 합계)</span></h4>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={cfData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }} stackOffset="sign">
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="ym" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v: number) => man(v)} width={60} />
                <Tooltip formatter={(v: any, name: any) => [won(Math.abs(Number(v))) + "원", name]} />
                <Legend />
                <ReferenceLine y={0} stroke="#999" />
                <Bar dataKey="입금" fill="#2e6e4e" stackId="s" />
                <Bar dataKey="출금" fill="#c0392b" stackId="s" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ overflow: "auto", marginTop: 8 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 480 }}>
              <thead><tr>
                <th style={{ ...TH, textAlign: "left" }}>월</th>
                <th style={{ ...TH, textAlign: "right" }}>입금</th>
                <th style={{ ...TH, textAlign: "right" }}>출금</th>
                <th style={{ ...TH, textAlign: "right" }}>순증감</th>
              </tr></thead>
              <tbody>
                {cfData.map(c => (
                  <tr key={c.ym}>
                    <td style={{ ...TD, fontWeight: 700 }}>{c.ym}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{won(c.입금)}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{won(-c.출금)}</td>
                    <td style={{ ...TD, textAlign: "right", fontWeight: 700, color: c.net >= 0 ? "#15663f" : "#c0392b" }}>{c.net >= 0 ? "+" : ""}{won(c.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <h4 style={{ margin: 0 }}>계좌 목록 <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>({accounts.length}개)</span></h4>
          {zeroCount > 0 && <button className="btn ghost" style={{ marginLeft: "auto", padding: "2px 10px", fontSize: 12 }} onClick={() => setShowZero(v => !v)}>
            {showZero ? "잔액 0 계좌 숨기기" : `잔액 0 계좌 보기 (${zeroCount})`}
          </button>}
        </div>
        <div style={{ overflow: "auto", marginTop: 8 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
            <thead><tr>
              <th style={{ ...TH, textAlign: "center" }}>유형</th>
              <th style={{ ...TH, textAlign: "left" }}>은행</th>
              <th style={{ ...TH, textAlign: "left" }}>계좌명</th>
              <th style={{ ...TH, textAlign: "left" }}>별칭</th>
              <th style={{ ...TH, textAlign: "right" }}>잔액</th>
            </tr></thead>
            <tbody>
              {visAccounts.map(a => (
                <tr key={a.id} style={a.acct_type === "LOAN" ? { background: "#fdf1ef" } : undefined}>
                  <td style={{ ...TD, textAlign: "center", fontSize: 11.5, fontWeight: 700, color: a.acct_type === "LOAN" ? "#c0392b" : a.acct_type === "FX" ? "#8e5bd8" : "#2e6e4e" }}>{TYPE_LABEL[a.acct_type] || a.acct_type}</td>
                  <td style={TD}>{BANKS[a.bank_code] || a.bank_code}</td>
                  <td style={TD}>{a.name}</td>
                  <td style={{ ...TD, fontSize: 12 }}>{a.alias}</td>
                  <td style={{ ...TD, textAlign: "right", fontWeight: 700 }}>
                    {a.currency !== "KRW"
                      ? <>{Number(a.balance).toLocaleString("ko-KR")} {a.currency} <span className="muted" style={{ fontWeight: 400 }}>≈ {won(Number(a.krw_balance))}원</span></>
                      : won(Number(a.krw_balance)) + "원"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {revenue.length > 0 && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>매출 정산 <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>(카드·PG 등 채널별)</span></h4>
          <div style={{ overflow: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 420 }}>
              <thead><tr>
                <th style={{ ...TH, textAlign: "left" }}>월</th>
                <th style={{ ...TH, textAlign: "left" }}>채널</th>
                <th style={{ ...TH, textAlign: "right" }}>매출</th>
                <th style={{ ...TH, textAlign: "right" }}>정산</th>
              </tr></thead>
              <tbody>
                {revenue.map(r => (
                  <tr key={r.ym + r.channel}>
                    <td style={TD}>{r.ym}</td><td style={TD}>{r.channel}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{won(Number(r.gross))}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{won(Number(r.net))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="muted" style={{ fontSize: 11, margin: 0, lineHeight: 1.6 }}>
        ※ 데이터는 Clobe가 은행에서 수집한 스냅샷을 서버에 동기화한 것입니다(조회 전용).
        최신화가 필요하면 Clobe(app.clobe.ai)에서 재수집 후 동기화를 요청하세요. 외화는 수집 시점 환율의 원화 환산입니다.
      </p>
    </div>
  );
}
