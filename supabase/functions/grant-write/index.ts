// 지원사업 서류 AI 문장 다듬기 — 짧은 초안을 정부지원사업 서류 문체(보고체)로 확장.
// 배포: Supabase Edge Function 'grant-write' (verify_jwt: 로그인 사용자만 호출 가능)
// 필요 secret: ANTHROPIC_API_KEY — 대시보드 > Edge Functions > Secrets에 등록 (리포지토리에 절대 커밋 금지)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `당신은 한국 정부지원사업(2026년 창업중심대학사업) 제출 서류 작성 전문가입니다.
창업기업 담당자가 서류의 특정 칸에 들어갈 내용을 키워드/짧은 초안으로 주면,
심사·정산 담당자가 읽을 공식 서류 문장으로 다듬어 작성합니다.

원칙:
- 문체는 보고체(~함/~임 또는 명사형 종결). 존댓말 서술(~합니다)은 쓰지 않습니다.
- 함께 제공되는 건 정보(과제명·품명·지출항목 등)와 초안에 있는 사실만 사용합니다.
  초안에 없는 구체 스펙·수치·일정·성능치를 지어내지 않습니다.
- 과제(사업계획)와의 연관성이 드러나게 서술합니다. 과제명이 주어지면 그 과제 수행에
  해당 지출이 왜 필요한지 연결합니다.
- 분량은 서류 칸에 맞게 300~600자. 필요하면 불릿(-)으로 항목화하되, 마크다운 제목/굵게 등은 쓰지 않습니다.
- 결과는 다듬어진 본문만 출력합니다(설명·인사말·따옴표 없이).`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // 게이트웨이(verify_jwt)가 서명은 검증하므로, 여기서는 역할만 확인 —
    // 공개 anon 키만으로는 호출 불가(로그인 사용자 전용, AI 비용 남용 방지)
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let role = "";
    try { role = JSON.parse(atob(token.split(".")[1] || "")).role || ""; } catch { /* malformed */ }
    if (role !== "authenticated") return json({ error: "로그인이 필요합니다." }, 401);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json({ error: "AI 키가 등록되지 않았습니다. Supabase 대시보드 > Edge Functions > Secrets에 ANTHROPIC_API_KEY를 등록해 주세요." }, 400);
    }
    const { field, draft, context } = await req.json().catch(() => ({}));
    if (!field || !String(draft || "").trim()) return json({ error: "다듬을 초안을 먼저 입력해 주세요." }, 400);

    const ctxLines = Object.entries((context || {}) as Record<string, unknown>)
      .filter(([, v]) => String(v ?? "").trim() !== "")
      .map(([k, v]) => `- ${k}: ${v}`).join("\n");

    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `서류 칸: ${field}\n\n건 정보:\n${ctxLines || "(없음)"}\n\n담당자 초안:\n${draft}\n\n위 초안을 이 칸에 넣을 공식 서류 문장으로 다듬어 주세요.`,
      }],
    });

    if (resp.stop_reason === "refusal") return json({ error: "AI가 이 요청을 처리하지 못했습니다. 다시 시도해 주세요." }, 400);
    const text = resp.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    if (!text) return json({ error: "AI 응답이 비어 있습니다. 다시 시도해 주세요." }, 500);
    return json({ text, model: resp.model, usage: { input: resp.usage.input_tokens, output: resp.usage.output_tokens } });
  } catch (e: any) {
    const status = e?.status;
    const msg = status === 401 ? "AI 키가 유효하지 않습니다. 키를 다시 확인해 주세요."
      : status === 429 ? "AI 사용량 한도를 초과했습니다. 잠시 후 다시 시도해 주세요."
      : status === 529 || status === 500 ? "AI 서비스가 일시적으로 혼잡합니다. 잠시 후 다시 시도해 주세요."
      : (e?.message || String(e));
    return json({ error: "AI 호출 실패: " + msg }, 500);
  }
});
