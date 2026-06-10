import { useEffect, useState } from "react";
import { listAudit } from "../lib/db";
import { useIsMobile } from "../lib/useIsMobile";

export default function Audit() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const isMobile = useIsMobile();
  useEffect(() => {
    listAudit(200).then(r => { setRows(r); setLoading(false); })
      .catch(e => { setErr(e.message || String(e)); setLoading(false); });
  }, []);

  const TH: React.CSSProperties = { background: "var(--navy)", color: "#fff", padding: "6px 8px", position: "sticky", top: 0, fontSize: 12, textAlign: "left" };
  const TD: React.CSSProperties = { padding: "5px 8px", borderBottom: "1px solid #eef2f7", fontSize: 12 };

  if (loading) return <div className="muted">불러오는 중…</div>;
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>변경 내역 (최근 200건)</h3>
      {err && <p style={{ color: "#c0392b" }}>불러오기 오류: {err}</p>}
      {rows.length === 0 ? <p className="muted">기록이 없습니다.</p> :
        isMobile ? (
          <div style={{ maxHeight: "75vh", overflow: "auto" }}>
            {rows.map(r => (
              <div className="mcard" key={r.id}>
                <div className="mrow"><span className="k">{new Date(r.at).toLocaleString("ko-KR")}</span><span className="v">{r.action}</span></div>
                <div className="mrow"><span className="k">{r.user_email || "-"}</span><span className="v" style={{ fontWeight: 400 }}>{r.entity}{r.entity_id ? ` #${String(r.entity_id).slice(0, 8)}` : ""}</span></div>
                {r.detail ? <div className="mrow"><span className="k">내용</span><span className="v" style={{ fontWeight: 400, fontSize: 11 }}>{JSON.stringify(r.detail)}</span></div> : null}
              </div>
            ))}
          </div>
        ) : (
        <div style={{ overflow: "auto", maxHeight: "70vh" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr>{["시각", "사용자", "작업", "대상", "내용"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={TD}>{new Date(r.at).toLocaleString("ko-KR")}</td>
                  <td style={TD}>{r.user_email || "-"}</td>
                  <td style={TD}>{r.action}</td>
                  <td style={TD}>{r.entity}{r.entity_id ? ` #${String(r.entity_id).slice(0, 8)}` : ""}</td>
                  <td style={{ ...TD, color: "#666" }}>{r.detail ? JSON.stringify(r.detail) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
    </div>
  );
}
