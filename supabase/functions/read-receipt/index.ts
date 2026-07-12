// 영수증/증빙 AI 인식 — 이미지에서 거래 정보를 JSON 추출 (국내 영수증 + 해외 인보이스)
// 배포: Supabase Edge Function 'read-receipt' (verify_jwt) / secret: ANTHROPIC_API_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(status: number, obj: unknown) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function modelList(): string[] {
  const envM = Deno.env.get("RECEIPT_MODEL");
  const base = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001", "claude-sonnet-4-20250514", "claude-3-5-sonnet-latest"];
  return envM ? [envM, ...base] : base;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json(401, { error: "unauthorized" });
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json(400, { error: "ANTHROPIC_API_KEY 미설정" });
    const { imageBase64, mediaType } = await req.json();
    if (!imageBase64) return json(400, { error: "이미지가 없습니다." });
    const today = new Date().toISOString().slice(0, 10);
    const prompt = `너는 한국 회사의 영수증/증빙을 읽어 부가세 신고용으로 정리하는 도우미야.\n첨부된 영수증 이미지를 읽고 아래 항목을 JSON으로만 반환해. 설명·마크다운·코드블록 없이 순수 JSON 객체 하나만.\n\n- 거래일자: YYYY-MM-DD. 안 보이면 "${today}".\n- 거래처명, 사업자번호(없으면 "").\n- 공급가액/부가세/합계: 숫자만(없으면 0).\n- 증빙유형: 카드/세금계산서/현금영수증/간이영수증/해외영수증(인보이스).\n  외국어·외화로 표기된 해외 영수증·인보이스(호텔, 항공, 해외 식당·상점 등)면 "해외영수증(인보이스)".\n- 통화: 해외 영수증이면 ISO 통화코드(USD/JPY/EUR/CNY 등), 국내(원화)면 "".\n- 외화금액: 해외 영수증의 결제 총액 숫자(국내면 0). 해외 영수증은 부가세 0, 합계는 원화 환산이 불가하니 0으로 두고 외화금액만 채워.\n- 계정과목: 아래 목록 중 하나로 추정. 해외 영수증(항공·호텔·해외 식당·현지 교통 등)=여비교통비(해외), 식당·카페·마트·간식=복리후생비, 엔진오일·주유·정비·주차·하이패스·타이어=차량유지비, 택시·출장·숙박(국내)=여비교통비, 접대·선물=접대비, 청소·장갑·소모품=소모품비, 볼펜·용지·문구=사무용품비, 모니터·가구·공구=비품, 통신·인터넷=통신비, 택배·운송=운반비, 인쇄·명함·도서=도서인쇄비, 수수료=지급수수료, 보험=보험료, 임차·월세=임차료, 교육=교육훈련비, 광고=광고선전비, 수리·수선=수선비, 애매하면 기타.\n- 비고: 흐릿/추정이면 "확인 필요", 깨끗하면 "".\n반드시 JSON 하나만. 예: {"거래일자":"2026-06-01","거래처명":"하나로마트","사업자번호":"","공급가액":0,"부가세":0,"합계":55000,"증빙유형":"카드","계정과목":"복리후생비","통화":"","외화금액":0,"비고":""}`;
    const content = [
      { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 } },
      { type: "text", text: prompt },
    ];
    let lastErr = "";
    for (const model of modelList()) {
      let resp: Response;
      try {
        resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model, max_tokens: 1000, messages: [{ role: "user", content }] }),
        });
      } catch (fe) { return json(502, { error: "AI 서버 연결 실패: " + String((fe as Error)?.message || fe) }); }
      if (resp.status === 404) { lastErr = `model ${model} not found`; continue; }
      if (!resp.ok) { const tx = await resp.text(); return json(502, { error: `AI 호출 실패 (${resp.status}, model=${model}): ` + tx.slice(0, 400) }); }
      const data = await resp.json();
      const text = (data.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
      const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
      let rec: any; try { rec = JSON.parse(clean); } catch { return json(502, { error: "AI 응답 파싱 실패", raw: clean.slice(0, 300) }); }
      return json(200, { ok: true, rec, model });
    }
    return json(502, { error: "사용 가능한 모델을 찾지 못했습니다. (" + lastErr + ")" });
  } catch (e) {
    return json(500, { error: String((e as Error)?.message || e) });
  }
});
