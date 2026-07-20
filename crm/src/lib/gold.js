// ---------------------------------------------------------------------------
// 신한은행 금시세 붙여넣기 파서
// 사이트 표를 복사하면 탭/줄바꿈이 섞여 오고, '전일대비'는
// "상승1,019.13" 과 "+0.54%" 가 별도 줄로 갈라져 들어온다. 예:
//   07.20.\t191,251.69\t\n상승1,019.13\n+0.54%\n200,814.27\t181,689.11\t...
// 날짜(MM.DD.)를 행 시작으로 잡고, 행 안의 숫자를 순서대로 해석한다.
// ---------------------------------------------------------------------------

const num = (s) => {
  const n = parseFloat(String(s).replace(/,/g, ""));
  return isNaN(n) ? null : n;
};

// 같은 날짜가 여러 번 들어 있으면 첫 값만 남긴다.
// (신한은행 페이지는 하루에 고시가 여러 번 있어 같은 날짜가 반복될 수 있고,
//  DB upsert는 한 번에 같은 키를 두 번 처리하지 못함 — "ON CONFLICT ..." 오류의 원인)
function dedupeByDate(rows, errors) {
  const seen = new Set();
  const out = [];
  let dup = 0;
  for (const r of rows) {
    if (seen.has(r.date)) { dup++; continue; }
    seen.add(r.date);
    out.push(r);
  }
  if (dup > 0) errors.push(`같은 날짜 ${dup}건은 첫 값만 사용했습니다 (하루 여러 고시)`);
  return out;
}

// text와 연도(YYYY)를 받아 [{date, close, change, change_rate, buy_physical, sell_physical, deposit, withdraw}] 반환
// 인식 실패 행은 errors에 사유와 함께 담는다.
export function parseShinhanGold(text, year) {
  const rows = [];
  const errors = [];
  if (!text || !String(text).trim()) return { rows, errors };

  // 날짜 패턴(MM.DD.)을 기준으로 텍스트를 행 단위로 자름
  const src = String(text).replace(/\r/g, "");
  const dateRe = /(\d{2})\.(\d{2})\.?/g;
  const marks = [];
  let m;
  while ((m = dateRe.exec(src)) !== null) {
    // 숫자 중간의 "1,019.13" 같은 소수점과 혼동하지 않게: 날짜는 줄 시작 또는 공백/탭 뒤에만
    const before = src[m.index - 1];
    if (before === undefined || before === "\n" || before === "\t" || before === " ") {
      marks.push({ mm: m[1], dd: m[2], start: m.index, end: m.index + m[0].length });
    }
  }
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    const chunk = src.slice(mark.end, i + 1 < marks.length ? marks[i + 1].start : src.length);
    const label = `${mark.mm}.${mark.dd}.`;

    // 전일대비: 상승/하락/보합 + 숫자 (부호로 변환)
    let change = null;
    const chg = chunk.match(/(상승|하락|보합)\s*([\d,.]+)?/);
    if (chg) {
      if (chg[1] === "보합") change = 0;
      else if (chg[2] != null) change = (chg[1] === "하락" ? -1 : 1) * (num(chg[2]) ?? 0);
    }
    // 등락률: ±x.xx%
    let changeRate = null;
    const rate = chunk.match(/([+-][\d,.]+)\s*%/);
    if (rate) changeRate = num(rate[1]);

    // 나머지 숫자들: 전일대비/등락률에 쓰인 숫자를 제거한 뒤 순서대로
    let rest = chunk;
    if (chg) rest = rest.replace(chg[0], " ");
    if (rate) rest = rest.replace(rate[0], " ");
    const nums = (rest.match(/\d[\d,]*\.?\d*/g) || []).map(num).filter((v) => v != null);

    if (nums.length < 1) { errors.push(`${label} — 종가를 찾지 못해 건너뜀`); continue; }
    const [close, buyP, sellP, dep, wd] = nums;
    const mmN = parseInt(mark.mm, 10), ddN = parseInt(mark.dd, 10);
    if (mmN < 1 || mmN > 12 || ddN < 1 || ddN > 31) { errors.push(`${label} — 날짜 형식 오류`); continue; }

    rows.push({
      date: `${year}-${mark.mm}-${mark.dd}`,
      close: close ?? null,
      change,
      change_rate: changeRate,
      buy_physical: buyP ?? null,
      sell_physical: sellP ?? null,
      deposit: dep ?? null,
      withdraw: wd ?? null,
    });
  }
  return { rows: dedupeByDate(rows, errors), errors };
}

// ---------------------------------------------------------------------------
// 엑셀 이력 형식 파서 — 사용자가 쓰던 엑셀 표를 그대로 붙여넣기 (탭 구분, 18열)
//   날짜(YYYY-MM-DD) 매매기준율 전일대비 등락률 실물살때 실물팔때 계좌입금 계좌해지
//   국제금시세 원달러환율 PGC 구매량 비율(%) PGC참고자료 구매대금 청화은 은수량 은구매액
// 날짜가 완전하므로 연도 선택 불필요. PGC·구매 기록까지 전체 열을 저장한다.
// ---------------------------------------------------------------------------
const numOrNull = (s) => {
  if (s == null) return null;
  const t = String(s).replace(/[,%\s원]/g, "");
  if (t === "" || t === "-") return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
};

export function parseExcelGold(text) {
  const rows = [];
  const errors = [];
  for (const line of String(text || "").replace(/\r/g, "").split("\n")) {
    const f = line.split("\t").map((s) => s.trim());
    if (!/^\d{4}-\d{2}-\d{2}/.test(f[0] || "")) continue; // 날짜로 시작하는 행만 (헤더 등 무시)
    const date = f[0].slice(0, 10);
    const close = numOrNull(f[1]);
    if (close == null) { errors.push(`${date} — 매매기준율이 비어 있어 건너뜀`); continue; }
    rows.push({
      date,
      close,
      change: numOrNull(f[2]),
      change_rate: numOrNull(f[3]),
      buy_physical: numOrNull(f[4]),
      sell_physical: numOrNull(f[5]),
      deposit: numOrNull(f[6]),
      withdraw: numOrNull(f[7]),
      intl_gold: numOrNull(f[8]),
      usd_krw: numOrNull(f[9]),
      pgc: numOrNull(f[10]),
      pgc_qty: numOrNull(f[11]),
      pgc_ratio: numOrNull(f[12]),
      pgc_note: (f[13] || "").trim() || null,
      pgc_amount: numOrNull(f[14]),
      agcn: numOrNull(f[15]),
      agcn_qty: numOrNull(f[16]),
      agcn_amount: numOrNull(f[17]),
    });
  }
  return { rows: dedupeByDate(rows, errors), errors };
}

// 통합 파서 — 행마다 형식을 자동 판별
//   엑셀 형식(YYYY-MM-DD, 전체 열) → excelRows / 신한은행 형식(MM.DD.) → shinhanRows
export function parseGoldPaste(text, year) {
  const src = String(text || "").replace(/\r/g, "");
  const lines = src.split("\n");
  const excelText = lines.filter((l) => /^\d{4}-\d{2}-\d{2}/.test(l.trim().split("\t")[0] || "")).join("\n");
  const restText = lines.filter((l) => !/^\d{4}-\d{2}-\d{2}/.test(l.trim().split("\t")[0] || "")).join("\n");
  const excel = parseExcelGold(excelText);
  const shinhan = parseShinhanGold(restText, year);
  return { excelRows: excel.rows, shinhanRows: shinhan.rows, errors: [...excel.errors, ...shinhan.errors] };
}

// 월 평균 계산 — 값이 있는 날만 평균 (없으면 null)
export function monthlyAvg(list, ym) {
  const inMonth = list.filter((r) => (r.date || "").startsWith(ym));
  const avg = (key) => {
    const vals = inMonth.map((r) => Number(r[key])).filter((v) => !isNaN(v) && v > 0);
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  return { days: inMonth.length, close: avg("close"), pgc: avg("pgc"), agcn: avg("agcn"),
    pgcDays: inMonth.filter((r) => Number(r.pgc) > 0).length,
    agcnDays: inMonth.filter((r) => Number(r.agcn) > 0).length };
}
