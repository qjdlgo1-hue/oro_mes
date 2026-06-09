import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Receipt } from "../lib/types";
import { listReceipts, addReceipt, deleteReceipt, readReceiptAI, receiptSignedUrl, receiptImageBlob, logAudit } from "../lib/db";
import { can } from "../lib/perm";
import { toast } from "../lib/toast";
import { useIsMobile } from "../lib/useIsMobile";

type QItem = Receipt & { file?: File };
const ACCOUNTS = ["복리후생비", "여비교통비", "소모품비", "접대비", "통신비", "운반비", "수수료", "기타"];
const TYPES = ["카드", "세금계산서", "현금영수증", "간이영수증"];
const won = (n: any) => (Number(n) || 0).toLocaleString("ko-KR");
const todayIso = () => new Date().toISOString().slice(0, 10);
const emptyForm = (): Receipt => ({ rdate: todayIso(), vendor: "", bizno: "", supply: 0, vat: 0, total: 0, rtype: "카드", account: "복리후생비", memo: "" });
function quarterOf(rdate: string) { const y = rdate.slice(0, 4); const m = +rdate.slice(5, 7); return `${y}-${m <= 6 ? 1 : 2}기`; }
function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = () => rej(new Error("파일 읽기 실패")); r.readAsDataURL(file); });
}

export default function Receipts() {
  const canEdit = can("receipt.edit");
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<Receipt[]>([]);
  const [form, setForm] = useState<Receipt>(emptyForm());
  const [formFile, setFormFile] = useState<File | null>(null);
  const [queue, setQueue] = useState<QItem[]>([]);
  const [scanning, setScanning] = useState("");
  const [busy, setBusy] = useState(false);
  const [qFilter, setQFilter] = useState("전체");
  const [company, setCompany] = useState(localStorage.getItem("oro_rcpt_company") || "ORO 주식회사");
  const [period, setPeriod] = useState(localStorage.getItem("oro_rcpt_period") || "");
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  async function reload() { try { setRows(await listReceipts()); } catch (e: any) { toast.error("불러오기 실패: " + (e.message || e)); } }
  useEffect(() => { reload(); }, []);
  useEffect(() => { localStorage.setItem("oro_rcpt_company", company); }, [company]);
  useEffect(() => { localStorage.setItem("oro_rcpt_period", period); }, [period]);

  const quarters = useMemo(() => ["전체", ...[...new Set(rows.map(r => quarterOf(r.rdate)))].sort((a, b) => a < b ? 1 : -1)], [rows]);
  const shown = useMemo(() => (qFilter === "전체" ? rows : rows.filter(r => quarterOf(r.rdate) === qFilter)), [rows, qFilter]);
  const periodLabel = qFilter !== "전체" ? qFilter : period;
  const sumS = useMemo(() => shown.reduce((a, r) => a + Number(r.supply || 0), 0), [shown]);
  const sumV = useMemo(() => shown.reduce((a, r) => a + Number(r.vat || 0), 0), [shown]);
  const sumT = useMemo(() => shown.reduce((a, r) => a + Number(r.total || 0), 0), [shown]);

  function setField<K extends keyof Receipt>(k: K, v: Receipt[K]) { setForm(f => ({ ...f, [k]: v })); }
  function onTotal(v: number) { const supply = v > 0 ? Math.round(v / 1.1) : 0; setForm(f => ({ ...f, total: v, supply, vat: v > 0 ? v - supply : 0 })); }

  async function add(r?: QItem) {
    const rec = r || form;
    const file = r ? r.file : (formFile || undefined);
    if (!rec.vendor.trim()) { toast.error("거래처명을 입력하세요."); return; }
    if (!(Number(rec.total) > 0)) { toast.error("합계금액을 입력하세요."); return; }
    let supply = Number(rec.supply) || 0, vat = Number(rec.vat) || 0;
    if (!supply) { supply = Math.round(Number(rec.total) / 1.1); vat = Number(rec.total) - supply; }
    setBusy(true);
    try {
      await addReceipt({ ...rec, supply, vat, total: Number(rec.total), company, period }, file);
      await logAudit("증빙 추가", "receipt", "", { vendor: rec.vendor, total: rec.total, image: !!file });
      toast.success("목록에 추가됨" + (file ? " (원본 저장)" : "")); if (!r) { setForm(emptyForm()); setFormFile(null); } await reload();
    } catch (e: any) { toast.error("저장 실패: " + (e.message || e)); }
    setBusy(false);
  }
  async function del(r: Receipt) {
    if (!r.id) return;
    if (!confirm("이 증빙(원본 포함)을 삭제할까요?")) return;
    setBusy(true);
    try { await deleteReceipt(r.id, r.image_path); await logAudit("증빙 삭제", "receipt", r.id, {}); toast.success("삭제됨"); await reload(); }
    catch (e: any) { toast.error("삭제 실패: " + (e.message || e)); }
    setBusy(false);
  }
  async function viewOriginal(path: string) {
    try { const url = await receiptSignedUrl(path); if (url) window.open(url, "_blank"); else toast.error("원본을 열 수 없습니다."); }
    catch (e: any) { toast.error("원본 열기 실패: " + (e.message || e)); }
  }

  async function processFiles(files: File[]) {
    files = files.filter(f => f.type.startsWith("image/"));
    if (!files.length) { toast.error("이미지 파일을 선택하세요."); return; }
    const found: QItem[] = [];
    for (let i = 0; i < files.length; i++) {
      setScanning(`AI가 영수증을 읽고 있어요... (${i + 1}/${files.length})`);
      try {
        const b64 = await fileToBase64(files[i]);
        const rec = await readReceiptAI(b64, files[i].type || "image/jpeg");
        let total = Number(rec["합계"]) || 0, supply = Number(rec["공급가액"]) || 0, vat = Number(rec["부가세"]) || 0;
        if (total && !supply) { supply = Math.round(total / 1.1); vat = total - supply; }
        found.push({ rdate: rec["거래일자"] || todayIso(), vendor: rec["거래처명"] || "", bizno: rec["사업자번호"] || "", supply, vat, total, rtype: rec["증빙유형"] || "카드", account: rec["계정과목"] || "기타", memo: rec["비고"] || "", file: files[i] });
      } catch (err: any) { toast.error(`${i + 1}번째 사진 인식 실패: ${err.message || err}`); }
    }
    setScanning(""); setQueue(q => [...q, ...found]);
    if (found.length) toast.success(`${found.length}건 인식됨 — 확인 후 추가하세요 (원본 자동 보관)`);
  }
  function onFiles(e: React.ChangeEvent<HTMLInputElement>) { processFiles(Array.from(e.target.files || [])); e.target.value = ""; }
  function onDrop(e: React.DragEvent) { e.preventDefault(); processFiles(Array.from(e.dataTransfer.files || [])); }

  function exportExcel() {
    if (!shown.length) { toast.error("내보낼 데이터가 없어요."); return; }
    const header = ["번호", "거래일자", "거래처명", "사업자번호", "공급가액", "부가세", "합계", "증빙유형", "계정과목", "비고", "원본"];
    const data = shown.map((r, i) => [i + 1, r.rdate, r.vendor, r.bizno, r.supply, r.vat, r.total, r.rtype, r.account, r.memo, r.image_path ? "있음" : ""]);
    data.push([] as any); data.push(["", "", "【합계】", "", sumS, sumV, sumT, "", "", "", ""] as any);
    const aoa = [[company + " 증빙 자료"], ["대상기간", periodLabel], [], header, ...data];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    (ws as any)["!cols"] = [{ wch: 5 }, { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 6 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "증빙장부");
    XLSX.writeFile(wb, `증빙장부_${periodLabel || todayIso()}.xlsx`);
  }

  async function pdfSummary() {
    if (!shown.length) { toast.error("내보낼 데이터가 없어요."); return; }
    if (!summaryRef.current) return;
    try {
      toast.success("PDF 요약본 만드는 중…");
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
      const canvas = await html2canvas(summaryRef.current, { scale: 2, backgroundColor: "#ffffff" });
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(); const m = 10; const iw = pw - m * 2;
      const pagePx = Math.floor((ph - m * 2) * canvas.width / iw); let sY = 0, first = true;
      while (sY < canvas.height) {
        const h = Math.min(pagePx, canvas.height - sY);
        const slice = document.createElement("canvas"); slice.width = canvas.width; slice.height = h;
        slice.getContext("2d")!.drawImage(canvas, 0, sY, canvas.width, h, 0, 0, canvas.width, h);
        if (!first) pdf.addPage();
        pdf.addImage(slice.toDataURL("image/jpeg", 0.95), "JPEG", m, m, iw, h * iw / canvas.width);
        sY += h; first = false;
      }
      pdf.save(`증빙요약_${periodLabel || todayIso()}.pdf`);
    } catch (e: any) { toast.error("PDF 생성 실패: " + (e.message || e)); }
  }

  async function zipOriginals() {
    const withImg = shown.filter(r => r.image_path);
    if (!withImg.length) { toast.error("원본이 저장된 항목이 없습니다."); return; }
    setBusy(true);
    try {
      toast.success(`원본 ${withImg.length}건 압축 중…`);
      const JSZip = (await import("jszip")).default; const zip = new JSZip();
      for (const r of withImg) {
        const blob = await receiptImageBlob(r.image_path!);
        if (blob) { const ext = (r.image_path!.split(".").pop() || "jpg"); const safe = (r.vendor || "미상").replace(/[\\/:*?"<>|]/g, ""); zip.file(`${r.rdate}_${safe}_${r.total}.${ext}`, blob); }
      }
      const out = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(out); a.download = `증빙원본_${periodLabel || "전체"}.zip`; a.click();
      logAudit("증빙 원본 ZIP", "receipt", "", { count: withImg.length, q: periodLabel });
    } catch (e: any) { toast.error("ZIP 실패: " + (e.message || e)); }
    setBusy(false);
  }

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 };
  const fin: React.CSSProperties = { width: "100%", padding: 8, border: "1px solid var(--line)", borderRadius: 6, marginBottom: 10 };
  const cell: React.CSSProperties = { border: "1px solid #eee", padding: "4px 6px", fontSize: 12 };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
        <div style={{ flex: 1, minWidth: 180 }}><label style={lbl}>회사명</label><input style={{ ...fin, marginBottom: 0 }} value={company} onChange={e => setCompany(e.target.value)} /></div>
        <div style={{ flex: 1, minWidth: 180 }}><label style={lbl}>대상기간(메모)</label><input style={{ ...fin, marginBottom: 0 }} placeholder="예: 2026년 1기 (1~6월)" value={period} onChange={e => setPeriod(e.target.value)} /></div>
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "380px 1fr", alignItems: "start" }} className="rcpt-grid">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>📷 영수증 사진 인식 (AI)</h3>
          {canEdit ? <>
            <div onClick={() => galRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={onDrop}
              style={{ border: "2px dashed #b9c2d0", borderRadius: 10, padding: 18, textAlign: "center", cursor: "pointer", color: "#6b7280" }}>
              <div style={{ fontSize: 28 }}>🖼️</div>갤러리에서 선택 / 파일 끌어다 놓기<div style={{ fontSize: 11 }}>여러 장 가능 · AI 인식 + 원본 자동 보관</div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => camRef.current?.click()}>📷 사진 촬영</button>
              <button className="btn ghost" style={{ flex: 1 }} onClick={() => galRef.current?.click()}>🖼️ 갤러리에서 선택</button>
            </div>
            <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onFiles} style={{ display: "none" }} />
            <input ref={galRef} type="file" accept="image/*" multiple onChange={onFiles} style={{ display: "none" }} />
            {scanning && <p style={{ color: "#3b5e8c", fontSize: 13, marginTop: 10 }}>⏳ {scanning}</p>}
          </> : <p className="muted">증빙 입력 권한이 없습니다(보기 전용).</p>}

          {queue.length > 0 &&
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: "#3b5e8c", fontWeight: 700, marginBottom: 6 }}>📷 인식된 {queue.length}건 — 확인 후 추가</div>
              {queue.map((r, i) => (
                <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 8, marginBottom: 6, fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}><span>{r.vendor || "(거래처 미상)"}</span><span>{won(r.total)}원</span></div>
                  <div style={{ color: "#6b7280" }}>{r.rdate} · {r.rtype} · {r.account}{r.memo ? ` · ⚠ ${r.memo}` : ""}{r.file ? " · 📎원본" : ""}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button className="btn ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => { setForm({ ...r }); setFormFile(r.file || null); setQueue(q => q.filter((_, x) => x !== i)); }}>입력칸으로</button>
                    <button className="btn green" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => { add(r); setQueue(q => q.filter((_, x) => x !== i)); }}>바로 추가</button>
                    <button className="btn" style={{ fontSize: 11, padding: "3px 8px", background: "#9aa3af" }} onClick={() => setQueue(q => q.filter((_, x) => x !== i))}>버리기</button>
                  </div>
                </div>
              ))}
            </div>}

          <div style={{ height: 1, background: "var(--line)", margin: "14px 0" }} />
          <h3 style={{ marginTop: 0 }}>✎ 직접 입력 / 확인·수정</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={lbl}>거래일자</label><input type="date" style={fin} value={form.rdate} onChange={e => setField("rdate", e.target.value)} /></div>
            <div><label style={lbl}>증빙유형</label><select style={fin} value={form.rtype} onChange={e => setField("rtype", e.target.value)}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
          </div>
          <label style={lbl}>거래처명</label><input style={fin} placeholder="예: 하나로마트" value={form.vendor} onChange={e => setField("vendor", e.target.value)} />
          <label style={lbl}>사업자번호 (있으면)</label><input style={fin} placeholder="123-45-67890" value={form.bizno} onChange={e => setField("bizno", e.target.value)} />
          <label style={lbl}>합계금액 (실제 결제액)</label><input type="number" inputMode="numeric" style={fin} placeholder="11000" value={form.total || ""} onChange={e => onTotal(Number(e.target.value))} />
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: -6, marginBottom: 8 }}>합계만 넣으면 공급가액·부가세 자동 역산(÷1.1)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={lbl}>공급가액</label><input type="number" inputMode="numeric" style={fin} value={form.supply || ""} onChange={e => setField("supply", Number(e.target.value))} /></div>
            <div><label style={lbl}>부가세</label><input type="number" inputMode="numeric" style={fin} value={form.vat || ""} onChange={e => setField("vat", Number(e.target.value))} /></div>
          </div>
          <label style={lbl}>계정과목</label><select style={fin} value={form.account} onChange={e => setField("account", e.target.value)}>{ACCOUNTS.map(a => <option key={a}>{a}</option>)}</select>
          {form.account === "접대비" && <div style={{ fontSize: 11, color: "#b45309", marginTop: -6, marginBottom: 8 }}>⚠ 접대비는 비고에 "누구와/왜"를 꼭 적어주세요(소명 대비).</div>}
          <label style={lbl}>비고</label><input style={fin} placeholder="원본파일명/용도, 불공제 등" value={form.memo} onChange={e => setField("memo", e.target.value)} />
          {canEdit && <>
            <label style={lbl}>원본 사진 첨부 (선택)</label>
            <input ref={attachRef} type="file" accept="image/*" onChange={e => setFormFile(e.target.files?.[0] || null)} style={{ marginBottom: 8 }} />
            {formFile && <div style={{ fontSize: 11, color: "#1aa260", marginBottom: 8 }}>📎 {formFile.name} — 추가 시 원본 보관됨</div>}
            <button className="btn" style={{ width: "100%" }} disabled={busy} onClick={() => add()}>목록에 추가</button>
          </>}
          <button className="btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => { setForm(emptyForm()); setFormFile(null); }}>입력칸 비우기</button>
        </div>

        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>≡ 증빙 목록 {shown.length ? `(${shown.length}건)` : ""}</h3>
            <select value={qFilter} onChange={e => setQFilter(e.target.value)} style={{ padding: 6 }}>{quarters.map(q => <option key={q} value={q}>{q}</option>)}</select>
            <button className="btn green" onClick={exportExcel}>📊 엑셀</button>
            <button className="btn" onClick={pdfSummary}>📄 PDF 요약본</button>
            <button className="btn ghost" disabled={busy} onClick={zipOriginals}>🗂 원본 ZIP</button>
          </div>

          {isMobile ? (
            <div>
              {shown.length === 0 ? <p className="muted">증빙이 없어요.</p> :
                shown.map(r => {
                  const warn = r.memo && (r.memo.includes("확인") || r.memo.includes("추정"));
                  return (
                    <div className="mcard" key={r.id}>
                      <div className="mrow"><span className="k">{r.rdate} · {quarterOf(r.rdate)}</span><span className="v">{won(r.total)}원</span></div>
                      <div className="mrow"><span className="k">거래처</span><span className="v">{r.vendor}</span></div>
                      <div className="mrow"><span className="k">유형 / 계정</span><span className="v" style={{ fontWeight: 400 }}>{r.rtype} · {r.account}</span></div>
                      <div className="mrow"><span className="k">공급가액 / 부가세</span><span className="v" style={{ fontWeight: 400 }}>{won(r.supply)} / {won(r.vat)}</span></div>
                      {r.memo ? <div className="mrow"><span className="k">비고</span><span className="v" style={{ color: warn ? "#b45309" : "#6b7280", fontWeight: 400 }}>{r.memo}</span></div> : null}
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        {r.image_path && <button className="btn ghost" style={{ flex: 1 }} onClick={() => viewOriginal(r.image_path!)}>📎 원본 보기</button>}
                        {canEdit && <button className="btn" style={{ background: "#c0392b", flex: 1 }} onClick={() => del(r)}>삭제</button>}
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div style={{ overflow: "auto", maxHeight: "55vh" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr>{["일자", "분기", "거래처", "유형", "공급가액", "부가세", "합계", "계정과목", "비고", "원본", ""].map(h =>
                  <th key={h} style={{ ...cell, background: "#1f3a5f", color: "#fff", position: "sticky", top: 0 }}>{h}</th>)}</tr></thead>
                <tbody>
                  {shown.length === 0 ? <tr><td colSpan={11} style={{ ...cell, textAlign: "center", color: "#6b7280", padding: 30 }}>증빙이 없어요. 사진을 올리거나 직접 입력하세요.</td></tr> :
                    shown.map(r => {
                      const warn = r.memo && (r.memo.includes("확인") || r.memo.includes("추정"));
                      return (
                        <tr key={r.id}>
                          <td style={cell}>{r.rdate}</td><td style={cell}>{quarterOf(r.rdate)}</td><td style={cell}>{r.vendor}</td>
                          <td style={cell}><span style={{ background: "#eef2f7", borderRadius: 4, padding: "1px 6px" }}>{r.rtype}</span></td>
                          <td style={{ ...cell, textAlign: "right" }}>{won(r.supply)}</td><td style={{ ...cell, textAlign: "right" }}>{won(r.vat)}</td><td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{won(r.total)}</td>
                          <td style={cell}>{r.account}</td>
                          <td style={{ ...cell, color: warn ? "#b45309" : "#6b7280" }}>{warn ? `⚠ ${r.memo}` : r.memo}</td>
                          <td style={{ ...cell, textAlign: "center" }}>{r.image_path ? <button className="btn ghost" style={{ padding: "1px 7px", fontSize: 11 }} onClick={() => viewOriginal(r.image_path!)}>보기</button> : <span style={{ color: "#c0392b" }}>없음</span>}</td>
                          <td style={cell}>{canEdit && <button className="btn" style={{ background: "#c0392b", padding: "1px 7px", fontSize: 12 }} onClick={() => del(r)}>×</button>}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: "flex", gap: 24, marginTop: 14, padding: "12px 16px", background: "#e6f0ea", borderRadius: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13 }}>건수 <b style={{ display: "block", fontSize: 18, color: "#2f6f4f" }}>{shown.length}건</b></div>
            <div style={{ fontSize: 13 }}>공급가액 합 <b style={{ display: "block", fontSize: 18, color: "#2f6f4f" }}>{won(sumS)}</b></div>
            <div style={{ fontSize: 13 }}>부가세 합 <b style={{ display: "block", fontSize: 18, color: "#2f6f4f" }}>{won(sumV)}</b></div>
            <div style={{ fontSize: 13 }}>총 합계 <b style={{ display: "block", fontSize: 18, color: "#2f6f4f" }}>{won(sumT)}</b></div>
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>※ 원본 '없음'은 5년 보관 대비 위험 — 사진으로 추가하면 자동 보관됩니다. 세무사 전달: 엑셀 + PDF 요약본 + 원본 ZIP.</p>
        </div>
      </div>

      {/* PDF 요약본용 오프스크린 */}
      <div ref={summaryRef} style={{ position: "fixed", left: -10000, top: 0, width: 760, background: "#fff", padding: 24, fontFamily: "'Malgun Gothic',sans-serif" }}>
        <h2 style={{ color: "#1f3a5f", margin: "0 0 4px" }}>{company} 증빙 요약</h2>
        <div style={{ color: "#555", fontSize: 13, marginBottom: 12 }}>대상기간: {periodLabel || "전체"} · 출력일 {todayIso()}</div>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead><tr>{["번호", "거래일자", "거래처", "유형", "공급가액", "부가세", "합계", "계정과목", "비고"].map(h =>
            <th key={h} style={{ border: "1px solid #aaa", padding: "4px 6px", background: "#1f3a5f", color: "#fff" }}>{h}</th>)}</tr></thead>
          <tbody>
            {shown.map((r, i) => <tr key={r.id}>
              <td style={{ border: "1px solid #ccc", padding: "3px 6px", textAlign: "center" }}>{i + 1}</td>
              <td style={{ border: "1px solid #ccc", padding: "3px 6px" }}>{r.rdate}</td>
              <td style={{ border: "1px solid #ccc", padding: "3px 6px" }}>{r.vendor}</td>
              <td style={{ border: "1px solid #ccc", padding: "3px 6px" }}>{r.rtype}</td>
              <td style={{ border: "1px solid #ccc", padding: "3px 6px", textAlign: "right" }}>{won(r.supply)}</td>
              <td style={{ border: "1px solid #ccc", padding: "3px 6px", textAlign: "right" }}>{won(r.vat)}</td>
              <td style={{ border: "1px solid #ccc", padding: "3px 6px", textAlign: "right" }}>{won(r.total)}</td>
              <td style={{ border: "1px solid #ccc", padding: "3px 6px" }}>{r.account}</td>
              <td style={{ border: "1px solid #ccc", padding: "3px 6px" }}>{r.memo}</td>
            </tr>)}
            <tr style={{ fontWeight: 700, background: "#e6f0ea" }}>
              <td colSpan={4} style={{ border: "1px solid #aaa", padding: "5px 6px", textAlign: "center" }}>【합계】 {shown.length}건</td>
              <td style={{ border: "1px solid #aaa", padding: "5px 6px", textAlign: "right" }}>{won(sumS)}</td>
              <td style={{ border: "1px solid #aaa", padding: "5px 6px", textAlign: "right" }}>{won(sumV)}</td>
              <td style={{ border: "1px solid #aaa", padding: "5px 6px", textAlign: "right" }}>{won(sumT)}</td>
              <td colSpan={2} style={{ border: "1px solid #aaa" }}></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
