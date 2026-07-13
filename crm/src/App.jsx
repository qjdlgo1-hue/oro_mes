import React, { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import {
  cloudLoadAll, cloudLoadOne, cloudInsert, cloudUpdate, cloudDelete, cloudDeleteCompanyCascade,
  localLoad, localSave, getSavedMode, saveMode,
  mailAccountsList, mailAccountSave, mailAccountDelete,
} from "./lib/db";

// ============================================================================
// ORO CRM - 실제 동작 버전 (2단계: Supabase 연동)
// ----------------------------------------------------------------------------
// [저장 방식 - 두 가지 모드]
//   클라우드 모드(기본): MES와 같은 Supabase 서버 DB에 저장.
//     → MES 계정으로 로그인하면 팀원 모두가 같은 데이터를 봅니다.
//   로컬 모드: 브라우저 localStorage에 저장. 로그인 없이 바로 사용.
//     → 이 브라우저에서만 보이는 개인 연습장 같은 것.
//
// [지금 되는 것]
//   거래처/담당자/딜/대화기록 입력 → 서버에 저장 → 어느 기기에서든 로그인하면 보임
//   이메일/LINE/WeChat 대화를 수동으로 기록 → 타임라인에 채널별로 쌓임
//
// [아직 안 되는 것]
//   메일 자동 수집 (다음 단계)
//   다른 사람이 수정한 내용의 실시간 반영 (새로고침하면 보임)
// ============================================================================

// ---------------------------------------------------------------------------
// [0] 디자인 색상 토큰 — MES(src/index.css :root)와 동일한 ORO 브랜드 팔레트
//     딥 테크 네이비 + 일렉트릭 틸 포인트 + 골드 로고 + 실버 화이트 배경
// ---------------------------------------------------------------------------
const T = {
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
const CHANNELS = {
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
const STAGES = [
  { key: "inquiry", label: "문의", color: "#8B97A3" },
  { key: "quote", label: "견적", color: "#4F7396" },
  { key: "sample", label: "샘플 발송", color: "#2E8FA0" },
  { key: "eval", label: "고객 평가", color: "#1BA3A3" },
  { key: "approve", label: "승인", color: "#178E6E" },
  { key: "mass", label: "양산", color: "#0E6B52" },
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
// [4] 저장/불러오기는 src/lib/db.js 가 담당합니다.
//     (클라우드=Supabase / 로컬=localStorage 를 그 파일이 알아서 처리)
// ---------------------------------------------------------------------------

// 고유 id 만들기 (새 거래처/딜/기록 추가할 때 사용)
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// 모바일 화면인지 감지 (768px 이하) — 창 크기가 바뀌면 자동 갱신
function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 768px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const onChange = (e) => setMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

// ---------------------------------------------------------------------------
// [5] 메인 컴포넌트
// ---------------------------------------------------------------------------
export default function OroCrmApp() {
  // ----- 화면 상태 -----
  const [screen, setScreen] = useState("dashboard"); // 지금 보는 화면
  const [selectedCompanyId, setSelectedCompanyId] = useState(null); // 거래처 상세에서 어느 회사?
  const [loading, setLoading] = useState(true); // 데이터 불러오는 중?
  const [loadError, setLoadError] = useState(""); // 서버에서 불러오다 실패하면 메시지 표시

  // ----- 저장 모드 & 로그인 상태 -----
  const [mode, setMode] = useState(getSavedMode()); // "cloud"(서버 공유) | "local"(이 브라우저만)
  const [session, setSession] = useState(null); // 로그인 정보 (없으면 로그인 화면)
  const [authChecked, setAuthChecked] = useState(false); // 로그인 여부 확인이 끝났는지

  // ----- 데이터 상태 -----
  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [activities, setActivities] = useState([]);

  // ----- 팝업(모달) 상태 -----
  const [modal, setModal] = useState(null); // null이면 팝업 없음. {type, ...}이면 팝업 열림

  const isMobile = useIsMobile(); // 모바일이면 사이드바 대신 상단바+하단 탭
  const [searchOpen, setSearchOpen] = useState(false); // 통합 검색창

  // ----- 로그인 상태 감시 (앱 켜질 때 1번 확인 + 이후 변화 감지) -----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // ----- 데이터 불러오기 (모드와 로그인 상태가 정해지면 실행) -----
  useEffect(() => {
    (async () => {
      if (mode === "cloud") {
        if (!authChecked) return; // 아직 로그인 확인 중
        if (!session) { setLoading(false); return; } // 로그인 화면이 뜰 차례
        setLoading(true);
        try {
          const all = await cloudLoadAll(); // 서버에서 전부 가져오기
          setCompanies(all.companies);
          setContacts(all.contacts);
          setDeals(all.deals);
          setActivities(all.activities);
          setLoadError("");
        } catch (e) {
          setLoadError(e.message);
        }
        setLoading(false);
      } else {
        // 로컬 모드: 브라우저 창고에서 (비어있으면 예시 데이터로 시작)
        setCompanies(localLoad("companies", SEED.companies));
        setContacts(localLoad("contacts", SEED.contacts));
        setDeals(localLoad("deals", SEED.deals));
        setActivities(localLoad("activities", SEED.activities));
        setLoadError("");
        setLoading(false);
      }
    })();
  }, [mode, session, authChecked]);

  // ----- 로컬 모드에서만: 데이터가 바뀔 때마다 자동으로 브라우저에 저장 -----
  // (클라우드 모드는 아래 조작 함수들이 서버에 바로 저장하므로 여기선 할 일 없음)
  useEffect(() => { if (!loading && mode === "local") localSave("companies", companies); }, [companies, loading, mode]);
  useEffect(() => { if (!loading && mode === "local") localSave("contacts", contacts); }, [contacts, loading, mode]);
  useEffect(() => { if (!loading && mode === "local") localSave("deals", deals); }, [deals, loading, mode]);
  useEffect(() => { if (!loading && mode === "local") localSave("activities", activities); }, [activities, loading, mode]);

  // ----- 데이터 조작 함수들 -----
  // 클라우드 모드: 서버에 먼저 저장하고, 성공하면 화면 반영 (실패 시 알림)
  // 로컬 모드: 화면만 바꾸면 위 useEffect가 알아서 저장

  // 새 거래처 추가
  const addCompany = async (data) => {
    const item = { id: newId(), ...data };
    if (mode === "cloud") {
      try { await cloudInsert("companies", item); } catch (e) { alert(e.message); return; }
    }
    setCompanies([...companies, item]);
  };

  // 새 담당자 추가
  const addContact = async (data) => {
    const item = { id: newId(), ...data };
    if (mode === "cloud") {
      try { await cloudInsert("contacts", item); } catch (e) { alert(e.message); return; }
    }
    setContacts([...contacts, item]);
  };

  // 새 딜 추가
  const addDeal = async (data) => {
    const item = { id: newId(), ...data };
    if (mode === "cloud") {
      try { await cloudInsert("deals", item); } catch (e) { alert(e.message); return; }
    }
    setDeals([...deals, item]);
  };

  // 딜 단계 변경 (파이프라인에서 앞/뒤 이동)
  const moveDeal = async (dealId, newStage) => {
    if (mode === "cloud") {
      try { await cloudUpdate("deals", dealId, { stage: newStage }); } catch (e) { alert(e.message); return; }
    }
    setDeals(deals.map((d) => (d.id === dealId ? { ...d, stage: newStage } : d)));
  };

  // 새 대화 기록 추가 (이메일/LINE/WeChat 수동 기록의 핵심)
  const addActivity = async (data) => {
    const item = { id: newId(), ...data };
    if (mode === "cloud") {
      try { await cloudInsert("activities", item); } catch (e) { alert(e.message); return; }
    }
    setActivities([item, ...activities]); // 최신 것이 맨 위로
  };

  // ----- 수정 함수들 (모달에서 저장 시 호출) -----
  const kindSetters = { companies: setCompanies, contacts: setContacts, deals: setDeals, activities: setActivities };
  const kindGetters = { companies, contacts, deals, activities };

  const updateItem = async (kind, id, data) => {
    if (mode === "cloud") {
      try { await cloudUpdate(kind, id, data); } catch (e) { alert(e.message); return false; }
    }
    kindSetters[kind](kindGetters[kind].map((x) => (x.id === id ? { ...x, ...data } : x)));
    return true;
  };

  // ----- 삭제 함수들 (휴지통 방식 — 서버 DB에는 남아 있어 복구 가능) -----
  const deleteItem = async (kind, id) => {
    if (mode === "cloud") {
      try { await cloudDelete(kind, id); } catch (e) { alert(e.message); return false; }
    }
    kindSetters[kind](kindGetters[kind].filter((x) => x.id !== id));
    return true;
  };

  // 거래처 삭제: 담당자/딜/대화기록도 함께 삭제
  const deleteCompany = async (companyId) => {
    if (mode === "cloud") {
      try { await cloudDeleteCompanyCascade(companyId); } catch (e) { alert(e.message); return false; }
    }
    setContacts(contacts.filter((x) => x.companyId !== companyId));
    setDeals(deals.filter((x) => x.companyId !== companyId));
    setActivities(activities.filter((x) => x.companyId !== companyId));
    setCompanies(companies.filter((x) => x.id !== companyId));
    setSelectedCompanyId(null);
    setScreen("companies");
    return true;
  };

  // 모드 전환
  const switchToLocal = () => { saveMode("local"); setMode("local"); };
  const switchToCloud = () => { saveMode("cloud"); setMode("cloud"); };
  const logout = async () => { await supabase.auth.signOut(); };

  // 클라우드 모드인데 아직 로그인 확인 중이면 잠시 대기 화면
  if (mode === "cloud" && !authChecked) {
    return <CenterMessage>로그인 확인 중...</CenterMessage>;
  }

  // 클라우드 모드인데 로그인이 안 되어 있으면 로그인 화면
  if (mode === "cloud" && !session) {
    return <LoginScreen onLocalMode={switchToLocal} />;
  }

  // 로딩 중이면 로딩 화면 표시
  if (loading) {
    return <CenterMessage>데이터 불러오는 중...</CenterMessage>;
  }

  // 서버에서 불러오기 실패 (인터넷 문제 등)
  if (loadError) {
    return (
      <CenterMessage>
        <div style={{ color: T.danger, fontWeight: 700, marginBottom: 8 }}>서버 연결에 실패했습니다</div>
        <div style={{ fontSize: 13, marginBottom: 16 }}>{loadError}</div>
        <button onClick={() => window.location.reload()} style={btnStyle("primary")}>다시 시도</button>
      </CenterMessage>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        height: "100vh",
        fontFamily: "-apple-system, 'Segoe UI', 'Malgun Gothic', '맑은 고딕', sans-serif",
        background: T.bg,
        color: T.text,
        fontSize: 14,
      }}
    >
      {/* PC: 왼쪽 메뉴 / 모바일: 상단 슬림 바 */}
      {isMobile ? (
        <MobileTopBar mode={mode} email={session?.user?.email} onLogout={logout} onSwitchToCloud={switchToCloud} onSearch={() => setSearchOpen(true)} />
      ) : (
        <Sidebar
          screen={screen}
          setScreen={(s) => { setScreen(s); setSelectedCompanyId(null); }}
          unreplied={countUnreplied(activities)}
          mode={mode}
          email={session?.user?.email}
          onLogout={logout}
          onSwitchToCloud={switchToCloud}
          onSearch={() => setSearchOpen(true)}
        />
      )}

      {/* 메인 */}
      <div style={{ flex: 1, overflow: "auto", paddingBottom: isMobile ? 64 : 0 }}>
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
            onEditCompany={(c) => setModal({ type: "company", initial: c })}
            onDeleteCompany={(c) => {
              if (window.confirm(`'${c.name}' 거래처를 삭제할까요?\n담당자·딜·대화기록도 함께 삭제됩니다.`)) deleteCompany(c.id);
            }}
            onEditContact={(p) => setModal({ type: "contact", companyId: selectedCompanyId, initial: p })}
            onDeleteContact={(p) => { if (window.confirm(`담당자 '${p.name}'을(를) 삭제할까요?`)) deleteItem("contacts", p.id); }}
            onEditDeal={(d) => setModal({ type: "deal", companyId: selectedCompanyId, initial: d })}
            onDeleteDeal={(d) => { if (window.confirm(`딜 '${d.title}'을(를) 삭제할까요?`)) deleteItem("deals", d.id); }}
            onEditActivity={(a) => setModal({ type: "activity", companyId: selectedCompanyId, initial: a })}
            onDeleteActivity={(a) => { if (window.confirm(`대화 기록 '${a.title}'을(를) 삭제할까요?`)) deleteItem("activities", a.id); }}
          />
        )}
        {screen === "pipeline" && (
          <Pipeline
            deals={deals}
            companies={companies}
            moveDeal={moveDeal}
            onEditDeal={(d) => setModal({ type: "deal", companyId: d.companyId, initial: d })}
          />
        )}
        {screen === "settings" && <SettingsScreen mode={mode} />}
      </div>

      {/* 모바일: 하단 탭바 */}
      {isMobile && (
        <MobileTabBar screen={screen} setScreen={(s) => { setScreen(s); setSelectedCompanyId(null); }} />
      )}

      {/* 통합 검색 오버레이 */}
      {searchOpen && (
        <SearchOverlay
          companies={companies}
          contacts={contacts}
          deals={deals}
          activities={activities}
          onOpenCompany={(id) => { setSelectedCompanyId(id); setScreen("company"); setSearchOpen(false); }}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* 팝업(모달) - 필요할 때만 나타남. initial이 있으면 수정 모드 */}
      {modal?.type === "company" && (
        <CompanyModal
          initial={modal.initial}
          onClose={() => setModal(null)}
          onSave={(d) => { modal.initial ? updateItem("companies", modal.initial.id, d) : addCompany(d); setModal(null); }}
        />
      )}
      {modal?.type === "contact" && (
        <ContactModal
          companyId={modal.companyId}
          initial={modal.initial}
          onClose={() => setModal(null)}
          onSave={(d) => { modal.initial ? updateItem("contacts", modal.initial.id, d) : addContact(d); setModal(null); }}
        />
      )}
      {modal?.type === "deal" && (
        <DealModal
          companyId={modal.companyId}
          initial={modal.initial}
          onClose={() => setModal(null)}
          onSave={(d) => { modal.initial ? updateItem("deals", modal.initial.id, d) : addDeal(d); setModal(null); }}
        />
      )}
      {modal?.type === "activity" && (
        <ActivityModal
          companyId={modal.companyId}
          initial={modal.initial}
          deals={deals.filter((d) => d.companyId === modal.companyId)}
          onClose={() => setModal(null)}
          onSave={(d) => { modal.initial ? updateItem("activities", modal.initial.id, d) : addActivity(d); setModal(null); }}
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
function Sidebar({ screen, setScreen, unreplied, mode, email, onLogout, onSwitchToCloud, onSearch }) {
  const menus = [
    { key: "dashboard", label: "대시보드", icon: "▦" },
    { key: "companies", label: "거래처", icon: "🏢" },
    { key: "pipeline", label: "영업 파이프라인", icon: "▤" },
    { key: "settings", label: "설정", icon: "⚙" },
  ];

  return (
    <div style={{ width: 220, background: T.card, color: T.text, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "22px 20px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, color: T.navy }}>
          ORO <span style={{ color: T.teal }}>CRM</span>
        </div>
        <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>오알오 주식회사</div>
      </div>

      <div style={{ padding: "12px 10px 0" }}>
        <button onClick={onSearch}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.tint, color: T.sub, cursor: "pointer", fontSize: 13, textAlign: "left" }}>
          🔍 검색...
        </button>
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
                background: active ? T.tint2 : "transparent",
                color: active ? T.teal : T.sub,
                borderLeft: active ? `3px solid ${T.teal}` : "3px solid transparent",
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
        <div style={{ background: T.tint, borderRadius: 8, padding: "12px 14px", fontSize: 11, color: T.sub, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: T.navy, marginBottom: 4 }}>💬 LINE 자동 연동</div>
          공식계정 전환 시 활성화 예정<br />(현재는 수동 기록 사용)
        </div>
      </div>

      <div style={{ padding: "16px 20px", borderTop: `1px solid ${T.border}`, fontSize: 12, color: T.sub }}>
        {mode === "cloud" ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.teal, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>
                {(email || "?")[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: T.navy, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>{email}</div>
                <div style={{ fontSize: 10, color: T.teal, fontWeight: 700 }}>☁️ 서버 저장 (팀 공유)</div>
              </div>
            </div>
            <button onClick={onLogout} style={{ width: "100%", padding: "6px", borderRadius: 6, border: `1px solid ${T.border}`, background: "#fff", color: T.sub, fontSize: 11, cursor: "pointer" }}>
              로그아웃
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 11, marginBottom: 8, color: T.navy }}>💾 로컬 모드<br /><span style={{ fontSize: 10, color: T.sub }}>이 브라우저에만 저장됨</span></div>
            <button onClick={onSwitchToCloud} style={{ width: "100%", padding: "6px", borderRadius: 6, border: "none", background: T.teal, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              ☁️ 서버 모드로 전환 (로그인)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// 화면 5: 설정 — 메일 자동 수집 계정 관리
// (여기 등록한 계정을 수집기가 1시간마다 읽어 IMAP으로 메일을 가져옴)
// ===========================================================================
const MAIL_PRESETS = [
  { key: "naver", label: "네이버 메일", imap_host: "imap.naver.com", imap_port: 993, smtp_host: "smtp.naver.com", smtp_port: 465, hint: "아이디는 @naver.com 앞부분" },
  { key: "works", label: "네이버 웍스", imap_host: "imap.worksmobile.com", imap_port: 993, smtp_host: "smtp.worksmobile.com", smtp_port: 465, hint: "아이디는 이메일 전체 주소" },
  { key: "custom", label: "직접 입력", imap_host: "", imap_port: 993, smtp_host: "", smtp_port: 465, hint: "" },
];

function SettingsScreen({ mode }) {
  const isMobile = useIsMobile();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // null=닫힘, {}=새 계정, 계정객체=수정

  const reload = async () => {
    setLoading(true);
    try {
      setAccounts(await mailAccountsList());
      setError("");
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (mode === "cloud") reload();
    else setLoading(false);
  }, [mode]);

  const remove = async (acc) => {
    if (!window.confirm(`'${acc.label}' 계정을 삭제할까요?\n이후 이 계정의 메일은 수집되지 않습니다.`)) return;
    try { await mailAccountDelete(acc.id); reload(); } catch (e) { alert(e.message); }
  };

  const toggleEnabled = async (acc) => {
    try { await mailAccountSave({ ...acc, enabled: !acc.enabled }); reload(); } catch (e) { alert(e.message); }
  };

  if (mode !== "cloud") {
    return (
      <div>
        <Header title="설정" sub="메일 자동 수집 계정" />
        <div style={{ padding: 28 }}>
          <Empty>
            메일 자동 수집은 서버(클라우드) 모드에서만 사용할 수 있습니다.
            <div style={{ marginTop: 8, fontSize: 12 }}>사이드바 하단에서 "서버 모드로 전환"을 눌러주세요.</div>
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header
        title="설정"
        sub="메일 자동 수집 계정 관리"
        right={<button onClick={() => setEditing({})} style={btnStyle("primary")}>+ 메일 계정 추가</button>}
      />
      <div style={{ padding: isMobile ? 14 : 28, maxWidth: 860 }}>
        <Panel title="메일 자동 수집 계정">
          {loading && <Empty small>불러오는 중...</Empty>}
          {!loading && error && <Empty small><span style={{ color: T.danger }}>{error}</span></Empty>}
          {!loading && !error && accounts.length === 0 && (
            <Empty>
              등록된 메일 계정이 없습니다
              <div style={{ marginTop: 8, fontSize: 12 }}>"+ 메일 계정 추가"로 네이버 메일이나 네이버 웍스 계정을 등록하세요</div>
            </Empty>
          )}
          {accounts.map((a, i) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: i < accounts.length - 1 ? `1px solid ${T.border}` : "none" }}>
              <span style={{ fontSize: 18 }}>📮</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  {a.label}
                  <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 4, background: a.enabled ? T.tint2 : T.tint, color: a.enabled ? T.tealDark : T.sub }}>
                    {a.enabled ? "수집 중" : "중지됨"}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: T.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.username} · IMAP {a.imap_host}:{a.imap_port}{a.smtp_host ? ` · SMTP ${a.smtp_host}:${a.smtp_port}` : ""}
                </div>
              </div>
              <button onClick={() => toggleEnabled(a)} style={{ ...btnStyle("ghost"), fontSize: 11, padding: "5px 10px" }}>
                {a.enabled ? "중지" : "재개"}
              </button>
              <button onClick={() => setEditing(a)} style={{ ...btnStyle("ghost"), fontSize: 11, padding: "5px 10px" }}>수정</button>
              <button onClick={() => remove(a)} style={{ ...btnStyle("ghost"), fontSize: 11, padding: "5px 10px", color: T.danger }}>삭제</button>
            </div>
          ))}
        </Panel>

        <div style={{ height: 20 }} />
        <Panel title="동작 방식 · 주의사항">
          <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.8 }}>
            · 등록한 계정의 받은편지함·보낸편지함을 <b style={{ color: T.navy }}>1시간마다</b> 확인해, 거래처의 "이메일 도메인"과 주고받은 메일을 타임라인에 자동 기록합니다.<br />
            · 네이버 쪽 설정에서 <b style={{ color: T.navy }}>IMAP 사용</b>이 켜져 있어야 합니다 (네이버 메일: 환경설정 → POP3/IMAP 설정).<br />
            · 2단계 인증을 쓰는 계정은 실제 비밀번호 대신 <b style={{ color: T.navy }}>애플리케이션 비밀번호</b>를 발급해 입력하세요.<br />
            · <span style={{ color: T.danger }}>비밀번호는 서버 DB에 저장되며 CRM에 로그인한 팀원이 볼 수 있습니다.</span> 가능하면 전용 앱 비밀번호를 사용하세요.<br />
            · SMTP 정보는 지금은 저장만 해두며, 나중에 CRM에서 메일을 보내는 기능이 생기면 사용됩니다.
          </div>
        </Panel>
      </div>

      {editing !== null && (
        <MailAccountModal
          account={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

// 메일 계정 추가/수정 모달
function MailAccountModal({ account, onClose, onSaved }) {
  const isNew = !account.id;
  const [f, setF] = useState({
    label: account.label || "",
    username: account.username || "",
    password: account.password || "",
    imap_host: account.imap_host || "",
    imap_port: account.imap_port || 993,
    smtp_host: account.smtp_host || "",
    smtp_port: account.smtp_port || 465,
    enabled: account.enabled !== false,
  });
  const [preset, setPreset] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));

  const applyPreset = (p) => {
    setPreset(p.key);
    setF((prev) => ({
      ...prev,
      label: prev.label || (p.key !== "custom" ? p.label : ""),
      imap_host: p.imap_host, imap_port: p.imap_port,
      smtp_host: p.smtp_host, smtp_port: p.smtp_port,
    }));
  };

  const canSave = f.label.trim() && f.username.trim() && f.password && f.imap_host.trim();

  const save = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      await mailAccountSave({
        id: account.id || newId(),
        label: f.label.trim(),
        username: f.username.trim(),
        password: f.password,
        imap_host: f.imap_host.trim(),
        imap_port: parseInt(f.imap_port, 10) || 993,
        smtp_host: f.smtp_host.trim() || null,
        smtp_port: parseInt(f.smtp_port, 10) || 465,
        enabled: f.enabled,
      });
      onSaved();
    } catch (e) {
      alert(e.message);
      setBusy(false);
    }
  };

  const hint = MAIL_PRESETS.find((p) => p.key === preset)?.hint;

  return (
    <Modal title={isNew ? "메일 계정 추가" : "메일 계정 수정"} onClose={onClose}>
      {isNew && (
        <Field label="어떤 메일인가요?">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {MAIL_PRESETS.map((p) => (
              <button key={p.key} onClick={() => applyPreset(p)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600,
                  border: `1px solid ${preset === p.key ? T.teal : T.border}`,
                  background: preset === p.key ? T.tint2 : "#fff",
                  color: preset === p.key ? T.tealDark : T.sub,
                }}>
                {p.label}
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label="이름(라벨) *"><input style={inputStyle} value={f.label} onChange={(e) => set("label", e.target.value)} placeholder="예: 대표 네이버웍스" /></Field>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label={`아이디 *${hint ? ` (${hint})` : ""}`}>
            <input style={inputStyle} value={f.username} onChange={(e) => set("username", e.target.value)} placeholder="예: dwlee@orocorp.kr" autoComplete="off" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="비밀번호 * (앱 비밀번호 권장)">
            <input style={inputStyle} type="password" value={f.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 2 }}>
          <Field label="IMAP 서버 * (메일 읽기)"><input style={inputStyle} value={f.imap_host} onChange={(e) => set("imap_host", e.target.value)} placeholder="imap.naver.com" /></Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="IMAP 포트"><input style={inputStyle} type="number" value={f.imap_port} onChange={(e) => set("imap_port", e.target.value)} /></Field>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 2 }}>
          <Field label="SMTP 서버 (메일 발송 — 선택)"><input style={inputStyle} value={f.smtp_host} onChange={(e) => set("smtp_host", e.target.value)} placeholder="smtp.naver.com" /></Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="SMTP 포트"><input style={inputStyle} type="number" value={f.smtp_port} onChange={(e) => set("smtp_port", e.target.value)} /></Field>
        </div>
      </div>

      <Field label="수집 사용">
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={f.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          이 계정에서 메일을 수집합니다
        </label>
      </Field>

      <ModalActions onClose={onClose} onSave={save} disabled={!canSave || busy} saveLabel={busy ? "저장 중..." : "저장"} />
    </Modal>
  );
}

// ===========================================================================
// 로그인 화면 (클라우드 모드 — MES와 같은 계정 사용)
// ===========================================================================
function LoginScreen({ onLocalMode }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const login = async () => {
    if (!email.trim() || !pw) return;
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    if (error) setErr(error.message === "Invalid login credentials" ? "이메일 또는 비밀번호가 올바르지 않습니다." : error.message);
    setBusy(false);
    // 성공하면 onAuthStateChange가 session을 채워서 자동으로 앱 화면으로 넘어감
  };

  return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: T.bg, fontFamily: "-apple-system, 'Segoe UI', 'Malgun Gothic', '맑은 고딕', sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 10, padding: 32, width: "100%", maxWidth: 360, border: `1px solid ${T.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 0.5, marginBottom: 4, color: T.navy }}>
          ORO <span style={{ color: T.teal }}>CRM</span>
        </div>
        <div style={{ fontSize: 13, color: T.sub, marginBottom: 24 }}>MES와 같은 계정으로 로그인하세요</div>

        <Field label="이메일">
          <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="name@orocorp.kr" onKeyDown={(e) => e.key === "Enter" && login()} />
        </Field>
        <Field label="비밀번호">
          <input style={inputStyle} type="password" value={pw} onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()} />
        </Field>

        {err && <div style={{ color: T.danger, fontSize: 12, marginBottom: 12 }}>{err}</div>}

        <button onClick={login} disabled={busy || !email.trim() || !pw}
          style={{ ...btnStyle("primary"), width: "100%", padding: "12px", fontSize: 14, opacity: busy || !email.trim() || !pw ? 0.5 : 1 }}>
          {busy ? "로그인 중..." : "로그인"}
        </button>

        <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 20, paddingTop: 16, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: T.sub, marginBottom: 8 }}>계정 없이 이 브라우저에서만 써보고 싶다면</div>
          <button onClick={onLocalMode} style={{ ...btnStyle("ghost"), fontSize: 12 }}>
            💾 로컬 모드로 사용 (로그인 없이)
          </button>
        </div>
      </div>
    </div>
  );
}

// 가운데 안내 문구 (로딩/오류 등)
function CenterMessage({ children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", alignItems: "center", justifyContent: "center", background: T.bg, fontFamily: "sans-serif", color: T.sub, textAlign: "center", padding: 20 }}>
      <div>{children}</div>
    </div>
  );
}

// ===========================================================================
// 모바일 상단 바 + 하단 탭바
// ===========================================================================
function MobileTopBar({ mode, email, onLogout, onSwitchToCloud, onSearch }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: T.card, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
      <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.5, color: T.navy }}>
        ORO <span style={{ color: T.teal }}>CRM</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={onSearch} style={{ border: "none", background: "transparent", fontSize: 17, cursor: "pointer", padding: "2px 4px" }}>🔍</button>
        {mode === "cloud" ? (
          <>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: T.teal, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11 }}>
              {(email || "?")[0].toUpperCase()}
            </div>
            <button onClick={onLogout} style={{ ...btnStyle("ghost"), fontSize: 11, padding: "5px 10px" }}>로그아웃</button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 11, color: T.sub }}>💾 로컬</span>
            <button onClick={onSwitchToCloud} style={{ ...btnStyle("primary"), fontSize: 11, padding: "5px 10px" }}>☁ 로그인</button>
          </>
        )}
      </div>
    </div>
  );
}

function MobileTabBar({ screen, setScreen }) {
  const tabs = [
    { key: "dashboard", label: "대시보드", icon: "▦" },
    { key: "companies", label: "거래처", icon: "🏢" },
    { key: "pipeline", label: "파이프라인", icon: "▤" },
    { key: "settings", label: "설정", icon: "⚙" },
  ];
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, display: "flex", background: T.card, borderTop: `1px solid ${T.border}`, zIndex: 50 }}>
      {tabs.map((t) => {
        const active = screen === t.key || (t.key === "companies" && screen === "company");
        return (
          <button key={t.key} onClick={() => setScreen(t.key)}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "8px 0 10px", border: "none", background: "transparent", cursor: "pointer", color: active ? T.teal : T.sub, fontWeight: active ? 700 : 500, fontSize: 11 }}>
            <span style={{ fontSize: 16 }}>{t.icon}</span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ===========================================================================
// 공통 헤더
// ===========================================================================
function Header({ title, sub, right }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, padding: isMobile ? "14px 14px" : "22px 28px", background: T.card, borderBottom: `1px solid ${T.border}` }}>
      <div>
        <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 800 }}>{title}</div>
        {sub && <div style={{ fontSize: isMobile ? 12 : 13, color: T.sub, marginTop: 3 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// ===========================================================================
// 화면 1: 대시보드
// ===========================================================================
function Dashboard({ companies, deals, activities, openCompany }) {
  const isMobile = useIsMobile();
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
      <div style={{ padding: isMobile ? 14 : 28 }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: isMobile ? 10 : 16, marginBottom: isMobile ? 16 : 24 }}>
          <StatCard label="답장 필요" value={needReply.length} unit="건" color={T.danger} hint="받고 아직 회신 안 함" />
          <StatCard label="진행 중인 딜" value={openDeals.length} unit="건" color={T.teal} hint="양산 전 단계" />
          <StatCard label="전체 거래처" value={companies.length} unit="개사" color={T.navy} hint="등록됨" />
          <StatCard label="이번 달 대화" value={thisMonth} unit="건" color={T.warn} hint="모든 채널" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 14 : 20 }}>
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
  const isMobile = useIsMobile();
  return (
    <div>
      <Header
        title="거래처"
        sub={`${companies.length}개사 등록됨`}
        right={<button onClick={onAdd} style={btnStyle("primary")}>+ 거래처 추가</button>}
      />
      <div style={{ padding: isMobile ? 14 : 28 }}>
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
function CompanyDetail({
  company, contacts, deals, activities, back, onAddActivity, onAddContact, onAddDeal,
  onEditCompany, onDeleteCompany, onEditContact, onDeleteContact,
  onEditDeal, onDeleteDeal, onEditActivity, onDeleteActivity,
}) {
  const [filter, setFilter] = useState("all"); // 타임라인 채널 필터
  const isMobile = useIsMobile();

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
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => onEditCompany(company)} style={btnStyle("ghost")}>✎ 수정</button>
            <button onClick={() => onDeleteCompany(company)} style={{ ...btnStyle("ghost"), color: T.danger }}>🗑 삭제</button>
            <button onClick={back} style={btnStyle("ghost")}>← 목록으로</button>
          </div>
        }
      />
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 14 : 20, padding: isMobile ? 14 : 28 }}>
        {/* 왼쪽 정보 (모바일에선 위쪽) */}
        <div style={{ width: isMobile ? "auto" : 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: isMobile ? 14 : 20 }}>
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
                <IconBtn onClick={() => onEditContact(c)}>✎</IconBtn>
                <IconBtn danger onClick={() => onDeleteContact(c)}>🗑</IconBtn>
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
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <div style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 0 }}>{d.title}</div>
                    <IconBtn onClick={() => onEditDeal(d)}>✎</IconBtn>
                    <IconBtn danger onClick={() => onDeleteDeal(d)}>🗑</IconBtn>
                  </div>
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
                <ActivityItem
                  key={a.id}
                  activity={a}
                  deal={deals.find((d) => d.id === a.dealId)}
                  last={i === filtered.length - 1}
                  onEdit={() => onEditActivity(a)}
                  onDelete={() => onDeleteActivity(a)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 타임라인 개별 항목
function ActivityItem({ activity, deal, last, onEdit, onDelete }) {
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
            <span style={{ fontSize: 10, fontWeight: 700, color: isSent ? T.tealDark : T.navy, background: isSent ? T.tint2 : "#E8EEF4", padding: "1px 7px", borderRadius: 4 }}>
              {isSent ? "보냄 ↑" : "받음 ↓"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: 11, color: T.sub }}>{activity.date}</span>
            {onEdit && <IconBtn onClick={onEdit}>✎</IconBtn>}
            {onDelete && <IconBtn danger onClick={onDelete}>🗑</IconBtn>}
          </div>
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
function Pipeline({ deals, companies, moveDeal, onEditDeal }) {
  const isMobile = useIsMobile();
  const companyName = (id) => companies.find((c) => c.id === id)?.name || "?";

  return (
    <div>
      <Header title="영업 파이프라인" sub="◀ ▶ 버튼으로 딜의 단계를 옮기세요" />
      <div style={{ padding: isMobile ? 14 : 28, overflowX: "auto" }}>
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
                          <span style={{ fontWeight: 700, fontSize: 12, flex: 1 }}>{companyName(card.companyId)}</span>
                          <IconBtn onClick={() => onEditDeal(card)}>✎</IconBtn>
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
                            style={{ flex: 1, fontSize: 11, padding: "5px", borderRadius: 6, border: `1px solid ${T.border}`, background: idx === 0 ? T.bg : "#fff", color: idx === 0 ? "#B4BEC8" : T.sub, cursor: idx === 0 ? "default" : "pointer", fontWeight: 600 }}
                          >
                            ◀ 이전
                          </button>
                          <button
                            onClick={() => idx < STAGES.length - 1 && moveDeal(card.id, STAGES[idx + 1].key)}
                            disabled={idx === STAGES.length - 1}
                            style={{ flex: 1, fontSize: 11, padding: "5px", borderRadius: 6, border: "none", background: idx === STAGES.length - 1 ? T.bg : T.teal, color: idx === STAGES.length - 1 ? "#B4BEC8" : "#fff", cursor: idx === STAGES.length - 1 ? "default" : "pointer", fontWeight: 700 }}
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
// 통합 검색 오버레이 — 거래처/담당자/딜/대화를 한 번에 검색
// ===========================================================================
function SearchOverlay({ companies, contacts, deals, activities, onOpenCompany, onClose }) {
  const [q, setQ] = useState("");
  const isMobile = useIsMobile();

  // ESC 키로 닫기
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const query = q.trim().toLowerCase();
  const has = (s) => (s || "").toLowerCase().includes(query);
  const companyName = (id) => companies.find((c) => c.id === id)?.name || "?";

  const results = query
    ? {
        companies: companies.filter((c) => has(c.name) || has(c.domain) || has(c.product) || has(c.memo)).slice(0, 5),
        contacts: contacts.filter((p) => has(p.name) || has(p.contact) || has(p.role)).slice(0, 5),
        deals: deals.filter((d) => has(d.title) || has(d.spec)).slice(0, 5),
        activities: activities.filter((a) => has(a.title) || has(a.body) || has(a.person)).slice(0, 8),
      }
    : null;
  const total = results ? results.companies.length + results.contacts.length + results.deals.length + results.activities.length : 0;

  const Row = ({ icon, title, sub, companyId }) => (
    <div onClick={() => onOpenCompany(companyId)}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, cursor: "pointer" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = T.tint)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      <span style={{ fontSize: 15, width: 20 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ fontSize: 11, color: T.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
      </div>
    </div>
  );

  const Section = ({ label, children }) =>
    children.length > 0 && (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, padding: "6px 12px 2px", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
        {children}
      </div>
    );

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(10,31,61,0.5)", zIndex: 120, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: isMobile ? "16px 10px" : "80px 20px" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 560, maxHeight: isMobile ? "85vh" : "70vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 15 }}>🔍</span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="거래처, 담당자, 딜, 대화 내용 검색..."
            style={{ flex: 1, border: "none", outline: "none", fontSize: 15, fontFamily: "inherit", background: "transparent" }}
          />
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: T.sub, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ overflow: "auto", padding: "8px 6px" }}>
          {!query && <Empty small>검색어를 입력하세요</Empty>}
          {query && total === 0 && <Empty small>'{q}' 검색 결과가 없습니다</Empty>}
          {results && (
            <>
              <Section label={`거래처 (${results.companies.length})`}>
                {results.companies.map((c) => (
                  <Row key={c.id} icon="🏢" title={c.name} sub={`${c.country || ""} · ${c.domain || ""} · ${c.product || ""}`} companyId={c.id} />
                ))}
              </Section>
              <Section label={`담당자 (${results.contacts.length})`}>
                {results.contacts.map((p) => (
                  <Row key={p.id} icon="👤" title={p.name} sub={`${companyName(p.companyId)} · ${p.role || ""} · ${p.contact || ""}`} companyId={p.companyId} />
                ))}
              </Section>
              <Section label={`딜 (${results.deals.length})`}>
                {results.deals.map((d) => (
                  <Row key={d.id} icon="▤" title={d.title} sub={`${companyName(d.companyId)} · ${stageInfo(d.stage).label} · ${d.spec || ""}`} companyId={d.companyId} />
                ))}
              </Section>
              <Section label={`대화 기록 (${results.activities.length})`}>
                {results.activities.map((a) => (
                  <Row key={a.id} icon={CHANNELS[a.channel]?.icon || "📝"} title={a.title} sub={`${companyName(a.companyId)} · ${a.person || ""} · ${a.date}`} companyId={a.companyId} />
                ))}
              </Section>
            </>
          )}
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
  const isMobile = useIsMobile();
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,42,67,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 10 : 20 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: isMobile ? 12 : 16, width: "100%", maxWidth: 480, maxHeight: "92vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ padding: isMobile ? "14px 16px" : "20px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{title}</div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", color: T.sub, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: isMobile ? 16 : 24 }}>{children}</div>
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

// 거래처 추가/수정 모달 (initial이 있으면 수정 모드)
function CompanyModal({ initial, onClose, onSave }) {
  const [f, setF] = useState({ name: "", domain: "", country: "한국", tier: "일반", product: "", memo: "", ...initial });
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Modal title={initial ? "거래처 수정" : "거래처 추가"} onClose={onClose}>
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

// 담당자 추가/수정 모달
function ContactModal({ companyId, initial, onClose, onSave }) {
  const [f, setF] = useState({ companyId, name: "", role: "구매", contact: "", ...initial });
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Modal title={initial ? "담당자 수정" : "담당자 추가"} onClose={onClose}>
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

// 딜 추가/수정 모달
function DealModal({ companyId, initial, onClose, onSave }) {
  const [f, setF] = useState({ companyId, title: "", spec: "", stage: "inquiry", value: "", ...initial });
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <Modal title={initial ? "딜(영업기회) 수정" : "딜(영업기회) 추가"} onClose={onClose}>
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

// 대화 기록 추가/수정 모달 (핵심!)
function ActivityModal({ companyId, initial, deals, onClose, onSave }) {
  // 오늘 날짜를 기본값으로 (YYYY-MM-DD HH:MM 형태)
  const now = new Date();
  const defaultDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const [f, setF] = useState({
    companyId, channel: "email", direction: "received",
    person: "", title: "", body: "", dealId: "", date: defaultDate,
    ...initial,
  });
  const set = (k, v) => setF({ ...f, [k]: v });

  return (
    <Modal title={initial ? "대화 기록 수정" : "대화 기록 추가"} onClose={onClose}>
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
            style={{ flex: 1, padding: "8px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `1px solid ${f.direction === "received" ? T.navy : T.border}`, background: f.direction === "received" ? "#E8EEF4" : "#fff", color: f.direction === "received" ? T.navy : T.sub }}>
            받음 ↓ (고객→나)
          </button>
          <button onClick={() => set("direction", "sent")}
            style={{ flex: 1, padding: "8px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `1px solid ${f.direction === "sent" ? T.tealDark : T.border}`, background: f.direction === "sent" ? T.tint2 : "#fff", color: f.direction === "sent" ? T.tealDark : T.sub }}>
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
  // 핵심 = ORO 골드, 일반 = 스틸 네이비, 잠재 = 실버
  const colors = {
    핵심: { bg: "#F5EFDF", color: "#8A6D2B" },
    일반: { bg: "#E8EEF4", color: "#3A5578" },
    잠재: { bg: "#EBF0F3", color: "#66717D" },
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

// 수정/삭제용 작은 아이콘 버튼
function IconBtn({ onClick, danger, children }) {
  return (
    <button
      onClick={onClick}
      style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 13, color: danger ? T.danger : T.sub, padding: "2px 4px", flexShrink: 0, lineHeight: 1 }}
    >
      {children}
    </button>
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
  // MES button.btn과 동일한 톤: 틸 배경 + 흰 글씨, 모서리 6px
  const base = { border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13, padding: "9px 16px" };
  if (variant === "primary") return { ...base, background: T.teal, color: "#fff" };
  if (variant === "ghost") return { ...base, background: T.tint, color: T.text, border: `1px solid ${T.border}` };
  return base;
}
