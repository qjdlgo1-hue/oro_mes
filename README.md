# ORO MES (웹앱)

이카운트 주문 → 생산계획(드래그 스케줄러) → COC 발행을 한 곳에서.
React + Vite + TypeScript. 데이터는 **Supabase(클라우드)**, 미설정 시 **브라우저 로컬**로 자동 동작.

---

## 0) 필요한 것 (처음 1회)
- **Node.js LTS** 설치: https://nodejs.org 에서 LTS 버전 다운로드 → 설치
- 설치 확인: 터미널(명령 프롬프트)에서 `node -v` 입력 → 버전이 나오면 OK

## 1) 실행 (로컬에서 바로 보기)
이 `oro-mes` 폴더에서 터미널을 열고:
```
npm install
npm run dev
```
→ 안내되는 주소(예: http://localhost:5173)를 브라우저에서 엽니다.
처음엔 데이터가 없으니, **[주문 가져오기] 탭 → "데모 데이터 불러오기"** 를 누르면 2026년 1~6월 주문이 들어갑니다.

## 2) 사용법
- **주문 가져오기**: 이카운트 [주문서현황]을 ① 엑셀로 받아 업로드 하거나 ② 화면을 복사해 붙여넣기. 미리보기 확인 후 저장(해당 월 교체).
- **생산계획**: 막대를 좌우로 끌어 생산일 이동, 오른쪽 끝을 끌면 여러 날로 확장, 더블클릭=완료. 월 이동 ◀▶.
- **COC 발행**: 주문 선택 → 자동 채움, QC 값 입력, 이미지 추가, 🖨 인쇄/PDF.

## 3) 클라우드(Supabase) 연결 — 어디서나 접속·공유
1. https://supabase.com 가입 → New project 생성 (DB 비밀번호 메모)
2. 좌측 **SQL Editor** → `supabase/schema.sql` 내용 붙여넣고 **Run**
3. **Project Settings → API** 에서 **Project URL** 과 **anon public key** 복사
4. 이 폴더의 `.env.example` 을 복사해 **`.env`** 파일로 만들고 값 입력:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...
   ```
5. `npm run dev` 재실행 → 헤더 배지가 "저장: Supabase(클라우드)" 로 바뀌면 연결 완료.

## 4) 배포(Vercel) — 인터넷 주소로 공유
1. 이 프로젝트를 GitHub 저장소에 올립니다.
2. https://vercel.com 가입 → **Add New → Project** → 해당 GitHub 저장소 선택
3. Framework: **Vite** 자동 인식. **Environment Variables** 에 위 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 추가
4. **Deploy** → 발급된 주소로 접속.

---

## 폴더 구조
```
oro-mes/
  index.html
  src/
    App.tsx                앱 셸 + 탭
    main.tsx, index.css
    lib/
      types.ts             데이터 타입
      supabase.ts          Supabase 클라이언트(키 있으면 활성)
      db.ts                데이터 계층(클라우드/로컬 자동 전환)
      parseOrders.ts       엑셀/붙여넣기 파서
      sampleOrders.ts      데모 주문 83건
    components/
      ImportOrders.tsx     주문 가져오기
      ProductionPlan.tsx   생산계획 드래그 스케줄러
      CocIssue.tsx         COC 발행
  supabase/schema.sql      DB 스키마
  .env.example             환경변수 예시
```

## 참고
- 이카운트는 주문서 "조회" API가 없어, 주문은 엑셀 업로드/붙여넣기로 가져옵니다.
- 재import 시 해당 월 주문이 교체되며, 그 달의 기존 생산계획/COC는 초기화됩니다.
