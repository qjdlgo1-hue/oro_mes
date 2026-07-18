import React, { useState, useEffect } from "react";

// 모바일 화면인지 감지 (768px 이하) — 창 크기가 바뀌면 자동 갱신
export function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 768px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const onChange = (e) => setMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return mobile;
}
