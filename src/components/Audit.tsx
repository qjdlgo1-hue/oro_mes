import { useEffect, useMemo, useState } from "react";
import { listAudit } from "../lib/db";
import { useIsMobile } from "../lib/useIsMobile";

// 로그인/로그아웃 = 접속 기록, 나머지 = 데이터 변경 기록
const isAuth = (r: any) => r.entity === "auth" || r.action === "로그인" || r.action === "로그아웃";
// detail을 사람이 읽게 — 접속 기록은 기기 정보만 뽑아 표시
function detailText(r: any): string {
  if (!r.detail) return "";
  if (isAuth(r) && r.detail.device) return `접속 기기: ${r.detail.device}`;
  try { return JSON.stringify(r.detail); } catch { return String(r.detail); }
}

export default function Audit() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<"all" | "auth" | "data">("all");
  const isMobile = useIsMobile();
  useEffect(() => {
    listAudit(200).then(r => { setRows(r); setLoading(false); })
      .catch(e => { setErr(e.message || String(e)); setLoading(false); });
  }, []);

  const shown = useMemo(() =>
    filter === "all" ? rows : rows.filter(r => filter === "auth" ? isAuth(r) : !isAuth(r)),
  [rows, filter]);
  const authCount = useMemo(() => rows.filter(isAuth).length, [rows]);

  const TH: React.CSSProperties = { background: "#f1f3f7", color: "#374151", padding: "6px 8px", position: "sticky", top: 0, fontSize: 12, textAlign: "left" };
  const TD: React.CSSProperties = { padding: "5px 8px", borderBottom: "1px solid #eef2f7", fontSize: 12 };

  if (loading) return <div className="muted">불러오는 중…</div>;
  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>기록 (최근 200건)</h3>
        <div className="seg">
          <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>전체</button>
          <button className={filter === "auth" ? "on" : ""} onClick={() => setFilter("auth")}>🔐 로그인 {authCount ? `(${authCount})` : ""}</button>
          <button className={filter === "data" ? "on" : ""} onClick={() => setFilter("data")}>✎ 데이터 변경</button>
        </div>
      </div>
      {err && <p style={{ color: "#c0392b" }}>불러오기 오류: {err}</p>}
      {shown.length === 0 ? <p className="muted">{filter === "auth" ? "로그인 기록이 없습니다. (이번 업데이트 이후의 로그인부터 기록됩니다)" : "기록이 없습니다."}</p> :
        isMobile ? (
          <div style={{ maxHeight: "75vh", overflow: "auto" }}>
            {shown.map(r => (
              <div className="mcard" key={r.id} style={isAuth(r) ? { background: "var(--tint2)" } : undefined}>
                <div className="mrow"><span className="k">{new Date(r.at).toLocaleString("ko-KR")}</span><span className="v">{isAuth(r) ? "🔐 " : ""}{r.action}</span></div>
                <div className="mrow"><span className="k">{r.user_email || "-"}</span><span className="v" style={{ fontWeight: 400 }}>{isAuth(r) ? "" : `${r.entity}${r.entity_id ? ` #${String(r.entity_id).slice(0, 8)}` : ""}`}</span></div>
                {detailText(r) ? <div className="mrow"><span className="k">내용</span><span className="v" style={{ fontWeight: 400, fontSize: 11 }}>{detailText(r)}</span></div> : null}
              </div>
            ))}
          </div>
        ) : (
        <div style={{ overflow: "auto", maxHeight: "70vh" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr>{["시각", "사용자", "작업", "대상", "내용"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.id} style={isAuth(r) ? { background: "var(--tint2)" } : undefined}>
                  <td style={TD}>{new Date(r.at).toLocaleString("ko-KR")}</td>
                  <td style={TD}>{r.user_email || "-"}</td>
                  <td style={TD}>{isAuth(r) ? `🔐 ${r.action}` : r.action}</td>
                  <td style={TD}>{isAuth(r) ? "접속" : <>{r.entity}{r.entity_id ? ` #${String(r.entity_id).slice(0, 8)}` : ""}</>}</td>
                  <td style={{ ...TD, color: "#666" }}>{detailText(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
    </div>
  );
}
