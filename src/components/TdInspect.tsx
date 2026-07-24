// 기술닥터 상용화지원 · 검수조서 (양식 4) — 서류 자동작성 td 공고 내부 뷰.
// 원래 지원사업 탭의 독립 '검수조서' 모드였던 기능을 통째로 이전한 것.
// 데이터는 기존 projects/inspections 테이블을 그대로 사용(기존 검수조서 승계),
// 서식 헤더의 기업명·과제명·협약기간은 회사 정보(prof)·과제 정보(prof.td)를 우선 사용한다.
import { errMsg } from "../lib/errmsg";
import { useEffect, useMemo, useRef, useState } from "react";
import { Project, Inspection, InspItem, GrantProfile, listProjects, upsertProject, listInspections, upsertInspection, deleteInspection, storageUpload, storageObjectUrl, downscaleImage, logAudit } from "../lib/db";
import { PROGRAMS } from "../lib/grantforms";
import { can } from "../lib/perm";
import { toast } from "../lib/toast";
import { confirmDialog } from "../lib/confirm";
import * as XLSX from "xlsx";
import { nf as won, todayIso } from "../lib/fmt";
import { useIsMobile } from "../lib/useIsMobile";
import { usePaged } from "../lib/usePaged";

const TD_ANNOUNCE = PROGRAMS.find(p => p.key === "td")!.name;
const dateKo = (iso?: string) => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return `${y}년 ${m}월 ${d}일`; };
const blankItem = (): InspItem => ({ name: "", spec: "", unit: "EA", qty: 0, price: 0, note: "" });
const normPhotos = (arr?: any[]): { path: string; caption?: string }[] => (arr || []).map(x => typeof x === "string" ? { path: x } : x);

export default function TdInspect({ prof, onBack }: { prof: GrantProfile; onBack: () => void }) {
  const canEdit = can("support.edit");
  const isMobile = useIsMobile();
  const [project, setProject] = useState<Project | null>(null);
  const [insps, setInsps] = useState<Inspection[]>([]);
  const [form, setForm] = useState<Inspection | null>(null);
  const [imgCache, setImgCache] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"insp" | "settle">("insp");
  const [showPreview, setShowPreview] = useState(false);
  const [pdfRender, setPdfRender] = useState(false); // PDF 생성 순간에만 미리보기를 임시 마운트
  const certRef = useRef<HTMLDivElement>(null);

  const loadI = () => listInspections().then(setInsps).catch(e => toast.error("검수조서 불러오기 실패: " + errMsg(e)));
  // 기술닥터 공고 행 자동 확보 — 기존 행이 있으면 그대로(기존 검수조서 승계), 없으면 프로필로 생성
  useEffect(() => {
    (async () => {
      try {
        const ps = await listProjects();
        let p = ps.find(x => (x.announce || "").includes("기술닥터")) || null;
        if (!p && canEdit) {
          p = await upsertProject({
            name: prof.td?.project || "기술닥터 상용화지원 과제", announce: TD_ANNOUNCE,
            company: prof.company || "오알오", vendor: "",
            period_from: prof.td?.periodFrom || "", period_to: prof.td?.periodTo || "", note: "",
          });
        }
        setProject(p);
      } catch (e: any) { toast.error("과제 불러오기 실패: " + errMsg(e)); }
      loadI();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 서식 헤더 값 — 프로필 우선(과제 정보 카드와 한 곳으로 통일), 없으면 기존 공고 행 값
  const hdr = {
    company: prof.company || project?.company || "",
    announce: project?.announce || TD_ANNOUNCE,
    task: prof.td?.project || project?.name || "",
    from: prof.td?.periodFrom || project?.period_from || "",
    to: prof.td?.periodTo || project?.period_to || "",
  };

  const projInsps = useMemo(() => insps.filter(i => i.project_id === project?.id), [insps, project]);

  useEffect(() => {
    const paths: string[] = [];
    if (form?.sign_path) paths.push(form.sign_path);
    (form?.photos || []).forEach(ph => paths.push(ph.path));
    let warned = false;
    paths.forEach(p => {
      if (!p || imgCache[p]) return;
      storageObjectUrl("coc", p) // blob URL: base64보다 메모리를 훨씬 적게 씀(모바일 새로고침 방지)
        .then(u => { if (u) setImgCache(c => ({ ...c, [p]: u })); })
        .catch(e => { console.warn("이미지 로드 실패:", p, e); if (!warned) { warned = true; toast.error("서명/증빙사진 원본을 불러오지 못했습니다 — 파일이 삭제됐거나 네트워크 문제일 수 있습니다."); } });
    });
    // eslint-disable-next-line
  }, [form]);
  const src = (path?: string) => (path ? imgCache[path] : undefined);

  // ---- inspection ----
  function newInsp() {
    if (!project) { toast.error("과제 정보를 불러오는 중입니다 — 잠시 후 다시 시도하세요."); return; }
    setForm({ project_id: project.id!, insp_no: "", deliver_place: hdr.company || "오알오", vendor: project.vendor || "", inspect_date: todayIso(), inspector: "", sign_path: "", items: [blankItem()], photos: [] });
  }
  function loadInsp(i: Inspection) { setForm({ ...i, items: (i.items && i.items.length ? i.items : [blankItem()]), photos: normPhotos(i.photos) }); }
  function setF(patch: Partial<Inspection>) { setForm(f => f ? { ...f, ...patch } : f); }
  function setItem(idx: number, patch: Partial<InspItem>) { setForm(f => { if (!f) return f; const items = [...(f.items || [])]; items[idx] = { ...items[idx], ...patch }; return { ...f, items }; }); }
  function addItem() { setForm(f => f ? { ...f, items: [...(f.items || []), blankItem()] } : f); }
  function delItem(idx: number) { setForm(f => { if (!f) return f; const items = (f.items || []).filter((_, i) => i !== idx); return { ...f, items: items.length ? items : [blankItem()] }; }); }

  const rows = (form?.items || []).map(it => ({ ...it, amount: (Number(it.qty) || 0) * (Number(it.price) || 0) }));
  const sumPrice = rows.reduce((s, r) => s + (Number(r.price) || 0), 0);
  const sumAmount = rows.reduce((s, r) => s + r.amount, 0);
  const photoChunks = useMemo(() => { const arr = form?.photos || []; const out: { path: string; caption?: string }[][] = []; for (let i = 0; i < arr.length; i += 4) out.push(arr.slice(i, i + 4)); return out; }, [form]);
  const withinPeriod = useMemo(() => {
    if (!form?.inspect_date || !hdr.from || !hdr.to) return true;
    return form.inspect_date >= hdr.from && form.inspect_date <= hdr.to;
  }, [form, hdr.from, hdr.to]);
  const settleRows = useMemo(() => {
    const out: { date: string; vendor: string; name: string; spec: string; unit: string; qty: number; price: number; amount: number; note: string }[] = [];
    projInsps.forEach(i => { (i.items || []).forEach(it => { const qty = Number(it.qty) || 0, price = Number(it.price) || 0; out.push({ date: i.inspect_date || "", vendor: i.vendor || "", name: it.name || "", spec: it.spec || "", unit: it.unit || "", qty, price, amount: qty * price, note: it.note || "" }); }); });
    return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  }, [projInsps]);
  const settleTotal = settleRows.reduce((s2, r) => s2 + r.amount, 0);
  const { paged: settlePaged, remaining: settleRemaining, showMore: settleMore } = usePaged(settleRows, 300);
  function exportSettle() {
    if (!settleRows.length) { toast.error("정산할 데이터가 없습니다."); return; }
    const aoa: any[][] = [["검수일자", "공고명", "과제명", "납품업체", "품명", "규격", "단위", "수량", "단가", "금액", "비고"]];
    settleRows.forEach(r => aoa.push([r.date, hdr.announce, hdr.task, r.vendor, r.name, r.spec, r.unit, String(r.qty), String(r.price), String(r.amount), r.note]));
    aoa.push(["합계", "", "", "", "", "", "", "", "", String(settleTotal), ""]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "정산내용");
    XLSX.writeFile(wb, `정산내용_기술닥터_${todayIso()}.xlsx`);
    toast.success("엑셀 저장 완료");
  }

  function pickUpload(cb: (path: string) => void) {
    const inp2 = document.createElement("input"); inp2.type = "file"; inp2.accept = "image/*";
    inp2.onchange = async () => {
      const raw = inp2.files?.[0]; if (!raw) return; setBusy(true);
      try {
        const file = await downscaleImage(raw); // 폰 원본을 긴 변 1600px JPEG로 축소 후 업로드
        const path = await storageUpload("coc", file);
        const u = await storageObjectUrl("coc", path); if (u) setImgCache(c => ({ ...c, [path]: u }));
        cb(path);
      } catch (e: any) { toast.error("업로드 실패: " + errMsg(e)); }
      setBusy(false);
    };
    inp2.click();
  }
  const addSign = () => pickUpload(path => setF({ sign_path: path }));

  // 증빙사진 다중 업로드 — 파일 선택(여러 장)/드래그 앤 드롭/붙여넣기 공용 경로
  async function uploadFiles(raws: File[]) {
    const imgs = raws.filter(f => f && f.type.startsWith("image/"));
    if (!imgs.length) return;
    setBusy(true);
    let ok = 0;
    for (const raw of imgs) {
      try {
        const file = await downscaleImage(raw);
        const path = await storageUpload("coc", file);
        const u = await storageObjectUrl("coc", path); if (u) setImgCache(c => ({ ...c, [path]: u }));
        setForm(f => f ? { ...f, photos: [...(f.photos || []), { path, caption: "" }] } : f);
        ok++;
      } catch { /* 아래에서 개수로 안내 */ }
    }
    if (ok < imgs.length) toast.error(`사진 ${imgs.length - ok}장 업로드 실패${ok ? ` (${ok}장은 추가됨)` : ""}`);
    else if (imgs.length > 1) toast.success(`사진 ${ok}장 추가됨`);
    setBusy(false);
  }
  const addPhoto = () => {
    const inp2 = document.createElement("input");
    inp2.type = "file"; inp2.accept = "image/*"; inp2.multiple = true;
    inp2.onchange = () => uploadFiles([...(inp2.files || [])]);
    inp2.click();
  };
  // 편집 중 붙여넣기: 구글 포토 웹 등에서 '이미지 복사' 후 Ctrl+V로 바로 추가 (텍스트 붙여넣기는 그대로 통과)
  const editingOpen = !!form;
  const [dragOver, setDragOver] = useState(false);
  useEffect(() => {
    if (!editingOpen) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.items || [])]
        .filter(it => it.type.startsWith("image/"))
        .map(it => it.getAsFile()).filter((f): f is File => !!f);
      if (files.length) { e.preventDefault(); uploadFiles(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingOpen]);
  const delPhoto = (path: string) => setForm(f => f ? { ...f, photos: (f.photos || []).filter(ph => ph.path !== path) } : f);
  const setCaption = (path: string, cap: string) => setForm(f => f ? { ...f, photos: (f.photos || []).map(ph => ph.path === path ? { ...ph, caption: cap } : ph) } : f);

  async function saveInsp() {
    if (!form) return;
    if (!withinPeriod && !(await confirmDialog({ title: "협약기간 확인", message: "검수일자가 협약기간을 벗어납니다. 그래도 저장할까요?", confirmLabel: "저장" }))) return;
    setBusy(true);
    try { const saved = await upsertInspection({ ...form, items: rows }); await loadI(); setForm({ ...saved, items: saved.items && saved.items.length ? saved.items : [blankItem()], photos: saved.photos || [] }); logAudit("검수조서 저장", "inspection", saved.id || "", {}); toast.success("검수조서 저장됨"); }
    catch (e: any) { toast.error("저장 실패: " + errMsg(e)); }
    setBusy(false);
  }
  async function removeInsp(i: Inspection) {
    if (!(await confirmDialog({ title: "검수조서 삭제", message: `${i.inspect_date || "-"} 검수조서(${(i.items || []).length}품목)를 삭제할까요?\n복구할 수 없습니다.`, danger: true, confirmLabel: "삭제" }))) return;
    setBusy(true);
    try {
      await deleteInspection(i.id!); await loadI(); if (form?.id === i.id) setForm(null); toast.success("삭제됨");
      logAudit("검수조서 삭제", "inspection", i.id!, { date: i.inspect_date });
    } catch (e: any) { toast.error("삭제 실패: " + errMsg(e)); }
    setBusy(false);
  }
  async function savePdf() {
    if (!form || busy) return;
    setBusy(true);
    try {
      toast.info("PDF 만드는 중…");
      if (!showPreview) { setPdfRender(true); await new Promise(r => setTimeout(r, 250)); } // 접힘 상태면 잠시 마운트
      if (!certRef.current) throw new Error("미리보기를 준비하지 못했습니다. 다시 시도하세요.");
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(); const m = 10;
      const maxW = pw - m * 2, maxH = ph - m * 2;
      const pages = Array.from(certRef.current.querySelectorAll<HTMLElement>(".pdf-page"));
      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: "#ffffff" });
        let w = maxW, h = canvas.height * w / canvas.width;
        if (h > maxH) { h = maxH; w = canvas.width * h / canvas.height; }
        if (i > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", m + (maxW - w) / 2, m, w, h);
      }
      const clean = (x?: string) => (x || "").replace(/[\\/:*?"<>|\s]+/g, "");
      pdf.save(`검수조서_${clean(hdr.task).slice(0, 16)}_${form.inspect_date || todayIso()}.pdf`);
      logAudit("검수조서 PDF", "inspection", form.id || "", {});
    } catch (e: any) { toast.error("PDF 생성 실패: " + errMsg(e)); }
    finally { setPdfRender(false); setBusy(false); }
  }

  const inp: React.CSSProperties = { padding: 7, border: "1px solid var(--line)", borderRadius: 6, fontSize: 13 };
  const bd: React.CSSProperties = { border: "1px solid #333", padding: "4px 6px", fontSize: 12, color: "#111" };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, display: "block", marginBottom: 3 };
  const pageStyle: React.CSSProperties = { background: "#fff", color: "#000", padding: "28px 26px", width: 720, maxWidth: "100%", margin: "0 auto 16px", boxSizing: "border-box", minHeight: 1000, border: "1px solid #ddd", fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif" };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card grant-side">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn ghost" onClick={onBack}>← 서류 목록</button>
          <h3 style={{ margin: 0 }}>🏛️ 검수조서 <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>— 기술닥터 상용화지원 (양식 4)</span></h3>
          <div className="seg" style={{ marginLeft: "auto" }}>
            <button className={tab === "insp" ? "on" : ""} onClick={() => setTab("insp")}>검수조서</button>
            <button className={tab === "settle" ? "on" : ""} onClick={() => setTab("settle")}>정산내용</button>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
          공고명: {hdr.announce} · 과제명: {hdr.task || "-"} · 협약기간: {hdr.from || "-"} ~ {hdr.to || "-"} · 기업명: {hdr.company || "-"}
          {" "}<span style={{ opacity: .8 }}>(위 '회사 정보'·'과제 정보' 카드 값이 자동 반영됩니다)</span>
        </p>
      </div>

      {/* 저장된 검수조서 목록 */}
      {tab === "insp" &&
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <h4 style={{ margin: 0 }}>검수조서 목록 <span className="muted" style={{ fontSize: 12 }}>· {projInsps.length}건</span></h4>
            {canEdit && <button className="btn green" style={{ marginLeft: "auto" }} onClick={newInsp} disabled={busy}>+ 새 검수조서</button>}
          </div>
          {projInsps.length === 0 ? <p className="muted">아직 저장된 검수조서가 없습니다.</p> :
            <div style={{ display: "grid", gap: 6 }}>
              {projInsps.map(i => (
                <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 6, fontSize: 13, background: form?.id === i.id ? "var(--tint2)" : "#fff" }}>
                  <b>{i.inspect_date || "-"}</b>
                  <span className="muted">검수자 {i.inspector || "-"} · {(i.items || []).length}품목 · 사진 {(i.photos || []).length}</span>
                  <button className="btn ghost" style={{ marginLeft: "auto", padding: "2px 10px", fontSize: 12 }} onClick={() => loadInsp(i)}>열기</button>
                  {canEdit && <button className="btn ghost" style={{ padding: "2px 10px", fontSize: 12, color: "#c0392b" }} onClick={() => removeInsp(i)}>삭제</button>}
                </div>
              ))}
            </div>}
        </div>}

      {/* 편집 폼 */}
      {form && tab === "insp" &&
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <h4 style={{ margin: 0 }}>검수조서 작성</h4>
            <button className="btn green" onClick={saveInsp} disabled={busy || !canEdit}>저장</button>
            <button className="btn" onClick={savePdf} disabled={busy}>📄 PDF 저장</button>
            <button className="btn ghost" onClick={() => setForm(null)}>닫기</button>
          </div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", marginBottom: 12 }}>
            <div><label style={lbl}>납품업체</label><input style={{ ...inp, width: "100%" }} value={form.vendor || ""} onChange={e => setF({ vendor: e.target.value })} /></div>
            <div><label style={lbl}>납품장소</label><input style={{ ...inp, width: "100%" }} value={form.deliver_place || ""} onChange={e => setF({ deliver_place: e.target.value })} /></div>
            <div><label style={lbl}>검수일자 {!withinPeriod && <span style={{ color: "#c0392b" }}>협약기간 밖!</span>}</label><input type="date" style={{ ...inp, width: "100%", borderColor: withinPeriod ? "var(--line)" : "#c0392b" }} value={form.inspect_date || ""} onChange={e => setF({ inspect_date: e.target.value })} /></div>
            <div><label style={lbl}>검수자</label><input style={{ ...inp, width: "100%" }} value={form.inspector || ""} onChange={e => setF({ inspector: e.target.value })} /></div>
          </div>

          <label style={lbl}>품목</label>
          <div style={{ overflow: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
              <thead><tr>{["No", "품명", "규격", "단위", "수량", "단가", "금액", "비고", ""].map(h => <th key={h} style={{ ...bd, background: "#f1f3f7" }}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((it, idx) => (
                  <tr key={idx}>
                    <td style={{ ...bd, textAlign: "center" }}>{idx + 1}</td>
                    <td style={bd}><input style={{ ...inp, width: 130, padding: 3 }} value={it.name || ""} onChange={e => setItem(idx, { name: e.target.value })} /></td>
                    <td style={bd}><input style={{ ...inp, width: 130, padding: 3 }} value={it.spec || ""} onChange={e => setItem(idx, { spec: e.target.value })} /></td>
                    <td style={bd}><input style={{ ...inp, width: 44, padding: 3 }} value={it.unit || ""} onChange={e => setItem(idx, { unit: e.target.value })} /></td>
                    <td style={bd}><input type="number" style={{ ...inp, width: 60, padding: 3, textAlign: "right" }} value={it.qty || 0} onChange={e => setItem(idx, { qty: Number(e.target.value) })} /></td>
                    <td style={bd}><input type="number" style={{ ...inp, width: 84, padding: 3, textAlign: "right" }} value={it.price || 0} onChange={e => setItem(idx, { price: Number(e.target.value) })} /></td>
                    <td style={{ ...bd, textAlign: "right" }}>{won(it.amount)}</td>
                    <td style={bd}><input style={{ ...inp, width: 80, padding: 3 }} value={it.note || ""} onChange={e => setItem(idx, { note: e.target.value })} /></td>
                    <td style={{ ...bd, textAlign: "center" }}><button className="btn ghost" style={{ padding: "1px 7px", fontSize: 11 }} onClick={() => delItem(idx)}>×</button></td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, background: "var(--tint)" }}>
                  <td style={{ ...bd, textAlign: "center" }} colSpan={5}>합 계</td>
                  <td style={{ ...bd, textAlign: "right" }}>{won(sumPrice)}</td>
                  <td style={{ ...bd, textAlign: "right" }}>{won(sumAmount)}</td>
                  <td style={bd} colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          </div>
          <button className="btn ghost" style={{ marginTop: 6, fontSize: 12 }} onClick={addItem}>+ 품목 추가</button>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14, alignItems: "flex-start" }}>
            <div>
              <label style={lbl}>검수자 서명(이미지)</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="btn ghost" onClick={addSign} disabled={busy}>서명 올리기</button>
                {src(form.sign_path) && <img src={src(form.sign_path)} alt="sign" style={{ height: 40 }} />}
              </div>
            </div>
            <div
              style={{ flex: 1, minWidth: 240, borderRadius: 8, ...(dragOver ? { outline: "2px dashed var(--accent)", outlineOffset: 4, background: "var(--tint2)" } : {}) }}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); uploadFiles([...e.dataTransfer.files]); }}
            >
              <label style={lbl}>증빙사진</label>
              <button className="btn ghost" onClick={addPhoto} disabled={busy}>+ 사진 추가 (여러 장)</button>
              <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>
                PC: 파일을 여기에 끌어다 놓거나, 구글 포토 웹에서 '이미지 복사' 후 Ctrl+V
              </span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                {(form.photos || []).map(ph => (
                  <div key={ph.path} style={{ position: "relative", width: 120 }}>
                    {src(ph.path) ? <img src={src(ph.path)} alt="" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }} /> : <div style={{ width: 120, height: 90, background: "#eee", borderRadius: 6 }} />}
                    <button className="btn danger" style={{ position: "absolute", top: -6, right: -6, padding: "0 6px", fontSize: 11 }} aria-label="사진 삭제" onClick={() => delPhoto(ph.path)}>×</button>
                    <input value={ph.caption || ""} onChange={e => setCaption(ph.path, e.target.value)} placeholder="캡션(설명)" style={{ ...inp, width: 120, padding: 4, fontSize: 11, marginTop: 3 }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>}

      {/* 미리보기 (PDF 캡처 대상) — 접힘 상태에서는 렌더하지 않음(모바일 메모리 보호), PDF 생성 순간에만 임시 마운트 */}
      {form && tab === "insp" &&
        <div className="card" style={{ overflow: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--muted)", marginBottom: showPreview ? 6 : 0, cursor: "pointer", userSelect: "none" }} onClick={() => setShowPreview(v => !v)}>
            <b style={{ color: "var(--navy)" }}>{showPreview ? "▼" : "▶"} 미리보기</b> (이 모양대로 PDF 저장됩니다) — 클릭해서 {showPreview ? "접기" : "펼치기"}
          </div>
          {(showPreview || pdfRender) &&
          <div ref={certRef} style={!showPreview ? { position: "fixed", left: -10000, top: 0, width: 760 } : (isMobile ? ({ zoom: Math.min(1, (window.innerWidth - 60) / 720) } as any) : undefined)}>
            <div className="pdf-page" style={pageStyle}>
            <div style={{ textAlign: "right", fontSize: 11 }}>양식 4</div>
            <h2 style={{ textAlign: "center", letterSpacing: 10, margin: "4px 0 18px", fontSize: 24 }}>검 수 조 서</h2>
            <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 10 }}>
              <tbody>
                <tr><td style={{ ...bd, background: "#f4f4f4", width: 90, fontWeight: 700 }}>기업명</td><td style={bd}>{hdr.company}</td><td style={{ ...bd, background: "#f4f4f4", width: 90, fontWeight: 700 }}>협약기간</td><td style={bd}>{hdr.from} ~ {hdr.to}</td></tr>
                <tr><td style={{ ...bd, background: "#f4f4f4", fontWeight: 700 }}>공고명</td><td style={bd} colSpan={3}>{hdr.announce}</td></tr>
                <tr><td style={{ ...bd, background: "#f4f4f4", fontWeight: 700 }}>과제명</td><td style={bd} colSpan={3}>{hdr.task}</td></tr>
                <tr><td style={{ ...bd, background: "#f4f4f4", fontWeight: 700 }}>납품업체</td><td style={bd}>{form.vendor}</td><td style={{ ...bd, background: "#f4f4f4", fontWeight: 700 }}>납품장소</td><td style={bd}>{form.deliver_place}</td></tr>
              </tbody>
            </table>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>{["일련번호", "품 명", "규격", "단위", "수량", "단 가", "금 액", "비고"].map(h => <th key={h} style={{ ...bd, background: "#f4f4f4", textAlign: "center" }}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((it, idx) => (
                  <tr key={idx}>
                    <td style={{ ...bd, textAlign: "center" }}>{idx + 1}</td>
                    <td style={bd}>{it.name}</td>
                    <td style={bd}>{it.spec}</td>
                    <td style={{ ...bd, textAlign: "center" }}>{it.unit}</td>
                    <td style={{ ...bd, textAlign: "right" }}>{it.qty || 0}</td>
                    <td style={{ ...bd, textAlign: "right" }}>{won(it.price || 0)}</td>
                    <td style={{ ...bd, textAlign: "right" }}>{won(it.amount)}</td>
                    <td style={bd}>{it.note}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700 }}>
                  <td style={{ ...bd, textAlign: "center" }} colSpan={5}>합 계</td>
                  <td style={{ ...bd, textAlign: "right" }}>{won(sumPrice)}</td>
                  <td style={{ ...bd, textAlign: "right" }}>{won(sumAmount)}</td>
                  <td style={bd}></td>
                </tr>
              </tbody>
            </table>
            <div style={{ fontSize: 12, marginTop: 6 }}>※ ［첨부］ 증빙사진</div>
            <div style={{ textAlign: "center", margin: "26px 0 8px", fontSize: 15 }}>상기와 같이 검수함.</div>
            <div style={{ textAlign: "center", fontSize: 15, marginBottom: 16 }}>{dateKo(form.inspect_date)}</div>
            <div style={{ textAlign: "right", fontSize: 15 }}>
              검수자 : {form.inspector} &nbsp; <span style={{ position: "relative", display: "inline-block", padding: "0 6px", minWidth: 40, textAlign: "center" }}>{src(form.sign_path) && <img src={src(form.sign_path)} alt="" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", height: 48, pointerEvents: "none" }} />}(인)</span>
            </div>
            </div>
            {photoChunks.map((chunk, pi) => (
              <div className="pdf-page" style={pageStyle} key={pi}>
                <div style={{ textAlign: "right", fontSize: 11 }}>양식 4</div>
                <h3 style={{ textAlign: "center", margin: "6px 0 14px" }}>증빙사진{photoChunks.length > 1 ? ` (${pi + 1}/${photoChunks.length})` : ""}</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  {chunk.map(ph => (
                    <figure key={ph.path} style={{ margin: 0, textAlign: "center" }}>
                      {src(ph.path) ? <img src={src(ph.path)} alt="" style={{ width: "100%", maxHeight: 380, objectFit: "contain", border: "1px solid #999" }} /> : null}
                      {ph.caption ? <figcaption style={{ fontSize: 12, color: "#000", marginTop: 4 }}>{ph.caption}</figcaption> : null}
                    </figure>
                  ))}
                </div>
              </div>
            ))}
          </div>}
        </div>}

      {tab === "settle" &&
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <h4 style={{ margin: 0 }}>정산내용 <span className="muted" style={{ fontSize: 12 }}>· {settleRows.length}건 · 합계 {won(settleTotal)}원</span></h4>
            <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={exportSettle}>📊 엑셀</button>
          </div>
          {settleRows.length === 0 ? <p className="muted">정산할 검수조서 품목이 없습니다. (검수조서를 저장하면 여기에 쌓입니다)</p> :
            <div style={{ overflow: "auto", maxHeight: "62vh" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
                <thead><tr>{["검수일자", "납품업체", "품명", "규격", "단위", "수량", "단가", "금액", "비고"].map(h => <th key={h} style={{ ...bd, background: "#f1f3f7" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {settlePaged.map((r, idx) => (
                    <tr key={idx}>
                      <td style={bd}>{r.date}</td><td style={bd}>{r.vendor}</td>
                      <td style={bd}>{r.name}</td><td style={bd}>{r.spec}</td><td style={{ ...bd, textAlign: "center" }}>{r.unit}</td>
                      <td style={{ ...bd, textAlign: "right" }}>{r.qty}</td><td style={{ ...bd, textAlign: "right" }}>{won(r.price)}</td>
                      <td style={{ ...bd, textAlign: "right", fontWeight: 700 }}>{won(r.amount)}</td><td style={bd}>{r.note}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700, background: "var(--tint)" }}><td style={bd} colSpan={7}>합 계</td><td style={{ ...bd, textAlign: "right" }}>{won(settleTotal)}</td><td style={bd}></td></tr>
                </tbody>
              </table>
              {settleRemaining > 0 && <button className="btn ghost" style={{ width: "100%", marginTop: 6 }} onClick={settleMore}>더 보기 (남은 {settleRemaining.toLocaleString()}건)</button>}
            </div>}
        </div>}
    </div>
  );
}
