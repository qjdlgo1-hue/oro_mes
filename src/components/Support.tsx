import { useEffect, useMemo, useRef, useState } from "react";
import { Project, Inspection, InspItem, listProjects, upsertProject, deleteProject, listInspections, upsertInspection, deleteInspection, storageUpload, storageBlobToDataUrl, logAudit } from "../lib/db";
import { can } from "../lib/perm";
import { toast } from "../lib/toast";
import { confirmDialog } from "../lib/confirm";
import * as XLSX from "xlsx";

const won = (n: number) => (Math.round(n) || 0).toLocaleString();
const todayIso = () => new Date().toISOString().slice(0, 10);
const dateKo = (iso?: string) => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return `${y}년 ${m}월 ${d}일`; };
const blankItem = (): InspItem => ({ name: "", spec: "", unit: "EA", qty: 0, price: 0, note: "" });
const normPhotos = (arr?: any[]): { path: string; caption?: string }[] => (arr || []).map(x => typeof x === "string" ? { path: x } : x);

export default function Support() {
  const canEdit = can("support.edit");
  const [projects, setProjects] = useState<Project[]>([]);
  const [insps, setInsps] = useState<Inspection[]>([]);
  const [pid, setPid] = useState<string>("");
  const [projEdit, setProjEdit] = useState<Project | null>(null);
  const [form, setForm] = useState<Inspection | null>(null);
  const [imgCache, setImgCache] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"insp" | "settle">("insp");
  const [settleAll, setSettleAll] = useState(false);
  const certRef = useRef<HTMLDivElement>(null);

  const loadP = () => listProjects().then(setProjects).catch(e => toast.error("과제 불러오기 실패: " + (e.message || e)));
  const loadI = () => listInspections().then(setInsps).catch(() => {});
  useEffect(() => { loadP(); loadI(); }, []);

  const project = projects.find(p => p.id === pid) || null;
  const projInsps = useMemo(() => insps.filter(i => i.project_id === pid), [insps, pid]);

  useEffect(() => {
    const paths: string[] = [];
    if (form?.sign_path) paths.push(form.sign_path);
    (form?.photos || []).forEach(ph => paths.push(ph.path));
    paths.forEach(p => { if (p && !imgCache[p]) storageBlobToDataUrl("coc", p).then(u => { if (u) setImgCache(c => ({ ...c, [p]: u })); }); });
    // eslint-disable-next-line
  }, [form]);
  const src = (path?: string) => (path ? imgCache[path] : undefined);

  // ---- projects ----
  function newProject() { setProjEdit({ name: "", announce: "", company: "오알오", vendor: "", period_from: "", period_to: "", note: "" }); }
  function editProject() { if (project) setProjEdit({ ...project }); }
  async function saveProject() {
    if (!projEdit) return; if (!projEdit.name?.trim()) { toast.error("과제명을 입력하세요."); return; }
    setBusy(true);
    try { const saved = await upsertProject(projEdit); await loadP(); setPid(saved.id!); setProjEdit(null); logAudit("과제 저장", "project", saved.id || "", { name: saved.name }); toast.success("과제 저장됨"); }
    catch (e: any) { toast.error("저장 실패: " + (e.message || e)); }
    setBusy(false);
  }
  async function removeProject() {
    if (!project) return;
    const n = projInsps.length;
    const ok = await confirmDialog({
      title: "공고 삭제",
      message: `공고 "${project.announce || project.name}" 를 삭제할까요?\n${n ? `이 공고의 검수조서 ${n}건도 함께 영구 삭제되며 복구할 수 없습니다.` : "복구할 수 없습니다."}`,
      danger: true, confirmLabel: n ? `공고+검수조서 ${n}건 삭제` : "삭제",
    });
    if (!ok) return;
    setBusy(true);
    try { await deleteProject(project.id!); setPid(""); setForm(null); await loadP(); await loadI(); toast.success("삭제됨"); }
    catch (e: any) { toast.error("삭제 실패: " + (e.message || e)); }
    setBusy(false);
  }

  // ---- inspection ----
  function newInsp() {
    if (!project) { toast.error("과제를 먼저 선택하세요."); return; }
    setForm({ project_id: project.id!, insp_no: "", deliver_place: project.company || "오알오", vendor: project.vendor || "", inspect_date: todayIso(), inspector: "", sign_path: "", items: [blankItem()], photos: [] });
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
    if (!form?.inspect_date || !project?.period_from || !project?.period_to) return true;
    return form.inspect_date >= project.period_from && form.inspect_date <= project.period_to;
  }, [form, project]);
  const settleRows = useMemo(() => {
    const list = insps.filter(i => settleAll ? true : i.project_id === pid);
    const out: { date: string; announce: string; task: string; vendor: string; name: string; spec: string; unit: string; qty: number; price: number; amount: number; note: string }[] = [];
    list.forEach(i => { const prj = projects.find(p => p.id === i.project_id); (i.items || []).forEach(it => { const qty = Number(it.qty) || 0, price = Number(it.price) || 0; out.push({ date: i.inspect_date || "", announce: prj?.announce || "", task: prj?.name || "", vendor: i.vendor || "", name: it.name || "", spec: it.spec || "", unit: it.unit || "", qty, price, amount: qty * price, note: it.note || "" }); }); });
    return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  }, [insps, projects, pid, settleAll]);
  const settleTotal = settleRows.reduce((s2, r) => s2 + r.amount, 0);
  function exportSettle() {
    if (!settleRows.length) { toast.error("정산할 데이터가 없습니다."); return; }
    const aoa: any[][] = [["검수일자", "공고명", "과제명", "납품업체", "품명", "규격", "단위", "수량", "단가", "금액", "비고"]];
    settleRows.forEach(r => aoa.push([r.date, r.announce, r.task, r.vendor, r.name, r.spec, r.unit, String(r.qty), String(r.price), String(r.amount), r.note]));
    aoa.push(["합계", "", "", "", "", "", "", "", "", String(settleTotal), ""]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "정산내용");
    XLSX.writeFile(wb, `정산내용_${settleAll ? "전체" : (project?.name || "").slice(0, 12)}.xlsx`);
    toast.success("엑셀 저장 완료");
  }

  function pickUpload(cb: (path: string) => void) {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.onchange = async () => { const file = inp.files?.[0]; if (!file) return; setBusy(true); try { const path = await storageUpload("coc", file); const u = await storageBlobToDataUrl("coc", path); if (u) setImgCache(c => ({ ...c, [path]: u })); cb(path); } catch (e: any) { toast.error("업로드 실패: " + (e.message || e)); } setBusy(false); };
    inp.click();
  }
  const addSign = () => pickUpload(path => setF({ sign_path: path }));
  const addPhoto = () => pickUpload(path => setForm(f => f ? { ...f, photos: [...(f.photos || []), { path, caption: "" }] } : f));
  const delPhoto = (path: string) => setForm(f => f ? { ...f, photos: (f.photos || []).filter(ph => ph.path !== path) } : f);
  const setCaption = (path: string, cap: string) => setForm(f => f ? { ...f, photos: (f.photos || []).map(ph => ph.path === path ? { ...ph, caption: cap } : ph) } : f);

  async function saveInsp() {
    if (!form) return;
    if (!withinPeriod && !(await confirmDialog({ title: "협약기간 확인", message: "검수일자가 협약기간을 벗어납니다. 그래도 저장할까요?", confirmLabel: "저장" }))) return;
    setBusy(true);
    try { const saved = await upsertInspection({ ...form, items: rows }); await loadI(); setForm({ ...saved, items: saved.items && saved.items.length ? saved.items : [blankItem()], photos: saved.photos || [] }); logAudit("검수조서 저장", "inspection", saved.id || "", {}); toast.success("검수조서 저장됨"); }
    catch (e: any) { toast.error("저장 실패: " + (e.message || e)); }
    setBusy(false);
  }
  async function removeInsp(i: Inspection) {
    if (!(await confirmDialog({ title: "검수조서 삭제", message: `${i.inspect_date || "-"} 검수조서(${(i.items || []).length}품목)를 삭제할까요?\n복구할 수 없습니다.`, danger: true, confirmLabel: "삭제" }))) return;
    setBusy(true);
    try { await deleteInspection(i.id!); await loadI(); if (form?.id === i.id) setForm(null); toast.success("삭제됨"); }
    catch (e: any) { toast.error("삭제 실패: " + (e.message || e)); }
    setBusy(false);
  }
  async function savePdf() {
    if (!form || !certRef.current || busy) return;
    setBusy(true);
    try {
      toast.info("PDF 만드는 중…");
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
      pdf.save(`검수조서_${clean(project?.name).slice(0, 16)}_${form.inspect_date || todayIso()}.pdf`);
      logAudit("검수조서 PDF", "inspection", form.id || "", {});
    } catch (e: any) { toast.error("PDF 생성 실패: " + (e.message || e)); }
    finally { setBusy(false); }
  }

  const inp: React.CSSProperties = { padding: 7, border: "1px solid var(--line)", borderRadius: 6, fontSize: 13 };
  const bd: React.CSSProperties = { border: "1px solid #333", padding: "4px 6px", fontSize: 12, color: "#111" };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, display: "block", marginBottom: 3 };
  const pageStyle: React.CSSProperties = { background: "#fff", color: "#000", padding: "28px 26px", width: 720, maxWidth: "100%", margin: "0 auto 16px", boxSizing: "border-box", minHeight: 1000, border: "1px solid #ddd", fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif" };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* 과제 선택/관리 */}
      <div className="card">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>🏛️ 지원사업 · 검수조서</h3>
          <select value={pid} onChange={e => { setPid(e.target.value); setForm(null); }} style={{ ...inp, minWidth: 260 }}>
            <option value="">공고 선택…</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.announce || p.name}</option>)}
          </select>
          {canEdit && <>
            <button className="btn ghost" onClick={newProject} disabled={busy}>+ 새 공고</button>
            {project && <button className="btn ghost" onClick={editProject} disabled={busy}>공고 수정</button>}
            {project && <button className="btn" style={{ background: "#c0392b" }} onClick={removeProject} disabled={busy}>공고 삭제</button>}
          </>}
        </div>
        {project && !projEdit &&
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            공고명: {project.announce || "-"} · 협약기간: {project.period_from || "-"} ~ {project.period_to || "-"} · 기업명: {project.company} · 납품업체(기본): {project.vendor || "-"}
          </p>}
        {projEdit &&
          <div style={{ marginTop: 12, background: "#f5f9ff", border: "1px solid #dbe7ff", borderRadius: 8, padding: 12, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
            <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>공고명</label><input style={{ ...inp, width: "100%" }} value={projEdit.announce || ""} onChange={e => setProjEdit({ ...projEdit, announce: e.target.value })} /></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>과제명 (필수)</label><input style={{ ...inp, width: "100%" }} value={projEdit.name} onChange={e => setProjEdit({ ...projEdit, name: e.target.value })} /></div>
            <div><label style={lbl}>기업명</label><input style={{ ...inp, width: "100%" }} value={projEdit.company || ""} onChange={e => setProjEdit({ ...projEdit, company: e.target.value })} /></div>
            <div><label style={lbl}>납품업체(기본)</label><input style={{ ...inp, width: "100%" }} value={projEdit.vendor || ""} onChange={e => setProjEdit({ ...projEdit, vendor: e.target.value })} /></div>
            <div><label style={lbl}>협약 시작일</label><input type="date" style={{ ...inp, width: "100%" }} value={projEdit.period_from || ""} onChange={e => setProjEdit({ ...projEdit, period_from: e.target.value })} /></div>
            <div><label style={lbl}>협약 종료일</label><input type="date" style={{ ...inp, width: "100%" }} value={projEdit.period_to || ""} onChange={e => setProjEdit({ ...projEdit, period_to: e.target.value })} /></div>
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
              <button className="btn green" onClick={saveProject} disabled={busy}>저장</button>
              <button className="btn ghost" onClick={() => setProjEdit(null)}>취소</button>
            </div>
          </div>}
      </div>

      {project &&
        <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", width: "fit-content" }}>
          <button className="btn" style={{ borderRadius: 0, background: tab === "insp" ? "#2563eb" : "#e7ebf1", color: tab === "insp" ? "#fff" : "#374151" }} onClick={() => setTab("insp")}>검수조서</button>
          <button className="btn" style={{ borderRadius: 0, background: tab === "settle" ? "#2563eb" : "#e7ebf1", color: tab === "settle" ? "#fff" : "#374151" }} onClick={() => setTab("settle")}>정산내용</button>
        </div>}
      {/* 저장된 검수조서 목록 */}
      {project && tab === "insp" &&
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <h4 style={{ margin: 0 }}>검수조서 목록 <span className="muted" style={{ fontSize: 12 }}>· {projInsps.length}건</span></h4>
            {canEdit && <button className="btn green" style={{ marginLeft: "auto" }} onClick={newInsp} disabled={busy}>+ 새 검수조서</button>}
          </div>
          {projInsps.length === 0 ? <p className="muted">아직 저장된 검수조서가 없습니다.</p> :
            <div style={{ display: "grid", gap: 6 }}>
              {projInsps.map(i => (
                <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 6, fontSize: 13, background: form?.id === i.id ? "#eff6ff" : "#fff" }}>
                  <b>{i.inspect_date || "-"}</b>
                  <span className="muted">검수자 {i.inspector || "-"} · {(i.items || []).length}품목 · 사진 {(i.photos || []).length}</span>
                  <button className="btn ghost" style={{ marginLeft: "auto", padding: "2px 10px", fontSize: 12 }} onClick={() => loadInsp(i)}>열기</button>
                  {canEdit && <button className="btn ghost" style={{ padding: "2px 10px", fontSize: 12, color: "#c0392b" }} onClick={() => removeInsp(i)}>삭제</button>}
                </div>
              ))}
            </div>}
        </div>}

      {/* 편집 폼 */}
      {form && project && tab === "insp" &&
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
                <tr style={{ fontWeight: 700, background: "#eef3f9" }}>
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
            <div style={{ flex: 1, minWidth: 240 }}>
              <label style={lbl}>증빙사진</label>
              <button className="btn ghost" onClick={addPhoto} disabled={busy}>+ 사진 추가</button>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                {(form.photos || []).map(ph => (
                  <div key={ph.path} style={{ position: "relative", width: 120 }}>
                    {src(ph.path) ? <img src={src(ph.path)} alt="" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }} /> : <div style={{ width: 120, height: 90, background: "#eee", borderRadius: 6 }} />}
                    <button className="btn" style={{ position: "absolute", top: -6, right: -6, padding: "0 6px", background: "#c0392b", fontSize: 11 }} onClick={() => delPhoto(ph.path)}>×</button>
                    <input value={ph.caption || ""} onChange={e => setCaption(ph.path, e.target.value)} placeholder="캡션(설명)" style={{ ...inp, width: 120, padding: 4, fontSize: 11, marginTop: 3 }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>}

      {/* 미리보기 (PDF 캡처 대상) */}
      {form && project && tab === "insp" &&
        <div className="card" style={{ overflow: "auto" }}>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>미리보기 (이 모양대로 PDF 저장됩니다)</div>
          <div ref={certRef}>
            <div className="pdf-page" style={pageStyle}>
            <div style={{ textAlign: "right", fontSize: 11 }}>양식 4</div>
            <h2 style={{ textAlign: "center", letterSpacing: 10, margin: "4px 0 18px", fontSize: 24 }}>검 수 조 서</h2>
            <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 10 }}>
              <tbody>
                <tr><td style={{ ...bd, background: "#f4f4f4", width: 90, fontWeight: 700 }}>기업명</td><td style={bd}>{project.company}</td><td style={{ ...bd, background: "#f4f4f4", width: 90, fontWeight: 700 }}>협약기간</td><td style={bd}>{project.period_from} ~ {project.period_to}</td></tr>
                <tr><td style={{ ...bd, background: "#f4f4f4", fontWeight: 700 }}>공고명</td><td style={bd} colSpan={3}>{project.announce || ""}</td></tr>
                <tr><td style={{ ...bd, background: "#f4f4f4", fontWeight: 700 }}>과제명</td><td style={bd} colSpan={3}>{project.name}</td></tr>
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
          </div>
        </div>}
      {project && tab === "settle" &&
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <h4 style={{ margin: 0 }}>정산내용 {settleAll ? "(전체 과제)" : ""} <span className="muted" style={{ fontSize: 12 }}>· {settleRows.length}건 · 합계 {won(settleTotal)}원</span></h4>
            <label style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={settleAll} onChange={e => setSettleAll(e.target.checked)} /> 전체 과제 합산</label>
            <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={exportSettle}>📊 엑셀</button>
          </div>
          {settleRows.length === 0 ? <p className="muted">정산할 검수조서 품목이 없습니다. (검수조서를 저장하면 여기에 쌓입니다)</p> :
            <div style={{ overflow: "auto", maxHeight: "62vh" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
                <thead><tr>{["검수일자", "공고명", "과제명", "납품업체", "품명", "규격", "단위", "수량", "단가", "금액", "비고"].map(h => <th key={h} style={{ ...bd, background: "#f1f3f7" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {settleRows.map((r, idx) => (
                    <tr key={idx}>
                      <td style={bd}>{r.date}</td><td style={bd}>{r.announce}</td><td style={bd}>{r.task}</td><td style={bd}>{r.vendor}</td>
                      <td style={bd}>{r.name}</td><td style={bd}>{r.spec}</td><td style={{ ...bd, textAlign: "center" }}>{r.unit}</td>
                      <td style={{ ...bd, textAlign: "right" }}>{r.qty}</td><td style={{ ...bd, textAlign: "right" }}>{won(r.price)}</td>
                      <td style={{ ...bd, textAlign: "right", fontWeight: 700 }}>{won(r.amount)}</td><td style={bd}>{r.note}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700, background: "#eef3f9" }}><td style={bd} colSpan={9}>합 계</td><td style={{ ...bd, textAlign: "right" }}>{won(settleTotal)}</td><td style={bd}></td></tr>
                </tbody>
              </table>
            </div>}
        </div>}
    </div>
  );
}
