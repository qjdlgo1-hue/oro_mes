

// ---------------------------------------------------------------------------
// [0] 디자인 색상 토큰 — MES(src/index.css :root)와 동일한 ORO 브랜드 팔레트
//     딥 테크 네이비 + 일렉트릭 틸 포인트 + 골드 로고 + 실버 화이트 배경
// ---------------------------------------------------------------------------
export const T = {
  navy: "#0A1F3D",      // --navy  (기본 글자·헤더 배경)
  navyLight: "#14304F",
  teal: "#1BA3A3",      // --accent (주요 버튼 — 흰 글씨)
  tealDark: "#147F7F",
  gold: "#C9A84C",      // --gold  (로고·핵심 포인트)
  bg: "#EDF1F3",        // --bg    (실버 화이트 배경)
  card: "#FFFFFF",      // --panel
  border: "#D7DDE2",    // --line
  tint: "#EBF0F3",      // --tint  (옅은 실버 틴트)
  tint2: "#E7F5F4",     // --tint2 (옅은 틸 틴트)
  text: "#0A1F3D",
  sub: "#66717D",       // --muted
  danger: "#c0392b",    // --danger
  warn: "#f59e0b",      // --warn
  ok: "#178E6E",        // --ok
};

// ---------------------------------------------------------------------------
// [1] 채널 정의 - 이메일/LINE/WeChat/전화/기타
//     각 채널마다 표시할 아이콘, 색깔, 이름을 정해둡니다.
// ---------------------------------------------------------------------------
export const CHANNELS = {
  email: { label: "이메일", icon: "📧", color: "#4F7396", bg: "#E8EEF4" },
  line: { label: "LINE", icon: "💬", color: "#1F9D55", bg: "#E4F3E9" },
  wechat: { label: "WeChat", icon: "🟢", color: "#178E6E", bg: "#E7F5F4" },
  phone: { label: "전화", icon: "📞", color: "#A5853B", bg: "#F5EFDF" },
  memo: { label: "메모", icon: "📝", color: "#66717D", bg: "#EBF0F3" },
};

// ---------------------------------------------------------------------------
// [2] 딜(영업기회) 단계 정의 - ORO 실제 영업 흐름
// ---------------------------------------------------------------------------
// 색은 브랜드 팔레트 안에서 진행도 순서로: 실버 → 스틸 네이비 → 틸 → 그린
export const STAGES = [
  { key: "inquiry", label: "문의", color: "#8B97A3" },
  { key: "quote", label: "견적", color: "#4F7396" },
  { key: "sample", label: "샘플 발송", color: "#2E8FA0" },
  { key: "eval", label: "고객 평가", color: "#1BA3A3" },
  { key: "approve", label: "승인", color: "#178E6E" },
  { key: "mass", label: "양산", color: "#0E6B52" },
];

// 단계 key로 단계 정보를 빠르게 찾는 도우미 함수
export const stageInfo = (key) => STAGES.find((s) => s.key === key) || STAGES[0];

// ---------------------------------------------------------------------------
// [3] 처음 실행할 때 넣어줄 예시 데이터
//     (창고가 완전히 비어있으면 이 데이터로 시작합니다.
//      한 번이라도 저장한 뒤에는 이 데이터 대신 저장된 내용을 씁니다.)
// ---------------------------------------------------------------------------
export const SEED = {
  companies: [
    {
      id: "c1",
      name: "ISC",
      domain: "isc.co.kr",
      tier: "핵심",
      country: "한국",
      product: "Au / Ag 도금",
      memo: "PCR 소켓용 주력 거래처",
    },
    {
      id: "c2",
      name: "대만 TFE",
      domain: "tfe.com.tw",
      tier: "핵심",
      country: "대만",
      product: "Ni 분말",
      memo: "LINE으로 주로 소통",
    },
    {
      id: "c3",
      name: "중국 SZ전자",
      domain: "qq.com",
      tier: "일반",
      country: "중국",
      product: "Pd-Co 코팅",
      memo: "WeChat 소통, 견적은 메일",
    },
  ],
  contacts: [
    { id: "p1", companyId: "c1", name: "김구매 과장", role: "구매", contact: "kim@isc.co.kr" },
    { id: "p2", companyId: "c1", name: "박연구 책임", role: "품질/연구", contact: "park@isc.co.kr" },
    { id: "p3", companyId: "c2", name: "Chen 부장", role: "구매", contact: "LINE: chen_tfe" },
    { id: "p4", companyId: "c3", name: "Wang 매니저", role: "영업", contact: "WeChat: wang_sz" },
  ],
  deals: [
    { id: "d1", companyId: "c1", title: "Au도금 양산 견적", spec: "Au 0.3μm · 월5kg", stage: "eval", value: "월 750만" },
    { id: "d2", companyId: "c1", title: "Ag 정기 납품", spec: "Ag 0.5μm", stage: "mass", value: "월 300만" },
    { id: "d3", companyId: "c2", title: "Ni 분말 재견적", spec: "Ni raw · 월10kg", stage: "quote", value: "월 400만" },
    { id: "d4", companyId: "c3", title: "Pd-Co 신규 평가", spec: "Pd-Co · 샘플", stage: "sample", value: "미정" },
  ],
  activities: [
    {
      id: "a1",
      companyId: "c1",
      channel: "email",
      direction: "received",
      person: "김구매 과장",
      title: "PCR 소켓용 Ni 분말 견적 요청",
      body: "Au 도금 두께 0.3μm 사양으로 견적 부탁드립니다. 수량은 월 5kg 예상.",
      dealId: "d1",
      date: "2025-07-11 14:22",
    },
    {
      id: "a2",
      companyId: "c1",
      channel: "email",
      direction: "sent",
      person: "이동욱",
      title: "RE: 견적 요청 회신",
      body: "요청 사양 기준 견적서 첨부. 샘플은 다음 주 발송 가능합니다.",
      dealId: "d1",
      date: "2025-07-11 17:05",
    },
    {
      id: "a3",
      companyId: "c2",
      channel: "line",
      direction: "received",
      person: "Chen 부장",
      title: "납기 문의 (LINE)",
      body: "이번 Ni 분말 주문 납기를 2주 앞당길 수 있나요? 고객사 일정이 당겨졌습니다.",
      dealId: "d3",
      date: "2025-07-12 10:30",
    },
    {
      id: "a4",
      companyId: "c3",
      channel: "wechat",
      direction: "received",
      person: "Wang 매니저",
      title: "샘플 관련 문의 (WeChat)",
      body: "Pd-Co 샘플 도착했습니다. 저항 편차 데이터 확인 후 다시 연락드릴게요.",
      dealId: "d4",
      date: "2025-07-12 15:40",
    },
  ],
};

// ---------------------------------------------------------------------------
// [4] 저장/불러오기는 src/lib/db.js 가 담당합니다.
//     (클라우드=Supabase / 로컬=localStorage 를 그 파일이 알아서 처리)
// ---------------------------------------------------------------------------

// 고유 id 만들기 (새 거래처/딜/기록 추가할 때 사용)
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
