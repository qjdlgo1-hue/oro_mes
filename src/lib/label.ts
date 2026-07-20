// 생산 라벨 출력 — POP에서 생산 건별 라벨 인쇄.
// 용지 2종 지원:
//  · sheet: A4 21칸 라벨지 (Printec AnyLabel V3330 = 63.5×38.1mm, 3×7 — Avery L7160 호환).
//           쓰다 만 시트를 이어 쓸 수 있게 '시작 칸'을 고르고, 그리드 좌표에 절대배치로 인쇄.
//  · roll : 롤 라벨 프린터(EPSON TM-C3500 등) — 라벨 1장 크기의 @page로 인쇄.
// 다이얼로그 없이 완전 자동 출력: 현장 PC 크롬 바로가기에 --kiosk-printing + 기본 프린터 지정.
import { Order, PlanEntry } from "./types";

// V3330(A4 21칸) 규격 — 상단 15.1mm/좌측 7.25mm 여백, 가로 피치 66mm(칸 간격 2.5mm), 세로 피치 38.1mm
const SHEET = { cols: 3, rows: 7, cellW: 63.5, cellH: 38.1, top: 15.1, left: 7.25, pitchX: 66, pitchY: 38.1 };

export type LabelOpts = {
  mode: "sheet" | "roll";
  start: number;   // sheet: 시작 칸(1~21) — 쓰다 만 라벨지 이어 쓰기
  copies: number;  // 출력 장수(칸 수)
  offX: number;    // sheet: 인쇄 위치 미세 보정(mm, +오른쪽)
  offY: number;    // sheet: 인쇄 위치 미세 보정(mm, +아래)
  w: number;       // roll: 라벨 폭(mm)
  h: number;       // roll: 라벨 높이(mm)
  qr: boolean;     // QR 코드 포함(주문 추적)
  auto: boolean;   // POP '완료' 처리 시 자동 인쇄
};
// 기본: 롤 라벨(EPSON TM-C3500 등), 크기는 사용 라벨 63.5×38.1mm — A4 21칸 시트는 보조 모드
export const defaultLabelOpts: LabelOpts = { mode: "roll", start: 1, copies: 1, offX: 0, offY: 0, w: 63.5, h: 38.1, qr: true, auto: true };
const LS_KEY = "oro_label_opts2"; // v2: 기본 모드가 sheet→roll로 바뀌어 키 갱신(구 저장값 무시)
export function loadLabelOpts(): LabelOpts {
  try { return { ...defaultLabelOpts, ...JSON.parse(localStorage.getItem(LS_KEY) || "{}") }; }
  catch { return defaultLabelOpts; }
}
export function saveLabelOpts(o: LabelOpts) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch { /* best-effort */ }
}

// LOT 번호: ORO-생산일(YYMMDD)-주문ID 끝 4자리 (자산관리번호와 같은 ORO- 관례)
export function lotNo(o: Order, prodDate: string): string {
  const ymd = (prodDate || "").replace(/-/g, "").slice(2) || "000000";
  return `ORO-${ymd}-${String(o.id || "").replace(/-/g, "").slice(-4).toUpperCase()}`;
}

const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// 라벨 1칸 내용 (V3330 63.5×38.1 기준 폰트 — roll은 배율 s로 확대)
function cellInner(o: Order, qty: number, prodDate: string, qrDataUrl: string, s = 1): string {
  const lot = lotNo(o, prodDate);
  return `
    <div class="head"><span class="brand">ORO</span><span class="lot">${esc(lot)}</span></div>
    <div class="name" style="font-size:${5.2 * s}mm">${esc(o.name)}</div>
    <div class="spec" style="font-size:${2.8 * s}mm">${esc(o.spec)}</div>
    <table class="meta" style="font-size:${2.6 * s}mm">
      <tr><th>수량</th><td>${(Number(qty) || 0).toLocaleString("ko-KR")} g</td></tr>
      <tr><th>생산일</th><td>${esc(prodDate)}</td></tr>
      <tr><th>고객사</th><td>${esc(o.customer)}</td></tr>
    </table>
    ${qrDataUrl ? `<img class="qr" src="${qrDataUrl}" alt="QR" style="width:${11 * s}mm;height:${11 * s}mm" />` : ""}`;
}

const baseCss = (s = 1) => `
  * { box-sizing: border-box; margin: 0; }
  body { font-family: "Malgun Gothic", sans-serif; }
  .cell { padding: ${2 * s}mm ${2.5 * s}mm; overflow: hidden; position: relative; }
  .head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: ${0.4 * s}mm solid #000; padding-bottom: ${0.7 * s}mm; }
  .brand { font-weight: 900; font-size: ${3.6 * s}mm; letter-spacing: 1px; }
  .lot { font-size: ${2.4 * s}mm; font-weight: 700; }
  .name { font-weight: 800; margin-top: ${1 * s}mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .spec { color: #222; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { border-collapse: collapse; margin-top: ${0.7 * s}mm; }
  .meta th { text-align: left; color: #444; font-weight: 700; padding: ${0.3 * s}mm ${1.5 * s}mm ${0.3 * s}mm 0; white-space: nowrap; }
  .meta td { font-weight: 800; padding: ${0.3 * s}mm 0; white-space: nowrap; }
  .qr { position: absolute; right: ${2 * s}mm; bottom: ${2 * s}mm; }`;

// A4 21칸 시트: 시작 칸부터 copies칸을 절대배치. 21칸을 넘으면 다음 페이지로.
function sheetHtml(o: Order, qty: number, prodDate: string, opts: LabelOpts, qrDataUrl: string): string {
  const per = SHEET.cols * SHEET.rows;
  const start = Math.max(1, Math.min(per, Math.floor(opts.start) || 1)) - 1;
  const n = Math.max(1, Math.min(200, Math.floor(opts.copies) || 1));
  const pages: string[] = [];
  for (let p = 0; p * per < start + n; p++) {
    const cells: string[] = [];
    for (let idx = 0; idx < per; idx++) {
      const g = p * per + idx;
      if (g < start || g >= start + n) continue;
      const col = idx % SHEET.cols, row = Math.floor(idx / SHEET.cols);
      const x = SHEET.left + col * SHEET.pitchX + opts.offX;
      const y = SHEET.top + row * SHEET.pitchY + opts.offY;
      cells.push(`<div class="cell" style="left:${x}mm;top:${y}mm;width:${SHEET.cellW}mm;height:${SHEET.cellH}mm;position:absolute;">${cellInner(o, qty, prodDate, qrDataUrl)}</div>`);
    }
    pages.push(`<div class="page">${cells.join("")}</div>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>라벨 ${esc(o.name)}</title>
  <style>
    @page { size: A4; margin: 0; }
    ${baseCss(1)}
    .page { position: relative; width: 210mm; height: 296mm; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
  </style></head><body>${pages.join("")}</body></html>`;
}

// 롤 라벨: 라벨 1장 크기의 페이지를 copies장
function rollHtml(o: Order, qty: number, prodDate: string, opts: LabelOpts, qrDataUrl: string): string {
  const s = Math.max(0.7, Math.min(2.5, opts.h / SHEET.cellH)); // 칸 높이 대비 배율
  const one = `<div class="cell" style="width:${opts.w}mm;height:${opts.h}mm;page-break-after:always;">${cellInner(o, qty, prodDate, qrDataUrl, s)}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>라벨 ${esc(o.name)}</title>
  <style>
    @page { size: ${opts.w}mm ${opts.h}mm; margin: 0; }
    ${baseCss(s)}
    .cell:last-child { page-break-after: auto; }
  </style></head><body>${one.repeat(Math.max(1, Math.min(50, opts.copies)))}</body></html>`;
}

// 라벨 인쇄 — win을 미리 열어 넘기면(클릭 직후 동기 open) 팝업 차단을 피할 수 있다.
export async function printProductionLabel(
  o: Order, pl: PlanEntry | undefined, prodDate: string, opts: LabelOpts, win?: Window | null,
): Promise<void> {
  const qty = pl?.qty != null ? Number(pl.qty) : (Number(o.qty) || 0);
  let qrDataUrl = "";
  if (opts.qr) {
    try {
      const QR = await import("qrcode"); // 별도 청크 — 라벨 인쇄 때만 로드
      qrDataUrl = await QR.toDataURL(JSON.stringify({ t: "oro-prod", id: o.id, name: o.name, lot: lotNo(o, prodDate), qty, date: prodDate }), { margin: 0, width: 160 });
    } catch { /* QR 실패 시 텍스트만 인쇄 */ }
  }
  const html = opts.mode === "roll" ? rollHtml(o, qty, prodDate, opts, qrDataUrl) : sheetHtml(o, qty, prodDate, opts, qrDataUrl);
  const w = win || window.open("", "_blank", "width=560,height=460");
  if (!w) throw new Error("팝업이 차단되었습니다 — 브라우저 팝업 허용 후 다시 시도하세요.");
  w.document.open();
  w.document.write(html);
  w.document.close();
  // 이미지(QR) 렌더 후 인쇄 — kiosk-printing 모드면 다이얼로그 없이 즉시 출력됨
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* 창이 닫혔으면 무시 */ } }, 350);
}
