import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  // React Compiler — 컴포넌트 리렌더를 빌드 타임에 자동 메모이제이션 (수동 memo/useMemo 불필요)
  plugins: [react({ babel: { plugins: [["babel-plugin-react-compiler", {}]] } })],
  base: "./",
  build: {
    rollupOptions: {
      output: {
        // 무거운 서드파티를 별도 청크로 — 앱 코드가 바뀌어도 브라우저 캐시 유지
        manualChunks: {
          xlsx: ["xlsx"],
          charts: ["recharts"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
