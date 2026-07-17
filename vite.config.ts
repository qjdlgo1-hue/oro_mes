import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
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
