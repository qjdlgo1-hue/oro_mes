import { useEffect, useState } from "react";
export function useIsMobile(bp = 760) {
  const [m, setM] = useState(typeof window !== "undefined" ? window.innerWidth <= bp : false);
  useEffect(() => {
    const f = () => setM(window.innerWidth <= bp);
    window.addEventListener("resize", f); return () => window.removeEventListener("resize", f);
  }, [bp]);
  return m;
}
