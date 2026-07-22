import { useEffect, useState } from "react";

// 터치가 주 입력인 기기(태블릿·터치 모니터) 여부 — index.css의 @media (pointer: coarse)와 같은 기준.
// 기기 특성이라 세션 중 바뀌지 않으므로 모듈 상수로 1회 판정.
export const isCoarse = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

// 모바일 판정: 좁은 화면(≤bp)이거나, 터치 기기면서 태블릿 세로 폭(≤1020px)까지.
// 태블릿 세로는 햄버거+드로어 UI가 터치에 더 맞아 모바일 레이아웃을 쓴다. (가로는 데스크톱 레일 유지)
export function useIsMobile(bp = 760) {
  const judge = () => window.innerWidth <= bp || (isCoarse && window.innerWidth <= 1020);
  const [m, setM] = useState(typeof window !== "undefined" ? judge() : false);
  useEffect(() => {
    const f = () => setM(judge());
    window.addEventListener("resize", f); return () => window.removeEventListener("resize", f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bp]);
  return m;
}
