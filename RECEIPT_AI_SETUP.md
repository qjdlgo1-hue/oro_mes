# 증빙 사진 AI 인식 — 키 설정 (1회)

증빙 탭의 "사진→AI 자동인식"은 서버 함수(read-receipt)가 Anthropic을 호출합니다.
보안을 위해 **API 키는 코드/화면에 넣지 않고 Supabase 비밀값**으로 등록합니다.

## 설정 방법
1. Anthropic 콘솔(https://console.anthropic.com) → API Keys 에서 키 발급(sk-ant-...).
2. Supabase 대시보드 → 프로젝트 oro-mes → **Edge Functions → Secrets(또는 Manage secrets)**
3. 새 비밀값 추가: 이름 `ANTHROPIC_API_KEY`, 값 = 발급받은 키 → 저장.
4. 끝. (함수는 자동으로 이 키를 읽습니다. 재배포 불필요)

## 참고
- 키 등록 전에도 **수동 입력·엑셀 다운로드**는 정상 동작합니다. AI 인식만 "키 미설정" 안내가 뜹니다.
- 사용 모델: claude-sonnet-4-20250514 (functions/read-receipt 의 MODEL 상수에서 변경 가능).
- AI 사용량만큼 Anthropic 요금이 청구됩니다(영수증 1장당 소액).
