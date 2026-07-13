import { createClient } from "@supabase/supabase-js";

// MES와 같은 Supabase 프로젝트를 사용합니다 (로그인 계정도 공유됨).
// 우선순위: .env(VITE_*) > 아래 기본값(공개 anon 키 — 프런트엔드 공개용, RLS로 보호)
const FALLBACK_URL = "https://fzoombsxvscndzrhzmwb.supabase.co";
const FALLBACK_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6b29tYnN4dnNjbmR6cmh6bXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MDkzMDMsImV4cCI6MjA5NjM4NTMwM30.kyuQIWCihIcgO7wN-t-YRwB8FrIWJT3MqApbzLeCamc";

const url = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_ANON;

export const supabase = createClient(url, key);
