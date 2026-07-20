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
  return { rows, errors };
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
