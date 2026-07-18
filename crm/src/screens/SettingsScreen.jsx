import React, { useState, useEffect } from "react";
import { T } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";
import { Header, Panel, Empty, btnStyle } from "../components/ui";
import { MailAccountModal } from "../components/modals";
import { mailAccountsList, mailAccountSave, mailAccountDelete } from "../lib/db";

export function SettingsScreen({ mode }) {
  const isMobile = useIsMobile();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // null=닫힘, {}=새 계정, 계정객체=수정

  const reload = async () => {
    setLoading(true);
    try {
      setAccounts(await mailAccountsList());
      setError("");
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (mode === "cloud") reload();
    else setLoading(false);
  }, [mode]);

  const remove = async (acc) => {
    if (!window.confirm(`'${acc.label}' 계정을 삭제할까요?\n이후 이 계정의 메일은 수집되지 않습니다.`)) return;
    try { await mailAccountDelete(acc.id); reload(); } catch (e) { alert(e.message); }
  };

  const toggleEnabled = async (acc) => {
    try { await mailAccountSave({ ...acc, enabled: !acc.enabled }); reload(); } catch (e) { alert(e.message); }
  };

  if (mode !== "cloud") {
    return (
      <div>
        <Header title="설정" sub="메일 자동 수집 계정" />
        <div style={{ padding: 28 }}>
          <Empty>
            메일 자동 수집은 서버(클라우드) 모드에서만 사용할 수 있습니다.
            <div style={{ marginTop: 8, fontSize: 12 }}>사이드바 하단에서 "서버 모드로 전환"을 눌러주세요.</div>
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header
        title="설정"
        sub="메일 자동 수집 계정 관리"
        right={<button onClick={() => setEditing({})} style={btnStyle("primary")}>+ 메일 계정 추가</button>}
      />
      <div style={{ padding: isMobile ? 14 : 28, maxWidth: 860 }}>
        <Panel title="메일 자동 수집 계정">
          {loading && <Empty small>불러오는 중...</Empty>}
          {!loading && error && <Empty small><span style={{ color: T.danger }}>{error}</span></Empty>}
          {!loading && !error && accounts.length === 0 && (
            <Empty>
              등록된 메일 계정이 없습니다
              <div style={{ marginTop: 8, fontSize: 12 }}>"+ 메일 계정 추가"로 네이버 메일이나 네이버 웍스 계정을 등록하세요</div>
            </Empty>
          )}
          {accounts.map((a, i) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: i < accounts.length - 1 ? `1px solid ${T.border}` : "none" }}>
              <span style={{ fontSize: 18 }}>📮</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  {a.label}
                  <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 4, background: a.enabled ? T.tint2 : T.tint, color: a.enabled ? T.tealDark : T.sub }}>
                    {a.enabled ? "수집 중" : "중지됨"}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: T.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.username} · IMAP {a.imap_host}:{a.imap_port}{a.smtp_host ? ` · SMTP ${a.smtp_host}:${a.smtp_port}` : ""}
                </div>
              </div>
              <button onClick={() => toggleEnabled(a)} style={{ ...btnStyle("ghost"), fontSize: 11, padding: "5px 10px" }}>
                {a.enabled ? "중지" : "재개"}
              </button>
              <button onClick={() => setEditing(a)} style={{ ...btnStyle("ghost"), fontSize: 11, padding: "5px 10px" }}>수정</button>
              <button onClick={() => remove(a)} style={{ ...btnStyle("ghost"), fontSize: 11, padding: "5px 10px", color: T.danger }}>삭제</button>
            </div>
          ))}
        </Panel>

        <div style={{ height: 20 }} />
        <Panel title="동작 방식 · 주의사항">
          <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.8 }}>
            · 등록한 계정의 받은편지함·보낸편지함을 <b style={{ color: T.navy }}>1시간마다</b> 확인해, 거래처의 "이메일 도메인"과 주고받은 메일을 타임라인에 자동 기록합니다.<br />
            · 네이버 쪽 설정에서 <b style={{ color: T.navy }}>IMAP 사용</b>이 켜져 있어야 합니다 (네이버 메일: 환경설정 → POP3/IMAP 설정).<br />
            · 2단계 인증을 쓰는 계정은 실제 비밀번호 대신 <b style={{ color: T.navy }}>애플리케이션 비밀번호</b>를 발급해 입력하세요.<br />
            · <span style={{ color: T.danger }}>비밀번호는 서버 DB에 저장되며 CRM에 로그인한 팀원이 볼 수 있습니다.</span> 가능하면 전용 앱 비밀번호를 사용하세요.<br />
            · SMTP 정보는 지금은 저장만 해두며, 나중에 CRM에서 메일을 보내는 기능이 생기면 사용됩니다.
          </div>
        </Panel>
      </div>

      {editing !== null && (
        <MailAccountModal
          account={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}
