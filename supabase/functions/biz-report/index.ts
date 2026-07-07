// 경영분석보고서 AI 생성 — 클라이언트가 집계한 KPI JSON을 받아 Claude API로 한국어 보고서(마크다운)를 작성.
// 배포: Supabase Edge Function 'biz-report' (verify_jwt: 로그인 사용자만 호출 가능)
// 필요 secret: ANTHROPIC_API_KEY — 대시보드 > Edge Functions > Secrets에 등록 (리포지토리에 절대 커밋 금지)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `당신은 한국의 소규모 표면처리(분체도장) 제조기업 'ORO'의 경영분석 컨설턴트입니다.
MES에서 집계된 기간 KPI JSON을 받아 경영진이 바로 읽을 한국어 경영분석보고서를 마크다운으로 작성합니다.

원칙:
- 수치는 제공된 KPI에 있는 것만 사용하고, 계산(증감률·비중 등)은 그 수치에서 유도합니다. 없는 데이터를 추정하거나 지어내지 않습니다.
- kpis.gaps에 명시된 데이터 공백은 '데이터 참고' 섹션에서 정직하게 알리고, 해당 영역 분석은 생략하거나 한계를 밝힙니다.
- 판매액 단위는 원(부가세 제외 공급가액), 생산량·수주량 단위는 g입니다. 숫자는 천 단위 콤마로 표기합니다.
- 문체는 간결한 보고체(~함/~임 또는 명사형). 과장 없이 사실 기반으로.

출력 형식(마크다운):
# {기간} 경영분석보고서
## 1. 핵심 요약  (핵심 결론 3~5개 불릿 — 경영진이 이것만 읽어도 되게)
## 2. 매출 분석  (총액·내자/외자·전기/전년동기 비교, 상위 거래처/품목 표, 집중도·변화 해석)
## 3. 생산·납기  (생산량, 수주 대비 계획/완료/지연, 지연이 있으면 원인 점검 포인트)
## 4. 원가·소모  (원재료 표준 대비 실제 소모, 초과 소모 품목과 시사점 — 데이터 있을 때만)
## 5. 지출  (증빙 기준 계정별 지출 — 데이터 있을 때만)
## 6. 리스크와 제언  (실행 가능한 제언 2~4개, 각 제언은 근거 수치와 연결)
## 7. 데이터 참고  (공백·한계 — gaps가 있을 때만)

표가 유용한 곳(상위 거래처/품목, 소모, 계정별 지출)에는 마크다운 표를 사용하세요.`;

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
    const { periodLabel, kpis } = await req.json().catch(() => ({}));
    if (!kpis) return json({ error: "kpis 데이터가 없습니다." }, 400);

    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `대상 기간: ${periodLabel || kpis.label || ""}\n\n다음은 MES에서 집계한 KPI JSON입니다. 이 데이터로 보고서를 작성해 주세요.\n\n${JSON.stringify(kpis)}`,
      }],
    });

    if (resp.stop_reason === "refusal") return json({ error: "AI가 이 요청을 처리하지 못했습니다. 다시 시도해 주세요." }, 400);
    const md = resp.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    if (!md) return json({ error: "AI 응답이 비어 있습니다. 다시 시도해 주세요." }, 500);
    return json({ md, model: resp.model, usage: { input: resp.usage.input_tokens, output: resp.usage.output_tokens } });
  } catch (e: any) {
    const status = e?.status;
    const msg = status === 401 ? "AI 키가 유효하지 않습니다. 키를 다시 확인해 주세요."
      : status === 429 ? "AI 사용량 한도를 초과했습니다. 잠시 후 다시 시도해 주세요."
      : status === 529 || status === 500 ? "AI 서비스가 일시적으로 혼잡합니다. 잠시 후 다시 시도해 주세요."
      : (e?.message || String(e));
    return json({ error: "AI 호출 실패: " + msg }, 500);
  }
});
