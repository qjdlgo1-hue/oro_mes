// 사용자 관리(master 전용) — 계정 생성/비밀번호 재설정. Service Role 키 사용.
// 배포본(버전 2)의 소스 스냅샷 — Supabase에 이미 배포되어 있으며, 수정 시 mcp/CLI로 재배포.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(status: number, obj: unknown) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json(401, { error: "unauthorized" });
    const admin = createClient(url, svc);
    const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!prof || prof.role !== "master") return json(403, { error: "forbidden: master only" });

    const body = await req.json();
    const action = body.action;

    if (action === "create") {
      const { email, password, role } = body;
      if (!email || !password) return json(400, { error: "email/password required" });
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) return json(400, { error: error.message });
      await admin.from("profiles").upsert({ id: created.user!.id, email, role: role || "user" });
      return json(200, { ok: true, id: created.user!.id });
    }
    if (action === "reset") {
      const { userId, password } = body;
      if (!userId || !password) return json(400, { error: "userId/password required" });
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return json(400, { error: error.message });
      return json(200, { ok: true });
    }
    return json(400, { error: "unknown action" });
  } catch (e) {
    return json(500, { error: String((e as Error)?.message || e) });
  }
});
