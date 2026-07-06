import React from "react";

// 화면 렌더 중 예기치 못한 오류가 나도 흰 화면 대신 안내+오류 내용을 보여주는 안전망
type State = { error: Error | null };
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error("화면 오류:", error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card" style={{ maxWidth: 640, margin: "40px auto", textAlign: "center", padding: 28 }}>
        <div style={{ fontSize: 34 }}>⚠️</div>
        <h3 style={{ margin: "8px 0 6px" }}>화면을 표시하는 중 문제가 발생했습니다</h3>
        <p className="muted" style={{ fontSize: 13 }}>아래 오류 내용을 관리자에게 알려주시면 빠르게 고칠 수 있습니다.</p>
        <pre style={{ textAlign: "left", background: "#f7f9fc", border: "1px solid var(--line)", borderRadius: 8, padding: 12, fontSize: 12, overflowX: "auto", whiteSpace: "pre-wrap" }}>
          {String(this.state.error?.message || this.state.error)}
        </pre>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
          <button className="btn" onClick={() => this.setState({ error: null })}>다시 시도</button>
          <button className="btn ghost" onClick={() => window.location.reload()}>새로고침</button>
        </div>
      </div>
    );
  }
}
