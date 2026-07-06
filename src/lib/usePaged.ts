import { useEffect, useState } from "react";

// 대용량 표 렌더 부하 방지: 처음 step행만 그리고 '더 보기'로 늘림. 필터/데이터가 바뀌면 초기화.
export function usePaged<T>(rows: T[], step = 200) {
  const [n, setN] = useState(step);
  useEffect(() => { setN(step); }, [rows, step]);
  const paged = n >= rows.length ? rows : rows.slice(0, n);
  const remaining = rows.length - paged.length;
  const showMore = () => setN(x => x + step);
  return { paged, remaining, showMore };
}
