// 생산 라벨 출력 — POP에서 생산 건별 Conductive Powder 라벨 인쇄 (labelprintspec.md).
// 라벨지: 70×40mm 고정(롤 라벨 프린터 — EPSON TM-C3500 등). 라벨 1장 = 1페이지.
// 하단 색상 띠는 Ag(은) 포함 여부로 자동 결정: Ag 있으면 [노랑|회색], 없으면 [전체 노랑].
// 인쇄 매수 = 생산수량 ÷ 포장단위(New wt) 올림 — 포장단위는 거래처별 기본값 저장(db.getLabelPacks).
// 다이얼로그 없이 완전 자동 출력: 현장 PC 크롬 바로가기에 --kiosk-printing + 기본 프린터 지정.
import { Order } from "./types";
import { ModelParse, buildGrade, fmtDate, expiryDate, parseModelCode } from "./labelRules";

export type LabelOpts = {
  auto: boolean;       // POP '완료' 처리 시 자동 인쇄
  packDefault: number; // 기본 포장단위(g) — 거래처별 값이 없을 때 사용
};
export const defaultLabelOpts: LabelOpts = { auto: true, packDefault: 50 };
const LS_KEY = "oro_label_opts3"; // v3: 70×40 명세 템플릿으로 개편 (구 저장값 무시)
export function loadLabelOpts(): LabelOpts {
  try { return { ...defaultLabelOpts, ...JSON.parse(localStorage.getItem(LS_KEY) || "{}") }; }
  catch { return defaultLabelOpts; }
}
export function saveLabelOpts(o: LabelOpts) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch { /* best-effort */ }
}

// 인쇄 매수 = 생산수량(g) ÷ 포장단위(g) 올림, 최소 1장 (값이 비정상이면 1장)
export function calcCopies(qtyG: number, packG: number): number {
  const q = Number(qtyG) || 0, p = Number(packG) || 0;
  if (q <= 0 || p <= 0) return 1;
  return Math.max(1, Math.ceil(q / p));
}

const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// 라벨 CSS — labelprintspec.md §6 그대로 (실물 검증 완료, 구조·비율 변경 금지).
// 색이 실물과 다르면 아래 변수 4개만 수정. 변수·선택자는 .label 아래로 한정해
// 화면 미리보기(앱 안에 렌더링)에서도 앱 스타일과 충돌하지 않게 했다.
export const POWDER_LABEL_CSS = `
.label {
  --lb-yellow:#ffe600;  /* 하단 노란 띠 */
  --lb-gray:#d9d9d9;    /* 하단 회색 띠 (Ag 있을 때) */
  --lb-ag:#bdbdbd;      /* 미니표 Ag 머리칸 */
  --lb-au:#e6a23c;      /* 미니표 Au 머리칸 */
  /* 기준 글자 크기 — 내부가 전부 em 단위라 이 값만 바꾸면 비율 그대로 확대/축소된다.
     명세 원안 4.2mm은 브라우저(Arial 메트릭)에서 제목·본문이 40mm를 넘쳐 3mm로 보정. */
  --lb-base:3mm;
  width:70mm; height:40mm; font-size:var(--lb-base);
  position:relative; background:#fff; color:#111; overflow:hidden;
  font-family:Arial,"Malgun Gothic",sans-serif;
  display:flex; flex-direction:column;
  -webkit-print-color-adjust:exact; print-color-adjust:exact;  /* 색 띠 인쇄 보장 */
}
.label .lb-title { font-size:1.9em; font-weight:800; padding:0.28em 0.45em 0.1em; }
.label .lb-body { flex:1; display:flex; padding:0 0.45em; gap:0.4em; }
.label .lb-info { flex:1; font-size:0.82em; line-height:1.5; }
.label .lb-info .v { font-weight:700; }
.label .lb-info .v.plain { font-weight:400; }
.label .lb-info .size-v { font-size:1.25em; font-weight:800; }
/* 미니표 2개(Size / Ag·Au)는 오른쪽에 세로로 쌓는다 — 명세 원안대로 가로로 나란히 두면
   왼쪽 정보칸이 좁아져 Grade 줄이 두 줄로 감기므로(비율상 어떤 기준 크기에서도 동일) 배치만 보정 */
.label .lb-side { align-self:center; display:flex; flex-direction:column; gap:0.35em; }
.label .lb-mini { font-size:0.82em; border-collapse:collapse; }
.label .lb-mini td { border:0.09em solid #111; text-align:center; padding:0.12em 0.5em; min-width:3.4em; }
.label .lb-mini .h-size { font-weight:600; }
.label .lb-mini .v-size { font-size:1.25em; font-weight:700; }
.label .lb-mini .v-size small { font-size:0.55em; font-weight:600; }
.label .lb-mini .h-ag { background:var(--lb-ag); font-weight:800; }
.label .lb-mini .h-au { background:var(--lb-au); font-weight:800; }
.label .lb-mini .v-num { font-size:1.15em; }
.label .lb-mini .v-ag { background:#efefef; }
.label .lb-mini .v-au { background:#f3c979; }
.label .lb-band { display:flex; height:2.5em; flex-shrink:0; } /* 색 띠가 위 내용에 눌려 사라지지 않게 고정 */
/* border/radius 0: 앱의 세그먼트 버튼 클래스(.seg)와 이름이 겹쳐 미리보기에서 테두리가 생기는 것 방지 */
.label .lb-band .seg { flex:1; position:relative; display:block; border:0; border-radius:0; }
.label .seg.yellow { background:var(--lb-yellow); }
.label .seg.gray { background:var(--lb-gray); }
.label .lb-corp { position:absolute; right:0.6em; bottom:0.35em; font-size:1.15em; font-weight:800; color:#111; }`;

// 라벨 1장 HTML (labelprintspec.md §6 템플릿) — 화면 미리보기와 인쇄가 같은 HTML을 쓴다.
export function powderLabelHtml(model: string, p: ModelParse, weightText: string, mfgIso: string): string {
  const hasAg = p.ag > 0;
  const size = p.s1 != null ? `${p.s1}-${p.s2}` : "-";
  // ★ 핵심 규칙: Ag 있으면 [노랑|회색], 없으면 [노랑 전체]
  const band = hasAg
    ? `<div class="seg yellow"></div><div class="seg gray"><span class="lb-corp">oro corp</span></div>`
    : `<div class="seg yellow"><span class="lb-corp">oro corp</span></div>`;
  return `<div class="label">
  <div class="lb-title">Conductive Powder</div>
  <div class="lb-body">
    <div class="lb-info">
      <div>Grade: <span class="v">${esc(buildGrade(p.ag, p.au))}</span></div>
      <div>Model: <span class="v plain">${esc(model)}</span></div>
      <div>S i z e : <span class="size-v">${esc(size)}</span></div>
      <div>New wt: <span class="v plain">${esc(weightText)}</span></div>
      <div>제 조 일: <span class="v plain">${esc(fmtDate(mfgIso))}</span></div>
      <div>사용기한: <span class="v plain">${esc(fmtDate(expiryDate(mfgIso)))}</span></div>
    </div>
    <div class="lb-side">
      <table class="lb-mini"><tbody>
        <tr><td class="h-size">Size</td><td class="v-size">${esc(size)}<small>um</small></td></tr>
      </tbody></table>
      <table class="lb-mini"><tbody>
        <tr><td class="h-ag">Ag</td><td class="h-au">Au</td></tr>
        <tr><td class="v-num v-ag">${p.ag}</td><td class="v-num v-au">${p.au}</td></tr>
      </tbody></table>
    </div>
  </div>
  <div class="lb-band">${band}</div>
</div>`;
}

// 라벨 인쇄 — 매수만큼 반복, 라벨 1장 = 1페이지(70×40mm, 여백 0).
// win을 미리 열어 넘기면(클릭 직후 동기 open) 팝업 차단을 피할 수 있다.
export function printPowderLabels(
  o: Order, opts: { packG: number; copies: number; mfgIso: string }, win?: Window | null,
): void {
  const p = parseModelCode(o.name);
  const one = powderLabelHtml(o.name, p, `${opts.packG}g`, opts.mfgIso);
  const n = Math.max(1, Math.min(500, Math.floor(opts.copies) || 1));
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>라벨 ${esc(o.name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: 70mm 40mm; margin: 0; }
    ${POWDER_LABEL_CSS}
    .label { page-break-after: always; }
    .label:last-child { page-break-after: auto; }
  </style></head><body>${one.repeat(n)}</body></html>`;
  const w = win || window.open("", "_blank", "width=560,height=460");
  if (!w) throw new Error("팝업이 차단되었습니다 — 브라우저 팝업 허용 후 다시 시도하세요.");
  w.document.open();
  w.document.write(html);
  w.document.close();
  // 렌더 후 인쇄 — kiosk-printing 모드면 다이얼로그 없이 즉시 출력됨
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* 창이 닫혔으면 무시 */ } }, 250);
}
