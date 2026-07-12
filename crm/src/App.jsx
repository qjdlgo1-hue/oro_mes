import React, { useState, useEffect } from "react";

// ============================================================================
// ORO CRM - 실제 동작 버전 (1단계)
// ----------------------------------------------------------------------------
// 이전 목업과 가장 큰 차이점:
//   목업 = 새로고침하면 사라지는 가짜 데이터
//   이번 = 입력한 데이터가 "진짜로 저장"되어 새로고침해도 유지됨
//
// [저장 방식]
//   브라우저의 localStorage 라는 저장 공간을 사용합니다.
//   쉽게 말해 "브라우저 안에 있는 작은 창고"에 데이터를 넣고 빼는 겁니다.
//   (특수 환경에서 window.storage 가 제공되면 그것을 우선 사용합니다)
//
// [지금 되는 것]
//   거래처/담당자/딜/대화기록을 직접 입력 → 저장됨 → 새로고침해도 남아있음
//   이메일/LINE/WeChat 대화를 수동으로 기록 → 타임라인에 채널별로 쌓임
//
// [아직 안 되는 것]
//   메일 자동 수집 (서버가 준비되면 나중에 연결)
//   여러 사람이 동시에 같은 데이터 보기 (서버로 옮겨야 가능)
// ============================================================================

// ---------------------------------------------------------------------------
// [0] 디자인 색상 토큰 (한 곳에 모아두면 나중에 바꾸기 쉬움)
// ---------------------------------------------------------------------------
const T = {
  navy: "#0F2A43",
  navyLight: "#1B3A57",
  teal: "#14B8A6",
  tealDark: "#0F766E",
  bg: "#F1F5F9",
  card: "#FFFFFF",
  border: "#E2E8F0",
  text: "#0F172A",
  sub: "#64748B",
  danger: "#EF4444",
  warn: "#F59E0B",
};

// ---------------------------------------------------------------------------
// [1] 채널 정의 - 이메일/LINE/WeChat/전화/기타
//     각 채널마다 표시할 아이콘, 색깔, 이름을 정해둡니다.
// ---------------------------------------------------------------------------
const CHANNELS = {
  email: { label: "이메일", icon: "📧", color: "#2563EB", bg: "#DBEAFE" },
  line: { label: "LINE", icon: "💬", color: "#06C755", bg: "#DCFCE7" },
  wechat: { label: "WeChat", icon: "🟢", color: "#1AAD19", bg: "#DCFCE7" },
  phone: { label: "전화", icon: "📞", color: "#7C3AED", bg: "#EDE9FE" },
  memo: { label: "메모", icon: "📝", color: "#64748B", bg: "#F1F5F9" },
};

// ---------------------------------------------------------------------------
// [2] 딜(영업기회) 단계 정의 - ORO 실제 영업 흐름
// ---------------------------------------------------------------------------
const STAGES = [
  { key: "inquiry", label: "문의", color: "#94A3B8" },
  { key: "quote", label: "견적", color: "#60A5FA" },
  { key: "sample", label: "샘플 발송", color: "#818CF8" },
  { key: "eval", label: "고객 평가", color: "#A78BFA" },
  { key: "approve", label: "승인", color: "#34D399" },
  { key: "mass", label: "양산", color: "#10B981" },
];

// 단계 key로 단계 정보를 빠르게 찾는 도우미 함수
const stageInfo = (key) => STAGES.find((s) => s.key === key) || STAGES[0];

// ---------------------------------------------------------------------------
// [3] 처음 실행할 때 넣어줄 예시 데이터
//     (창고가 완전히 비어있으면 이 데이터로 시작합니다.
//      한 번이라도 저장한 뒤에는 이 데이터 대신 저장된 내용을 씁니다.)
// ---------------------------------------------------------------------------
const SEED = {
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
// [4] 저장/불러오기 도우미 함수
//     기본은 브라우저 localStorage 사용. (Claude 아티팩트처럼 window.storage 를
//     제공하는 환경에서는 그것을 우선 사용해 어디서든 동작하도록 함)
// ---------------------------------------------------------------------------

// 창고에서 데이터 불러오기. 없으면 기본값(fallback)을 돌려줌.
async function loadData(key, fallback) {
  try {
    if (typeof window !== "undefined" && window.storage?.get) {
      const result = await window.storage.get(key);
      if (result && result.value) return JSON.parse(result.value);
      return fallback;
    }
    const raw = localStorage.getItem(key); // 창고에서 꺼내기 시도
    if (raw) {
      return JSON.parse(raw); // 저장은 글자로 되어있으니 원래 형태로 되돌림
    }
    return fallback; // 창고에 없으면 기본값 사용
  } catch (e) {
    // 창고에 해당 키가 아예 없거나 읽기 오류 → 기본값 사용
    return fallback;
  }
}

// 창고에 데이터 저장하기.
async function saveData(key, value) {
  try {
    // 데이터는 글자 형태로 바꿔서 저장 (JSON.stringify)
    if (typeof window !== "undefined" && window.storage?.set) {
      await window.storage.set(key, JSON.stringify(value));
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (e) {
    console.error("저장 실패:", e);
  }
}

// 고유 id 만들기 (새 거래처/딜/기록 추가할 때 사용)
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---------------------------------------------------------------------------
// [5] 메인 컴포넌트
// ---------------------------------------------------------------------------
export default function OroCrmApp() {
  // ----- 화면 상태 -----
  const [screen, setScreen] = useState("dashboard"); // 지금 보는 화면
  const [selectedCompanyId, setSelectedCompanyId] = useState(null); // 거래처 상세에서 어느 회사?
  const [loading, setLoading] = useState(true); // 데이터 불러오는 중?

  // ----- 데이터 상태 (창고에서 불러온 실제 데이터) -----
  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [activities, setActivities] = useState([]);

  // ----- 팝업(모달) 상태 -----
  const [modal, setModal] = useState(null); // null이면 팝업 없음. {type, ...}이면 팝업 열림

  // ----- 앱이 처음 켜질 때: 창고에서 데이터 불러오기 -----
  useEffect(() => {
    (async () => {
      setCompanies(await loadData("oro_companies", SEED.companies));
      setContacts(await loadData("oro_contacts", SEED.contacts));
      setDeals(await loadData("oro_deals", SEED.deals));
      setActivities(await loadData("oro_activities", SEED.activities));
      setLoading(false); // 다 불러왔으면 로딩 끝
    })();
  }, []);

  // ----- 데이터가 바뀔 때마다 자동으로 창고에 저장 -----
  // (아래 4개 useEffect가 각 데이터를 지켜보다가, 바뀌면 즉시 저장합니다)
  useEffect(() => { if (!loading) saveData("oro_companies", companies); }, [companies, loading]);
  useEffect(() => { if (!loading) saveData("oro_contacts", contacts); }, [contacts, loading]);
  useEffect(() => { if (!loading) saveData("oro_deals", deals); }, [deals, loading]);
  useEffect(() => { if (!loading) saveData("oro_activities", activities); }, [activities, loading]);

  // ----- 데이터 조작 함수들 -----

  // 새 거래처 추가
  const addCompany = (data) => {
    setCompanies([...companies, { id: newId(), ...data }]);
  };

  // 새 담당자 추가
  const addContact = (data) => {
    setContacts([...contacts, { id: newId(), ...data }]);
  };

  // 새 딜 추가
  const addDeal = (data) => {
    setDeals([...deals, { id: newId(), ...data }]);
  };

  // 딜 단계 변경 (파이프라인에서 앞/뒤 이동)
  const moveDeal = (dealId, newStage) => {
    setDeals(deals.map((d) => (d.id === dealId ? { ...d, stage: newStage } : d)));
  };

  // 새 대화 기록 추가 (이메일/LINE/WeChat 수동 기록의 핵심)
  const addActivity = (data) => {
    setActivities([{ id: newId(), ...data }, ...activities]); // 최신 것이 맨 위로
  };

  // 로딩 중이면 로딩 화면 표시
  if (loading) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: T.bg, fontFamily: "sans-serif", color: T.sub }}>
        데이터 불러오는 중...
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "'Pretendard', -apple-system, 'Malgun Gothic', sans-serif",
        background: T.bg,
        color: T.text,
        fontSize: 14,
      }}
    >
      {/* 왼쪽 메뉴 */}
      <Sidebar
        screen={screen}
        setScreen={(s) => { setScreen(s); setSelectedCompanyId(null); }}
        unreplied={countUnreplied(activities)}
      />

      {/* 오른쪽 메인 */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {screen === "dashboard" && (
          <Dashboard
            companies={companies}
            deals={deals}
            activities={activities}
            openCompany={(id) => { setSelectedCompanyId(id); setScreen("company"); }}
          />
        )}
        {screen === "companies" && (
          <CompanyList
            companies={companies}
            deals={deals}
            activities={activities}
            openCompany={(id) => { setSelectedCompanyId(id); setScreen("company"); }}
            onAdd={() => setModal({ type: "company" })}
          />
        )}
        {screen === "company" && selectedCompanyId && (
          <CompanyDetail
            company={companies.find((c) => c.id === selectedCompanyId)}
            contacts={contacts.filter((p) => p.companyId === selectedCompanyId)}
            deals={deals.filter((d) => d.companyId === selectedCompanyId)}
            activities={activities.filter((a) => a.companyId === selectedCompanyId)}
            allDeals={deals}
            back={() => setScreen("companies")}
            onAddActivity={() => setModal({ type: "activity", companyId: selectedCompanyId })}
            onAddContact={() => setModal({ type: "contact", companyId: selectedCompanyId })}
            onAddDeal={() => setModal({ type: "deal", companyId: selectedCompanyId })}
          />
        )}
        {screen === "pipeline" && (
          <Pipeline deals={deals} companies={companies} moveDeal={moveDeal} />
        )}
      </div>

      {/* 팝업(모달) - 필요할 때만 나타남 */}
      {modal?.type === "company" && (
        <CompanyModal onClose={() => setModal(null)} onSave={(d) => { addCompany(d); setModal(null); }} />
      )}
      {modal?.type === "contact" && (
        <ContactModal companyId={modal.companyId} onClose={() => setModal(null)} onSave={(d) => { addContact(d); setModal(null); }} />
      )}
      {modal?.type === "deal" && (
        <DealModal companyId={modal.companyId} onClose={() => setModal(null)} onSave={(d) => { addDeal(d); setModal(null); }} />
      )}
      {modal?.type === "activity" && (
        <ActivityModal
          companyId={modal.companyId}
          deals={deals.filter((d) => d.companyId === modal.companyId)}
          onClose={() => setModal(null)}
          onSave={(d) => { addActivity(d); setModal(null); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 도우미: 답장 필요한 메일 개수 세기
// (마지막 활동이 "받은 것"인데 그 뒤로 우리가 답한 게 없으면 = 답장 필요)
// ---------------------------------------------------------------------------
function countUnreplied(activities) {
  // 회사별로 가장 최근 활동을 확인
  const byCompany = {};
  activities.forEach((a) => {
    if (!byCompany[a.companyId] || a.date > byCompany[a.companyId].date) {
      byCompany[a.companyId] = a;
    }
  });
  // 가장 최근이 "받은 것"이면 답장 필요로 카운트
  return Object.values(byCompany).filter((a) => a.direction === "received").length;
}

// ===========================================================================
// 사이드바
// ===========================================================================
function Sidebar({ screen, setScreen, unreplied }) {
  const menus = [
    { key: "dashboard", label: "대시보드", icon: "▦" },
    { key: "companies", label: "거래처", icon: "🏢" },
    { key: "pipeline", label: "영업 파이프라인", icon: "▤" },
  ];

  return (
    <div style={{ width: 220, background: T.navy, color: "#fff", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "22px 20px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>
          ORO <span style={{ color: T.teal }}>CRM</span>
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>오알오 주식회사</div>
      </div>

      <div style={{ padding: "12px 10px", flex: 1 }}>
        {menus.map((m) => {
          const active = screen === m.key || (m.key === "companies" && screen === "company");
          return (
            <button
              key={m.key}
              onClick={() => setScreen(m.key)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "11px 14px", marginBottom: 4, border: "none", borderRadius: 8,
                cursor: "pointer", textAlign: "left", fontSize: 14,
                fontWeight: active ? 700 : 500,
                background: active ? T.teal : "transparent",
                color: active ? T.navy : "rgba(255,255,255,0.8)",
              }}
            >
              <span style={{ fontSize: 15, width: 18 }}>{m.icon}</span>
              <span style={{ flex: 1 }}>{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* LINE 공식계정 연동 - 나중 옵션 자리 */}
      <div style={{ padding: "0 14px 12px" }}>
        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "12px 14px", fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: "rgba(255,255,255,0.75)", marginBottom: 4 }}>💬 LINE 자동 연동</div>
          공식계정 전환 시 활성화 예정<br />(현재는 수동 기록 사용)
        </div>
      </div>

      <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.1)", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.teal, color: T.navy, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>이</div>
          <div>
            <div style={{ color: "#fff", fontWeight: 600 }}>이동욱</div>
            <div style={{ fontSize: 10 }}>데이터 저장됨</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// 공통 헤더
// ===========================================================================
function Header({ title, sub, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 28px", background: T.card, borderBottom: `1px solid ${T.border}` }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{title}</div>
        {sub && <div style={{ fontSize: 13, color: T.sub, marginTop: 3 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// ===========================================================================
// 화면 1: 대시보드
// ===========================================================================
function Dashboard({ companies, deals, activities, openCompany }) {
  // 답장 필요한 메일 찾기 (회사별 최근 활동이 "받음"인 경우)
  const byCompany = {};
  activities.forEach((a) => {
    if (!byCompany[a.companyId] || a.date > byCompany[a.companyId].date) byCompany[a.companyId] = a;
  });
  const needReply = Object.values(byCompany).filter((a) => a.direction === "received");

  const openDeals = deals.filter((d) => d.stage !== "mass"); // 양산 전 = 진행 중

  // 이번 달 활동 수 (오늘 날짜 기준 YYYY-MM)
  const ym = new Date().toISOString().slice(0, 7);
  const thisMonth = activities.filter((a) => a.date.startsWith(ym)).length;

  return (
    <div>
      <Header title="대시보드" sub="오늘 챙겨야 할 것들" />
      <div style={{ padding: 28 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          <StatCard label="답장 필요" value={needReply.length} unit="건" color={T.danger} hint="받고 아직 회신 안 함" />
          <StatCard label="진행 중인 딜" value={openDeals.length} unit="건" color={T.teal} hint="양산 전 단계" />
          <StatCard label="전체 거래처" value={companies.length} unit="개사" color={T.navy} hint="등록됨" />
          <StatCard label="이번 달 대화" value={thisMonth} unit="건" color={T.warn} hint="모든 채널" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* 답장 필요한 메일 */}
          <Panel title="답장이 필요한 대화">
            {needReply.length === 0 && <Empty>답장 필요한 대화가 없습니다 👍</Empty>}
            {needReply.map((a, i) => {
              const company = companies.find((c) => c.id === a.companyId);
              const ch = CHANNELS[a.channel];
              return (
                <div key={a.id} onClick={() => openCompany(a.companyId)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: i < needReply.length - 1 ? `1px solid ${T.border}` : "none", cursor: "pointer" }}>
                  <span style={{ fontSize: 18 }}>{ch.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: T.sub }}>{company?.name} · {a.person}</div>
                  </div>
                  <span style={{ fontSize: 11, color: T.sub }}>{a.date.slice(5, 10)}</span>
                </div>
              );
            })}
          </Panel>

          {/* 채널별 이번 달 대화량 */}
          <Panel title="채널별 대화 현황">
            {Object.entries(CHANNELS).map(([key, ch]) => {
              const count = activities.filter((a) => a.channel === key).length;
              const max = Math.max(1, ...Object.keys(CHANNELS).map((k) => activities.filter((a) => a.channel === k).length));
              return (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px" }}>
                  <span style={{ fontSize: 16, width: 24 }}>{ch.icon}</span>
                  <span style={{ width: 60, fontSize: 13, fontWeight: 600 }}>{ch.label}</span>
                  <div style={{ flex: 1, height: 8, background: T.bg, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${(count / max) * 100}%`, height: "100%", background: ch.color, borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.sub, width: 30, textAlign: "right" }}>{count}</span>
                </div>
              );
            })}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, unit, color, hint }) {
  return (
    <div style={{ background: T.card, borderRadius: 12, padding: 20, border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 12, color: T.sub, fontWeight: 600 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, margin: "8px 0 4px" }}>
        <span style={{ fontSize: 32, fontWeight: 800, color }}>{value}</span>
        <span style={{ fontSize: 14, color: T.sub, fontWeight: 600 }}>{unit}</span>
      </div>
      <div style={{ fontSize: 11, color: T.sub }}>{hint}</div>
    </div>
  );
}

// ===========================================================================
// 화면 2: 거래처 목록
// ===========================================================================
function CompanyList({ companies, deals, activities, openCompany, onAdd }) {
  return (
    <div>
      <Header
        title="거래처"
        sub={`${companies.length}개사 등록됨`}
        right={<button onClick={onAdd} style={btnStyle("primary")}>+ 거래처 추가</button>}
      />
      <div style={{ padding: 28 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {companies.map((c) => {
            const dealCount = deals.filter((d) => d.companyId === c.id && d.stage !== "mass").length;
            const lastActivity = activities.filter((a) => a.companyId === c.id).sort((a, b) => b.date.localeCompare(a.date))[0];
            return (
              <div key={c.id} onClick={() => openCompany(c.id)}
                style={{ background: T.card, borderRadius: 12, padding: 20, border: `1px solid ${T.border}`, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: T.navy, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>
                    {c.name.slice(0, 2)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: T.sub }}>{c.country} · {c.domain}</div>
                  </div>
                  <TierBadge tier={c.tier} />
                </div>
                <div style={{ fontSize: 12, color: T.sub, marginBottom: 10 }}>{c.product}</div>
                <div style={{ display: "flex", gap: 8, fontSize: 11, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                  <span style={{ color: T.teal, fontWeight: 700 }}>진행 딜 {dealCount}</span>
                  <span style={{ color: T.sub, marginLeft: "auto" }}>
                    {lastActivity ? `최근 ${lastActivity.date.slice(5, 10)}` : "대화 없음"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// 화면 3: 거래처 상세 (CRM의 심장)
// ===========================================================================
function CompanyDetail({ company, contacts, deals, activities, back, onAddActivity, onAddContact, onAddDeal }) {
  const [filter, setFilter] = useState("all"); // 타임라인 채널 필터

  if (!company) return null;

  // 필터 적용된 활동 목록 (최신순 정렬)
  const filtered = activities
    .filter((a) => filter === "all" || a.channel === filter)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      <Header
        title={company.name}
        sub={`${company.country} · ${company.domain} · ${company.tier} 거래처`}
        right={<button onClick={back} style={btnStyle("ghost")}>← 목록으로</button>}
      />
      <div style={{ display: "flex", gap: 20, padding: 28 }}>
        {/* 왼쪽 정보 */}
        <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* 회사 정보 */}
          <div style={{ background: T.card, borderRadius: 12, padding: 20, border: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: T.navy, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800 }}>
                {company.name.slice(0, 2)}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{company.name}</div>
                <TierBadge tier={company.tier} />
              </div>
            </div>
            <InfoRow label="국가" value={company.country} />
            <InfoRow label="도메인" value={company.domain} />
            <InfoRow label="제품군" value={company.product} />
            <InfoRow label="총 대화" value={`${activities.length}건`} />
            {company.memo && (
              <div style={{ marginTop: 10, padding: 10, background: T.bg, borderRadius: 8, fontSize: 12, color: T.sub, lineHeight: 1.5 }}>
                {company.memo}
              </div>
            )}
          </div>

          {/* 담당자 */}
          <div style={{ background: T.card, borderRadius: 12, padding: 20, border: `1px solid ${T.border}` }}>
            <SectionHead label="담당자" onAdd={onAddContact} />
            {contacts.length === 0 && <Empty small>담당자를 추가하세요</Empty>}
            {contacts.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: T.navy }}>
                  {c.name[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: T.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.role} · {c.contact}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 딜 */}
          <div style={{ background: T.card, borderRadius: 12, padding: 20, border: `1px solid ${T.border}` }}>
            <SectionHead label="진행 중인 딜" onAdd={onAddDeal} />
            {deals.length === 0 && <Empty small>딜을 추가하세요</Empty>}
            {deals.map((d) => {
              const s = stageInfo(d.stage);
              return (
                <div key={d.id} style={{ padding: "10px 12px", background: T.bg, borderRadius: 8, marginTop: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{d.title}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: T.sub }}>{d.spec}</span>
                    <span style={{ fontSize: 11, color: s.color, fontWeight: 700 }}>{s.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 오른쪽 타임라인 */}
        <div style={{ flex: 1 }}>
          <div style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>대화 타임라인</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>전체</FilterChip>
                {Object.entries(CHANNELS).map(([key, ch]) => (
                  <FilterChip key={key} active={filter === key} onClick={() => setFilter(key)}>
                    {ch.icon} {ch.label}
                  </FilterChip>
                ))}
                <button onClick={onAddActivity} style={{ ...btnStyle("primary"), fontSize: 12, padding: "7px 14px", marginLeft: 4 }}>
                  + 대화 기록
                </button>
              </div>
            </div>

            <div style={{ padding: "8px 0" }}>
              {filtered.length === 0 && (
                <Empty>
                  {filter === "all" ? "아직 기록된 대화가 없습니다" : `${CHANNELS[filter].label} 대화가 없습니다`}
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    이메일·LINE·WeChat 대화를 "+ 대화 기록"으로 남겨보세요
                  </div>
                </Empty>
              )}
              {filtered.map((a, i) => (
                <ActivityItem key={a.id} activity={a} deal={deals.find((d) => d.id === a.dealId)} last={i === filtered.length - 1} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 타임라인 개별 항목
function ActivityItem({ activity, deal, last }) {
  const ch = CHANNELS[activity.channel];
  const isSent = activity.direction === "sent";
  return (
    <div style={{ display: "flex", gap: 14, padding: "16px 20px", borderBottom: last ? "none" : `1px solid ${T.border}` }}>
      <div style={{ flexShrink: 0, paddingTop: 2 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: ch.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
          {ch.icon}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{activity.person}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: ch.color, background: ch.bg, padding: "1px 7px", borderRadius: 4 }}>
              {ch.label}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, color: isSent ? T.tealDark : T.navy, background: isSent ? "#CCFBF1" : "#DBEAFE", padding: "1px 7px", borderRadius: 4 }}>
              {isSent ? "보냄 ↑" : "받음 ↓"}
            </span>
          </div>
          <span style={{ fontSize: 11, color: T.sub }}>{activity.date}</span>
        </div>
        <div style={{ fontWeight: 600, fontSize: 14, margin: "5px 0" }}>{activity.title}</div>
        <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{activity.body}</div>
        {deal && (
          <div style={{ marginTop: 8 }}>
            <span style={{ fontSize: 11, color: T.teal, fontWeight: 600 }}>🔗 {deal.title}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// 화면 4: 파이프라인 (칸반)
// ===========================================================================
function Pipeline({ deals, companies, moveDeal }) {
  const companyName = (id) => companies.find((c) => c.id === id)?.name || "?";

  return (
    <div>
      <Header title="영업 파이프라인" sub="◀ ▶ 버튼으로 딜의 단계를 옮기세요" />
      <div style={{ padding: 28, overflowX: "auto" }}>
        <div style={{ display: "flex", gap: 14, minWidth: "max-content" }}>
          {STAGES.map((stage) => {
            const cards = deals.filter((d) => d.stage === stage.key);
            return (
              <div key={stage.key} style={{ width: 230, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "0 4px" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: stage.color }} />
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{stage.label}</span>
                  <span style={{ fontSize: 12, color: T.sub, fontWeight: 600 }}>{cards.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {cards.map((card) => {
                    const idx = STAGES.findIndex((s) => s.key === stage.key);
                    return (
                      <div key={card.id} style={{ background: T.card, borderRadius: 10, padding: 14, border: `1px solid ${T.border}`, borderTop: `3px solid ${stage.color}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                          <div style={{ width: 22, height: 22, borderRadius: 6, background: T.navy, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 9 }}>
                            {companyName(card.companyId).slice(0, 2)}
                          </div>
                          <span style={{ fontWeight: 700, fontSize: 12 }}>{companyName(card.companyId)}</span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{card.title}</div>
                        <div style={{ fontSize: 11, color: T.sub, marginBottom: 8 }}>{card.spec}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.navy, paddingBottom: 8, borderBottom: `1px solid ${T.border}`, marginBottom: 8 }}>
                          {card.value}
                        </div>
                        {/* 단계 이동 버튼 */}
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => idx > 0 && moveDeal(card.id, STAGES[idx - 1].key)}
                            disabled={idx === 0}
                            style={{ flex: 1, fontSize: 11, padding: "5px", borderRadius: 6, border: `1px solid ${T.border}`, background: idx === 0 ? T.bg : "#fff", color: idx === 0 ? "#CBD5E1" : T.sub, cursor: idx === 0 ? "default" : "pointer", fontWeight: 600 }}
                          >
                            ◀ 이전
                          </button>
                          <button
                            onClick={() => idx < STAGES.length - 1 && moveDeal(card.id, STAGES[idx + 1].key)}
                            disabled={idx === STAGES.length - 1}
                            style={{ flex: 1, fontSize: 11, padding: "5px", borderRadius: 6, border: "none", background: idx === STAGES.length - 1 ? T.bg : T.teal, color: idx === STAGES.length - 1 ? "#CBD5E1" : T.navy, cursor: idx === STAGES.length - 1 ? "default" : "pointer", fontWeight: 700 }}
                          >
                            다음 ▶
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {cards.length === 0 && (
                    <div style={{ border: `2px dashed ${T.border}`, borderRadius: 10, padding: 20, textAlign: "center", fontSize: 12, color: T.sub }}>
                      비어 있음
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// 팝업(모달)들
// ===========================================================================

// 모달 껍데기 (배경 어둡게 + 가운데 흰 박스)
function Modal({ title, onClose, children }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,42,67,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{title}</div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", color: T.sub, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );
}

// 입력 필드 (라벨 + 인풋)
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: T.text }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 8,
  border: `1px solid ${T.border}`, outline: "none", boxSizing: "border-box",
  fontFamily: "inherit",
};

// 거래처 추가 모달
function CompanyModal({ onClose, onSave }) {
  const [f, setF] = useState({ name: "", domain: "", country: "한국", tier: "일반", product: "", memo: "" });
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Modal title="거래처 추가" onClose={onClose}>
      <Field label="회사명 *"><input style={inputStyle} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="예: ISC" /></Field>
      <Field label="이메일 도메인 (@뒤)"><input style={inputStyle} value={f.domain} onChange={(e) => set("domain", e.target.value)} placeholder="예: isc.co.kr" /></Field>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label="국가">
            <select style={inputStyle} value={f.country} onChange={(e) => set("country", e.target.value)}>
              <option>한국</option><option>대만</option><option>중국</option><option>기타</option>
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="등급">
            <select style={inputStyle} value={f.tier} onChange={(e) => set("tier", e.target.value)}>
              <option>핵심</option><option>일반</option><option>잠재</option>
            </select>
          </Field>
        </div>
      </div>
      <Field label="제품군"><input style={inputStyle} value={f.product} onChange={(e) => set("product", e.target.value)} placeholder="예: Au / Ag 도금" /></Field>
      <Field label="메모"><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={f.memo} onChange={(e) => set("memo", e.target.value)} placeholder="예: LINE으로 주로 소통" /></Field>
      <ModalActions onClose={onClose} onSave={() => f.name.trim() && onSave(f)} disabled={!f.name.trim()} />
    </Modal>
  );
}

// 담당자 추가 모달
function ContactModal({ companyId, onClose, onSave }) {
  const [f, setF] = useState({ companyId, name: "", role: "구매", contact: "" });
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Modal title="담당자 추가" onClose={onClose}>
      <Field label="이름 *"><input style={inputStyle} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="예: 김구매 과장" /></Field>
      <Field label="역할">
        <select style={inputStyle} value={f.role} onChange={(e) => set("role", e.target.value)}>
          <option>구매</option><option>품질/연구</option><option>영업</option><option>대표</option><option>기타</option>
        </select>
      </Field>
      <Field label="연락처 (이메일/LINE ID/WeChat ID)"><input style={inputStyle} value={f.contact} onChange={(e) => set("contact", e.target.value)} placeholder="예: kim@isc.co.kr 또는 LINE: chen_tfe" /></Field>
      <ModalActions onClose={onClose} onSave={() => f.name.trim() && onSave(f)} disabled={!f.name.trim()} />
    </Modal>
  );
}

// 딜 추가 모달
function DealModal({ companyId, onClose, onSave }) {
  const [f, setF] = useState({ companyId, title: "", spec: "", stage: "inquiry", value: "" });
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Modal title="딜(영업기회) 추가" onClose={onClose}>
      <Field label="제목 *"><input style={inputStyle} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="예: Au도금 양산 견적" /></Field>
      <Field label="사양"><input style={inputStyle} value={f.spec} onChange={(e) => set("spec", e.target.value)} placeholder="예: Au 0.3μm · 월5kg" /></Field>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label="현재 단계">
            <select style={inputStyle} value={f.stage} onChange={(e) => set("stage", e.target.value)}>
              {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="예상 금액"><input style={inputStyle} value={f.value} onChange={(e) => set("value", e.target.value)} placeholder="예: 월 750만" /></Field>
        </div>
      </div>
      <ModalActions onClose={onClose} onSave={() => f.title.trim() && onSave(f)} disabled={!f.title.trim()} />
    </Modal>
  );
}

// 대화 기록 추가 모달 (핵심!)
function ActivityModal({ companyId, deals, onClose, onSave }) {
  // 오늘 날짜를 기본값으로 (YYYY-MM-DD HH:MM 형태)
  const now = new Date();
  const defaultDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const [f, setF] = useState({
    companyId, channel: "email", direction: "received",
    person: "", title: "", body: "", dealId: "", date: defaultDate,
  });
  const set = (k, v) => setF({ ...f, [k]: v });

  return (
    <Modal title="대화 기록 추가" onClose={onClose}>
      {/* 채널 선택 - 버튼으로 */}
      <Field label="채널 *">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.entries(CHANNELS).map(([key, ch]) => (
            <button key={key} onClick={() => set("channel", key)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
                border: `1px solid ${f.channel === key ? ch.color : T.border}`,
                background: f.channel === key ? ch.bg : "#fff",
                color: f.channel === key ? ch.color : T.sub,
              }}>
              {ch.icon} {ch.label}
            </button>
          ))}
        </div>
      </Field>

      {/* 방향 선택 */}
      <Field label="방향 *">
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => set("direction", "received")}
            style={{ flex: 1, padding: "8px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `1px solid ${f.direction === "received" ? T.navy : T.border}`, background: f.direction === "received" ? "#DBEAFE" : "#fff", color: f.direction === "received" ? T.navy : T.sub }}>
            받음 ↓ (고객→나)
          </button>
          <button onClick={() => set("direction", "sent")}
            style={{ flex: 1, padding: "8px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `1px solid ${f.direction === "sent" ? T.tealDark : T.border}`, background: f.direction === "sent" ? "#CCFBF1" : "#fff", color: f.direction === "sent" ? T.tealDark : T.sub }}>
            보냄 ↑ (나→고객)
          </button>
        </div>
      </Field>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label="상대방 이름"><input style={inputStyle} value={f.person} onChange={(e) => set("person", e.target.value)} placeholder="예: Chen 부장" /></Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="날짜/시간"><input style={inputStyle} value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
        </div>
      </div>

      <Field label="제목 *"><input style={inputStyle} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="예: 납기 단축 문의" /></Field>
      <Field label="내용 (LINE·WeChat 대화는 복사해서 붙여넣으세요)">
        <textarea style={{ ...inputStyle, minHeight: 90, resize: "vertical" }} value={f.body} onChange={(e) => set("body", e.target.value)} placeholder="대화 내용을 여기에 붙여넣기..." />
      </Field>

      {deals.length > 0 && (
        <Field label="연결할 딜 (선택)">
          <select style={inputStyle} value={f.dealId} onChange={(e) => set("dealId", e.target.value)}>
            <option value="">연결 안 함</option>
            {deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
        </Field>
      )}

      <ModalActions onClose={onClose} onSave={() => f.title.trim() && onSave(f)} disabled={!f.title.trim()} saveLabel="기록 저장" />
    </Modal>
  );
}

// 모달 하단 버튼 (취소 / 저장)
function ModalActions({ onClose, onSave, disabled, saveLabel = "저장" }) {
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
      <button onClick={onClose} style={{ ...btnStyle("ghost"), flex: 1, padding: "11px" }}>취소</button>
      <button onClick={onSave} disabled={disabled} style={{ ...btnStyle("primary"), flex: 1, padding: "11px", opacity: disabled ? 0.4 : 1, cursor: disabled ? "default" : "pointer" }}>
        {saveLabel}
      </button>
    </div>
  );
}

// ===========================================================================
// 작은 재사용 부품들
// ===========================================================================
function Panel({ title, children }) {
  return (
    <div style={{ background: T.card, borderRadius: 12, padding: 20, border: `1px solid ${T.border}` }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function SectionHead({ label, onAdd }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      {onAdd && <button onClick={onAdd} style={{ border: "none", background: T.bg, color: T.teal, borderRadius: 6, width: 24, height: 24, cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1 }}>+</button>}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
      <span style={{ color: T.sub }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: "right", maxWidth: "60%" }}>{value}</span>
    </div>
  );
}

function TierBadge({ tier }) {
  const colors = {
    핵심: { bg: "#FEF3C7", color: "#92400E" },
    일반: { bg: "#E0E7FF", color: "#3730A3" },
    잠재: { bg: "#F1F5F9", color: "#64748B" },
  };
  const c = colors[tier] || colors.일반;
  return <span style={{ fontSize: 11, background: c.bg, color: c.color, padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>{tier}</span>;
}

function FilterChip({ children, active, onClick }) {
  return (
    <span onClick={onClick} style={{ fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 20, cursor: "pointer", background: active ? T.navy : T.bg, color: active ? "#fff" : T.sub, border: `1px solid ${active ? T.navy : T.border}`, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Empty({ children, small }) {
  return (
    <div style={{ textAlign: "center", padding: small ? "16px 0" : "40px 20px", color: T.sub, fontSize: small ? 12 : 14 }}>
      {children}
    </div>
  );
}

function btnStyle(variant) {
  const base = { border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13, padding: "9px 16px" };
  if (variant === "primary") return { ...base, background: T.teal, color: T.navy };
  if (variant === "ghost") return { ...base, background: T.bg, color: T.text, border: `1px solid ${T.border}` };
  return base;
}
