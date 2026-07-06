import { useEffect, useState } from "react";

// 탭 이동/재방문 시에도 필터 상태 유지 (세션 동안)
export function usePersistState<T>(key: string, init: T) {
  const k = "oro_ui_" + key;
  const [v, setV] = useState<T>(() => {
    try { const raw = sessionStorage.getItem(k); if (raw != null) return JSON.parse(raw) as T; } catch { /* 무시 */ }
    return init;
  });
  useEffect(() => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } }, [k, v]);
  return [v, setV] as const;
}
