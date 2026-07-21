// 라벨 자동화 규칙 모음 (labelprintspec.md §5) — 모델명 판별·Grade 문구·라벨 날짜는
// 반드시 이 파일의 함수만 사용한다 (다른 곳에 중복 구현 금지).
import { addYear } from "./coc";

// ── 모델명 해석 ──────────────────────────────────────────────
// "ACD3245-S150G10A" → { s1:32, s2:45, ag:150, au:10 }
// "ACC2532-G20A"     → { s1:25, s2:32, ag:0,   au:20 }
// ag/au 단위는 0.01㎛ (150 = 1.5㎛)
// 사이즈(앞 4자리)는 하이픈 앞부분에서만 찾는다 — 하이픈 뒤 S150G10 같은
// 도금 코드의 숫자를 사이즈로 오인하지 않기 위한 보강.
export type ModelParse = { s1: number | null; s2: number | null; ag: number; au: number };
export function parseModelCode(model: string): ModelParse {
  const m = (model || "").toUpperCase().trim();
  const head = m.split("-")[0];                       // 하이픈 앞 = 모델 본체(사이즈 포함)
  const sizeMatch = head.match(/(\d{2})(\d{2})/);     // 연속 4자리 = 사이즈 범위
  const suffix = m.split("-").slice(1).join("-");     // 하이픈 뒤 = 도금 코드부
  const agMatch = suffix.match(/S(\d+)/);             // S### = Ag 두께
  const auMatch = suffix.match(/G(\d+)/);             // G### = Au 두께
  return {
    s1: sizeMatch ? parseInt(sizeMatch[1], 10) : null,
    s2: sizeMatch ? parseInt(sizeMatch[2], 10) : null,
    ag: agMatch ? parseInt(agMatch[1], 10) : 0,       // S 코드 없으면 Ag 없음
    au: auMatch ? parseInt(auMatch[1], 10) : 0,
  };
}

// ── Grade 문구 생성: (150,10) → "Ni+Ag(1.5um)+Au(0.1um)" ──
export function buildGrade(ag: number, au: number): string {
  const um = (v: number) => (v / 100) + "um";         // 0.01㎛ → ㎛ 문자열
  let g = "Ni";
  if (ag > 0) g += "+Ag(" + um(ag) + ")";
  if (au > 0) g += "+Au(" + um(au) + ")";
  return g;
}

// ── 날짜: 라벨 표기는 0 없이 "2026-7-9" 형식 (MES 날짜는 ISO 문자열이라 문자열로 처리) ──
export function fmtDate(iso: string): string {
  const [y, mo, d] = (iso || "").split("-").map(Number);
  if (!y || !mo || !d) return iso || "";
  return `${y}-${mo}-${d}`;
}

// ── 사용기한 = 제조일 + 1년 − 1일 (2026-7-9 → 2027-7-8) ──
// COC 유효기간과 동일한 규칙이므로 coc.addYear를 재사용 (규칙 변경 시 한 곳만 수정).
export function expiryDate(mfgIso: string): string {
  return addYear(mfgIso);
}
