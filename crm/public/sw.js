// ORO CRM 서비스워커 — 홈화면 설치용 최소 구성
// 전략: 페이지 이동(HTML)은 network-first(새 배포 즉시 반영), 해시 붙은 정적 에셋만 cache-first
const CACHE = "oro-crm-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // API 등은 손대지 않음

  // 페이지 이동은 항상 네트워크 우선 (오프라인이면 캐시된 셸)
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // 해시 붙은 빌드 에셋(assets/*-xxxx.js 등)은 캐시 우선
  if (url.pathname.includes("/assets/")) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
            return res;
          })
      )
    );
  }
});
