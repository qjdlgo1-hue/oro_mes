import { useMemo, useState } from "react";

// 표 헤더 클릭 정렬 공통 훅 — 숫자/문자 자동 비교, 같은 키 재클릭 시 방향 토글
export function useSort<T extends Record<string, any>>(rows: T[]) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const { key, dir } = sort;
    return [...rows].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      const as = String(av ?? ""), bs = String(bv ?? "");
      return as < bs ? -dir : as > bs ? dir : 0;
    });
  }, [rows, sort]);
  const toggle = (key: string) => setSort(s => s && s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { key, dir: 1 });
  const arrow = (key: string) => (sort?.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : "");
  return { sorted, toggle, arrow, active: sort?.key || null };
}
