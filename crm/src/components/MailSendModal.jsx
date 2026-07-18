import React, { useState, useEffect } from "react";
import { T } from "../theme";
import { supabase } from "../lib/supabase";
import { mailAccountsList } from "../lib/db";
import { buildQuoteXlsxBuffer } from "../lib/quote";
import { Modal, Field, inputStyle, btnStyle, Empty } from "./ui";

// contact 자유 입력 텍스트에서 이메일 주소 추출 (첫 번째)
export function extractEmail(text) {
  const m = String(text || "").match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0] : "";
}

// ArrayBuffer → base64 (32KB씩 나눠 변환 — 큰 파일도 안전)
function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

// ===========================================================================
// 견적서 메일 발송 모달
// - 대상: 선택 거래처 1곳 또는 품목 있는 전체 거래처
// - 수신자: 담당자 연락처에서 이메일 자동 추출 (행별 수정 가능)
// - 발송: Edge Function(send-quote-mail)이 설정 화면의 SMTP 계정으로 전송
// ===========================================================================
export function MailSendModal({ companies, items, contacts, buildRows, ym, pgcPrice, initialCompanyId, onSent, onClose }) {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [scope, setScope] = useState(initialCompanyId ? "one" : "all"); // one | all
  const [subject, setSubject] = useState(`[오알오] ${ym} 견적서 송부 - {거래처명}`);
  const [body, setBody] = useState(
    `{거래처명} 담당자님, 안녕하세요.\n오알오 주식회사입니다.\n\n${ym} 기준 견적서를 첨부와 같이 송부드립니다.\n검토 부탁드리며, 문의사항은 회신 주시기 바랍니다.\n\n감사합니다.\n오알오 주식회사 드림`
  );
  const [rows, setRows] = useState([]); // {company, quoteRows, email, status: idle|sending|ok|fail, error}
  const [sending, setSending] = useState(false);
  const [testStatus, setTestStatus] = useState("");

  // SMTP 계정 로드 (smtp_host 있는 계정만)
  useEffect(() => {
    (async () => {
      try {
        const list = (await mailAccountsList()).filter((a) => a.smtp_host);
        setAccounts(list);
        if (list.length > 0) setAccountId(list[0].id);
      } catch (e) { alert(e.message); }
    })();
  }, []);

  // 대상 목록 구성 — 품목 있는 거래처 + 담당자 이메일 자동 추출
  useEffect(() => {
    const targetCompanies = companies.filter((c) => {
      if (scope === "one") return c.id === initialCompanyId;
      return items.some((it) => it.company_id === c.id);
    });
    setRows(targetCompanies.map((c) => {
      const list = items.filter((it) => it.company_id === c.id);
      const contact = contacts.find((p) => p.companyId === c.id && extractEmail(p.contact));
      return { company: c, quoteRows: buildRows(list), email: contact ? extractEmail(contact.contact) : "", status: "idle", error: "" };
    }));
  }, [scope, companies, items, contacts]);

  const setRow = (cid, patch) => setRows((prev) => prev.map((r) => (r.company.id === cid ? { ...r, ...patch } : r)));
  const sendable = rows.filter((r) => r.email && r.quoteRows.length > 0);
  const fill = (tpl, name) => tpl.replaceAll("{거래처명}", name);

  // 한 건 발송 (Edge Function 호출)
  const sendOne = async (r) => {
    const buf = await buildQuoteXlsxBuffer({ companyName: r.company.name, ym, pgcPrice, agcnPrice: null, rows: r.quoteRows });
    const { data, error } = await supabase.functions.invoke("send-quote-mail", {
      body: {
        accountId,
        to: r.email.trim(),
        subject: fill(subject, r.company.name),
        body: fill(body, r.company.name),
        attachment: { filename: `견적서_${r.company.name}_${ym}.xlsx`, base64: bufToBase64(buf) },
      },
    });
    if (error) throw new Error(error.message || "함수 호출 실패");
    if (data?.error) throw new Error(data.error);
  };

  const sendAll = async () => {
    if (!accountId) { alert("발송 계정을 선택하세요 (설정 화면에서 SMTP 포함 계정을 등록해야 합니다)."); return; }
    if (sendable.length === 0) { alert("발송 가능한 거래처가 없습니다 (수신자 이메일 확인)."); return; }
    if (!window.confirm(`${sendable.length}곳에 ${ym} 견적서를 메일로 발송할까요?`)) return;
    setSending(true);
    for (const r of rows) {
      if (!r.email || r.quoteRows.length === 0) continue;
      setRow(r.company.id, { status: "sending", error: "" });
      try {
        await sendOne(r);
        setRow(r.company.id, { status: "ok" });
        onSent(r.company, r.quoteRows, r.email.trim());
      } catch (e) {
        setRow(r.company.id, { status: "fail", error: e.message });
      }
    }
    setSending(false);
  };

  // 테스트 발송 — 발송 계정 자신에게 (첨부 없이)
  const sendTest = async () => {
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) { alert("발송 계정을 선택하세요."); return; }
    const self = acc.username.includes("@") ? acc.username : `${acc.username}@naver.com`;
    setTestStatus("발송 중...");
    try {
      const { data, error } = await supabase.functions.invoke("send-quote-mail", {
        body: { accountId, to: self, subject: "[오알오 CRM] 메일 발송 테스트", body: "CRM 견적서 메일 발송 기능이 정상 동작합니다." },
      });
      if (error) throw new Error(error.message || "함수 호출 실패");
      if (data?.error) throw new Error(data.error);
      setTestStatus(`✓ ${self} 로 테스트 메일을 보냈습니다 — 받은편지함을 확인하세요`);
    } catch (e) { setTestStatus(`✗ 실패: ${e.message}`); }
  };

  const statusBadge = (r) => {
    if (!r.email) return <span style={{ fontSize: 10, fontWeight: 800, color: T.danger, background: "#FDECEA", padding: "1px 8px", borderRadius: 10 }}>수신자 없음 — 제외</span>;
    if (r.status === "sending") return <span style={{ fontSize: 11, color: T.warn, fontWeight: 700 }}>발송 중...</span>;
    if (r.status === "ok") return <span style={{ fontSize: 11, color: T.ok, fontWeight: 800 }}>✓ 발송됨</span>;
    if (r.status === "fail") return <span style={{ fontSize: 10, color: T.danger, fontWeight: 700 }} title={r.error}>✗ {r.error.slice(0, 40)}</span>;
    return <span style={{ fontSize: 11, color: T.sub }}>대기</span>;
  };

  const doneCount = rows.filter((r) => r.status === "ok").length;

  return (
    <Modal title="📧 견적서 메일 발송" onClose={onClose}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <Field label="발송 계정 (설정 화면의 메일 계정)">
            <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.length === 0 && <option value="">SMTP 계정 없음 — 설정에서 등록</option>}
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({a.username})</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <Field label="발송 대상">
            <select style={inputStyle} value={scope} onChange={(e) => setScope(e.target.value)}>
              {initialCompanyId && <option value="one">선택한 거래처만</option>}
              <option value="all">품목 있는 전체 거래처</option>
            </select>
          </Field>
        </div>
      </div>

      <Field label="제목 ({거래처명} 자동 치환)">
        <input style={inputStyle} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <Field label="본문">
        <textarea style={{ ...inputStyle, minHeight: 110, resize: "vertical" }} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>

      {/* 대상 미리보기 */}
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 14, maxHeight: 260, overflow: "auto" }}>
        {rows.length === 0 && <Empty small>발송 대상이 없습니다</Empty>}
        {rows.map((r, i) => (
          <div key={r.company.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: i < rows.length - 1 ? `1px solid ${T.border}` : "none" }}>
            <div style={{ width: 110, fontWeight: 700, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.company.name}</div>
            <input
              style={{ ...inputStyle, flex: 1, padding: "6px 8px", fontSize: 12 }}
              placeholder="수신자 이메일 입력"
              value={r.email}
              disabled={sending}
              onChange={(e) => setRow(r.company.id, { email: e.target.value, status: "idle", error: "" })}
            />
            <span style={{ fontSize: 11, color: T.sub, width: 44, textAlign: "right" }}>{r.quoteRows.length}품목</span>
            <div style={{ width: 130, textAlign: "right" }}>{statusBadge(r)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={sendTest} disabled={sending || !accountId} style={{ ...btnStyle("ghost"), fontSize: 12 }}>테스트 발송(나에게)</button>
        <span style={{ fontSize: 11, color: testStatus.startsWith("✗") ? T.danger : T.sub, flex: 1 }}>{testStatus}</span>
        <button onClick={onClose} style={{ ...btnStyle("ghost") }}>{doneCount > 0 ? "닫기" : "취소"}</button>
        <button onClick={sendAll} disabled={sending || sendable.length === 0} style={{ ...btnStyle("primary"), opacity: sending || sendable.length === 0 ? 0.4 : 1 }}>
          {sending ? `발송 중... (${doneCount}/${sendable.length})` : `📤 ${sendable.length}곳 발송`}
        </button>
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: T.sub }}>
        발송된 메일은 거래처 대화기록과 견적 발행 이력에 자동으로 남습니다 · 수신자는 담당자 연락처에서 자동으로 찾았으며 직접 수정할 수 있습니다
      </div>
    </Modal>
  );
}
