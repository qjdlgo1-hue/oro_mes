// Supabase/네트워크 에러 원문을 사용자용 한국어 안내로 변환
export function errMsg(e: any): string {
  const raw = String(e?.message || e || "").trim();
  const m = raw.toLowerCase();
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed") || m.includes("network request failed"))
    return "네트워크 오류 — 인터넷 연결을 확인한 뒤 다시 시도하세요.";
  if (m.includes("jwt") || m.includes("token") && m.includes("expired") || m.includes("not authenticated") || m.includes("refresh_token"))
    return "로그인 세션이 만료됐습니다 — 새로고침 후 다시 로그인하세요.";
  if (m.includes("row-level security") || m.includes("permission denied") || m.includes("policy") || m.includes("not authorized") || m.includes("403"))
    return "권한이 없습니다 — 관리자에게 권한을 요청하세요.";
  if (m.includes("duplicate key"))
    return "이미 같은 데이터가 있습니다 (중복).";
  if (m.includes("timeout") || m.includes("timed out") || m.includes("57014"))
    return "요청 시간이 초과됐습니다 — 잠시 후 다시 시도하세요.";
  if (m.includes("foreign key"))
    return "연결된 데이터가 있어 처리할 수 없습니다.";
  if (m.includes("rate limit") || m.includes("429"))
    return "요청이 너무 많습니다 — 잠시 후 다시 시도하세요.";
  // 알 수 없는 오류는 원문을 짧게 덧붙여 문의에 활용
  return "오류가 발생했습니다" + (raw ? ` (${raw.slice(0, 120)})` : "") + " — 반복되면 관리자에게 알려주세요.";
}
