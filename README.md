# ORO MES (웹앱)

이카운트 주문 → 생산계획(드래그 스케줄러) → COC 발행 → 리포트를 한 곳에서.
**React + Vite + TypeScript**, 데이터는 **Supabase(클라우드)**, 미설정 시 브라우저 로컬로 자동 동작.

> 변경 이력은 [CHANGELOG.md](./CHANGELOG.md), 배포 방법은 [DEPLOY.md](./DEPLOY.md) 참고.

---

## 기능 (탭 8개 + 3단 역할)
- **로그인**: 이메일+비밀번호(Supabase Auth). 계정은 관리자가 발급(공개 가입 차단).
- **모바일**: 햄버거 그룹 드로어 내비 · COC 1단(화면맞춤) · 표 카드화 · 숫자 키패드.
- **POP**(현장 생산 현황, 기본 화면): 오늘 생산·지연·COC 발행 필요·다가오는 7일을 한눈에, 그 자리에서 완료 처리. (넓으면 2단/좁으면 1단 반응형)
- **기록**: 변경 내역(누가·언제·무엇) 감사 로그.
- **원재료(BOM)**: 제품별 AgCN·PGC 사용량(50g당) 입력 → 월별 소비량(발주량 기준) 거래처·품목별 표기.
- **증빙(영수증)**: 사진→AI 인식 + **원본 Storage 보관**(보기/다운로드/분기 ZIP) + 수동입력·자동역산 + **분기 자동 구분** + 엑셀/**PDF 요약본**. Supabase 저장.
- **관리자**(Master 전용): 역할 변경, **권한/메뉴 매트릭스**, **메뉴 표시 순서(PC·모바일 공통)**, 사용자 생성·비번재설정.
- **권한**: 기능별 on/off(role_permissions) + RLS 서버 강제. Edge Function으로 계정 생성. 토스트 알림.
- **주문 가져오기**: 이카운트 [주문서현황]을 ① 엑셀 업로드 ② 화면 복사–붙여넣기.
  - **중복 구분**: 일자·품목·규격·수량·거래처 기준으로 신규/중복 자동 표시 →
    "신규만 추가" 또는 "이 달 전체 교체" 선택.
  - "데모 데이터 불러오기"로 2026 1~6월 샘플 주입 가능.
  - **저장된 주문 데이터 표**(월 필터): 주문 내용 + 생산완료일 + 상태 + COC 발행여부, **행별 수정/삭제**.
  - 가져오기는 **동기화(신규만 추가)** — 기존 주문·계획·COC 보존(파괴적 전체교체 없음).
  - **주문 직접 추가**(긴급·이카운트 외): 수동 입력 → ✋수동 표시.
- **생산계획**: 막대를 좌우로 끌어 생산일 이동, 오른쪽 끝을 끌면 여러 날로 확장,
  더블클릭=완료(회색), 날짜별 일계(g) 자동 집계, 월 이동 ◀▶, 제품/무형상품 필터.
  - **일별/주별 전환**(주별=주합계 보기), 주 기준(월요일/1일) 선택, **열너비 줌(－/＋)**.
  - 모바일: **월간 캘린더(생산량 히트맵)** + 목록(시작일/기간/완료) 전환.
- **COC 발행**: 주문 선택 시 자동 채움(거래처·모델·Size·조성·생산일·유효기간+1년·중량) →
  QC 값 입력 → 현미경 이미지 첨부 → **로고·도장 자동 적용** → 인쇄/PDF.
- **리포트**: 월별 발주량/완료량/달성률(막대) + 행 클릭 시 **품목별·고객사별 상세**(반응형 2단/1단).

## 실행 (로컬)
```
npm install
npm run dev
```
→ 안내 주소(예: http://localhost:5173) 접속. (Node.js LTS 필요)
로컬 개발 시 .env가 없으면 브라우저 저장 모드로 동작하고 로그인은 생략됩니다.

## 로그인 / 계정 관리
- 사용자는 **Supabase 대시보드 → Authentication → Users → Add user** 에서 발급
  (비밀번호 입력 + "Auto Confirm User" 켜기).
- 외부 가입 차단: **Authentication → Sign In / Providers → Email →
  "Allow new users to sign up" 끄기**.

## Supabase
- 프로젝트: **oro-mes** (ap-northeast-2 / 서울)
- URL: https://fzoombsxvscndzrhzmwb.supabase.co
- 테이블: `orders`, `plans`, `cocs`, `app_settings` (스키마: `supabase/schema.sql`)
- 키: 공개 anon 키를 `src/lib/supabase.ts`에 기본값으로 내장(.env로 덮어쓰기 가능).

## 보안(RLS) 상태
- 모든 테이블 RLS 활성화.
- 정책: **로그인 사용자(authenticated)만 읽기/쓰기** (2026-06-07 적용 완료).
  익명 접근은 읽기·쓰기 모두 차단됨(검증 완료).

## 배포 (Vercel)
- **라이브 주소: https://mes.orocorp.kr** (기본: oro-mes.vercel.app)
- GitHub 저장소: https://github.com/qjdlgo1-hue/oro_mes
- Vercel(Pro)에 연결되어 `git push` 시 자동 재배포. 환경변수 없이 동작(키 내장).
- 자세한 절차: [DEPLOY.md](./DEPLOY.md)

## 폴더 구조
```
oro-mes/
  index.html
  src/
    App.tsx                앱 셸 + 탭 + 인증 게이트
    main.tsx, index.css
    lib/
      types.ts             데이터 타입(Order/PlanEntry/CocData/Settings)
      supabase.ts          Supabase 클라이언트(+공개키 기본값)
      db.ts                데이터 계층(클라우드/로컬 자동) + 중복판별 + 설정
      parseOrders.ts       엑셀/붙여넣기 파서
      plan.ts              생산완료일 계산(계획 마지막날)
      sampleOrders.ts      데모 주문 83건
    components/
      Login.tsx            로그인 화면
      Today.tsx            오늘 할 일(생산/지연/COC)
      Admin.tsx            관리자(역할/권한/계정)
      Receipts.tsx         증빙(영수증) 정리
      perm.ts(lib)         권한 캐시·can()·관리자 호출
      ImportOrders.tsx     주문 가져오기(중복 구분)
      ProductionPlan.tsx   생산계획 드래그 스케줄러
      CocIssue.tsx         COC 발행(로고·도장)
      Dashboard.tsx        월별 리포트
  supabase/schema.sql      DB 스키마
  .env.example
```

## 참고 / 제약
- 이카운트는 주문서 "조회" API가 없어, 주문은 엑셀 업로드/붙여넣기로 가져옵니다.
  (매월 화면 수집은 Claude in Chrome으로 보조 가능)
- 재import 시 "이 달 교체"는 해당 월 주문을 교체하며 그 달 생산계획/COC가 초기화됩니다.
- COC 이미지는 현재 DB(base64)에 저장 — 양이 많아지면 Supabase Storage로 이전 권장(예정).
