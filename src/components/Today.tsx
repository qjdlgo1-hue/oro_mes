import { errMsg } from "../lib/errmsg";
import { todayIso } from "../lib/fmt";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Order, PlanEntry, CocData } from "../lib/types";
import { listPlans, listCocs, upsertPlan, logAudit, getLabelPacks, saveLabelPacks } from "../lib/db";
import { completionDate } from "../lib/plan";
import { can } from "../lib/perm";
import { toast } from "../lib/toast";
import { LabelOpts, loadLabelOpts, saveLabelOpts, calcCopies, packWeights, packSummary, printPowderLabels, powderLabelHtml, POWDER_LABEL_CSS } from "../lib/label";
import { parseModelCode } from "../lib/labelRules";

const p = (n: number) => String(n).padStart(2, "0");

export default function Today({ orders }: { orders: Order[] }) {
  const [plans, setPlans] = useState<Record<string, PlanEntry>>({});
  const [cocs, setCocs] = useState<Record<string, CocData>>({});
  const [tick, setTick] = useState(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncFail, setSyncFail] = useState(false);

  const load = useCallback(async () => {
    setSyncing(true);
    try {
      const [pl, co] = await Promise.all([listPlans(), listCocs()]);
      setPlans(pl); setCocs(co); setLastSync(new Date()); setSyncFail(false);
    } catch { setSyncFail(true); /* 다음 주기에 재시도 — 배지로 실패 표시 */ }
    setSyncing(false);
  }, []);

  // 마운트 시 + 30초마다 자동 + 화면을 다시 볼 때 자동 갱신 (현장 모니터에 띄워둬도 최신 유지)
  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    const onFocus = () => load();
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(iv); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  const canEdit = can("plan.edit");
  const T = todayIso();
  const oMap = useMemo(() => { const m: Record<string, Order> = {}; orders.forEach(o => m[o.id] = o); return m; }, [orders]);

  const groups = useMemo(() => {
    const today: { o: Order; p: PlanEntry; start: string; end: string }[] = [];
    const late: typeof today = [];
    const upcoming: typeof today = [];
    Object.values(plans).forEach(pl => {
      const o = oMap[pl.order_id]; if (!o || pl.done) return;
      const start = pl.start_date; const end = completionDate(pl)!;
      if (end < T) late.push({ o, p: pl, start, end });
      else if (start <= T && T <= end) today.push({ o, p: pl, start, end });
      else if (start > T && start <= addDays(T, 7)) upcoming.push({ o, p: pl, start, end });
    });
    const sort = (a: any, b: any) => a.end < b.end ? -1 : 1;
    today.sort(sort); late.sort(sort); upcoming.sort((a, b) => a.start < b.start ? -1 : 1);
    // COC 발행 필요: 생산 완료(done)인데 COC 미발행
    const cocNeeded = Object.values(plans).filter(pl => pl.done && oMap[pl.order_id] && !cocs[pl.order_id])
      .map(pl => oMap[pl.order_id]);
    return { today, late, upcoming, cocNeeded };
  }, [plans, cocs, oMap, T, tick]);

  // ---- 생산 라벨 (Conductive Powder 70×40mm — labelprintspec.md) ----
  const [labelOpts, setLabelOpts] = useState<LabelOpts>(loadLabelOpts);
  const [labelCfgOpen, setLabelCfgOpen] = useState(false);
  const setLabel = (patch: Partial<LabelOpts>) => setLabelOpts(o => { const n = { ...o, ...patch }; saveLabelOpts(n); return n; });
  // 거래처별 포장단위(New wt, g) — 여러 PC 공유를 위해 서버(app_settings)에 저장
  const [packs, setPacks] = useState<Record<string, number>>({});
  useEffect(() => { getLabelPacks().then(setPacks).catch(() => { /* 오프라인 등 — 기본 포장단위로 동작 */ }); }, []);
  const packOf = (o: Order) => packs[o.customer] || labelOpts.packDefault || 50;
  const qtyOf = (o: Order, pl?: PlanEntry) => (pl?.qty != null ? Number(pl.qty) : Number(o.qty)) || 0;

  // 🏷 인쇄 다이얼로그 — 포장단위·매수(자동계산, 수정 가능)·제조일 확인 후 인쇄
  const [labelDlg, setLabelDlg] = useState<{ o: Order; pl?: PlanEntry } | null>(null);
  const [dlgPack, setDlgPack] = useState("50");
  const [dlgCopies, setDlgCopies] = useState("1");
  const [dlgMfg, setDlgMfg] = useState(T);
  function openLabelDlg(o: Order, pl?: PlanEntry) {
    const pack = packOf(o);
    setDlgPack(String(pack));
    setDlgCopies(String(calcCopies(qtyOf(o, pl), pack)));
    setDlgMfg((pl && completionDate(pl)) || T);
    setLabelDlg({ o, pl });
  }

  // 거래처 기본 포장단위 저장 (달라졌을 때만)
  async function savePackDefault(customer: string, packG: number) {
    if (!customer || packs[customer] === packG) return;
    const np = { ...packs, [customer]: packG };
    setPacks(np);
    try { await saveLabelPacks(np); } catch (e: any) { toast.error("포장단위 저장 실패: " + errMsg(e)); }
  }

  async function markDone(pl: PlanEntry) {
    // 자동 라벨: 팝업 차단을 피하려고 클릭 직후(저장 전) 창을 먼저 열어둔다
    const labelWin = labelOpts.auto ? window.open("", "_blank", "width=520,height=420") : null;
    const np = { ...pl, done: true };
    setPlans(prev => ({ ...prev, [pl.order_id]: np })); setTick(t => t + 1);
    try {
      await upsertPlan(np);
      const o = oMap[pl.order_id]; logAudit("생산 완료", "plan", pl.order_id, { name: o?.name });
      toast.success(`완료 처리됨: ${oMap[pl.order_id]?.name || ""}${labelOpts.auto && labelWin ? " — 라벨 인쇄" : ""}`);
      if (labelOpts.auto && o) {
        // 모델명에서 라벨 정보를 못 읽는 제품(PIN·PM 등 파우더 외)은 자동 인쇄를 건너뛴다
        if (parseModelCode(o.name).s1 == null) {
          labelWin?.close();
          toast.info(`라벨 자동 인쇄 건너뜀 — 모델명에서 라벨 정보를 읽지 못함: ${o.name}`);
        } else {
          const pack = packOf(o), qty = qtyOf(o, np);
          // 나누어떨어지지 않으면 마지막 장만 나머지 무게 (예: 500g÷200g → 200g×2 + 100g×1)
          const weights = packWeights(qty, pack, calcCopies(qty, pack));
          try { printPowderLabels(o, { weights, mfgIso: completionDate(np) || T }, labelWin); }
          catch (e: any) { labelWin?.close(); toast.error("라벨 인쇄 실패: " + errMsg(e)); }
        }
      } else labelWin?.close();
    } catch (e: any) {
      labelWin?.close();
      setPlans(prev => ({ ...prev, [pl.order_id]: pl })); setTick(t => t + 1);
      toast.error("완료 저장 실패 — 다시 시도하세요: " + errMsg(e));
    }
  }

  const Row = ({ o, end, start, pl, late }: { o: Order; end: string; start: string; pl: PlanEntry; late?: boolean }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderBottom: "1px solid #f0f3f7" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700 }}>{o.name} <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 12 }}>· {o.spec}</span></div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>{o.customer} · {(pl.qty != null ? Number(pl.qty) : o.qty).toLocaleString()}g · 생산 {start.slice(5)}~{end.slice(5)}{late ? ` · 완료예정 ${end} 지남` : ""}</div>
      </div>
      <button className="btn ghost" style={{ fontSize: 12, padding: "5px 8px" }} title="생산 라벨 인쇄" onClick={() => openLabelDlg(o, pl)}>🏷</button>
      {canEdit && <button className="btn green" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => markDone(pl)}>완료</button>}
    </div>
  );

  const Section = ({ title, color, count, children }: any) => (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ background: color, color: "#fff", padding: "8px 12px", fontWeight: 700, fontSize: 14 }}>{title} · {count}건</div>
      {count === 0 ? <div className="muted" style={{ padding: 14 }}>없음 👍</div> : children}
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 1040, gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))" }}>
      <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, color: "var(--muted)" }}>
        <span><b style={{ color: "var(--accent)", fontSize: 16 }}>POP</b> <span style={{ fontSize: 12 }}>(현장 생산 현황)</span> · 오늘 <b style={{ color: "var(--accent)" }}>{T}</b> · 생산계획 일정 기준 (자동 갱신)</span>
        <button className="btn ghost" style={{ marginLeft: "auto", padding: "4px 12px", fontSize: 12 }} onClick={() => setLabelCfgOpen(v => !v)}>🏷 라벨 설정</button>
        <button className="btn ghost" style={{ padding: "4px 12px", fontSize: 12 }} onClick={load} disabled={syncing}>{syncing ? "갱신 중…" : "🔄 새로고침"}</button>
        {lastSync && <span style={{ fontSize: 11 }}>갱신 {lastSync.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · 30초마다 자동</span>}
        {syncFail && <span style={{ fontSize: 11, color: "#c0392b", fontWeight: 700 }}>⚠ 갱신 실패 — 최신 데이터가 아닐 수 있음</span>}
      </div>

      {labelCfgOpen && (() => {
        const ni: React.CSSProperties = { width: 64, padding: 5, border: "1px solid var(--line)", borderRadius: 5 };
        const customers = [...new Set(orders.map(o => o.customer).filter(Boolean))].sort();
        return (
        <div className="card" style={{ gridColumn: "1 / -1", padding: 12 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
            <b>🏷 생산 라벨 설정</b> <span className="muted" style={{ fontSize: 12 }}>Conductive Powder 70×40mm 롤 라벨</span>
            <label>기본 포장단위(g) <input type="number" min={1} value={labelOpts.packDefault} onChange={e => setLabel({ packDefault: Math.max(1, Number(e.target.value) || 50) })} style={ni} /></label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={labelOpts.auto} onChange={e => setLabel({ auto: e.target.checked })} /> <b>완료 처리 시 자동 인쇄</b></label>
          </div>
          {customers.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>거래처별 포장단위(g) <span className="muted" style={{ fontWeight: 400 }}>— 비우면 기본값 사용. 인쇄 매수 = 생산수량 ÷ 포장단위 (올림)</span></div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12.5 }}>
                {customers.map(c => (
                  <label key={c} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{c}
                    <input type="number" min={1} placeholder={String(labelOpts.packDefault)} value={packs[c] || ""} style={ni}
                      onChange={e => { const v = Number(e.target.value) || 0; setPacks(p => { const n = { ...p }; if (v > 0) n[c] = v; else delete n[c]; return n; }); }}
                      onBlur={() => saveLabelPacks(packs).catch((e: any) => toast.error("포장단위 저장 실패: " + errMsg(e)))} />
                  </label>
                ))}
              </div>
            </div>
          )}
          <p className="muted" style={{ fontSize: 11.5, margin: "8px 0 0", lineHeight: 1.7 }}>
            라벨은 <b>70×40mm</b> 고정입니다. 라벨 프린터(예: EPSON TM-C3500) 드라이버 용지 설정에 70×40mm를 등록하고,
            크롬 인쇄 대화상자에서 <b>여백 없음 · 배율 100% · 배경 그래픽 켜기</b>로 설정하세요.
            하단 색 띠는 모델명으로 자동 결정됩니다 (Ag 포함 → 노랑+회색, Ag 없음 → 전체 노랑).
            {" "}각 행의 🏷 버튼으로 미리보기·매수 수정 후 인쇄할 수 있습니다.<br />
            💡 <b>다이얼로그 없이 완전 자동 출력</b>: 현장 PC 크롬 바로가기에 <code>--kiosk-printing</code> 옵션 + 기본 프린터 지정 → 완료 버튼만 눌러도 라벨이 바로 나옵니다.
          </p>
        </div>
        );
      })()}

      <Section title="🔴 지연 (완료일 지났는데 미완료)" color="#c0392b" count={groups.late.length}>
        {groups.late.map(g => <Row key={g.o.id} {...g} pl={g.p} late />)}
      </Section>

      <Section title="🔵 오늘 생산" color="var(--accent)" count={groups.today.length}>
        {groups.today.map(g => <Row key={g.o.id} {...g} pl={g.p} />)}
      </Section>

      <Section title="🟢 COC 발행 필요 (생산완료 · 성적서 미발행)" color="var(--ok)" count={groups.cocNeeded.length}>
        {groups.cocNeeded.map(o => (
          <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderBottom: "1px solid #f0f3f7" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{o.name} <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 12 }}>· {o.spec}</span></div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{o.customer} · {o.qty.toLocaleString()}g</div>
            </div>
            <button className="btn ghost" style={{ fontSize: 12, padding: "5px 8px" }} title="생산 라벨 인쇄" onClick={() => openLabelDlg(o, plans[o.id])}>🏷</button>
            <button className="btn ghost" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => { window.location.hash = "coc/" + o.id; }}>📄 발행하기 →</button>
          </div>
        ))}
      </Section>

      <Section title="⚪ 다가오는 7일 생산 예정" color="#6b7f96" count={groups.upcoming.length}>
        {groups.upcoming.map(g => <Row key={g.o.id} {...g} pl={g.p} />)}
      </Section>

      {labelDlg && (() => {
        const { o, pl } = labelDlg;
        const parse = parseModelCode(o.name);
        const qty = qtyOf(o, pl);
        const packG = Math.max(1, Number(dlgPack) || 0);
        // 장별 무게 구성 — 자동 매수일 때만 마지막 장을 나머지로 분할 (예: 500g÷200g → 200g×2 + 100g×1)
        const weights = packWeights(qty, packG, Math.max(1, Math.min(500, Number(dlgCopies) || 1)));
        const ni: React.CSSProperties = { width: 90, padding: 6, border: "1px solid var(--line)", borderRadius: 6 };
        const doPrint = () => {
          // 클릭 직후 동기 open — 팝업 차단 회피
          const win = window.open("", "_blank", "width=560,height=460");
          try { printPowderLabels(o, { weights, mfgIso: dlgMfg || T }, win); }
          catch (e: any) { toast.error("라벨 인쇄 실패: " + errMsg(e)); }
          setLabelDlg(null);
          savePackDefault(o.customer, packG); // 이 거래처 기본 포장단위로 기억
        };
        return (
          <div onClick={() => setLabelDlg(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
              style={{ background: "#fff", borderRadius: 10, padding: "16px 18px", width: "100%", maxWidth: 480, boxShadow: "0 8px 30px rgba(0,0,0,.3)", maxHeight: "92vh", overflow: "auto" }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>🏷 라벨 인쇄 — {o.name}</div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{o.customer} · 생산수량 {qty.toLocaleString()}g</div>
              {parse.s1 == null
                ? <div style={{ fontSize: 12.5, background: "#fdf3e7", border: "1px solid #e6a23c", borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>⚠ 모델명에서 사이즈·도금 정보를 읽지 못했습니다. 파우더 제품 라벨 대상인지 확인하세요 (그래도 인쇄는 가능).</div>
                : <div style={{ fontSize: 12.5, marginBottom: 8 }}>{parse.ag > 0 ? "🟡⬜ Ag 포함 — 하단 띠: 노랑+회색" : "🟡 Ag 없음 — 하단 띠: 전체 노랑"}</div>}
              {/* 미리보기: 인쇄와 동일한 HTML/CSS (70×40mm 실제 크기) */}
              <style>{POWDER_LABEL_CSS}</style>
              <div style={{ border: "1px solid var(--line)", display: "inline-block", boxShadow: "0 1px 4px rgba(0,0,0,.15)" }}
                dangerouslySetInnerHTML={{ __html: powderLabelHtml(o.name, parse, `${weights[0]}g`, dlgMfg || T) }} />
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13, marginTop: 10 }}>
                <label>포장단위(g)<br /><input type="number" min={1} value={dlgPack} style={ni}
                  onChange={e => { const v = e.target.value; setDlgPack(v); const p = Number(v) || 0; if (p > 0) setDlgCopies(String(calcCopies(qty, p))); }} /></label>
                <label>매수 <span className="muted" style={{ fontSize: 11 }}>(자동: 수량÷포장단위 올림)</span><br />
                  <input type="number" min={1} max={500} value={dlgCopies} style={ni} onChange={e => setDlgCopies(e.target.value)} /></label>
                <label>제조일<br /><input type="date" value={dlgMfg} style={{ ...ni, width: 140 }} onChange={e => setDlgMfg(e.target.value)} /></label>
              </div>
              <div style={{ fontSize: 12.5, marginTop: 8, background: "#f3f7fc", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 10px" }}>
                인쇄 구성: <b>{packSummary(weights)}</b>
                {weights.length > 1 && weights[weights.length - 1] !== weights[0] && <span className="muted"> — 나누어떨어지지 않아 마지막 장은 나머지 무게로 인쇄됩니다.</span>}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                <button className="btn ghost" onClick={() => setLabelDlg(null)}>취소</button>
                <button className="btn" onClick={doPrint}>🖨 인쇄</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function addDays(iso: string, n: number) {
  const d = new Date(iso); d.setDate(d.getDate() + n);
  const pp = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pp(d.getMonth() + 1)}-${pp(d.getDate())}`;
}
