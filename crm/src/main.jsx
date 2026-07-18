import React from "react";
import { createRoot } from "react-dom/client";
import OroCrmApp from "./App.jsx";

// PWA: 홈화면 설치를 위한 서비스워커 등록 (지원 브라우저에서만)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/crm/sw.js", { scope: "/crm/" }).catch(() => {});
  });
}

const root = createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <OroCrmApp />
  </React.StrictMode>
);
