import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import './material-skin.css'  // 머티리얼 스킨 CSS 불러오기
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
