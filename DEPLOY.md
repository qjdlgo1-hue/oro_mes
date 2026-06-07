# ORO MES · 배포 가이드 (GitHub → Vercel)

> 대상 저장소: https://github.com/qjdlgo1-hue/oro_mes.git
> Supabase는 이미 연결돼 있고 공개키가 코드에 들어가 있어, Vercel 환경변수 없이도 바로 동작합니다.
> 아래 명령은 **내 컴퓨터(윈도우)** 의 터미널에서 `oro-mes` 폴더 안에서 실행합니다.

---

## 0단계. 정리 (1회) — 중요
파일 탐색기에서 `oro-mes` 폴더 안의 **`.git`** 폴더와 **`_buildcheck`** 폴더가 보이면 삭제하세요.
(`.git`이 안 보이면 '보기 → 숨김 항목' 체크. 없으면 그냥 다음 단계로.)

## 1단계. 터미널 열기
`oro-mes` 폴더에서 우클릭 → "터미널에서 열기". 확인: `node -v` (버전 나오면 OK).

## 2단계. 깃 만들고 GitHub에 올리기 (명령어 복붙)
```
git init
git add -A
git commit -m "ORO MES 첫 배포"
git branch -M main
git remote add origin https://github.com/qjdlgo1-hue/oro_mes.git
git push -u origin main
```
- 푸시할 때 **GitHub 로그인 창**이 뜨면 로그인하세요(브라우저 인증).
- 만약 "rejected / 저장소에 이미 내용이 있음" 오류가 나면 아래 한 줄 먼저 실행 후 다시 push:
```
git pull origin main --allow-unrelated-histories -m merge
git push -u origin main
```

### (더 쉬운 대안) GitHub Desktop
GitHub Desktop 실행 → File → Add Local Repository → `oro-mes` 선택 →
상단 "Publish/Push" 클릭. (로그인만 하면 자동 업로드)

## 3단계. Vercel에서 배포
1. https://vercel.com 로그인 → **Add New… → Project**
2. **Import Git Repository** → `qjdlgo1-hue/oro_mes` 선택 (처음이면 GitHub 연동 허용)
3. Framework = **Vite** 자동 인식 → 그대로 **Deploy**
4. 1~2분 뒤 `https://oro-mes-xxxx.vercel.app` 주소 완성!

> 이후엔 코드 고치고 `git push` 만 하면 Vercel이 자동 재배포합니다.

## 막히면
터미널/Vercel 에러 메시지를 그대로 저에게 붙여넣어 주세요.
배포된 주소(URL)를 주시면 제가 열어서 정상 동작·Supabase 연결을 확인해 드립니다.

---
### 연결 정보 (참고)
- Supabase: oro-mes (서울) · https://fzoombsxvscndzrhzmwb.supabase.co · 테이블 orders/plans/cocs
- Vercel 팀: dongwook's projects
