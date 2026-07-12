# ORO CRM (1단계 — 실제 동작 버전)

ORO 주식회사의 거래처/영업 관리 CRM입니다. 기존 MES 앱과는 **완전히 독립된 프로젝트**로,
이 `crm/` 폴더 안에서 자체적으로 실행/빌드됩니다.

## 지금 되는 것
- 거래처 / 담당자 / 딜(영업기회) / 대화 기록 등록
- 이메일·LINE·WeChat·전화·메모 채널별 대화 타임라인
- 영업 파이프라인 칸반 (문의 → 견적 → 샘플 → 평가 → 승인 → 양산)
- 입력한 데이터는 브라우저 localStorage에 저장되어 새로고침해도 유지됨

## 아직 안 되는 것 (다음 단계)
- 메일 자동 수집 (서버 연동 필요)
- 여러 사람이 같은 데이터 공유 (Supabase 등 서버 DB로 이전 필요)

## 실행 방법
```bash
cd crm
npm install
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # 배포용 빌드 (dist/ 생성)
```

## 데이터 저장 방식
- 기본: 브라우저 `localStorage` (키: `oro_companies`, `oro_contacts`, `oro_deals`, `oro_activities`)
- `window.storage` API를 제공하는 환경(예: Claude 아티팩트)에서는 그것을 우선 사용
- 브라우저별/기기별로 데이터가 분리됩니다. 공유가 필요해지면 서버 DB로 옮기는 것이 2단계입니다.
