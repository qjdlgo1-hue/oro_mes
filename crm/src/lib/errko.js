// ---------------------------------------------------------------------------
// DB/네트워크 오류 메시지 한국어 변환
// Supabase(PostgreSQL/PostgREST)가 주는 영어 오류를 사용자가 이해할 수 있는
// 한국어 설명으로 바꾼다. 모르는 오류는 원문을 그대로 보여준다.
// ---------------------------------------------------------------------------
const RULES = [
  [/ON CONFLICT DO UPDATE command cannot affect row a second time/i,
    "같은 날짜(또는 같은 항목)가 한 번에 여러 번 들어 있어 저장할 수 없습니다 — 중복을 제거한 뒤 다시 시도하세요"],
  [/duplicate key value violates unique constraint/i,
    "이미 존재하는 항목입니다 (중복 저장 시도)"],
  [/violates foreign key constraint/i,
    "연결된 상위 데이터가 없어 저장할 수 없습니다 (예: 삭제된 거래처)"],
  [/violates row-level security|permission denied/i,
    "권한이 없어 처리할 수 없습니다 — 로그인 계정을 확인하세요"],
  [/JWT expired|invalid JWT|invalid token|refresh_token/i,
    "로그인이 만료되었습니다 — 페이지를 새로고침해 다시 로그인하세요"],
  // 메일(SMTP) 발송 관련 — Edge Function이 돌려주는 원인 메시지 변환
  [/535|authentication failed|auth(entication)?\s*(fail|error|invalid)|invalid login|username and password not accepted|not authorized|credentials/i,
    "메일 계정 인증에 실패했습니다 — 설정 화면의 메일 계정 아이디·비밀번호를 확인하세요 (네이버·웍스는 2단계 인증 시 '앱 비밀번호'를 발급해 입력, IMAP/SMTP 사용 설정도 필요)"],
  [/getaddrinfo|ENOTFOUND|dns error|name resolution/i,
    "메일 서버 주소를 찾을 수 없습니다 — 설정 화면의 SMTP 서버 주소를 확인하세요"],
  [/connection (refused|reset|closed)|ECONNREFUSED|ECONNRESET|BadResource|StartTls|corrupt message/i,
    "메일 서버에 연결하지 못했습니다 — SMTP 서버 주소·포트(465)와 보안 설정을 확인하세요"],
  [/Failed to fetch|NetworkError|fetch failed|Load failed|network/i,
    "서버에 연결할 수 없습니다 — 인터넷 연결을 확인한 뒤 다시 시도하세요"],
  [/value too long for type/i,
    "입력값이 너무 깁니다"],
  [/invalid input syntax/i,
    "입력 형식이 올바르지 않습니다 (숫자 칸에 문자가 들어갔는지 확인하세요)"],
  [/timeout|timed out/i,
    "요청 시간이 초과되었습니다 — 잠시 후 다시 시도하세요"],
  [/not-null constraint|null value in column/i,
    "필수 값이 비어 있어 저장할 수 없습니다"],
];

export function koMsg(message) {
  const m = String(message || "");
  for (const [re, ko] of RULES) {
    if (re.test(m)) return ko;
  }
  return m; // 모르는 오류는 원문 유지
}
