import React, { useState, useEffect } from "react";
import { T, SEED, newId } from "./theme";
import { useIsMobile } from "./hooks/useIsMobile";
import { CenterMessage, btnStyle } from "./components/ui";
import { Sidebar, MobileTopBar, MobileTabBar } from "./components/Sidebar";
import { SearchOverlay } from "./components/SearchOverlay";
import { CompanyModal, ContactModal, DealModal, ActivityModal } from "./components/modals";
import { Dashboard } from "./screens/Dashboard";
import { CompanyList } from "./screens/CompanyList";
import { CompanyDetail } from "./screens/CompanyDetail";
import { Pipeline } from "./screens/Pipeline";
import { QuoteScreen } from "./screens/QuoteScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { cloudLoadAll, cloudLoadOne, cloudInsert, cloudUpdate, cloudDelete, cloudDeleteCompanyCascade, localLoad, localSave, getSavedMode, saveMode } from "./lib/db";
import { supabase } from "./lib/supabase";

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
  // 의존성은 session 객체가 아니라 userId — 1시간마다 토큰이 자동 갱신되며
  // 새 session 객체가 와도 사용자가 같으면 전체 재로딩하지 않음
  const userId = session?.user?.id || null;

  // ----- 역할(권한): MES와 같은 profiles.role — master/manager는 편집, 그 외는 조회 전용 -----
  const [role, setRole] = useState(null); // null = 확인 중 (편집 가능으로 취급해 깜빡임 방지)
  useEffect(() => {
    if (mode !== "cloud" || !userId) { setRole(null); return; }
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle()
      .then(({ data }) => setRole(data?.role || "user"))
      .catch(() => setRole("user"));
  }, [mode, userId]);
  const canEdit = mode === "local" || role === null || role === "master" || role === "manager";
  useEffect(() => {
    (async () => {
      if (mode === "cloud") {
        if (!authChecked) return; // 아직 로그인 확인 중
        if (!userId) { setLoading(false); return; } // 로그인 화면이 뜰 차례
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
  }, [mode, userId, authChecked]);

  // ----- 실시간 동기화 (클라우드 모드 + 로그인 상태에서만) -----
  // 다른 팀원의 변경이나 자동 수집된 메일이 저장되면 서버가 알려주고,
  // 해당 종류만 다시 불러와 화면에 반영합니다 (0.5초 디바운스로 묶음 처리).
  useEffect(() => {
    if (mode !== "cloud" || !userId) return;

    const timers = {};
    const refreshKind = (kind) => {
      clearTimeout(timers[kind]);
      timers[kind] = setTimeout(async () => {
        try {
          const rows = await cloudLoadOne(kind);
          const setters = { companies: setCompanies, contacts: setContacts, deals: setDeals, activities: setActivities };
          setters[kind](rows);
        } catch (e) { /* 일시적 네트워크 오류는 무시 (다음 이벤트/포커스 때 재시도됨) */ }
      }, 500);
    };

    const tableToKind = {
      crm_companies: "companies", crm_contacts: "contacts",
      crm_deals: "deals", crm_activities: "activities",
    };
    const channel = supabase.channel("crm-sync");
    Object.keys(tableToKind).forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => refreshKind(tableToKind[table]));
    });
    channel.subscribe();

    // 보조: 창에 다시 돌아왔을 때 전체 새로 불러오기 (실시간 연결이 끊겼을 때 대비)
    const refreshAll = () => Object.values(tableToKind).forEach(refreshKind);
    const onVisible = () => { if (!document.hidden) refreshAll(); };
    window.addEventListener("focus", refreshAll);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("focus", refreshAll);
      document.removeEventListener("visibilitychange", onVisible);
      Object.values(timers).forEach(clearTimeout);
    };
  }, [mode, userId]);

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
    setCompanies((prev) => [...prev, item]);
  };

  // 새 담당자 추가
  const addContact = async (data) => {
    const item = { id: newId(), ...data };
    if (mode === "cloud") {
      try { await cloudInsert("contacts", item); } catch (e) { alert(e.message); return; }
    }
    setContacts((prev) => [...prev, item]);
  };

  // 새 딜 추가
  const addDeal = async (data) => {
    const item = { id: newId(), ...data };
    if (mode === "cloud") {
      try { await cloudInsert("deals", item); } catch (e) { alert(e.message); return; }
    }
    setDeals((prev) => [...prev, item]);
  };

  // 딜 단계 변경 (파이프라인에서 앞/뒤 이동)
  const moveDeal = async (dealId, newStage) => {
    if (mode === "cloud") {
      try { await cloudUpdate("deals", dealId, { stage: newStage }); } catch (e) { alert(e.message); return; }
    }
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage: newStage } : d)));
  };

  // 새 대화 기록 추가 (이메일/LINE/WeChat 수동 기록의 핵심)
  const addActivity = async (data) => {
    const item = { id: newId(), ...data };
    if (mode === "cloud") {
      try { await cloudInsert("activities", item); } catch (e) { alert(e.message); return; }
    }
    setActivities((prev) => [item, ...prev]); // 최신 것이 맨 위로
  };

  // ----- 수정 함수들 (모달에서 저장 시 호출) -----
  // 주의: setState는 항상 함수형(prev => ...)으로 — 연속 조작 시 이전 스냅샷으로
  //       덮어써서 다른 변경이 화면에서 사라지는 것을 방지
  const kindSetters = { companies: setCompanies, contacts: setContacts, deals: setDeals, activities: setActivities };

  const updateItem = async (kind, id, data) => {
    if (mode === "cloud") {
      try { await cloudUpdate(kind, id, data); } catch (e) { alert(e.message); return false; }
    }
    kindSetters[kind]((prev) => prev.map((x) => (x.id === id ? { ...x, ...data } : x)));
    return true;
  };

  // ----- 삭제 함수들 (휴지통 방식 — 서버 DB에는 남아 있어 복구 가능) -----
  const deleteItem = async (kind, id) => {
    if (mode === "cloud") {
      try { await cloudDelete(kind, id); } catch (e) { alert(e.message); return false; }
    }
    kindSetters[kind]((prev) => prev.filter((x) => x.id !== id));
    return true;
  };

  // 거래처 삭제: 담당자/딜/대화기록도 함께 삭제
  const deleteCompany = async (companyId) => {
    if (mode === "cloud") {
      try { await cloudDeleteCompanyCascade(companyId); } catch (e) { alert(e.message); return false; }
    }
    setContacts((prev) => prev.filter((x) => x.companyId !== companyId));
    setDeals((prev) => prev.filter((x) => x.companyId !== companyId));
    setActivities((prev) => prev.filter((x) => x.companyId !== companyId));
    setCompanies((prev) => prev.filter((x) => x.id !== companyId));
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
            onAdd={canEdit ? () => setModal({ type: "company" }) : null}
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
            onAddActivity={canEdit ? () => setModal({ type: "activity", companyId: selectedCompanyId }) : null}
            onAddContact={canEdit ? () => setModal({ type: "contact", companyId: selectedCompanyId }) : null}
            onAddDeal={canEdit ? () => setModal({ type: "deal", companyId: selectedCompanyId }) : null}
            onEditCompany={canEdit ? (c) => setModal({ type: "company", initial: c }) : null}
            onDeleteCompany={canEdit ? (c) => {
              if (window.confirm(`'${c.name}' 거래처를 삭제할까요?\n담당자·딜·대화기록도 함께 삭제됩니다.`)) deleteCompany(c.id);
            } : null}
            onEditContact={canEdit ? (p) => setModal({ type: "contact", companyId: selectedCompanyId, initial: p }) : null}
            onDeleteContact={canEdit ? (p) => { if (window.confirm(`담당자 '${p.name}'을(를) 삭제할까요?`)) deleteItem("contacts", p.id); } : null}
            onEditDeal={canEdit ? (d) => setModal({ type: "deal", companyId: selectedCompanyId, initial: d }) : null}
            onDeleteDeal={canEdit ? (d) => { if (window.confirm(`딜 '${d.title}'을(를) 삭제할까요?`)) deleteItem("deals", d.id); } : null}
            onEditActivity={canEdit ? (a) => setModal({ type: "activity", companyId: selectedCompanyId, initial: a }) : null}
            onDeleteActivity={canEdit ? (a) => { if (window.confirm(`대화 기록 '${a.title}'을(를) 삭제할까요?`)) deleteItem("activities", a.id); } : null}
          />
        )}
        {screen === "pipeline" && (
          <Pipeline
            deals={deals}
            companies={companies}
            canEdit={canEdit}
            moveDeal={moveDeal}
            onEditDeal={canEdit ? (d) => setModal({ type: "deal", companyId: d.companyId, initial: d }) : null}
          />
        )}
        {screen === "quotes" && (
          <QuoteScreen
            mode={mode}
            companies={companies}
            contacts={contacts}
            canEdit={canEdit}
            onLogActivity={(companyId, title, body) => {
              const now = new Date();
              const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
              addActivity({ companyId, channel: "memo", direction: "sent", person: "견적 담당", title, body, dealId: "", date });
            }}
          />
        )}
        {screen === "settings" && <SettingsScreen mode={mode} canEdit={canEdit} />}
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
