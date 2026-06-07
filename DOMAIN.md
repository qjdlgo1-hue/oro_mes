# 도메인 연결 가이드 (orocorp.kr → Vercel)

등록기관: **닷네임(dotname.co.kr)** · 추천 주소: **mes.orocorp.kr** (서브도메인)

> 서브도메인을 쓰면 회사 기존 홈페이지(루트 orocorp.kr)에 영향이 없고, CNAME 한 줄로 끝납니다.

---

## 1단계. Vercel에 도메인 추가
1. https://vercel.com → 프로젝트 **oro_mes** 선택
2. **Settings → Domains** → 입력칸에 `mes.orocorp.kr` 입력 → **Add**
3. Vercel이 "이 레코드를 등록기관에 추가하세요"라고 안내합니다.
   - 서브도메인이면 보통: **Type: CNAME / Name: mes / Value: `cname.vercel-dns.com`**
   - (Vercel 화면에 표시되는 값이 우선입니다. 다르면 그 값을 그대로 사용)

## 2단계. 닷네임에서 DNS 레코드 추가
1. https://www.dotname.co.kr 로그인
2. **마이닷네임 → 도메인 관리** → `orocorp.kr` 선택
3. **DNS 관리**(또는 "DNS 레코드 설정 / 네임서버·DNS") 메뉴로 이동
   - ※ 닷네임 기본 네임서버(ns.dotname.co.kr 등)를 쓰고 있어야 DNS 레코드 추가가 됩니다.
4. **레코드 추가**:
   | 항목 | 값 |
   |---|---|
   | 호스트(Host) | `mes` |
   | 타입(Type) | `CNAME` |
   | 값/대상(Value) | `cname.vercel-dns.com` |
   | TTL | 기본값(3600 등) |
5. 저장.

## 3단계. 검증 & 완료
- 저장 후 몇 분~수십 분 내 Vercel이 자동으로 인식 → **HTTPS 인증서까지 자동 발급**.
- Vercel Domains 화면에 `mes.orocorp.kr` 옆 **Valid / 체크 표시**가 뜨면 끝.
- 브라우저에서 `https://mes.orocorp.kr` 접속 확인.

---

## (옵션) 루트 도메인 orocorp.kr 자체로 쓰고 싶다면
- Vercel에 `orocorp.kr` 추가 → 안내되는 **A 레코드 IP**(Vercel 화면 값)를 닷네임에 등록.
- ⚠️ 단, 루트에 이미 회사 홈페이지가 연결돼 있으면 충돌하니, 그 경우 서브도메인을 권장합니다.

## 확인이 안 될 때
- DNS는 반영에 시간이 걸릴 수 있습니다(보통 10~30분, 최대 수 시간).
- 닷네임 네임서버를 외부(타사)로 바꿔 쓰는 경우, 그 외부 DNS에 레코드를 넣어야 합니다.
- 막히면 Vercel Domains 화면 캡처를 저에게 보여주세요. 어떤 값을 넣어야 하는지 짚어드립니다.
