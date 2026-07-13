// ---------------------------------------------------------------------------
// ORO CRM 메일 자동 수집기 (네이버 메일 + 네이버 웍스)
// ---------------------------------------------------------------------------
// GitHub Actions가 1시간마다 이 스크립트를 실행합니다.
//   1) CRM에 등록된 거래처의 "이메일 도메인" 목록을 가져오고
//   2) 네이버 메일/네이버 웍스에 IMAP으로 접속해 최근 3일치 메일 중
//      거래처 도메인과 주고받은 메일을 찾아
//   3) CRM 타임라인(crm_activities)에 기록합니다 (중복은 자동 무시).
//
// 메일 계정은 CRM의 "설정" 화면에서 등록합니다 (crm_mail_accounts 테이블).
// GitHub Secrets에는 SUPABASE_SERVICE_ROLE_KEY 하나만 있으면 됩니다.
// (예전 방식인 NAVER_MAIL_* / WORKS_MAIL_* Secrets도 계속 동작 — 보조 수단)
// ---------------------------------------------------------------------------
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import crypto from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://fzoombsxvscndzrhzmwb.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const LOOKBACK_DAYS = 3; // 매시간 돌므로 3일이면 충분 (중복은 걸러짐)

if (!SERVICE_KEY) {
  console.log("SUPABASE_SERVICE_ROLE_KEY 미설정 — 수집을 건너뜁니다 (Secrets 등록 후 자동 활성화).");
  process.exit(0);
}

async function sb(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${path} 실패: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// 한국시간 'YYYY-MM-DD HH:MM'
function kstString(d) {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 16).replace("T", " ");
}

function addressDomain(addr) {
  const i = (addr || "").lastIndexOf("@");
  return i < 0 ? "" : addr.slice(i + 1).toLowerCase();
}

// 수집 계정: 1순위 = CRM 설정 화면에서 등록한 계정, 보조 = 예전 방식 GitHub Secrets
const dbAccounts = (await sb("/rest/v1/crm_mail_accounts?select=*&enabled=eq.true")).map((a) => ({
  label: a.label,
  host: a.imap_host,
  port: a.imap_port || 993,
  user: a.username,
  pass: a.password,
}));
const envAccounts = [
  { label: "네이버 메일(Secrets)", host: "imap.naver.com", port: 993, user: process.env.NAVER_MAIL_USER, pass: process.env.NAVER_MAIL_PASSWORD },
  { label: "네이버 웍스(Secrets)", host: "imap.worksmobile.com", port: 993, user: process.env.WORKS_MAIL_USER, pass: process.env.WORKS_MAIL_PASSWORD },
].filter((a) => a.user && a.pass);

// 같은 계정이 양쪽에 있으면 설정 화면 쪽만 사용 (host+user 기준)
const seen = new Set(dbAccounts.map((a) => `${a.host}|${a.user}`.toLowerCase()));
const ACCOUNTS = [...dbAccounts, ...envAccounts.filter((a) => !seen.has(`${a.host}|${a.user}`.toLowerCase()))];

if (ACCOUNTS.length === 0) {
  console.log("등록된 메일 계정 없음 — CRM 설정 화면에서 계정을 추가하면 자동으로 수집이 시작됩니다.");
  process.exit(0);
}
console.log(`메일 계정 ${ACCOUNTS.length}개:`, ACCOUNTS.map((a) => `${a.label}(${a.host})`).join(", "));

const companies = (await sb("/rest/v1/crm_companies?select=id,name,domain&domain=not.is.null&deleted_at=is.null")).filter(
  (c) => (c.domain || "").trim() !== ""
);
if (companies.length === 0) {
  console.log("도메인이 등록된 거래처가 없어 수집할 것이 없습니다.");
  process.exit(0);
}
console.log(`거래처 ${companies.length}곳의 도메인을 대상으로 수집:`, companies.map((c) => c.domain).join(", "));

const rows = new Map(); // id -> row (계정/편지함 간 중복 제거)

for (const account of ACCOUNTS) {
  console.log(`\n[${account.label}] ${account.host} 접속...`);
  const client = new ImapFlow({
    host: account.host,
    port: account.port || 993,
    secure: true,
    auth: { user: account.user, pass: account.pass },
    logger: false,
  });
  try {
    await client.connect();
  } catch (e) {
    console.error(`[${account.label}] 접속 실패: ${e.message} — 아이디/비밀번호와 IMAP 사용 설정을 확인하세요.`);
    continue;
  }

  // 받은편지함 + 보낸편지함 모두 수집
  const boxes = ["INBOX"];
  try {
    const list = await client.list();
    const sent = list.find((b) => (b.specialUse || "") === "\\Sent");
    if (sent) boxes.push(sent.path);
  } catch (e) {
    console.log("보낸편지함 탐색 실패(받은편지함만 수집):", e.message);
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000);

  for (const box of boxes) {
    let lock;
    try {
      lock = await client.getMailboxLock(box);
    } catch (e) {
      console.log(`편지함 '${box}' 열기 실패:`, e.message);
      continue;
    }
    try {
      // 1단계: 봉투(보낸이/받는이/제목)만 훑어서 거래처 메일을 고른다
      //        (fetch 반복 중에는 다른 IMAP 명령을 보내면 안 되므로 다운로드는 2단계에서)
      let scanned = 0;
      const matchedMsgs = [];
      for await (const msg of client.fetch({ since }, { envelope: true, uid: true })) {
        scanned++;
        const env = msg.envelope || {};
        const all = [...(env.from || []), ...(env.to || []), ...(env.cc || [])];
        const company = companies.find((c) =>
          all.some((a) => addressDomain(a.address) === c.domain.toLowerCase())
        );
        if (company) matchedMsgs.push({ uid: msg.uid, env, company });
      }

      // 2단계: 매칭된 메일만 원문을 내려받아 본문 앞부분을 저장
      for (const { uid, env, company } of matchedMsgs) {
        const from = (env.from || [])[0] || {};
        const direction = addressDomain(from.address) === company.domain.toLowerCase() ? "received" : "sent";

        let bodyText = "";
        try {
          const dl = await client.download(uid, undefined, { uid: true });
          const parsed = await simpleParser(dl.content);
          bodyText = (parsed.text || "").replace(/\s+/g, " ").trim().slice(0, 500);
        } catch (e) {
          bodyText = "";
        }

        const mid = env.messageId || `${env.date}|${env.subject}|${from.address}`;
        const id = "nm" + crypto.createHash("sha1").update(mid).digest("hex").slice(0, 24);
        rows.set(id, {
          id,
          company_id: company.id,
          channel: "email",
          direction,
          person: from.name ? `${from.name} (${from.address})` : from.address || "",
          title: env.subject || "(제목 없음)",
          body: bodyText,
          deal_id: null,
          date: kstString(new Date(env.date || Date.now())),
        });
      }
      console.log(`[${account.label}] ${box}: ${scanned}통 확인, ${matchedMsgs.length}통 거래처 매칭`);
    } finally {
      lock.release();
    }
  }
  await client.logout().catch(() => {});
}

const payload = [...rows.values()];
if (payload.length === 0) {
  console.log("\n새로 기록할 메일 없음 — 정상 종료.");
  process.exit(0);
}

// on_conflict=id + ignore-duplicates → 이미 기록된 메일은 건너뜀
await sb("/rest/v1/crm_activities?on_conflict=id", {
  method: "POST",
  headers: { Prefer: "resolution=ignore-duplicates" },
  body: JSON.stringify(payload),
});
console.log(`\nCRM에 ${payload.length}건 기록 완료 (기존 중복은 자동 무시).`);
