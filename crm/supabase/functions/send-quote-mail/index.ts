// 견적서 메일 발송 Edge Function
// - CRM 설정 화면에 저장된 메일 계정(crm_mail_accounts)의 SMTP로 발송
// - 호출: supabase.functions.invoke("send-quote-mail", { body: { accountId, to, subject, body, attachment } })
// - attachment: { filename, base64 } (견적서 xlsx)
// - JWT 검증은 함수 설정(verify_jwt=true)에서 처리 — 로그인한 팀원만 호출 가능
import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST만 지원합니다" });

  let payload: {
    accountId?: string; to?: string; subject?: string; body?: string;
    attachment?: { filename?: string; base64?: string };
  };
  try { payload = await req.json(); } catch { return json(400, { error: "잘못된 요청 형식" }); }

  const { accountId, to, subject, body, attachment } = payload;
  if (!accountId || !to || !subject) return json(400, { error: "accountId/to/subject는 필수입니다" });
  if (!/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(to)) return json(400, { error: `수신자 이메일 형식 오류: ${to}` });

  // 발송 계정 조회 (service role — RLS 우회, 서버에서만 비밀번호 접근)
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: acc, error: accErr } = await admin.from("crm_mail_accounts").select("*").eq("id", accountId).single();
  if (accErr || !acc) return json(404, { error: "발송 계정을 찾을 수 없습니다" });
  if (!acc.smtp_host) return json(400, { error: "이 계정에는 SMTP 서버가 설정돼 있지 않습니다" });

  // 보내는 주소: username이 이메일이면 그대로, 아니면 네이버 형식으로
  const from = String(acc.username).includes("@") ? acc.username : `${acc.username}@naver.com`;

  const client = new SMTPClient({
    connection: {
      hostname: acc.smtp_host,
      port: acc.smtp_port || 465,
      tls: true,
      auth: { username: acc.username, password: acc.password },
    },
  });

  try {
    const attachments = [];
    if (attachment?.base64 && attachment?.filename) {
      const bin = Uint8Array.from(atob(attachment.base64), (c) => c.charCodeAt(0));
      attachments.push({
        filename: attachment.filename,
        content: bin,
        encoding: "binary" as const,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    }
    await client.send({
      from,
      to,
      subject,
      content: body || " ",
      attachments,
    });
    await client.close();
    return json(200, { ok: true });
  } catch (e) {
    try { await client.close(); } catch { /* 무시 */ }
    return json(500, { error: `발송 실패: ${e instanceof Error ? e.message : String(e)}` });
  }
});
