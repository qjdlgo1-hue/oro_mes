// 이카운트(ERP) OpenAPI 프록시 — MES ↔ 이카운트 연동의 유일한 통로.
// 인증키(COM_CODE/USER_ID/API_CERT_KEY)는 service role만 접근하는 ecount_config 테이블에 보관되어
// 브라우저(공개 저장소 SPA)로는 절대 내려가지 않는다. CORS·세션 발급/캐시/재시도도 여기서 처리.
// actions: get_config / save_config / test / my_ip (master 전용) · items / stock / save_prod / save_purchase (로그인 사용자)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Cfg = {
  id: number; com_code: string; user_id: string; api_cert_key: string;
  use_test: boolean; zone: string; session_id: string | null; session_at: string | null;
  last_calls?: Record<string, string> | null;
};

// 이카운트 전송 제한 보호 — 공식 기준: 실서버 Zone·로그인·조회 1회/10분, 저장 1회/10초,
// 테스트서버 1회/10초. 여기서 선제 차단해 이카운트 측 통보 없는 차단(연속 오류 30건/시간)을 예방.
// ※ src/lib/ecount.ts의 cooldownLeftMs와 동일 로직 — 수정 시 양쪽을 함께 바꿀 것 (테스트는 클라이언트 사본에)
function cooldownLeftMs(lastIso: string | null | undefined, action: string, useTest: boolean, now: number): number {
  const isSave = action === "save_prod" || action === "save_purchase";
  const min = useTest ? 10_000 : (isSave ? 10_000 : 10 * 60_000);
  if (!lastIso) return 0;
  const t = new Date(lastIso).getTime();
  if (isNaN(t)) return 0;
  return Math.max(0, t + min - now);
}
const fmtLeft = (ms: number) => ms >= 60_000 ? `${Math.ceil(ms / 60_000)}분` : `${Math.ceil(ms / 1000)}초`;

const db = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// 존 조회는 존 접두사 없는 공통 호스트, 이후 호출은 존 접두사 호스트. use_test면 sboapi(테스트존).
const zoneHost = (cfg: Cfg) => cfg.use_test ? "https://sboapi.ecount.com" : "https://oapi.ecount.com";
const apiHost = (cfg: Cfg) => cfg.use_test ? `https://sboapi${cfg.zone}.ecount.com` : `https://oapi${cfg.zone}.ecount.com`;

async function post(url: string, body: unknown): Promise<any> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  // 302/412 = API 전송 횟수 초과 (공식 상태코드 표)
  if (r.status === 302 || r.status === 412) throw new Error(`이카운트 전송 한도 초과(HTTP ${r.status}) — 잠시 후 다시 시도하세요.`);
  const text = await r.text();
  try { return JSON.parse(text); } catch { throw new Error(`이카운트 응답 해석 실패 (HTTP ${r.status}): ${text.slice(0, 200)}`); }
}

// 이카운트 오류 메시지 추출 — Error 단건/Errors 배열/Data.Message(로그인 등)/Status 비정상 모두 커버
// 실측: OAPILogin 실패는 {"Data":{"Code":"201","Message":"API_CERT_KEY가 유효하지 않습니다.",...}} 형태
function ecountErr(r: any): string | null {
  if (!r) return "빈 응답";
  const one = r.Error?.Message || r.Error?.MessageDetail || r.Data?.Error?.Message;
  if (one) return String(one);
  const many = Array.isArray(r.Errors) ? r.Errors.map((e: any) => e?.Message || e?.MessageDetail || JSON.stringify(e)).join(" / ") : "";
  if (many) return many;
  // Data.Code가 200이 아니고 Message가 있으면 그 사유를 그대로 (로그인 API 오류 형태)
  if (r.Data?.Message && String(r.Data?.Code ?? "") !== "200" && String(r.Data?.Code ?? "") !== "00") return String(r.Data.Message);
  if (r.Status && String(r.Status) !== "200") return `Status ${r.Status}`;
  return null;
}

async function loadCfg(sb: ReturnType<typeof db>): Promise<Cfg | null> {
  const { data, error } = await sb.from("ecount_config").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  return (data as Cfg) || null;
}

async function log(sb: ReturnType<typeof db>, action: string, ok: boolean, detail: Record<string, unknown>) {
  await sb.from("ecount_log").insert({ action, ok, detail }).then(() => {}, () => {});
}

// 간격 가드: 위반이면 남은 시간 문자열 반환(호출 안 함), 통과면 이번 시각을 last_calls에 기록
async function guard(sb: ReturnType<typeof db>, cfg: Cfg, action: string): Promise<string | null> {
  const lc = cfg.last_calls || {};
  const left = cooldownLeftMs(lc[action], action, cfg.use_test, Date.now());
  if (left > 0) {
    return `이카운트 전송 제한 보호 — ${fmtLeft(left)} 후 다시 시도하세요. (공식 기준: ${cfg.use_test ? "테스트서버 10초" : "운영서버 조회·로그인 10분 / 저장 10초"} 간격)`;
  }
  // 실패해도 시각을 기록 — 연속 오류 재시도 폭주(시간당 30건 차단)를 예방
  await sb.from("ecount_config").update({ last_calls: { ...lc, [action]: new Date().toISOString() } }).eq("id", 1);
  return null;
}

// 존 확인 + 로그인 → SESSION_ID 발급, config에 캐시
async function login(sb: ReturnType<typeof db>, cfg: Cfg): Promise<{ cfg: Cfg; sid: string }> {
  if (!cfg.com_code || !cfg.user_id || !cfg.api_cert_key) throw new Error("이카운트 연동 정보(회사코드/ID/인증키)가 등록되지 않았습니다. 관리자 화면에서 먼저 등록하세요.");
  if (!cfg.zone) {
    const z = await post(`${zoneHost(cfg)}/OAPI/V2/Zone`, { COM_CODE: cfg.com_code });
    const zone = z?.Data?.ZONE || z?.Data?.Zone;
    if (!zone) throw new Error("존(Zone) 확인 실패: " + (ecountErr(z) || "회사코드를 확인하세요."));
    cfg = { ...cfg, zone: String(zone) };
  }
  const r = await post(`${apiHost(cfg)}/OAPI/V2/OAPILogin`, {
    COM_CODE: cfg.com_code, USER_ID: cfg.user_id, API_CERT_KEY: cfg.api_cert_key,
    LAN_TYPE: "ko-KR", ZONE: cfg.zone,
  });
  const sid = r?.Data?.Datas?.SESSION_ID || r?.Data?.SESSION_ID;
  if (!sid) throw new Error("이카운트 로그인 실패: " + (ecountErr(r) || "인증키/ID를 확인하세요."));
  const next = { ...cfg, session_id: String(sid), session_at: new Date().toISOString() };
  await sb.from("ecount_config").update({ zone: next.zone, session_id: next.session_id, session_at: next.session_at, updated_at: new Date().toISOString() }).eq("id", 1);
  return { cfg: next, sid: String(sid) };
}

// 캐시된 세션으로 호출, 세션 오류면 재로그인 1회 재시도
async function callApi(sb: ReturnType<typeof db>, cfg: Cfg, path: string, body: unknown): Promise<any> {
  const exec = async (sid: string) => post(`${apiHost(cfg)}${path}?SESSION_ID=${encodeURIComponent(sid)}`, body);
  // 세션 캐시 12시간 재사용
  const fresh = cfg.session_at && (Date.now() - new Date(cfg.session_at).getTime() < 12 * 3600 * 1000);
  if (cfg.zone && cfg.session_id && fresh) {
    const r = await exec(cfg.session_id);
    if (!ecountErr(r)) return r;
    // 세션 만료 가능성 — 새로 로그인해 1회 재시도
    const { cfg: c2, sid } = await login(sb, { ...cfg, session_id: null, session_at: null });
    cfg = c2;
    return exec(sid);
  }
  const { cfg: c2, sid } = await login(sb, cfg);
  cfg = c2;
  return exec(sid);
}

// Data.Result가 배열/JSON 문자열/단건 어느 쪽이어도 배열로
function resultRows(r: any): any[] {
  let v = r?.Data?.Result ?? r?.Data?.Datas ?? r?.Data;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return []; } }
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object" && Array.isArray(v.Result)) return v.Result;
  return [];
}

const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = db();
  try {
    // 게이트웨이(verify_jwt)가 서명을 검증 — 여기서는 로그인 여부 + (관리 작업은) master 역할 확인
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let claims: any = {};
    try { claims = JSON.parse(atob(token.split(".")[1] || "")); } catch { /* malformed */ }
    if (claims.role !== "authenticated") return json({ error: "로그인이 필요합니다." }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    const isAdminAction = ["get_config", "save_config", "test", "my_ip"].includes(action);
    if (isAdminAction) {
      const { data: prof } = await sb.from("profiles").select("role").eq("id", claims.sub).maybeSingle();
      if ((prof as any)?.role !== "master") return json({ error: "이카운트 연동 설정은 master만 할 수 있습니다." }, 403);
    }

    if (action === "get_config") {
      const cfg = await loadCfg(sb);
      return json({
        com_code: cfg?.com_code || "", user_id: cfg?.user_id || "", use_test: cfg?.use_test ?? true,
        zone: cfg?.zone || "", has_key: !!cfg?.api_cert_key, session_at: cfg?.session_at || null,
      });
    }

    if (action === "save_config") {
      const prev = await loadCfg(sb);
      const com_code = String(body.com_code ?? prev?.com_code ?? "").trim();
      const user_id = String(body.user_id ?? prev?.user_id ?? "").trim();
      const key = String(body.api_cert_key ?? "").trim(); // 빈 값이면 기존 키 유지
      // 인증키 형식 검증 — 오류 메시지 등 엉뚱한 텍스트를 붙여넣는 실수 차단 (실제 키는 공백·한글 없음)
      if (key && (/[\s가-힣]/.test(key) || key.length < 16)) {
        return json({ error: "API 인증키 형식이 아닙니다 — 이카운트 [API인증키발급]에서 발급된 키만 붙여넣으세요. (공백·한글 불가)" }, 400);
      }
      const use_test = body.use_test ?? prev?.use_test ?? true;
      const changed = !prev || prev.com_code !== com_code || !!key || prev.use_test !== !!use_test;
      const row = {
        id: 1, com_code, user_id, use_test: !!use_test,
        api_cert_key: key || prev?.api_cert_key || "",
        // 회사코드/키/존 종류가 바뀌면 존·세션 캐시 무효화
        zone: changed ? "" : (prev?.zone || ""),
        session_id: changed ? null : (prev?.session_id ?? null),
        session_at: changed ? null : (prev?.session_at ?? null),
        updated_at: new Date().toISOString(),
      };
      const { error } = await sb.from("ecount_config").upsert(row);
      if (error) throw error;
      await log(sb, "설정 저장", true, { com_code, user_id, use_test: !!use_test, key_updated: !!key });
      return json({ ok: true });
    }

    // Edge Function의 현재 발신 IP — 이카운트 [IP등록]에 등록할 값 (발신 IP는 바뀔 수 있어
    // 연결이 거부되면 다시 확인해 추가 등록, 최대 20개)
    if (action === "my_ip") {
      const r = await fetch("https://api.ipify.org?format=json");
      const j = await r.json().catch(() => ({}));
      if (!j?.ip) return json({ error: "발신 IP 확인 실패 — 잠시 후 다시 시도하세요." }, 400);
      return json({ ip: String(j.ip) });
    }

    if (action === "test") {
      const cfg = await loadCfg(sb);
      if (!cfg) return json({ error: "연동 정보가 없습니다. 먼저 저장하세요." }, 400);
      const cool = await guard(sb, cfg, action);
      if (cool) return json({ error: cool }, 429);
      try {
        const { cfg: c2 } = await login(sb, { ...cfg, zone: "", session_id: null, session_at: null }); // 존부터 새로 확인
        await log(sb, "연결 테스트", true, { zone: c2.zone, use_test: c2.use_test });
        return json({ ok: true, zone: c2.zone, use_test: c2.use_test });
      } catch (e) {
        await log(sb, "연결 테스트", false, { error: String((e as Error).message || e) });
        throw e;
      }
    }

    if (action === "items") {
      const cfg = await loadCfg(sb);
      if (!cfg) return json({ error: "이카운트 연동이 설정되지 않았습니다." }, 400);
      const cool = await guard(sb, cfg, action);
      if (cool) return json({ error: cool }, 429);
      const codes: string[] = Array.isArray(body.codes) ? body.codes.map((c: unknown) => String(c).trim()).filter(Boolean) : [];
      // 단 1회 호출: 코드 미지정(전체) 또는 ∬로 묶은 복수 코드 — 코드별 개별 재시도는
      // 이카운트 전송 제한(조회 1회/10분, 연속 오류 30건 차단) 때문에 하지 않는다
      const r = await callApi(sb, cfg, "/OAPI/V2/InventoryBasic/ViewBasicProduct", { PROD_CD: codes.join("∬") });
      const err = ecountErr(r);
      const rows = err ? [] : resultRows(r);
      await log(sb, "품목 조회", !err, { requested: codes.length || "전체", got: rows.length, trace: r?.Data?.TRACE_ID, ...(err ? { error: err } : {}) });
      if (err) return json({ error: "품목 조회 실패: " + err + " — 테스트 인증키 사용 중이라면 이카운트 개발 검증(품목조회 API)이 먼저 통과되어야 합니다." }, 400);
      return json({ rows });
    }

    if (action === "stock") {
      const cfg = await loadCfg(sb);
      if (!cfg) return json({ error: "이카운트 연동이 설정되지 않았습니다." }, 400);
      const cool = await guard(sb, cfg, action);
      if (cool) return json({ error: cool }, 429);
      const baseDate = String(body.base_date || kstToday()).replace(/-/g, "");
      const r = await callApi(sb, cfg, "/OAPI/V2/InventoryBalance/ViewInventoryBalanceStatus", {
        BASE_DATE: baseDate, PROD_CD: "", WH_CD: "", ZERO_FLAG: "Y",
      });
      const err = ecountErr(r);
      const rows = err ? [] : resultRows(r);
      await log(sb, "재고 조회", !err, { base_date: baseDate, got: rows.length, trace: r?.Data?.TRACE_ID, ...(err ? { error: err } : {}) });
      if (err) return json({ error: "재고 조회 실패: " + err }, 400);
      return json({ rows, base_date: baseDate });
    }

    // 쓰기 2종 — 생산입고 I / 구매입력. 클라이언트가 만든 BulkDatas 목록을 전표 형식으로 감싸 전송.
    // 금액·부가세는 자동 계산되지 않으므로 클라이언트(MES)에서 산출해 온 값을 그대로 쓴다.
    if (action === "save_prod" || action === "save_purchase") {
      const cfg = await loadCfg(sb);
      if (!cfg) return json({ error: "이카운트 연동이 설정되지 않았습니다." }, 400);
      const cool = await guard(sb, cfg, action);
      if (cool) return json({ error: cool }, 429);
      const list: Record<string, string>[] = Array.isArray(body.list) ? body.list.slice(0, 200) : [];
      if (!list.length) return json({ error: "전송할 행이 없습니다." }, 400);
      const isProd = action === "save_prod";
      const path = isProd ? "/OAPI/V2/GoodsReceipt/SaveGoodsReceipt" : "/OAPI/V2/Purchases/SavePurchases";
      const payload = isProd
        ? { GoodsReceiptList: list.map(d => ({ BulkDatas: d })) }
        : { PurchasesList: list.map(d => ({ BulkDatas: d })) };
      const r = await callApi(sb, cfg, path, payload);
      const err = ecountErr(r);
      const d = r?.Data || {};
      const success = Number(d.SuccessCnt ?? 0);
      const fail = Number(d.FailCnt ?? 0);
      const slips: string[] = (Array.isArray(d.SlipNos) ? d.SlipNos : []).map((s: unknown) => String(s));
      const details = Array.isArray(d.ResultDetails) ? d.ResultDetails.slice(0, 50) : [];
      const label = isProd ? "생산입고 전송" : "구매입력 전송";
      const ok = !err && fail === 0 && success > 0;
      await log(sb, label, ok, {
        sent: list.length, success, fail, slips: slips.slice(0, 20), trace: r?.Data?.TRACE_ID,
        ...(cfg.use_test ? { zone: "테스트존" } : {}), ...(err ? { error: err } : {}),
      });
      if (err && !success) return json({ error: label + " 실패: " + err }, 400);
      return json({ success, fail, slip_nos: slips, details });
    }

    return json({ error: "알 수 없는 action: " + action }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 400);
  }
});
