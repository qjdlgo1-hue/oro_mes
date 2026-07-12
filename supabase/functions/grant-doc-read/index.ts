// 거래명세서/세금계산서/견적서 AI 인식 — PDF·이미지에서 품목/금액/거래처를 JSON으로 추출.
// 배포: Supabase Edge Function 'grant-doc-read' (verify_jwt: 로그인 사용자만 호출 가능)
// 필요 secret: ANTHROPIC_API_KEY — 대시보드 > Edge Functions > Secrets에 등록 (리포지토리에 절대 커밋 금지)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `당신은 한국 거래 서류(거래명세서·세금계산서·견적서·명세표) 판독기입니다.
첨부된 문서에서 아래 정보를 추출해 JSON **하나만** 출력합니다. 설명·마크다운·코드펜스 없이 JSON만 출력하세요.

{
  "vendor": "공급자(판매자) 상호",
  "bizno": "공급자 사업자등록번호",
  "date": "거래일자 YYYY-MM-DD",
  "items": [{ "name": "품명", "spec": "규격(없으면 null)", "qty": 수량(숫자), "unitPrice": 단가(숫자), "amount": 공급가액(숫자) }],
  "supplyTotal": 공급가액 합계(숫자, 부가세 제외),
  "vat": 부가세(숫자),
  "total": 합계금액(숫자, 부가세 포함)
}

원칙:
- 문서에 없는 값은 null. 절대 추정하거나 지어내지 않습니다.
- 금액은 콤마 없는 숫자로. 공급자와 공급받는자가 모두 있으면 vendor는 '공급자' 쪽입니다.
- 품목이 여러 개면 items에 모두 넣습니다.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // 게이트웨이(verify_jwt)가 서명은 검증하므로, 여기서는 역할만 확인 — 공개 anon 키만으로는 호출 불가
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let role = "";
    try { role = JSON.parse(atob(token.split(".")[1] || "")).role || ""; } catch { /* malformed */ }
    if (role !== "authenticated") return json({ error: "로그인이 필요합니다." }, 401);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json({ error: "AI 키가 등록되지 않았습니다. Supabase 대시보드 > Edge Functions > Secrets에 ANTHROPIC_API_KEY를 등록해 주세요." }, 400);
    }
    const { fileBase64, mediaType } = await req.json().catch(() => ({}));
    if (!fileBase64 || !mediaType) return json({ error: "파일 데이터가 없습니다." }, 400);

    const fileBlock: any = mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data: fileBase64 } };

    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content: [fileBlock, { type: "text", text: "이 문서에서 거래 정보를 추출해 JSON으로 출력해 주세요." }] }],
    });

    if (resp.stop_reason === "refusal") return json({ error: "AI가 이 문서를 처리하지 못했습니다. 다시 시도해 주세요." }, 400);
    const raw = resp.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return json({ error: "문서에서 거래 정보를 찾지 못했습니다. 선명한 파일로 다시 시도해 주세요." }, 400);
    let data: unknown;
    try { data = JSON.parse(m[0]); } catch { return json({ error: "AI 응답 해석에 실패했습니다. 다시 시도해 주세요." }, 500); }
    return json({ data, usage: { input: resp.usage.input_tokens, output: resp.usage.output_tokens } });
  } catch (e: any) {
    const status = e?.status;
    const msg = status === 401 ? "AI 키가 유효하지 않습니다. 키를 다시 확인해 주세요."
      : status === 429 ? "AI 사용량 한도를 초과했습니다. 잠시 후 다시 시도해 주세요."
      : status === 413 ? "파일이 너무 큽니다. 8MB 이하로 올려 주세요."
      : status === 529 || status === 500 ? "AI 서비스가 일시적으로 혼잡합니다. 잠시 후 다시 시도해 주세요."
      : (e?.message || String(e));
    return json({ error: "AI 호출 실패: " + msg }, 500);
  }
});
