import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Receipt } from "../lib/types";
import { listReceipts, addReceipt, deleteReceipt, readReceiptAI, logAudit } from "../lib/db";
import { can } from "../lib/perm";
import { toast } from "../lib/toast";

const ACCOUNTS = ["복리후생비", "여비교통비", "소모품비", "접대비", "통신비", "운반비", "수수료", "기타"];
const TYPES = ["카드", "세금계산서", "현금영수증", "간이영수증"];
const won = (n: any) => (Number(n) || 0).toLocaleString("ko-KR");
const todayIso = () => new Date().toISOString().slice(0, 10);
const emptyForm = (): Receipt => ({ rdate: todayIso(), vendor: "", bizno: "", supply: 0, vat: 0, total: 0, rtype: "카드", account: "복리후생비", memo: "" });

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = () => rej(new Error("파일 읽기 실패")); r.readAsDataURL(file);
  });
}

export default function Receipts() {
  const canEdit = can("receipt.edit");
  const [rows, setRows] = useState<Receipt[]>([]);
  const [form, setForm] = useState<Receipt>(emptyForm());
  const [queue, setQueue] = useState<Receipt[]>([]);
  const [scanning, setScanning] = useState("");
  const [busy, setBusy] = useState(false);
  const [company, setCompany] = useState(localStorage.getItem("oro_rcpt_company") || "ORO 주식회사");
  const [period, setPeriod] = useState(localStorage.getItem("oro_rcpt_period") || "");
  const fileRef = useRef<HTMLInputElement>(null);

  async function reload() { try { setRows(await listReceipts()); } catch (e: any) { toast.error("불러오기 실패: " + (e.message || e)); } }
  useEffect(() => { reload(); }, []);
  useEffect(() => { localStorage.setItem("oro_rcpt_company", company); }, [company]);
  useEffect(() => { localStorage.setItem("oro_rcpt_period", period); }, [period]);

  function setField<K extends keyof Receipt>(k: K, v: Receipt[K]) { setForm(f => ({ ...f, [k]: v })); }
  function onTotal(v: number) {
    const supply = v > 0 ? Math.round(v / 1.1) : 0;
    setForm(f => ({ ...f, total: v, supply, vat: v > 0 ? v - supply : 0 }));
  }

  async function add(r?: Receipt) {
    const rec = r || form;
    if (!rec.vendor.trim()) { toast.error("거래처명을 입력하세요."); return; }
    if (!(Number(rec.total) > 0)) { toast.error("합계금액을 입력하세요."); return; }
    let supply = Number(rec.supply) || 0, vat = Number(rec.vat) || 0;
    if (!supply) { supply = Math.round(Number(rec.total) / 1.1); vat = Number(rec.total) - supply; }
    setBusy(true);
    try {
      await addReceipt({ ...rec, supply, vat, total: Number(rec.total), company, period });
      await logAudit("증빙 추가", "receipt", "", { vendor: rec.vendor, total: rec.total });
      toast.success("목록에 추가됨"); if (!r) setForm(emptyForm()); await reload();
    } catch (e: any) { toast.error("저장 실패: " + (e.message || e)); }
    setBusy(false);
  }
  async function del(id?: string) {
    if (!id) return;
    if (!confirm("이 증빙을 삭제할까요?")) return;
    setBusy(true);
    try { await deleteReceipt(id); await logAudit("증빙 삭제", "receipt", id, {}); toast.success("삭제됨"); await reload(); }
    catch (e: any) { toast.error("삭제 실패: " + (e.message || e)); }
    setBusy(false);
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []); if (!files.length) return;
    const found: Receipt[] = [];
    for (let i = 0; i < files.length; i++) {
      setScanning(`AI가 영수증을 읽고 있어요... (${i + 1}/${files.length})`);
      try {
        const b64 = await fileToBase64(files[i]);
        const rec = await readReceiptAI(b64, files[i].type || "image/jpeg");
        let total = Number(rec["합계"]) || 0, supply = Number(rec["공급가액"]) || 0, vat = Number(rec["부가세"]) || 0;
        if (total && !supply) { supply = Math.round(total / 1.1); vat = total - supply; }
        found.push({ rdate: rec["거래일자"] || todayIso(), vendor: rec["거래처명"] || "", bizno: rec["사업자번호"] || "", supply, vat, total, rtype: rec["증빙유형"] || "카드", account: rec["계정과목"] || "기타", memo: rec["비고"] || "" });
      } catch (err: any) { toast.error(`${i + 1}번째 사진 인식 실패: ${err.message || err}`); }
    }
    setScanning(""); setQueue(q => [...q, ...found]); e.target.value = "";
    if (found.length) toast.success(`${found.length}건 인식됨 — 확인 후 추가하세요`);
  }

  function exportExcel() {
    if (!rows.length) { toast.error("내보낼 데이터가 없어요."); return; }
    const header = ["번호", "거래일자", "거래처명", "사업자번호", "공급가액", "부가세", "합계", "증빙유형", "계정과목", "비고"];
    const data = rows.map((r, i) => [i + 1, r.rdate, r.vendor, r.bizno, r.supply, r.vat, r.total, r.rtype, r.account, r.memo]);
    data.push([] as any);
    data.push(["", "", "【합계】", "", sumS, sumV, sumT, "", "", ""] as any);
    const aoa = [[company + " 증빙 자료"], ["대상기간", period], [], header, ...data];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    (ws as any)["!cols"] = [{ wch: 5 }, { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "증빙장부");
    XLSX.writeFile(wb, `증빙장부_${todayIso()}.xlsx`);
  }

  const sumS = useMemo(() => rows.reduce((a, r) => a + Number(r.supply || 0), 0), [rows]);
  const sumV = useMemo(() => rows.reduce((a, r) => a + Number(r.vat || 0), 0), [rows]);
  const sumT = useMemo(() => rows.reduce((a, r) => a + Number(r.total || 0), 0), [rows]);

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 };
  const fin: React.CSSProperties = { width: "100%", padding: 8, border: "1px solid var(--line)", borderRadius: 6, marginBottom: 10 };
  const cell: React.CSSProperties = { border: "1px solid #eee", padding: "4px 6px", fontSize: 12 };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
        <div style={{ flex: 1, minWidth: 180 }}><label style={lbl}>회사명</label><input style={{ ...fin, marginBottom: 0 }} value={company} onChange={e => setCompany(e.target.value)} /></div>
        <div style={{ flex: 1, minWidth: 180 }}><label style={lbl}>대상기간</label><input style={{ ...fin, marginBottom: 0 }} placeholder="예: 2026년 1기 (1~6월)" value={period} onChange={e => setPeriod(e.target.value)} /></div>
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "380px 1fr", alignItems: "start" }} className="rcpt-grid">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>📷 영수증 사진 인식 (AI)</h3>
          {canEdit ? <>
            <div onClick={() => fileRef.current?.click()} style={{ border: "2px dashed #b9c2d0", borderRadius: 10, padding: 20, textAlign: "center", cursor: "pointer", color: "#6b7280" }}>
              <div style={{ fontSize: 28 }}>📷</div>사진 찍기 / 파일 올리기<div style={{ fontSize: 11 }}>여러 장 가능 · AI가 자동으로 읽어요</div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple onChange={onFiles} style={{ display: "none" }} />
            {scanning && <p style={{ color: "#3b5e8c", fontSize: 13, marginTop: 10 }}>⏳ {scanning}</p>}
          </> : <p className="muted">증빙 입력 권한이 없습니다(보기 전용).</p>}

          {queue.length > 0 &&
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: "#3b5e8c", fontWeight: 700, marginBottom: 6 }}>📷 인식된 {queue.length}건 — 확인 후 추가</div>
              {queue.map((r, i) => (
                <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 8, marginBottom: 6, fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}><span>{r.vendor || "(거래처 미상)"}</span><span>{won(r.total)}원</span></div>
                  <div style={{ color: "#6b7280" }}>{r.rdate} · {r.rtype} · {r.account}{r.memo ? ` · ⚠ ${r.memo}` : ""}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button className="btn ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => { setForm({ ...r }); setQueue(q => q.filter((_, x) => x !== i)); }}>입력칸으로</button>
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
          <label style={lbl}>합계금액 (실제 결제액)</label><input type="number" style={fin} placeholder="11000" value={form.total || ""} onChange={e => onTotal(Number(e.target.value))} />
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: -6, marginBottom: 8 }}>합계만 넣으면 공급가액·부가세 자동 역산(÷1.1)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={lbl}>공급가액</label><input type="number" style={fin} value={form.supply || ""} onChange={e => setField("supply", Number(e.target.value))} /></div>
            <div><label style={lbl}>부가세</label><input type="number" style={fin} value={form.vat || ""} onChange={e => setField("vat", Number(e.target.value))} /></div>
          </div>
          <label style={lbl}>계정과목</label><select style={fin} value={form.account} onChange={e => setField("account", e.target.value)}>{ACCOUNTS.map(a => <option key={a}>{a}</option>)}</select>
          <label style={lbl}>비고</label><input style={fin} placeholder="확인 필요한 항목 등" value={form.memo} onChange={e => setField("memo", e.target.value)} />
          {canEdit && <button className="btn" style={{ width: "100%" }} disabled={busy} onClick={() => add()}>목록에 추가</button>}
          <button className="btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => setForm(emptyForm())}>입력칸 비우기</button>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>≡ 증빙 목록 {rows.length ? `(${rows.length}건)` : ""}</h3>
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <button className="btn green" onClick={exportExcel}>📊 엑셀 다운로드</button>
          </div>
          <div style={{ overflow: "auto", maxHeight: "55vh" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>{["일자", "거래처", "유형", "공급가액", "부가세", "합계", "계정과목", "비고", ""].map(h =>
                <th key={h} style={{ ...cell, background: "#1f3a5f", color: "#fff", position: "sticky", top: 0 }}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.length === 0 ? <tr><td colSpan={9} style={{ ...cell, textAlign: "center", color: "#6b7280", padding: 30 }}>아직 증빙이 없어요. 사진을 올리거나 직접 입력하세요.</td></tr> :
                  rows.map(r => {
                    const warn = r.memo && (r.memo.includes("확인") || r.memo.includes("추정"));
                    return (
                      <tr key={r.id}>
                        <td style={cell}>{r.rdate}</td><td style={cell}>{r.vendor}</td>
                        <td style={cell}><span style={{ background: "#eef2f7", borderRadius: 4, padding: "1px 6px" }}>{r.rtype}</span></td>
                        <td style={{ ...cell, textAlign: "right" }}>{won(r.supply)}</td><td style={{ ...cell, textAlign: "right" }}>{won(r.vat)}</td><td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{won(r.total)}</td>
                        <td style={cell}>{r.account}</td>
                        <td style={{ ...cell, color: warn ? "#b45309" : "#6b7280" }}>{warn ? `⚠ ${r.memo}` : r.memo}</td>
                        <td style={cell}>{canEdit && <button className="btn" style={{ background: "#c0392b", padding: "1px 7px", fontSize: 12 }} onClick={() => del(r.id)}>×</button>}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 24, marginTop: 14, padding: "12px 16px", background: "#e6f0ea", borderRadius: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13 }}>건수 <b style={{ display: "block", fontSize: 18, color: "#2f6f4f" }}>{rows.length}건</b></div>
            <div style={{ fontSize: 13 }}>공급가액 합 <b style={{ display: "block", fontSize: 18, color: "#2f6f4f" }}>{won(sumS)}</b></div>
            <div style={{ fontSize: 13 }}>부가세 합 <b style={{ display: "block", fontSize: 18, color: "#2f6f4f" }}>{won(sumV)}</b></div>
            <div style={{ fontSize: 13 }}>총 합계 <b style={{ display: "block", fontSize: 18, color: "#2f6f4f" }}>{won(sumT)}</b></div>
          </div>
        </div>
      </div>
    </div>
  );
}
