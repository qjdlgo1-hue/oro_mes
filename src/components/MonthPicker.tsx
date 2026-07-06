const p2 = (n: number) => String(n).padStart(2, "0");
const label = (ym: string) => `${ym.slice(0, 4)}년 ${+ym.slice(5, 7)}월`;

// 월 선택 공통 컴포넌트: ◀ [2026년 6월 ▾] ▶ | 오늘 (allowAll이면 '전체 월' 옵션)
export default function MonthPicker({ months, value, onChange, allowAll, allValue = "" }: {
  months: string[];              // "YYYY-MM" 오름차순 목록
  value: string;                 // 선택된 ym, 또는 allValue(전체)
  onChange: (ym: string) => void;
  allowAll?: boolean;
  allValue?: string;             // '전체'를 뜻하는 값 (기본 "")
}) {
  const sorted = [...months].sort();
  const idx = sorted.indexOf(value);
  const nowYm = (() => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; })();
  const move = (dir: number) => {
    if (idx < 0) { onChange(sorted[dir > 0 ? 0 : sorted.length - 1] || value); return; }
    const j = idx + dir; if (j >= 0 && j < sorted.length) onChange(sorted[j]);
  };
  const goToday = () => onChange(sorted.includes(nowYm) ? nowYm : (sorted[sorted.length - 1] || value));
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <button className="btn ghost" style={{ padding: "4px 9px" }} aria-label="이전 달" disabled={idx === 0} onClick={() => move(-1)}>◀</button>
      <select value={value} onChange={e => onChange(e.target.value)} aria-label="월 선택" style={{ padding: 6, border: "1px solid var(--line)", borderRadius: 6 }}>
        {allowAll && <option value={allValue}>전체 월</option>}
        {sorted.map(m => <option key={m} value={m}>{label(m)}</option>)}
      </select>
      <button className="btn ghost" style={{ padding: "4px 9px" }} aria-label="다음 달" disabled={idx >= 0 && idx === sorted.length - 1} onClick={() => move(1)}>▶</button>
      {sorted.length > 0 && <button className="btn ghost" style={{ padding: "4px 9px", fontSize: 12 }} onClick={goToday}>오늘</button>}
    </span>
  );
}
