// 지원사업 서류 자동작성 — 한 건 입력으로 창업중심대학사업 서식 세트를 자동 생성·일괄 인쇄
import { useEffect, useMemo, useState } from "react";
import { errMsg } from "../lib/errmsg";
import { hasSupabase } from "../lib/supabase";
import { toast } from "../lib/toast";
import { confirmDialog } from "../lib/confirm";
import { usePaged } from "../lib/usePaged";
import {
  GrantDoc, GrantPhoto, GrantProfile,
  listGrantDocs, listGrantSettle, getGrantDoc, saveGrantDoc, deleteGrantDoc, getGrantProfile, saveGrantProfile,
  downscaleImage, storageUpload, storageObjectUrl, aiGrantWrite, aiGrantRead, GrantReadResult,
} from "../lib/db";
import {
  FORMS, FormKey, EXPENSE_ITEMS, FORM_PRESETS, calcTotal, money, docAmount, settleSummary,
  PROGRAMS, ProgramKey, TD_FORMS, TdFormKey, TD_ITEMS, TD_PRESETS, TD_EVIDENCE, TD_SETTLE_DOCS,
} from "../lib/grantforms";
import GrantForm from "./GrantForms";
import GrantFormTD from "./GrantFormsTD";

const todayIso = () => { const t = new Date(); const p = (n: number) => String(n).padStart(2, "0"); return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`; };

const inp: React.CSSProperties = { padding: 7, border: "1px solid var(--line)", borderRadius: 6, width: "100%", fontSize: 13 };
const lbl: React.CSSProperties = { fontSize: 11.5, color: "var(--muted)", display: "block", marginBottom: 2 };

function Field({ label, children, w }: { label: string; children: React.ReactNode; w?: number }) {
  return <div style={{ minWidth: w || 160, flex: w ? undefined : 1 }}><label style={lbl}>{label}</label>{children}</div>;
}

// 서술형 칸 — 짧은 초안을 [✨ AI로 다듬기]로 공식 서류 문체(보고체)로 확장. 직전 내용은 [↩ 되돌리기]로 복원.
function AiTextarea({ label, field, value, minHeight, ctx, onChange }: {
  label: string; field: string; value: string; minHeight?: number;
  ctx: Record<string, any>; onChange: (v: string) => void;
}) {
  const [aiBusy, setAiBusy] = useState(false);
  const [prev, setPrev] = useState<string | null>(null);
  async function polish() {
    if (!value.trim()) { toast.error("먼저 간단한 초안을 입력하세요. 예: 분체도장 시제품 표면 검사용"); return; }
    setAiBusy(true);
    try {
      const text = (await aiGrantWrite({ field, draft: value, context: ctx })).trim();
      if (text) { setPrev(value); onChange(text); toast.success("AI가 다듬었습니다 — 내용을 검토하고 필요하면 수정하세요."); }
      else toast.error("AI 응답이 비어 있습니다. 다시 시도해 주세요.");
    } catch (e: any) { toast.error("AI 다듬기 실패: " + errMsg(e)); }
    setAiBusy(false);
  }
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <label style={lbl}>
        {label}
        <span style={{ float: "right", display: "inline-flex", gap: 10 }}>
          {prev != null && (
            <a style={{ cursor: "pointer", color: "var(--muted)" }} onClick={() => { onChange(prev); setPrev(null); }}>↩ 되돌리기</a>
          )}
          <a style={{ cursor: aiBusy ? "wait" : "pointer", color: "var(--accent)", fontWeight: 700 }} onClick={aiBusy ? undefined : polish}>
            {aiBusy ? "⏳ 다듬는 중…" : "✨ AI로 다듬기"}
          </a>
        </span>
      </label>
      <textarea style={{ ...inp, minHeight: minHeight || 80 }} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

export default function GrantDocs() {
  // ---- 회사 프로필 ----
  const [prof, setProf] = useState<GrantProfile>({});
  const [profOpen, setProfOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getGrantProfile().then(p => { setProf(p); if (!p.company) setProfOpen(true); }).catch(() => {});
  }, []);
  async function saveProf() {
    setBusy(true);
    try { await saveGrantProfile(prof); toast.success("회사 정보 저장됨"); setProfOpen(false); }
    catch (e: any) { toast.error("저장 실패: " + errMsg(e)); }
    setBusy(false);
  }

  // ---- 서명(도장) PNG — 1회 등록 후 모든 서식의 (인) 위에 표시 ----
  const [signUrl, setSignUrl] = useState<string>("");
  useEffect(() => {
    const sp = prof.signPath || "";
    if (!sp) { setSignUrl(""); return; }
    if (sp.startsWith("data:")) { setSignUrl(sp); return; }
    storageObjectUrl("coc", sp).then(u => setSignUrl(u || "")).catch(() => setSignUrl(""));
  }, [prof.signPath]);
  async function setSignPath(signPath: string) {
    const next = { ...prof, signPath };
    setProf(next);
    try { await saveGrantProfile(next); toast.success(signPath ? "서명이 등록되었습니다 — 모든 서식의 (인) 위에 표시됩니다." : "서명 삭제됨"); }
    catch (e: any) { toast.error("서명 저장 실패: " + errMsg(e)); }
  }
  function uploadSign() {
    const el = document.createElement("input");
    el.type = "file"; el.accept = "image/png,image/*";
    el.onchange = async () => {
      const raw = el.files?.[0]; if (!raw) return;
      setBusy(true);
      try {
        // 투명 배경 유지를 위해 JPEG 변환(downscaleImage) 없이 PNG 그대로 업로드
        if (hasSupabase) {
          const path = await storageUpload("coc", raw);
          await setSignPath(path);
        } else {
          if (raw.size > 300 * 1024) { toast.error("로컬 모드에서는 300KB 이하 PNG만 등록할 수 있습니다."); }
          else {
            const dataUrl = await new Promise<string>((res, rej) => {
              const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(raw);
            });
            await setSignPath(dataUrl);
          }
        }
      } catch (e: any) { toast.error("서명 업로드 실패: " + errMsg(e)); }
      setBusy(false);
    };
    el.click();
  }

  // ---- 공고(프로그램) 선택 ----
  const [prog, setProg] = useState<ProgramKey>("cud");
  const progDef = PROGRAMS.find(x => x.key === prog)!;

  // ---- 건 목록 ----
  const [docs, setDocs] = useState<GrantDoc[]>([]);
  const { paged, remaining, showMore } = usePaged(docs, 30);
  const loadDocs = (pg: ProgramKey = prog) => listGrantDocs(pg).then(setDocs).catch(e => toast.error("목록 불러오기 실패: " + errMsg(e)));
  useEffect(() => { loadDocs(prog); }, [prog]);

  // ---- 정산 현황 (건 data 포함 목록) ----
  const [view, setView] = useState<"list" | "settle">("list");
  const [settleDocs, setSettleDocs] = useState<GrantDoc[]>([]);
  useEffect(() => {
    if (view === "settle") listGrantSettle(prog).then(setSettleDocs).catch(e => toast.error("정산 목록 불러오기 실패: " + errMsg(e)));
  }, [view, prog]);

  // ---- 현재 편집 건 ----
  const [cur, setCur] = useState<GrantDoc | null>(null);
  const [imgCache, setImgCache] = useState<Record<string, string>>({});
  const d = cur?.data || {};
  const setD = (patch: Record<string, any>) => setCur(c => c ? { ...c, data: { ...c.data, ...patch } } : c);

  function newDoc() {
    if (prog === "td") {
      setCur({
        title: "", program: "td", expense_item: "(실험)재료비", forms: [...(TD_PRESETS["(실험)재료비"] || [])],
        data: { writeDate: todayIso(), expenseItem: "(실험)재료비" },
        photos: [],
      });
    } else {
      setCur({
        title: "", program: "cud", expense_item: "기계장치비", forms: [...(FORM_PRESETS["기계장치비"] || [])],
        data: { writeDate: todayIso(), deliverDate: todayIso(), acquireDate: todayIso(), advA: true, expenseItem: "기계장치비" },
        photos: [],
      });
    }
    window.scrollTo({ top: 0 });
  }
  async function openDoc(id?: string) {
    if (!id) return;
    try {
      const doc = await getGrantDoc(id);
      if (!doc) { toast.error("건을 찾을 수 없습니다."); return; }
      setCur(doc);
      (doc.photos || []).forEach(async ph => {
        try { const u = await storageObjectUrl("coc", ph.path); if (u) setImgCache(c => ({ ...c, [ph.path]: u })); } catch { /* */ }
      });
      window.scrollTo({ top: 0 });
    } catch (e: any) { toast.error("열기 실패: " + errMsg(e)); }
  }
  async function removeDoc(r: GrantDoc) {
    if (!(await confirmDialog({ title: "건 삭제", message: `'${r.title}' 건과 서류 데이터를 삭제할까요?`, danger: true, confirmLabel: "삭제" }))) return;
    try { await deleteGrantDoc(r.id!); setDocs(ds => ds.filter(x => x.id !== r.id)); if (cur?.id === r.id) setCur(null); toast.success("삭제됨"); }
    catch (e: any) { toast.error("삭제 실패: " + errMsg(e)); }
  }
  async function save() {
    if (!cur) return;
    if (!cur.title.trim()) { toast.error("건 이름(품명/용역명)을 입력하세요."); return; }
    setBusy(true);
    try {
      const saved = await saveGrantDoc(cur);
      setCur(saved);
      setDocs(ds => cur.id ? ds.map(x => x.id === saved.id ? { ...x, title: saved.title, expense_item: saved.expense_item, forms: saved.forms } : x) : [saved, ...ds]);
      toast.success("저장됨");
    } catch (e: any) { toast.error("저장 실패: " + errMsg(e)); }
    setBusy(false);
  }

  // 지출항목(비목) 변경 → 서식 기본 추천 자동 체크 (공고별 프리셋)
  function setExpense(item: string) {
    const preset: string[] = prog === "td" ? (TD_PRESETS[item] || ["t8"]) : (FORM_PRESETS[item] || ["f1"]);
    setCur(c => c ? { ...c, expense_item: item, forms: [...preset], data: { ...c.data, expenseItem: item } } : c);
  }
  function toggleForm(k: string) {
    setCur(c => c ? { ...c, forms: c.forms.includes(k) ? c.forms.filter(f => f !== k) : [...c.forms, k] } : c);
  }

  // 선택 서식이 요구하는 입력 섹션 (공고별 서식 레지스트리)
  const sections = useMemo(() => {
    const s = new Set<string>();
    (cur?.forms || []).forEach(k => {
      const secs = prog === "td" ? TD_FORMS.find(f => f.key === k)?.sections : FORMS.find(f => f.key === k)?.sections;
      (secs || []).forEach(x => s.add(x));
    });
    return s;
  }, [cur?.forms, prog]);

  // ---- 사진 업로드 (다중 선택 / 드래그 / 붙여넣기) ----
  async function uploadFiles(raws: File[]) {
    const imgs = raws.filter(f => f && f.type.startsWith("image/"));
    if (!imgs.length || !cur) return;
    setBusy(true);
    let ok = 0;
    for (const raw of imgs) {
      try {
        const file = await downscaleImage(raw);
        const path = await storageUpload("coc", file);
        const u = await storageObjectUrl("coc", path); if (u) setImgCache(c => ({ ...c, [path]: u }));
        setCur(c => c ? { ...c, photos: [...c.photos, { path, name: "", qty: "" }] } : c);
        ok++;
      } catch { /* 아래 개수 안내 */ }
    }
    if (ok < imgs.length) toast.error(`사진 ${imgs.length - ok}장 업로드 실패${ok ? ` (${ok}장은 추가됨)` : ""}`);
    else if (imgs.length > 1) toast.success(`사진 ${ok}장 추가됨`);
    setBusy(false);
  }
  const addPhotos = () => {
    const el = document.createElement("input");
    el.type = "file"; el.accept = "image/*"; el.multiple = true;
    el.onchange = () => uploadFiles([...(el.files || [])]);
    el.click();
  };
  const [dragOver, setDragOver] = useState(false);
  useEffect(() => {
    if (!cur) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.items || [])].filter(it => it.type.startsWith("image/")).map(it => it.getAsFile()).filter((f): f is File => !!f);
      if (files.length) { e.preventDefault(); uploadFiles(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!cur]);
  const setPhoto = (i: number, patch: Partial<GrantPhoto>) => setCur(c => c ? { ...c, photos: c.photos.map((p, j) => j === i ? { ...p, ...patch } : p) } : c);
  const delPhoto = (i: number) => setCur(c => c ? { ...c, photos: c.photos.filter((_, j) => j !== i) } : c);

  // 단가×수량 자동 합계
  useEffect(() => {
    if (!cur) return;
    const t = calcTotal(d.unitPrice, d.qty);
    if (t != null && String(t) !== String(d.total || "")) setD({ total: t });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.unitPrice, d.qty]);

  // 현물 표 행
  const ikRows: any[] = Array.isArray(d.ik) ? d.ik : [];
  const setIk = (rows: any[]) => setD({ ik: rows });

  const img = (path: string) => imgCache[path];
  const selForms = FORMS.filter(f => cur?.forms.includes(f.key));
  const selFormsTD = TD_FORMS.filter(f => cur?.forms.includes(f.key));

  // 기술닥터 원장(제8호) 행 편집
  const tdLedger: any[] = Array.isArray(d.ledger) ? d.ledger : [];
  const setLedger = (rows: any[]) => setD({ ledger: rows });

  // ---- 거래명세서(PDF/사진) AI 인식 → 건 자동 입력 ----
  const [readBusy, setReadBusy] = useState(false);
  const [readPrev, setReadPrev] = useState<{ data: Record<string, any>; title: string } | null>(null);
  function applyRead(r: GrantReadResult) {
    if (!cur) return;
    setReadPrev({ data: { ...cur.data }, title: cur.title });
    const items = (r.items || []).filter(it => it?.name);
    const first = items[0];
    const nameLabel = first?.name ? (items.length > 1 ? `${first.name} 외 ${items.length - 1}건` : String(first.name)) : "";
    if (prog === "td") {
      const rows = items.map(it => ({
        item: cur.expense_item, desc: [it?.name, it?.spec].filter(Boolean).join(" "),
        date: r.date || "", payee: r.vendor || "", amount: it?.amount != null ? String(it.amount) : "",
      }));
      setCur(c => c ? {
        ...c, title: c.title || nameLabel,
        data: { ...c.data, vendor: r.vendor || c.data.vendor, ledger: [...(Array.isArray(c.data.ledger) ? c.data.ledger : []), ...rows] },
      } : c);
    } else {
      setCur(c => c ? {
        ...c, title: c.title || nameLabel,
        data: {
          ...c.data,
          itemName: nameLabel || c.data.itemName,
          vendor: r.vendor || c.data.vendor,
          ...(items.length === 1 ? {
            qty: first?.qty != null ? String(first.qty) : c.data.qty,
            unitPrice: first?.unitPrice != null ? String(first.unitPrice) : c.data.unitPrice,
          } : {}),
          total: r.supplyTotal != null ? String(r.supplyTotal) : c.data.total,
          payAmount: r.supplyTotal != null ? String(r.supplyTotal) : c.data.payAmount,
          deliverDate: r.date || c.data.deliverDate,
        },
      } : c);
    }
  }
  function readStatement() {
    const el = document.createElement("input");
    el.type = "file"; el.accept = ".pdf,image/*";
    el.onchange = async () => {
      const f = el.files?.[0]; if (!f) return;
      if (f.size > 8 * 1024 * 1024) { toast.error("8MB 이하 파일만 올릴 수 있습니다."); return; }
      const mediaType = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : f.type;
      if (!mediaType || !(mediaType === "application/pdf" || mediaType.startsWith("image/"))) { toast.error("PDF 또는 이미지 파일만 지원합니다."); return; }
      setReadBusy(true);
      try {
        const b64 = await new Promise<string>((res, rej) => {
          const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.onerror = rej; fr.readAsDataURL(f);
        });
        const r = await aiGrantRead({ fileBase64: b64, mediaType });
        if (!r.items?.length && !r.vendor && r.supplyTotal == null) toast.error("문서에서 거래 정보를 찾지 못했습니다. 선명한 파일로 다시 시도해 주세요.");
        else { applyRead(r); toast.success("거래명세서를 읽어 채웠습니다 — 내용을 검토하세요."); }
      } catch (e: any) { toast.error("거래명세서 인식 실패: " + errMsg(e)); }
      setReadBusy(false);
    };
    el.click();
  }
  const undoRead = () => {
    if (!readPrev) return;
    setCur(c => c ? { ...c, title: readPrev.title, data: readPrev.data } : c);
    setReadPrev(null);
  };

  // AI 다듬기에 전달할 건 정보 — 초안에 없는 사실을 지어내지 않도록 실제 값만 전달
  const aiCtx = {
    "지원사업": progDef.name,
    "기업명": prof.company, "과제명": prog === "td" ? prof.td?.project : prof.project, "지출항목": cur?.expense_item,
    "품명/용역명": d.itemName || d.svcName || cur?.title,
    "업체": d.vendor || d.svcVendor, "수량": d.qty, "단가(원)": d.unitPrice,
    "금액(원)": d.total || d.payAmount || d.svcAmount,
    ...(prog === "td" ? { "기술닥터": prof.td?.doctor } : {}),
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* ===== 공고(지원사업) 선택 ===== */}
      <div className="card grant-side" style={{ padding: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="seg">
            {PROGRAMS.map(pr => (
              <button key={pr.key} className={prog === pr.key ? "on" : ""} onClick={() => { setProg(pr.key); setCur(null); setView("list"); }}>
                {pr.key === "cud" ? "🎓" : "🔧"} {pr.short}
              </button>
            ))}
          </div>
          <span className="muted" style={{ fontSize: 12 }}>「{progDef.name}」 — 수신처: {progDef.org}</span>
        </div>
      </div>

      {/* ===== 회사 정보 (1회 저장) ===== */}
      <div className="card grant-side">
        <h4 style={{ margin: 0, cursor: "pointer" }} onClick={() => setProfOpen(o => !o)}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{profOpen ? "▼" : "▶"}</span> 🏢 회사 정보 <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>(모든 서류에 자동 반영 — 1회만 입력)</span>
          {prof.company && <span style={{ marginLeft: 8, fontSize: 13 }}>{prof.company} / {prof.ceo}</span>}
        </h4>
        {profOpen && (
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Field label="기업명(창업기업명)"><input style={inp} value={prof.company || ""} onChange={e => setProf({ ...prof, company: e.target.value })} /></Field>
              <Field label="대표자"><input style={inp} value={prof.ceo || ""} onChange={e => setProf({ ...prof, ceo: e.target.value })} /></Field>
              <Field label="사업자번호"><input style={inp} value={prof.bizno || ""} onChange={e => setProf({ ...prof, bizno: e.target.value })} /></Field>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Field label="과제명"><input style={inp} value={prof.project || ""} onChange={e => setProf({ ...prof, project: e.target.value })} /></Field>
              <Field label="과제번호" w={140}><input style={inp} value={prof.projectNo || ""} onChange={e => setProf({ ...prof, projectNo: e.target.value })} /></Field>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Field label="은행명" w={120}><input style={inp} value={prof.bank || ""} onChange={e => setProf({ ...prof, bank: e.target.value })} /></Field>
              <Field label="예금주" w={120}><input style={inp} value={prof.holder || ""} onChange={e => setProf({ ...prof, holder: e.target.value })} /></Field>
              <Field label="계좌번호"><input style={inp} value={prof.account || ""} onChange={e => setProf({ ...prof, account: e.target.value })} /></Field>
              <Field label="관리책임자" w={120}><input style={inp} value={prof.manager || ""} onChange={e => setProf({ ...prof, manager: e.target.value })} /></Field>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Field label="주소"><input style={inp} value={prof.address || ""} onChange={e => setProf({ ...prof, address: e.target.value })} /></Field>
              <Field label="법인등록번호(각서용)" w={170}><input style={inp} value={prof.corpNo || ""} onChange={e => setProf({ ...prof, corpNo: e.target.value })} /></Field>
            </div>
            {prog === "td" && (
              <div style={{ borderTop: "1px dashed var(--line)", paddingTop: 8, display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>🔧 기술닥터 상용화지원 과제 정보 <span className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}>(서식 공통 반영)</span></div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Field label="과제명"><input style={inp} value={prof.td?.project || ""} onChange={e => setProf({ ...prof, td: { ...prof.td, project: e.target.value } })} /></Field>
                  <Field label="기술닥터" w={130}><input style={inp} value={prof.td?.doctor || ""} onChange={e => setProf({ ...prof, td: { ...prof.td, doctor: e.target.value } })} /></Field>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Field label="과제 시작" w={150}><input type="date" style={inp} value={prof.td?.periodFrom || "2026-06-01"} onChange={e => setProf({ ...prof, td: { ...prof.td, periodFrom: e.target.value } })} /></Field>
                  <Field label="과제 종료" w={150}><input type="date" style={inp} value={prof.td?.periodTo || "2026-11-30"} onChange={e => setProf({ ...prof, td: { ...prof.td, periodTo: e.target.value } })} /></Field>
                  <Field label="지원금(원)" w={150}><input style={inp} value={prof.td?.support || ""} onChange={e => setProf({ ...prof, td: { ...prof.td, support: e.target.value } })} /></Field>
                  <Field label="기업부담금(원, 현금)" w={160}><input style={inp} value={prof.td?.share || ""} onChange={e => setProf({ ...prof, td: { ...prof.td, share: e.target.value } })} /></Field>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Field label="기술닥터 소속" w={170}><input style={inp} value={prof.td?.doctorOrg || ""} onChange={e => setProf({ ...prof, td: { ...prof.td, doctorOrg: e.target.value } })} /></Field>
                  <Field label="기술닥터 직위" w={120}><input style={inp} value={prof.td?.doctorTitle || ""} onChange={e => setProf({ ...prof, td: { ...prof.td, doctorTitle: e.target.value } })} /></Field>
                  <Field label="실무담당자" w={110}><input style={inp} value={prof.td?.mgrName || ""} onChange={e => setProf({ ...prof, td: { ...prof.td, mgrName: e.target.value } })} /></Field>
                  <Field label="부서" w={110}><input style={inp} value={prof.td?.mgrDept || ""} onChange={e => setProf({ ...prof, td: { ...prof.td, mgrDept: e.target.value } })} /></Field>
                  <Field label="직위" w={90}><input style={inp} value={prof.td?.mgrTitle || ""} onChange={e => setProf({ ...prof, td: { ...prof.td, mgrTitle: e.target.value } })} /></Field>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Field label="담당자 e-mail" w={190}><input style={inp} value={prof.td?.mgrEmail || ""} onChange={e => setProf({ ...prof, td: { ...prof.td, mgrEmail: e.target.value } })} /></Field>
                  <Field label="일반전화" w={140}><input style={inp} value={prof.td?.mgrTel || ""} onChange={e => setProf({ ...prof, td: { ...prof.td, mgrTel: e.target.value } })} /></Field>
                  <Field label="휴대폰" w={140}><input style={inp} value={prof.td?.mgrPhone || ""} onChange={e => setProf({ ...prof, td: { ...prof.td, mgrPhone: e.target.value } })} /></Field>
                </div>
              </div>
            )}
            <div>
              <label style={lbl}>서명(도장) 이미지 — 배경이 투명한 PNG 권장, 한 번 등록하면 모든 서식의 (인) 위에 자동 표시</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn ghost" disabled={busy} onClick={uploadSign}>🖋 서명 올리기 (PNG)</button>
                {signUrl && <img src={signUrl} alt="서명" style={{ height: 40, border: "1px dashed var(--line)", borderRadius: 4, padding: 2, background: "#fff" }} />}
                {prof.signPath && <button className="btn danger" style={{ padding: "2px 10px", fontSize: 12 }} disabled={busy} onClick={() => setSignPath("")}>서명 삭제</button>}
              </div>
            </div>
            <div><button className="btn green" disabled={busy} onClick={saveProf}>회사 정보 저장</button></div>
          </div>
        )}
      </div>

      {/* ===== 정산 현황 ===== */}
      {!cur && view === "settle" && (() => {
        const progItems = prog === "td" ? TD_ITEMS : EXPENSE_ITEMS;
        const { lines, totalAmount, totalBudget } = settleSummary(settleDocs, prof.budgets || {}, progItems);
        const hasBudget = totalBudget > 0;
        const sorted = [...settleDocs].sort((a, b) =>
          String(a.data?.writeDate || a.created_at || "").localeCompare(String(b.data?.writeDate || b.created_at || "")));
        return (
          <>
            <div className="card grant-side">
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button className="btn ghost" onClick={() => setView("list")}>← 건 목록</button>
                <h4 style={{ margin: 0 }}>📊 정산 현황</h4>
                <span className="muted" style={{ fontSize: 12 }}>등록된 집행 건이 지출항목별로 자동 집계됩니다.</span>
                <span style={{ marginLeft: "auto" }}>
                  <button className="btn" onClick={() => window.print()}>🖨 정산표 인쇄/PDF</button>
                </span>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
                  {prog === "td" ? "세목별 계획액(원)" : "지출항목별 예산(원)"} <span className="muted" style={{ fontWeight: 400 }}>— 입력하면 잔액·집행률이 계산됩니다 (선택, 회사 정보와 함께 저장)</span>
                </div>
                {prog === "td" && (
                  <div style={{ fontSize: 12, background: "#f3f7fc", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 10px", marginBottom: 8, lineHeight: 1.7 }}>
                    <b>📎 정산 제출물 (관리지침 제37조)</b><br />{TD_SETTLE_DOCS.map(s => <span key={s}>· {s}<br /></span>)}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(prog === "td" ? TD_ITEMS : EXPENSE_ITEMS).map(it => (
                    <div key={it} style={{ width: 165 }}>
                      <label style={lbl}>{it}</label>
                      <input style={inp} value={prof.budgets?.[it] || ""} placeholder="예산(원)"
                        onChange={e => setProf({ ...prof, budgets: { ...(prof.budgets || {}), [it]: e.target.value } })} />
                    </div>
                  ))}
                </div>
                <button className="btn green" style={{ marginTop: 8 }} disabled={busy} onClick={saveProf}>예산 저장</button>
              </div>
            </div>

            {/* 인쇄 대상 정산표 */}
            <div className="gdoc">
              <h2 className="gtitle">「{progDef.name}」 사업비 집행 정산 현황</h2>
              <table className="gt gx" style={{ fontSize: "11pt" }}><tbody>
                <tr style={{ height: "6.9mm" }}>
                  <th style={{ width: "18%" }}>기 업 명</th><td style={{ width: "34%", textAlign: "center" }}>{prof.company}</td>
                  <th style={{ width: "18%" }}>작 성 일</th><td style={{ textAlign: "center" }}>{todayIso()}</td>
                </tr>
                <tr style={{ height: "6.9mm" }}><th>과 제 명</th><td colSpan={3} style={{ textAlign: "center" }}>{prog === "td" ? prof.td?.project : prof.project}</td></tr>
              </tbody></table>
              <div style={{ fontSize: "13pt", fontWeight: 700, margin: "5mm 0 1.5mm" }}>□ {prog === "td" ? "세목별" : "지출항목별"} 집계</div>
              <table className="gt gx" style={{ fontSize: "10.5pt" }}>
                <thead><tr style={{ height: "6.9mm" }}>
                  <th>지출항목</th><th style={{ width: "9%" }}>건수</th><th style={{ width: "17%" }}>집행액(원)</th>
                  {hasBudget && <><th style={{ width: "17%" }}>예산(원)</th><th style={{ width: "17%" }}>잔액(원)</th><th style={{ width: "11%" }}>집행률</th></>}
                </tr></thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.item} style={{ height: "6.4mm" }}>
                      <td style={{ paddingLeft: "2mm" }}>{l.item}</td>
                      <td style={{ textAlign: "center" }}>{l.count || ""}</td>
                      <td style={{ textAlign: "right" }}>{l.amount ? money(l.amount) : ""}</td>
                      {hasBudget && <>
                        <td style={{ textAlign: "right" }}>{l.budget ? money(l.budget) : ""}</td>
                        <td style={{ textAlign: "right" }}>{l.budget ? money(l.budget - l.amount) : ""}</td>
                        <td style={{ textAlign: "center" }}>{l.budget ? Math.round(l.amount / l.budget * 100) + "%" : ""}</td>
                      </>}
                    </tr>
                  ))}
                  {lines.length === 0 && <tr><td colSpan={hasBudget ? 6 : 3} style={{ textAlign: "center", padding: "3mm" }}>등록된 집행 건이 없습니다.</td></tr>}
                  {lines.length > 0 && (
                    <tr style={{ height: "6.9mm", fontWeight: 700 }}>
                      <td style={{ textAlign: "center" }}>합 계</td>
                      <td style={{ textAlign: "center" }}>{lines.reduce((s, l) => s + l.count, 0)}</td>
                      <td style={{ textAlign: "right" }}>{money(totalAmount)}</td>
                      {hasBudget && <>
                        <td style={{ textAlign: "right" }}>{money(totalBudget)}</td>
                        <td style={{ textAlign: "right" }}>{money(totalBudget - totalAmount)}</td>
                        <td style={{ textAlign: "center" }}>{totalBudget ? Math.round(totalAmount / totalBudget * 100) + "%" : ""}</td>
                      </>}
                    </tr>
                  )}
                </tbody>
              </table>
              <div style={{ fontSize: "13pt", fontWeight: 700, margin: "5mm 0 1.5mm" }}>□ 집행 건 상세</div>
              <table className="gt gx" style={{ fontSize: "10.5pt" }}>
                <thead><tr style={{ height: "6.9mm" }}>
                  <th style={{ width: "7%" }}>No</th><th style={{ width: "14%" }}>일자</th><th style={{ width: "17%" }}>지출항목</th>
                  <th>건명(품명/용역명)</th><th style={{ width: "17%" }}>업체</th><th style={{ width: "16%" }}>금액(원)</th>
                </tr></thead>
                <tbody>
                  {sorted.map((r, i) => (
                    <tr key={r.id || i} style={{ height: "6.4mm" }}>
                      <td style={{ textAlign: "center" }}>{i + 1}</td>
                      <td style={{ textAlign: "center" }}>{String(r.data?.writeDate || r.created_at || "").slice(0, 10)}</td>
                      <td style={{ textAlign: "center" }}>{r.expense_item}</td>
                      <td style={{ paddingLeft: "2mm" }}>{r.title}</td>
                      <td style={{ textAlign: "center" }}>{r.data?.vendor || r.data?.svcVendor || ""}</td>
                      <td style={{ textAlign: "right" }}>{money(docAmount(r.data || {})) || "0"}</td>
                    </tr>
                  ))}
                  {sorted.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", padding: "3mm" }}>등록된 집행 건이 없습니다.</td></tr>}
                </tbody>
              </table>
              <p style={{ fontSize: "10pt", marginTop: "2mm" }}>※ 금액은 각 건의 지급요청서 지급액(없으면 합계 → 단가×수량 → 용역금액 순)을 기준으로 집계함.</p>
            </div>
          </>
        );
      })()}

      {/* ===== 건 목록 ===== */}
      {!cur && view !== "settle" && (
        <div className="card grant-side">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h4 style={{ margin: 0 }}>📑 집행 건 목록</h4>
            <button className="btn green" onClick={newDoc}>＋ 새 건 만들기</button>
            <button className="btn ghost" onClick={() => setView("settle")}>📊 정산 현황</button>
            <span className="muted" style={{ fontSize: 12 }}>한 건을 등록하면 필요한 서식 세트가 자동으로 채워집니다.</span>
          </div>
          <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
            {docs.length === 0 && <p className="muted" style={{ fontSize: 13 }}>등록된 건이 없습니다. '새 건 만들기'로 시작하세요.</p>}
            {paged.map(r => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 6, fontSize: 13, flexWrap: "wrap" }}>
                <span style={{ background: "#eef3f9", borderRadius: 4, padding: "1px 6px", fontSize: 11 }}>{r.expense_item || "-"}</span>
                <b>{r.title}</b>
                <span className="muted" style={{ fontSize: 12 }}>서식 {r.forms?.length || 0}종 · {String(r.created_at || "").slice(0, 10)}</span>
                <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
                  <button className="btn ghost" style={{ padding: "2px 10px", fontSize: 12 }} onClick={() => openDoc(r.id)}>열기</button>
                  <button className="btn danger" style={{ padding: "2px 10px", fontSize: 12 }} onClick={() => removeDoc(r)}>삭제</button>
                </span>
              </div>
            ))}
            {remaining > 0 && <button className="btn ghost" onClick={showMore}>더 보기 ({remaining}건)</button>}
          </div>
        </div>
      )}

      {/* ===== 건 편집 ===== */}
      {cur && (
        <>
        <div className="card grant-edit">
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button className="btn ghost" onClick={() => setCur(null)}>← 목록</button>
            <h4 style={{ margin: 0 }}>{cur.id ? "건 편집" : "새 건"}</h4>
            <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
              <button className="btn green" disabled={busy} onClick={save}>💾 저장</button>
              <button className="btn" onClick={() => window.print()}>🖨 전체 인쇄/PDF</button>
            </span>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <Field label="건 이름 (품명/용역명)"><input style={inp} value={cur.title} onChange={e => setCur({ ...cur, title: e.target.value })} /></Field>
            <Field label={prog === "td" ? "비목(세목)" : "지출항목"} w={190}>
              <select style={inp} value={cur.expense_item || ""} onChange={e => setExpense(e.target.value)}>
                {(prog === "td" ? TD_ITEMS : EXPENSE_ITEMS).map(it => <option key={it} value={it}>{it}</option>)}
              </select>
            </Field>
            <Field label="작성일" w={150}><input type="date" style={inp} value={d.writeDate || ""} onChange={e => setD({ writeDate: e.target.value })} /></Field>
          </div>

          {/* 거래명세서 AI 인식 */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
            <button className="btn ghost" disabled={readBusy || busy} onClick={readStatement}>
              {readBusy ? "⏳ 인식 중…" : "📄 거래명세서 불러오기 (PDF/사진)"}
            </button>
            {readPrev && <a style={{ cursor: "pointer", color: "var(--muted)", fontSize: 13 }} onClick={undoRead}>↩ 인식 전으로 되돌리기</a>}
            <span className="muted" style={{ fontSize: 11.5 }}>
              품명·수량·단가·금액·업체·일자를 AI가 읽어 자동 입력합니다{prog === "td" ? " (품목이 집행 행으로 추가됩니다)" : ""}.
            </span>
          </div>

          {/* 서식 선택 */}
          <div style={{ marginTop: 12, border: "1px solid var(--line)", borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>생성할 서식 <span className="muted" style={{ fontWeight: 400 }}>({prog === "td" ? "비목" : "지출항목"}을 바꾸면 기본 추천이 다시 체크됩니다)</span></div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {(prog === "td" ? TD_FORMS : FORMS).map(f => (
                <label key={f.key} style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={cur.forms.includes(f.key)} onChange={() => toggleForm(f.key)} /> {f.no}. {f.title}
                </label>
              ))}
            </div>
          </div>

          {/* 기술닥터: 비목별 증빙 체크리스트 (관리지침 제35·39조) */}
          {prog === "td" && TD_EVIDENCE[cur.expense_item || ""] && (() => {
            const ev = TD_EVIDENCE[cur.expense_item || ""];
            const checks: Record<string, boolean> = d.evChecks || {};
            return (
              <div style={{ marginTop: 12, border: "1px solid #cfe3f7", background: "#f4f9ff", borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>📎 '{cur.expense_item}' 증빙 체크리스트 <span className="muted" style={{ fontWeight: 400 }}>— 관리지침(2025.02.05) 제35·39조 기준</span></div>
                <div style={{ display: "grid", gap: 4 }}>
                  {ev.docs.map(doc => (
                    <label key={doc} style={{ fontSize: 13, display: "flex", alignItems: "flex-start", gap: 6, cursor: "pointer" }}>
                      <input type="checkbox" checked={!!checks[doc]} onChange={e => setD({ evChecks: { ...checks, [doc]: e.target.checked } })} style={{ marginTop: 3 }} />
                      <span style={doc.startsWith("※") ? { color: "#b45309", fontWeight: 600 } : undefined}>{doc}</span>
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: "#555", lineHeight: 1.7 }}>
                  {ev.limits.map(l => <div key={l}>⚠ {l}</div>)}
                </div>
              </div>
            );
          })()}

          {/* 기술닥터: 서식별 입력 */}
          {prog === "td" && sections.has("tdbank") && (
            <div style={{ marginTop: 12, borderTop: "1px dashed var(--line)", paddingTop: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>📮 공문(제2호)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Field label="문서번호 (예: 2026-회사명-01)" w={230}><input style={inp} value={d.docNo || ""} onChange={e => setD({ docNo: e.target.value })} /></Field>
                <Field label="시행일자" w={150}><input type="date" style={inp} value={d.sendDate || ""} onChange={e => setD({ sendDate: e.target.value })} /></Field>
              </div>
            </div>
          )}
          {prog === "td" && sections.has("tdlog") && (
            <div style={{ marginTop: 12, borderTop: "1px dashed var(--line)", paddingTop: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>📝 기술지원 일지(제5호)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Field label="회차" w={80}><input style={inp} value={d.round || ""} onChange={e => setD({ round: e.target.value })} /></Field>
                <Field label="지원일자" w={150}><input type="date" style={inp} value={d.logDate || ""} onChange={e => setD({ logDate: e.target.value })} /></Field>
                <Field label="장소" w={180}><input style={inp} value={d.place || ""} onChange={e => setD({ place: e.target.value })} /></Field>
                <Field label="주제"><input style={inp} value={d.topic || ""} onChange={e => setD({ topic: e.target.value })} /></Field>
              </div>
              <div style={{ marginTop: 8 }}>
                <AiTextarea label="지원 내용 (문제점·분석·개선방안·지도내용)" field="기술지원 일지 내용(6하 원칙, 문제점/분석내용/개선방안/지도내용)" value={d.logContent || ""} minHeight={100} ctx={aiCtx} onChange={v => setD({ logContent: v })} />
              </div>
            </div>
          )}
          {prog === "td" && sections.has("tdreport") && (() => {
            const goals: any[] = Array.isArray(d.rptGoals) ? d.rptGoals : [];
            const tasks: any[] = Array.isArray(d.rptTasks) ? d.rptTasks : [];
            const sched: any[] = Array.isArray(d.rptSched) ? d.rptSched : [];
            const rounds: any[] = Array.isArray(d.rptRounds) ? d.rptRounds : [];
            const eff: Record<string, any> = d.rptEffect || {};
            const setEff = (k: string, patch: Record<string, string>) => setD({ rptEffect: { ...eff, [k]: { ...(eff[k] || {}), ...patch } } });
            const EFFECT_ROWS: [string, string][] = [
              ["sales", "매출액(천원)"], ["export", "수출액(천원)"], ["saving", "비용절감(천원)"], ["staff", "재직인원(명)"],
              ["patentReg", "특허등록(건)"], ["patentApp", "특허출원(건)"], ["cert", "인증(건)"], ["tech", "기술도입·판매(건)"], ["rnd", "R&D비용(천원)"],
            ];
            return (
              <div style={{ marginTop: 12, borderTop: "1px dashed var(--line)", paddingTop: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>📕 결과보고서(제4호) <span className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}>— 사진(수행과정)은 아래 증빙사진에 올리고 '품명' 칸에 과정설명을 쓰세요 (1~3번: 세로형, 4~6번: 가로형)</span></div>
                <div style={{ display: "grid", gap: 8 }}>
                  <AiTextarea label="① 현장애로기술지원 내용 요약" field="결과보고서-현장애로기술지원 내용 요약" value={d.rptField || ""} minHeight={50} ctx={aiCtx} onChange={v => setD({ rptField: v })} />
                  <AiTextarea label="② 중기애로기술지원 내용 요약" field="결과보고서-중기애로기술지원 과제 중 기술닥터 지원내용 요약" value={d.rptMid || ""} minHeight={60} ctx={aiCtx} onChange={v => setD({ rptMid: v })} />
                  <AiTextarea label="③ 상용화지원 내용 요약" field="결과보고서-상용화지원 과제 중 기술닥터 지원내용 요약" value={d.rptCom || ""} minHeight={60} ctx={aiCtx} onChange={v => setD({ rptCom: v })} />
                  <AiTextarea label="④ 과제 수행 결과물 (제작도면 비교·완성도·성능 등)" field="결과보고서-과제 수행 결과물 기술" value={d.rptResult || ""} minHeight={60} ctx={aiCtx} onChange={v => setD({ rptResult: v })} />
                  <AiTextarea label="⑤ 사업계획 대비 목표달성 서술" field="결과보고서-사업계획 대비 정량/정성 목표달성 성과" value={d.rptGoalText || ""} minHeight={60} ctx={aiCtx} onChange={v => setD({ rptGoalText: v })} />
                  <AiTextarea label="⑥ 상품화계획 및 사업성" field="결과보고서-사업성평가·사업화/상용화 계획·예상매출액" value={d.rptBiz || ""} minHeight={60} ctx={aiCtx} onChange={v => setD({ rptBiz: v })} />
                  <AiTextarea label="⑦ 정성적 기대효과 + 기타 파급효과" field="결과보고서-정성적 기대효과(구체적 수치 포함)" value={d.rptQualEffect || ""} minHeight={60} ctx={aiCtx} onChange={v => setD({ rptQualEffect: v })} />
                </div>

                <div style={{ fontSize: 12, fontWeight: 700, margin: "10px 0 4px" }}>목표달성 표</div>
                {goals.map((g, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                    <input style={{ ...inp, flex: 1, minWidth: 130 }} placeholder="달성 성능 지표명" value={g.name || ""} onChange={e => setD({ rptGoals: goals.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} />
                    <input style={{ ...inp, width: 120 }} placeholder="시장 충족 성능" value={g.market || ""} onChange={e => setD({ rptGoals: goals.map((x, j) => j === i ? { ...x, market: e.target.value } : x) })} />
                    <input style={{ ...inp, width: 110 }} placeholder="달성목표" value={g.target || ""} onChange={e => setD({ rptGoals: goals.map((x, j) => j === i ? { ...x, target: e.target.value } : x) })} />
                    <input style={{ ...inp, width: 110 }} placeholder="달성 결과" value={g.result || ""} onChange={e => setD({ rptGoals: goals.map((x, j) => j === i ? { ...x, result: e.target.value } : x) })} />
                    <input style={{ ...inp, width: 80 }} placeholder="달성도%" value={g.rate || ""} onChange={e => setD({ rptGoals: goals.map((x, j) => j === i ? { ...x, rate: e.target.value } : x) })} />
                    <input style={{ ...inp, width: 120 }} placeholder="증빙(시험성적서 등)" value={g.evidence || ""} onChange={e => setD({ rptGoals: goals.map((x, j) => j === i ? { ...x, evidence: e.target.value } : x) })} />
                    <button className="btn danger" style={{ padding: "2px 8px" }} onClick={() => setD({ rptGoals: goals.filter((_, j) => j !== i) })}>×</button>
                  </div>
                ))}
                <button className="btn ghost" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setD({ rptGoals: [...goals, {}] })}>＋ 목표 행</button>

                <div style={{ fontSize: 12, fontWeight: 700, margin: "10px 0 4px" }}>세부추진내용</div>
                {tasks.map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                    <input style={{ ...inp, width: 180 }} placeholder="추진항목" value={t.item || ""} onChange={e => setD({ rptTasks: tasks.map((x, j) => j === i ? { ...x, item: e.target.value } : x) })} />
                    <input style={{ ...inp, flex: 1, minWidth: 200 }} placeholder="추진내용 및 방법" value={t.method || ""} onChange={e => setD({ rptTasks: tasks.map((x, j) => j === i ? { ...x, method: e.target.value } : x) })} />
                    <button className="btn danger" style={{ padding: "2px 8px" }} onClick={() => setD({ rptTasks: tasks.filter((_, j) => j !== i) })}>×</button>
                  </div>
                ))}
                <button className="btn ghost" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setD({ rptTasks: [...tasks, {}] })}>＋ 추진 행</button>

                <div style={{ fontSize: 12, fontWeight: 700, margin: "10px 0 4px" }}>추진일정 <span className="muted" style={{ fontWeight: 400 }}>(월은 쉼표로: 예 1,2,3)</span></div>
                {sched.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                    <input style={{ ...inp, flex: 1, minWidth: 160 }} placeholder="항목 (예: ~ 설계)" value={s.item || ""} onChange={e => setD({ rptSched: sched.map((x, j) => j === i ? { ...x, item: e.target.value } : x) })} />
                    <input style={{ ...inp, width: 130 }} placeholder="계획월 (1,2)" value={s.plan || ""} onChange={e => setD({ rptSched: sched.map((x, j) => j === i ? { ...x, plan: e.target.value } : x) })} />
                    <input style={{ ...inp, width: 130 }} placeholder="실적월 (1,2)" value={s.actual || ""} onChange={e => setD({ rptSched: sched.map((x, j) => j === i ? { ...x, actual: e.target.value } : x) })} />
                    <button className="btn danger" style={{ padding: "2px 8px" }} onClick={() => setD({ rptSched: sched.filter((_, j) => j !== i) })}>×</button>
                  </div>
                ))}
                <button className="btn ghost" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setD({ rptSched: [...sched, {}] })}>＋ 일정 행</button>

                <div style={{ fontSize: 12, fontWeight: 700, margin: "10px 0 4px" }}>정량적 기대효과 <span className="muted" style={{ fontWeight: 400 }}>(전년도/해당연도/차년도/차차년도/세부근거)</span></div>
                {EFFECT_ROWS.map(([k, label]) => {
                  const e0 = eff[k] || {};
                  return (
                    <div key={k} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4, alignItems: "center" }}>
                      <span style={{ fontSize: 12, width: 130 }}>{label}</span>
                      <input style={{ ...inp, width: 90 }} placeholder="전년도" value={e0.y0 || ""} onChange={e => setEff(k, { y0: e.target.value })} />
                      <input style={{ ...inp, width: 90 }} placeholder="해당연도" value={e0.y1 || ""} onChange={e => setEff(k, { y1: e.target.value })} />
                      <input style={{ ...inp, width: 90 }} placeholder="차년도" value={e0.y2 || ""} onChange={e => setEff(k, { y2: e.target.value })} />
                      <input style={{ ...inp, width: 90 }} placeholder="차차년도" value={e0.y3 || ""} onChange={e => setEff(k, { y3: e.target.value })} />
                      <input style={{ ...inp, flex: 1, minWidth: 140 }} placeholder="세부근거" value={e0.basis || ""} onChange={e => setEff(k, { basis: e.target.value })} />
                    </div>
                  );
                })}
                <div style={{ marginTop: 6 }}><Field label="기타 기대성과 (벤처등록/이노비즈/연구소 설립 등)"><input style={inp} value={d.rptEtcEffect || ""} onChange={e => setD({ rptEtcEffect: e.target.value })} /></Field></div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <AiTextarea label="기술적 달성 목표 (정량적/구체적)" field="결과보고서-기술적 달성 목표" value={d.rptGoalTech || ""} minHeight={50} ctx={aiCtx} onChange={v => setD({ rptGoalTech: v })} />
                  <AiTextarea label="목표 대비 지원결과" field="결과보고서-목표 대비 지원결과" value={d.rptGoalResult || ""} minHeight={50} ctx={aiCtx} onChange={v => setD({ rptGoalResult: v })} />
                </div>

                <div style={{ fontSize: 12, fontWeight: 700, margin: "10px 0 4px" }}>회차별 기술지원내용 (1~10회)</div>
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
                    <span style={{ fontSize: 12, width: 34, textAlign: "right" }}>{i + 1}회</span>
                    <input style={{ ...inp, flex: 1 }} value={rounds[i]?.content || ""} onChange={e => {
                      const next = [...rounds]; while (next.length <= i) next.push({});
                      next[i] = { ...next[i], content: e.target.value }; setD({ rptRounds: next });
                    }} />
                  </div>
                ))}
              </div>
            );
          })()}

          {prog === "td" && sections.has("tdledger") && (
            <div style={{ marginTop: 12, borderTop: "1px dashed var(--line)", paddingTop: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>💰 집행 내역(제7·8호 명세서) <span className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}>— 행을 추가하면 명세서에 자동 반영</span></div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <Field label="당초계획: 인건비(원)" w={150}><input style={inp} value={d.planLabor || ""} onChange={e => setD({ planLabor: e.target.value })} /></Field>
                <Field label="당초계획: 직접비(원)" w={150}><input style={inp} value={d.planDirect || ""} onChange={e => setD({ planDirect: e.target.value })} /></Field>
                <Field label="당초계획: 이자(원)" w={130}><input style={inp} value={d.planInterest || ""} onChange={e => setD({ planInterest: e.target.value })} /></Field>
                <Field label="기술닥터수당 원천세(원)" w={160}><input style={inp} value={d.tdTax || ""} onChange={e => setD({ tdTax: e.target.value })} /></Field>
              </div>
              {tdLedger.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  <select style={{ ...inp, width: 160 }} value={r.item || ""} onChange={e => setLedger(tdLedger.map((x, j) => j === i ? { ...x, item: e.target.value } : x))}>
                    <option value="">세목 선택</option>
                    {TD_ITEMS.map(it => <option key={it} value={it}>{it}</option>)}
                  </select>
                  <input style={{ ...inp, flex: 1, minWidth: 140 }} placeholder="내역(품명)" value={r.desc || ""} onChange={e => setLedger(tdLedger.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))} />
                  <input style={{ ...inp, width: 120 }} placeholder="집행일" value={r.date || ""} onChange={e => setLedger(tdLedger.map((x, j) => j === i ? { ...x, date: e.target.value } : x))} />
                  <input style={{ ...inp, width: 120 }} placeholder="지급처" value={r.payee || ""} onChange={e => setLedger(tdLedger.map((x, j) => j === i ? { ...x, payee: e.target.value } : x))} />
                  <input style={{ ...inp, width: 110 }} placeholder="금액(원)" value={r.amount || ""} onChange={e => setLedger(tdLedger.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
                  <input style={{ ...inp, width: 80 }} placeholder="증빙No" value={r.evNo || ""} onChange={e => setLedger(tdLedger.map((x, j) => j === i ? { ...x, evNo: e.target.value } : x))} />
                  <button className="btn danger" style={{ padding: "2px 8px" }} onClick={() => setLedger(tdLedger.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              <button className="btn ghost" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setLedger([...tdLedger, { item: cur.expense_item }])}>＋ 집행 행 추가</button>
            </div>
          )}
          {prog === "td" && sections.has("tdchange") && (
            <div style={{ marginTop: 12, borderTop: "1px dashed var(--line)", paddingTop: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>🔁 협약변경(제11호)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Field label="변경 전"><textarea style={{ ...inp, minHeight: 70 }} value={d.changeBefore || ""} onChange={e => setD({ changeBefore: e.target.value })} /></Field>
                <Field label="변경 후"><textarea style={{ ...inp, minHeight: 70 }} value={d.changeAfter || ""} onChange={e => setD({ changeAfter: e.target.value })} /></Field>
              </div>
              <div style={{ marginTop: 8 }}>
                <AiTextarea label="변경 사유" field="협약변경 사유(변경 전후 내용의 타당성 설명)" value={d.changeReason || ""} minHeight={70} ctx={aiCtx} onChange={v => setD({ changeReason: v })} />
              </div>
              <div style={{ marginTop: 8 }}><Field label="기타사항"><textarea style={{ ...inp, minHeight: 50 }} value={d.changeEtc || ""} onChange={e => setD({ changeEtc: e.target.value })} /></Field></div>
            </div>
          )}

          {/* 공통: 지급요청서 */}
          {cur.forms.includes("f1") && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <Field label="지급액(원)" w={160}><input style={inp} value={d.payAmount || ""} onChange={e => setD({ payAmount: e.target.value })} /></Field>
              <AiTextarea label="지급 사유" field="지급 사유(사업비 지급요청서)" value={d.payReason || ""} minHeight={54} ctx={aiCtx} onChange={v => setD({ payReason: v })} />
            </div>
          )}

          {/* 구매(검수조서/활용계획서/라벨) */}
          {sections.has("purchase") && (
            <div style={{ marginTop: 12, borderTop: "1px dashed var(--line)", paddingTop: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>🛒 구매/기자재</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Field label="장비(물품)명"><input style={inp} value={d.itemName || ""} onChange={e => setD({ itemName: e.target.value })} /></Field>
                <Field label="납품업체/구매예정처"><input style={inp} value={d.vendor || ""} onChange={e => setD({ vendor: e.target.value })} /></Field>
                <Field label="납품일자" w={150}><input type="date" style={inp} value={d.deliverDate || ""} onChange={e => setD({ deliverDate: e.target.value })} /></Field>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <Field label="수량" w={90}><input style={inp} value={d.qty || ""} onChange={e => setD({ qty: e.target.value })} /></Field>
                <Field label="단가(원)" w={140}><input style={inp} value={d.unitPrice || ""} onChange={e => setD({ unitPrice: e.target.value })} /></Field>
                <Field label="합계(원, 자동)" w={140}><input style={inp} value={d.total || ""} onChange={e => setD({ total: e.target.value })} /></Field>
                <Field label="검수확인자" w={120}><input style={inp} value={d.inspector || ""} placeholder={prof.ceo || ""} onChange={e => setD({ inspector: e.target.value })} /></Field>
              </div>
              {cur.forms.includes("f5") && (
                <div style={{ marginTop: 8 }}>
                  <AiTextarea label="용도 및 기능 (활용계획서 — 간단히 쓰고 AI로 다듬기)" field="용도 및 기능(기자재 활용계획서 — 과제 연관성 상세 기술)"
                    value={d.usagePlan || ""} minHeight={90} ctx={aiCtx} onChange={v => setD({ usagePlan: v })} />
                </div>
              )}
              {cur.forms.includes("f10") && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <Field label="취득일" w={150}><input type="date" style={inp} value={d.acquireDate || ""} onChange={e => setD({ acquireDate: e.target.value })} /></Field>
                  <Field label="자산관리번호 접두어 (선택)" w={230}>
                    <input style={inp} value={d.assetNo || ""} placeholder={`비우면 ORO-${(d.acquireDate || "").replace(/-/g, "").slice(2) || "취득일"} 자동`} onChange={e => setD({ assetNo: e.target.value })} />
                  </Field>
                  <span className="muted" style={{ fontSize: 11.5, alignSelf: "center" }}>라벨은 수량만큼 생성되며 번호가 -01, -02… 로 누적됩니다.</span>
                </div>
              )}
            </div>
          )}

          {/* 용역 */}
          {sections.has("service") && (
            <div style={{ marginTop: 12, borderTop: "1px dashed var(--line)", paddingTop: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>🧰 외주용역</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Field label="용역의 명칭"><input style={inp} value={d.svcName || ""} onChange={e => setD({ svcName: e.target.value })} /></Field>
                <Field label="용역대상 업체" w={180}><input style={inp} value={d.svcVendor || ""} onChange={e => setD({ svcVendor: e.target.value })} /></Field>
                <Field label="용역금액(원, VAT별도)" w={160}><input style={inp} value={d.svcAmount || ""} onChange={e => setD({ svcAmount: e.target.value })} /></Field>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <Field label="용역 시작" w={150}><input type="date" style={inp} value={d.svcFrom || ""} onChange={e => setD({ svcFrom: e.target.value })} /></Field>
                <Field label="용역 종료" w={150}><input type="date" style={inp} value={d.svcTo || ""} onChange={e => setD({ svcTo: e.target.value })} /></Field>
                {cur.forms.includes("f6") && <>
                  <Field label="잔금(원)" w={140}><input style={inp} value={d.svcBalance || ""} onChange={e => setD({ svcBalance: e.target.value })} /></Field>
                  <Field label="잔금지급일" w={150}><input type="date" style={inp} value={d.svcBalanceDate || ""} onChange={e => setD({ svcBalanceDate: e.target.value })} /></Field>
                </>}
              </div>
              {cur.forms.includes("f2") && <>
                <div style={{ marginTop: 8 }}><Field label="용역절차 (과업지시서)"><input style={inp} value={d.svcProc || ""} onChange={e => setD({ svcProc: e.target.value })} /></Field></div>
                <div style={{ marginTop: 8 }}><AiTextarea label="용역세부내용 (과업지시서 — 예상결과물 등)" field="용역세부내용(과업지시서)" value={d.svcDetail || ""} minHeight={80} ctx={aiCtx} onChange={v => setD({ svcDetail: v })} /></div>
              </>}
              {cur.forms.includes("f6") && <>
                <div style={{ marginTop: 8 }}><AiTextarea label="용역진행결과 (결과보고서 — 단계별/일자별 진행상황)" field="용역진행결과(외주용역 최종결과보고서)" value={d.svcResult || ""} minHeight={100} ctx={aiCtx} onChange={v => setD({ svcResult: v })} /></div>
                <div style={{ marginTop: 8 }}><AiTextarea label="차후 진행예정사항" field="차후 진행예정사항(외주용역 최종결과보고서 — 잔여개발계획)" value={d.svcNext || ""} minHeight={60} ctx={aiCtx} onChange={v => setD({ svcNext: v })} /></div>
              </>}
            </div>
          )}

          {/* 거래기업(규정 확인서) */}
          {sections.has("vendor") && cur.forms.includes("f12") && (
            <div style={{ marginTop: 12, borderTop: "1px dashed var(--line)", paddingTop: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>🏭 거래기업 정보 (규정 확인서)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Field label="거래기업명"><input style={inp} value={d.vName || ""} onChange={e => setD({ vName: e.target.value })} /></Field>
                <Field label="대표자명" w={120}><input style={inp} value={d.vCeo || ""} onChange={e => setD({ vCeo: e.target.value })} /></Field>
                <Field label="사업자번호" w={150}><input style={inp} value={d.vBizno || ""} onChange={e => setD({ vBizno: e.target.value })} /></Field>
                <Field label="구분" w={100}>
                  <select style={inp} value={d.vType || "법인"} onChange={e => setD({ vType: e.target.value })}><option>법인</option><option>개인</option></select>
                </Field>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <Field label="업태" w={160}><input style={inp} value={d.vSector || ""} onChange={e => setD({ vSector: e.target.value })} /></Field>
                <Field label="종목" w={160}><input style={inp} value={d.vCategory || ""} onChange={e => setD({ vCategory: e.target.value })} /></Field>
                <Field label="집행항목" w={170}>
                  <select style={inp} value={d.execItem || "외주용역비"} onChange={e => setD({ execItem: e.target.value })}><option>외주용역비</option><option>광고선전비</option></select>
                </Field>
                <Field label="공급가액(원)" w={140}><input style={inp} value={d.supply || ""} onChange={e => setD({ supply: e.target.value })} /></Field>
                <Field label="부가세(원)" w={130}><input style={inp} value={d.vat || ""} onChange={e => setD({ vat: e.target.value })} /></Field>
              </div>
              <div style={{ marginTop: 8 }}><AiTextarea label="과업내용" field="과업내용(일반용역비 규정 확인서)" value={d.taskDesc || ""} minHeight={60} ctx={aiCtx} onChange={v => setD({ taskDesc: v })} /></div>
            </div>
          )}

          {/* 선금 각서 */}
          {sections.has("advance") && cur.forms.includes("f11") && (
            <div style={{ marginTop: 12, borderTop: "1px dashed var(--line)", paddingTop: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>💰 선금 각서</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <Field label="선금액(원)" w={150}><input style={inp} value={d.advAmount || ""} onChange={e => setD({ advAmount: e.target.value })} /></Field>
                <label style={{ fontSize: 13 }}><input type="checkbox" checked={d.advA !== false} onChange={e => setD({ advA: e.target.checked })} /> 지급각서(면제형)</label>
                <label style={{ fontSize: 13 }}><input type="checkbox" checked={!!d.advB} onChange={e => setD({ advB: e.target.checked })} /> 지급각서(반환형)</label>
                <label style={{ fontSize: 13 }}><input type="checkbox" checked={!!d.advC} onChange={e => setD({ advC: e.target.checked })} /> 사용각서</label>
              </div>
            </div>
          )}

          {/* 행사 */}
          {sections.has("event") && (
            <div style={{ marginTop: 12, borderTop: "1px dashed var(--line)", paddingTop: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>🎪 학회/전시회/박람회</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Field label="행사명"><input style={inp} value={d.evtName || ""} onChange={e => setD({ evtName: e.target.value })} /></Field>
                <Field label="일시" w={150}><input type="date" style={inp} value={d.evtDate || ""} onChange={e => setD({ evtDate: e.target.value })} /></Field>
                <Field label="장소" w={200}><input style={inp} value={d.evtPlace || ""} onChange={e => setD({ evtPlace: e.target.value })} /></Field>
              </div>
              <div style={{ marginTop: 8 }}><AiTextarea label="주요 내용" field="행사 주요 내용(학회/전시회/박람회 참가 보고서)" value={d.evtContent || ""} minHeight={80} ctx={aiCtx} onChange={v => setD({ evtContent: v })} /></div>
            </div>
          )}

          {/* 사유서 */}
          {sections.has("reason") && (
            <div style={{ marginTop: 12, borderTop: "1px dashed var(--line)", paddingTop: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>📝 사유서(확인서)</div>
              <AiTextarea label="서술 내용" field="사유서(확인서) 서술 내용" value={d.reasonText || ""} minHeight={120} ctx={aiCtx} onChange={v => setD({ reasonText: v })} />
            </div>
          )}

          {/* 현물 */}
          {sections.has("inkind") && (
            <div style={{ marginTop: 12, borderTop: "1px dashed var(--line)", paddingTop: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>🏗 현물 납부 내역</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                {[["labor", "인건비"], ["equip", "기자재"], ["mat", "재료"], ["space", "공간"]].map(([k, l]) => (
                  <label key={k} style={{ fontSize: 13 }}><input type="checkbox" checked={!!(d.ikChecks || {})[k]} onChange={e => setD({ ikChecks: { ...(d.ikChecks || {}), [k]: e.target.checked } })} /> {l}</label>
                ))}
              </div>
              {ikRows.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  <input style={{ ...inp, width: 90 }} placeholder="항목" value={r.cat || ""} onChange={e => setIk(ikRows.map((x, j) => j === i ? { ...x, cat: e.target.value } : x))} />
                  <input style={{ ...inp, width: 130 }} placeholder="세부항목" value={r.detail || ""} onChange={e => setIk(ikRows.map((x, j) => j === i ? { ...x, detail: e.target.value } : x))} />
                  <input style={{ ...inp, width: 110 }} placeholder="환산액(천원)" value={r.amount || ""} onChange={e => setIk(ikRows.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
                  <input style={{ ...inp, flex: 1, minWidth: 160 }} placeholder="산출내역" value={r.calc || ""} onChange={e => setIk(ikRows.map((x, j) => j === i ? { ...x, calc: e.target.value } : x))} />
                  <input style={{ ...inp, width: 90 }} placeholder="비고" value={r.note || ""} onChange={e => setIk(ikRows.map((x, j) => j === i ? { ...x, note: e.target.value } : x))} />
                  <button className="btn danger" style={{ padding: "2px 8px" }} onClick={() => setIk(ikRows.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              <button className="btn ghost" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setIk([...ikRows, {}])}>＋ 행 추가</button>
            </div>
          )}

          {/* 사진 */}
          <div
            style={{ marginTop: 12, borderTop: "1px dashed var(--line)", paddingTop: 10, borderRadius: 8, ...(dragOver ? { outline: "2px dashed var(--accent)", outlineOffset: 4, background: "#eff6ff" } : {}) }}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); uploadFiles([...e.dataTransfer.files]); }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>📷 증빙사진 <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>— 여러 장 선택·드래그, 또는 구글 포토 웹에서 '이미지 복사' 후 Ctrl+V</span></div>
            <button className="btn ghost" onClick={addPhotos} disabled={busy}>+ 사진 추가 (여러 장)</button>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {cur.photos.map((ph, i) => (
                <div key={ph.path} style={{ position: "relative", width: 130 }}>
                  {img(ph.path) ? <img src={img(ph.path)} alt="" style={{ width: 130, height: 96, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }} /> : <div style={{ width: 130, height: 96, background: "#eee", borderRadius: 6 }} />}
                  <button className="btn danger" style={{ position: "absolute", top: -6, right: -6, padding: "0 6px", fontSize: 11 }} onClick={() => delPhoto(i)}>×</button>
                  <input style={{ ...inp, padding: 4, fontSize: 11, marginTop: 3 }} placeholder="품명" value={ph.name || ""} onChange={e => setPhoto(i, { name: e.target.value })} />
                  <input style={{ ...inp, padding: 4, fontSize: 11, marginTop: 3 }} placeholder="수량" value={ph.qty || ""} onChange={e => setPhoto(i, { qty: e.target.value })} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===== 미리보기 (인쇄 대상) ===== */}
        {(prog === "td" ? selFormsTD.length : selForms.length) > 0 && (
          <div>
            <div className="grant-side" style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 2px 10px" }}>
              <h4 style={{ margin: 0 }}>🖨 서류 미리보기 <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>({prog === "td" ? selFormsTD.length : selForms.length}종 — 인쇄하면 이 서류들만 A4로 출력됩니다)</span></h4>
            </div>
            {prog === "td"
              ? selFormsTD.map(f => (
                <div key={f.key} className="gdoc">
                  <GrantFormTD form={f.key as TdFormKey} p={prof} sign={signUrl || undefined}
                    d={{ ...d, expenseItem: cur.expense_item }}
                    photos={cur.photos} img={img} />
                </div>
              ))
              : selForms.map(f => (
                <div key={f.key} className="gdoc">
                  <GrantForm form={f.key} p={prof} sign={signUrl || undefined}
                    d={{ ...d, expenseItem: cur.expense_item, itemName: d.itemName || cur.title, svcName: d.svcName || cur.title }}
                    photos={cur.photos} img={img} />
                </div>
              ))}
          </div>
        )}
        </>
      )}
    </div>
  );
}
