import React, { useState } from "react";
import { T, CHANNELS, STAGES, newId } from "../theme";
import { Modal, Field, inputStyle, ModalActions } from "../components/ui";
import { mailAccountSave, quoteItemSave } from "../lib/db";

// 거래처 추가/수정 모달 (initial이 있으면 수정 모드)
export function CompanyModal({ initial, onClose, onSave }) {
  const [f, setF] = useState({ name: "", domain: "", country: "한국", tier: "일반", product: "", memo: "", ...initial });
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Modal title={initial ? "거래처 수정" : "거래처 추가"} onClose={onClose}>
      <Field label="회사명 *"><input style={inputStyle} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="예: ISC" /></Field>
      <Field label="이메일 도메인 (@뒤)"><input style={inputStyle} value={f.domain} onChange={(e) => set("domain", e.target.value)} placeholder="예: isc.co.kr" /></Field>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label="국가">
            <select style={inputStyle} value={f.country} onChange={(e) => set("country", e.target.value)}>
              <option>한국</option><option>대만</option><option>중국</option><option>기타</option>
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="등급">
            <select style={inputStyle} value={f.tier} onChange={(e) => set("tier", e.target.value)}>
              <option>핵심</option><option>일반</option><option>잠재</option>
            </select>
          </Field>
        </div>
      </div>
      <Field label="제품군"><input style={inputStyle} value={f.product} onChange={(e) => set("product", e.target.value)} placeholder="예: Au / Ag 도금" /></Field>
      <Field label="메모"><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={f.memo} onChange={(e) => set("memo", e.target.value)} placeholder="예: LINE으로 주로 소통" /></Field>
      <ModalActions onClose={onClose} onSave={() => f.name.trim() && onSave(f)} disabled={!f.name.trim()} />
    </Modal>
  );
}

// 담당자 추가/수정 모달
export function ContactModal({ companyId, initial, onClose, onSave }) {
  const [f, setF] = useState({ companyId, name: "", role: "구매", contact: "", ...initial });
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Modal title={initial ? "담당자 수정" : "담당자 추가"} onClose={onClose}>
      <Field label="이름 *"><input style={inputStyle} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="예: 김구매 과장" /></Field>
      <Field label="역할">
        <select style={inputStyle} value={f.role} onChange={(e) => set("role", e.target.value)}>
          <option>구매</option><option>품질/연구</option><option>영업</option><option>대표</option><option>기타</option>
        </select>
      </Field>
      <Field label="연락처 (이메일/LINE ID/WeChat ID)"><input style={inputStyle} value={f.contact} onChange={(e) => set("contact", e.target.value)} placeholder="예: kim@isc.co.kr 또는 LINE: chen_tfe" /></Field>
      <ModalActions onClose={onClose} onSave={() => f.name.trim() && onSave(f)} disabled={!f.name.trim()} />
    </Modal>
  );
}

// 딜 추가/수정 모달
export function DealModal({ companyId, initial, onClose, onSave }) {
  const [f, setF] = useState({ companyId, title: "", spec: "", stage: "inquiry", value: "", valueNum: null, ...initial });
  // 금액은 만원 단위 숫자로 입력 (합계·통계 정확도) — 기존 텍스트 값은 그대로 보임
  const [manwon, setManwon] = useState(initial?.valueNum != null ? String(initial.valueNum / 10000) : "");
  const set = (k, v) => setF({ ...f, [k]: v });
  const save = () => {
    if (!f.title.trim()) return;
    const n = manwon.trim() === "" ? null : (Number(manwon) || 0) * 10000;
    onSave({
      ...f,
      valueNum: n,
      // 표시용 텍스트도 함께 갱신 (숫자 미입력 시 기존 텍스트 유지)
      value: n != null ? `${(n / 10000).toLocaleString("ko-KR")}만원` : f.value,
    });
  };
  return (
    <Modal title={initial ? "딜(영업기회) 수정" : "딜(영업기회) 추가"} onClose={onClose}>
      <Field label="제목 *"><input style={inputStyle} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="예: Au도금 양산 견적" /></Field>
      <Field label="사양"><input style={inputStyle} value={f.spec} onChange={(e) => set("spec", e.target.value)} placeholder="예: Au 0.3μm · 월5kg" /></Field>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label="현재 단계">
            <select style={inputStyle} value={f.stage} onChange={(e) => set("stage", e.target.value)}>
              {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="예상 금액 (만원)">
            <input type="number" style={inputStyle} value={manwon} onChange={(e) => setManwon(e.target.value)} placeholder="예: 750" />
          </Field>
        </div>
      </div>
      {f.value && manwon.trim() === "" && (
        <div style={{ fontSize: 11, color: T.sub, marginTop: -8, marginBottom: 12 }}>기존 금액 표기: "{f.value}" — 숫자를 입력하면 합계 통계에 정확히 반영됩니다</div>
      )}
      <ModalActions onClose={onClose} onSave={save} disabled={!f.title.trim()} />
    </Modal>
  );
}

// 대화 기록 추가/수정 모달 (핵심!)
// companies를 넘기면(공유 수신 흐름) 모달 안에서 거래처를 직접 고름
export function ActivityModal({ companyId, initial, deals, companies, onClose, onSave }) {
  // 오늘 날짜를 기본값으로 (YYYY-MM-DD HH:MM 형태)
  const now = new Date();
  const defaultDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const [f, setF] = useState({
    companyId, channel: "email", direction: "received",
    person: "", title: "", body: "", dealId: "", date: defaultDate,
    ...initial,
  });
  const set = (k, v) => setF({ ...f, [k]: v });

  return (
    <Modal title={initial?.id ? "대화 기록 수정" : companies ? "공유받은 내용 기록" : "대화 기록 추가"} onClose={onClose}>
      {/* 공유 수신 흐름: 어느 거래처의 대화인지 먼저 선택 */}
      {companies && (
        <Field label="거래처 *">
          <select style={inputStyle} value={f.companyId || ""} onChange={(e) => set("companyId", e.target.value)}>
            <option value="">거래처를 선택하세요</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}
      {/* 채널 선택 - 버튼으로 */}
      <Field label="채널 *">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.entries(CHANNELS).map(([key, ch]) => (
            <button key={key} onClick={() => set("channel", key)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
                border: `1px solid ${f.channel === key ? ch.color : T.border}`,
                background: f.channel === key ? ch.bg : "#fff",
                color: f.channel === key ? ch.color : T.sub,
              }}>
              {ch.icon} {ch.label}
            </button>
          ))}
        </div>
      </Field>

      {/* 방향 선택 */}
      <Field label="방향 *">
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => set("direction", "received")}
            style={{ flex: 1, padding: "8px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `1px solid ${f.direction === "received" ? T.navy : T.border}`, background: f.direction === "received" ? "#E8EEF4" : "#fff", color: f.direction === "received" ? T.navy : T.sub }}>
            받음 ↓ (고객→나)
          </button>
          <button onClick={() => set("direction", "sent")}
            style={{ flex: 1, padding: "8px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `1px solid ${f.direction === "sent" ? T.tealDark : T.border}`, background: f.direction === "sent" ? T.tint2 : "#fff", color: f.direction === "sent" ? T.tealDark : T.sub }}>
            보냄 ↑ (나→고객)
          </button>
        </div>
      </Field>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label="상대방 이름"><input style={inputStyle} value={f.person} onChange={(e) => set("person", e.target.value)} placeholder="예: Chen 부장" /></Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="날짜/시간"><input style={inputStyle} value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
        </div>
      </div>

      <Field label="제목 *"><input style={inputStyle} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="예: 납기 단축 문의" /></Field>
      <Field label="내용 (LINE·WeChat 대화는 복사해서 붙여넣으세요)">
        <textarea style={{ ...inputStyle, minHeight: 90, resize: "vertical" }} value={f.body} onChange={(e) => set("body", e.target.value)} placeholder="대화 내용을 여기에 붙여넣기..." />
      </Field>

      {deals.length > 0 && (
        <Field label="연결할 딜 (선택)">
          <select style={inputStyle} value={f.dealId} onChange={(e) => set("dealId", e.target.value)}>
            <option value="">연결 안 함</option>
            {deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
        </Field>
      )}

      <ModalActions
        onClose={onClose}
        onSave={() => f.title.trim() && (!companies || f.companyId) && onSave(f)}
        disabled={!f.title.trim() || (companies && !f.companyId)}
        saveLabel="기록 저장"
      />
    </Modal>
  );
}


// 견적 품목 추가/수정 모달
export function QuoteItemModal({ companyId, item, onClose, onSaved }) {
  const isNew = !item.id;
  const [f, setF] = useState({
    gubun: item.gubun || "사급",
    model: item.model || "",
    spec: item.spec || "",
    pgc_grams: item.pgc_grams ?? 0,
    agcn_grams: item.agcn_grams ?? 0,
    material_ni: item.material_ni ?? 0,
    material_etc: item.material_etc ?? 1800,
    yield_grams: item.yield_grams ?? 50,
    marginPct: Math.round(((item.margin_rate ?? 0.35) * 1000)) / 10, // % 표시
    note: item.note || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!f.model.trim() || busy) return;
    setBusy(true);
    try {
      await quoteItemSave({
        id: item.id || newId(),
        company_id: companyId,
        gubun: f.gubun,
        model: f.model.trim(),
        spec: f.spec.trim(),
        pgc_grams: Number(f.pgc_grams) || 0,
        agcn_grams: Number(f.agcn_grams) || 0,
        material_ni: Number(f.material_ni) || 0,
        material_etc: Number(f.material_etc) || 0,
        yield_grams: Number(f.yield_grams) || 50,
        margin_rate: (Number(f.marginPct) || 0) / 100,
        note: f.note.trim() || null,
        sort: item.sort ?? 999,
      });
      onSaved();
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <Modal title={isNew ? "견적 품목 추가" : "견적 품목 수정"} onClose={onClose}>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 2 }}>
          <Field label="모델명 *"><input style={inputStyle} value={f.model} onChange={(e) => set("model", e.target.value)} placeholder="예: ACC1625-G20A" /></Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="구분">
            <select style={inputStyle} value={f.gubun} onChange={(e) => set("gubun", e.target.value)}>
              <option>사급</option><option>도급</option>
            </select>
          </Field>
        </div>
      </div>
      <Field label="사양"><input style={inputStyle} value={f.spec} onChange={(e) => set("spec", e.target.value)} placeholder="예: Ni+Au(0.2um)" /></Field>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="PGC 사용량(g)"><input type="number" style={inputStyle} value={f.pgc_grams} onChange={(e) => set("pgc_grams", e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="AgCN 사용량(g)"><input type="number" style={inputStyle} value={f.agcn_grams} onChange={(e) => set("agcn_grams", e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="수율(g)"><input type="number" style={inputStyle} value={f.yield_grams} onChange={(e) => set("yield_grams", e.target.value)} /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label={f.gubun === "사급" ? "재료비 Ni자재 — 사급은 미적용" : "재료비 Ni자재(원)"}>
            <input type="number" style={{ ...inputStyle, opacity: f.gubun === "사급" ? 0.4 : 1 }} value={f.material_ni}
              onChange={(e) => set("material_ni", e.target.value)} disabled={f.gubun === "사급"} />
          </Field>
        </div>
        <div style={{ flex: 1 }}><Field label="목표 마진율(%)"><input type="number" style={inputStyle} value={f.marginPct} onChange={(e) => set("marginPct", e.target.value)} /></Field></div>
      </div>
      <div style={{ fontSize: 11, color: T.sub, marginTop: -6, marginBottom: 12 }}>
        ※ 재료비(기타)는 견적 화면의 "기준 정보"에서 입력한 값이 전 품목에 공통 적용됩니다.
      </div>
      <Field label="비고 (견적서에 표시)"><input style={inputStyle} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field>
      <ModalActions onClose={onClose} onSave={save} disabled={!f.model.trim() || busy} saveLabel={busy ? "저장 중..." : "저장"} />
    </Modal>
  );
}


// ===========================================================================
// 화면 5: 설정 — 메일 자동 수집 계정 관리
// (여기 등록한 계정을 수집기가 1시간마다 읽어 IMAP으로 메일을 가져옴)
// ===========================================================================
export const MAIL_PRESETS = [
  { key: "naver", label: "네이버 메일", imap_host: "imap.naver.com", imap_port: 993, smtp_host: "smtp.naver.com", smtp_port: 465, hint: "아이디는 @naver.com 앞부분" },
  { key: "works", label: "네이버 웍스", imap_host: "imap.worksmobile.com", imap_port: 993, smtp_host: "smtp.worksmobile.com", smtp_port: 465, hint: "아이디는 이메일 전체 주소" },
  { key: "custom", label: "직접 입력", imap_host: "", imap_port: 993, smtp_host: "", smtp_port: 465, hint: "" },
];


// 메일 계정 추가/수정 모달
export function MailAccountModal({ account, onClose, onSaved }) {
  const isNew = !account.id;
  const [f, setF] = useState({
    label: account.label || "",
    username: account.username || "",
    password: account.password || "",
    imap_host: account.imap_host || "",
    imap_port: account.imap_port || 993,
    smtp_host: account.smtp_host || "",
    smtp_port: account.smtp_port || 465,
    enabled: account.enabled !== false,
  });
  const [preset, setPreset] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));

  const applyPreset = (p) => {
    setPreset(p.key);
    setF((prev) => ({
      ...prev,
      label: prev.label || (p.key !== "custom" ? p.label : ""),
      imap_host: p.imap_host, imap_port: p.imap_port,
      smtp_host: p.smtp_host, smtp_port: p.smtp_port,
    }));
  };

  const canSave = f.label.trim() && f.username.trim() && f.password && f.imap_host.trim();

  const save = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      await mailAccountSave({
        id: account.id || newId(),
        label: f.label.trim(),
        username: f.username.trim(),
        password: f.password,
        imap_host: f.imap_host.trim(),
        imap_port: parseInt(f.imap_port, 10) || 993,
        smtp_host: f.smtp_host.trim() || null,
        smtp_port: parseInt(f.smtp_port, 10) || 465,
        enabled: f.enabled,
      });
      onSaved();
    } catch (e) {
      alert(e.message);
      setBusy(false);
    }
  };

  const hint = MAIL_PRESETS.find((p) => p.key === preset)?.hint;

  return (
    <Modal title={isNew ? "메일 계정 추가" : "메일 계정 수정"} onClose={onClose}>
      {isNew && (
        <Field label="어떤 메일인가요?">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {MAIL_PRESETS.map((p) => (
              <button key={p.key} onClick={() => applyPreset(p)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600,
                  border: `1px solid ${preset === p.key ? T.teal : T.border}`,
                  background: preset === p.key ? T.tint2 : "#fff",
                  color: preset === p.key ? T.tealDark : T.sub,
                }}>
                {p.label}
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label="이름(라벨) *"><input style={inputStyle} value={f.label} onChange={(e) => set("label", e.target.value)} placeholder="예: 대표 네이버웍스" /></Field>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label={`아이디 *${hint ? ` (${hint})` : ""}`}>
            <input style={inputStyle} value={f.username} onChange={(e) => set("username", e.target.value)} placeholder="예: dwlee@orocorp.kr" autoComplete="off" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="비밀번호 * (앱 비밀번호 권장)">
            <input style={inputStyle} type="password" value={f.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 2 }}>
          <Field label="IMAP 서버 * (메일 읽기)"><input style={inputStyle} value={f.imap_host} onChange={(e) => set("imap_host", e.target.value)} placeholder="imap.naver.com" /></Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="IMAP 포트"><input style={inputStyle} type="number" value={f.imap_port} onChange={(e) => set("imap_port", e.target.value)} /></Field>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 2 }}>
          <Field label="SMTP 서버 (메일 발송 — 선택)"><input style={inputStyle} value={f.smtp_host} onChange={(e) => set("smtp_host", e.target.value)} placeholder="smtp.naver.com" /></Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="SMTP 포트"><input style={inputStyle} type="number" value={f.smtp_port} onChange={(e) => set("smtp_port", e.target.value)} /></Field>
        </div>
      </div>

      <Field label="수집 사용">
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={f.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          이 계정에서 메일을 수집합니다
        </label>
      </Field>

      <ModalActions onClose={onClose} onSave={save} disabled={!canSave || busy} saveLabel={busy ? "저장 중..." : "저장"} />
    </Modal>
  );
}
