// 창업성공패키지(중진공 창업사관학교) 서식 — ysc=청년창업사관학교 딥테크 1기 / gsa=글로벌창업사관학교
// 본문 문구는 업로드된 각종 서류양식 ZIP(2026) HWP/XLSX 원문에서 추출한 그대로 재현.
// 두 변형의 차이는 용어("청년창업자"↔"창업자")·일부 서식 유무뿐이라 variant(v)로 분기한다.
import { Fragment } from "react";
import { GrantPhoto, GrantProfile } from "../lib/db";
import { SspFormKey, SspProgramKey, SSP_SUBITEMS, money, num, dateParts } from "../lib/grantforms";
import { Stamp } from "./GrantForms";
import GrantFormSSP2 from "./GrantFormsSSP2";

export type SspProps = {
  v: SspProgramKey;
  p: GrantProfile;
  d: Record<string, any>;
  photos: GrantPhoto[];
  img: (path: string) => string | undefined;
  sign?: string;
  // s20(사용실적보고서)·s22(월간 활동보고서) 자동 집계용 — 공고의 모든 집행 건
  settleDocs?: { expense_item?: string; data: Record<string, any>; created_at?: string }[];
};

// 공고별 용어 — 원문: ysc "청년창업자/청년창업사관학교", gsa "창업자/글로벌창업사관학교"
export const sspTerm = (v: SspProgramKey) =>
  v === "gsa"
    ? { founder: "창업자", school: "글로벌창업사관학교", schoolTag: "글로벌창업사관학교" }
    : { founder: "청년창업자", school: "청년창업사관학교", schoolTag: "청년(딥테크)창업사관학교" };
export const sspInfo = (p: GrantProfile, v: SspProgramKey) => (p.ssp?.[v] || {}) as NonNullable<GrantProfile["ssp"]>[string];

export const kdate = (iso?: string, blank = "20  년   월   일") =>
  iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(0, 4)}년 ${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일` : blank;
// 공통 스타일
const body: React.CSSProperties = { verticalAlign: "top", padding: "2mm 2.5mm", fontSize: "10.5pt", whiteSpace: "pre-wrap", lineHeight: 1.65 };
const TitleBox = ({ children }: { children: React.ReactNode }) => (
  <h2 style={{ textAlign: "center", fontSize: "18pt", fontWeight: 700, margin: "2mm 0 5mm" }}>{children}</h2>
);
// 날짜 + 서명 줄 (원문 "년 월 일" + "대표자명 : (인/서명)")
export function DateSign({ d, label = "대표자명", who, sign, seal = "(인)" }: { d?: string; label?: string; who?: string; sign?: string; seal?: string }) {
  const dp = dateParts(d);
  return (
    <div style={{ marginTop: "8mm" }}>
      <p style={{ textAlign: "center", fontSize: "12pt", margin: "0 0 5mm" }}>{dp.y || "        "} 년 {dp.m || "    "} 월 {dp.d || "    "} 일</p>
      <p style={{ textAlign: "right", fontSize: "12pt", margin: 0, paddingRight: "10mm" }}>
        {label} : {who || "          "} <Stamp sign={sign} label={seal} />
      </p>
    </div>
  );
}

// ── 1. 사업비 집행계획서 (xlsx 원본: 결재란 + 현황 + 협약금액 + 비목별 집행계획) ──
function S1({ v, p, d }: SspProps) {
  const info = sspInfo(p, v);
  const plan: Record<string, { amt?: string; calc?: string }> = d.plan || {};
  const items = Object.keys(SSP_SUBITEMS);
  const groupSum = (it: string) => SSP_SUBITEMS[it].reduce((s, sub) => s + num(plan[sub.name]?.amt), 0);
  const total = items.reduce((s, it) => s + groupSum(it), 0);
  const gov = num(info.govFund), cash = num(info.ownCash), inkind = num(info.ownInkind);
  const cell: React.CSSProperties = { fontSize: "10pt", textAlign: "center" };
  const amt: React.CSSProperties = { fontSize: "10pt", textAlign: "right", paddingRight: "1.5mm" };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <h2 style={{ fontSize: "18pt", fontWeight: 700, margin: 0 }}>사업비 집행계획서</h2>
        <table className="gt gx" style={{ width: "34%" }}><tbody>
          <tr style={{ height: "5mm" }}><th rowSpan={2} style={{ width: "22%", fontSize: "9pt" }}>승인</th><th style={{ fontSize: "9pt" }}>입교자</th><th style={{ fontSize: "9pt" }}>팀 장</th></tr>
          <tr style={{ height: "9mm" }}><td /><td /></tr>
        </tbody></table>
      </div>
      <div style={{ fontSize: "11.5pt", fontWeight: 700, margin: "4mm 0 1mm" }}>1. 현황 <span style={{ float: "right", fontWeight: 400, fontSize: "10pt" }}>작성일자 : {kdate(d.writeDate, "20   .   .   .")}</span></div>
      <table className="gt gx" style={{ fontSize: "10.5pt" }}><tbody>
        <tr style={{ height: "8mm" }}>
          <th style={{ width: "14%" }}>과제명</th><td style={{ textAlign: "center", width: "46%" }}>{info.taskName}</td>
          <th style={{ width: "16%" }}>입교자<br />(업체명)</th><td style={{ textAlign: "center" }}>{info.trainee || p.ceo}{p.company ? ` (${p.company})` : ""}</td>
        </tr>
      </tbody></table>
      <div style={{ fontSize: "11.5pt", fontWeight: 700, margin: "4mm 0 1mm" }}>2. 협약 금액 <span style={{ float: "right", fontWeight: 400, fontSize: "9.5pt" }}>(단위 : 원)</span></div>
      <table className="gt gx"><tbody>
        <tr style={{ height: "7mm" }}>
          <th rowSpan={2} style={{ fontSize: "10pt", width: "20%" }}>총사업비(A+B+C)</th>
          <th rowSpan={2} style={{ fontSize: "10pt", width: "18%" }}>정부지원금(A)</th>
          <th colSpan={3} style={{ fontSize: "10pt" }}>입교자 부담금</th>
          <th rowSpan={2} style={{ fontSize: "9.5pt" }}>현금(사업비)조성금액<br />(정부지원금+입교자현금부담금)</th>
        </tr>
        <tr style={{ height: "7mm" }}>
          <th style={{ fontSize: "10pt" }}>계(B+C)</th><th style={{ fontSize: "10pt" }}>현금(B)</th><th style={{ fontSize: "10pt" }}>현물(C)</th>
        </tr>
        <tr style={{ height: "9mm" }}>
          <td style={amt}>{money(gov + cash + inkind) || ""}</td><td style={amt}>{money(gov) || ""}</td>
          <td style={amt}>{money(cash + inkind) || ""}</td><td style={amt}>{money(cash) || ""}</td><td style={amt}>{money(inkind) || ""}</td>
          <td style={amt}>{money(gov + cash) || ""}</td>
        </tr>
      </tbody></table>
      <div style={{ fontSize: "11.5pt", fontWeight: 700, margin: "4mm 0 1mm" }}>3. 비목별 사업비 집행계획</div>
      <table className="gt gx"><tbody>
        <tr style={{ height: "7mm" }}>
          <th style={{ fontSize: "10pt", width: "13%" }}>비목</th><th style={{ fontSize: "10pt", width: "27%" }}>세목</th>
          <th style={{ fontSize: "10pt", width: "17%" }}>소요금액</th><th style={{ fontSize: "10pt" }}>산출내역</th>
        </tr>
        {items.map(it => {
          const subs = SSP_SUBITEMS[it];
          return (
            <Fragment key={it}>
              {subs.map((sub, i) => (
                <tr key={sub.name} style={{ height: "6.4mm" }}>
                  {i === 0 && <th rowSpan={subs.length + 1} style={{ fontSize: "10pt" }}>{it}</th>}
                  <td style={{ ...cell, textAlign: "left", paddingLeft: "1.5mm" }}>{sub.name}</td>
                  <td style={amt}>{money(plan[sub.name]?.amt) || ""}</td>
                  <td style={{ ...cell, textAlign: "left", paddingLeft: "1.5mm", fontSize: "9pt" }}>{plan[sub.name]?.calc || (sub.note ? <span className="gph">{sub.note}</span> : "")}</td>
                </tr>
              ))}
              <tr style={{ height: "6.4mm", background: "#f4f4f4" }}>
                <th style={{ fontSize: "9.5pt" }}>세목 합계</th><td style={{ ...amt, fontWeight: 700 }}>{groupSum(it) ? money(groupSum(it)) : ""}</td><td />
              </tr>
            </Fragment>
          );
        })}
        <tr style={{ height: "7.5mm" }}>
          <th colSpan={2} style={{ fontSize: "10.5pt" }}>총          계</th>
          <td style={{ ...amt, fontWeight: 700 }}>{total ? money(total) : ""}</td>
          <td style={{ fontSize: "9pt", paddingLeft: "1.5mm" }}>총계는 현금(사업비)조성금액과 일치하여야 함</td>
        </tr>
      </tbody></table>
    </div>
  );
}

// ── 2. 구매▪계약 세부내역서 (구매/계약 — 대표자가 3page 내외 직접 작성) ──
function S2({ v, p, d }: SspProps) {
  const info = sspInfo(p, v);
  const buy = (d.s2Type || "구매") === "구매";
  const rows: [string, string, string | undefined][] = buy
    ? [
      ["1. 제품명 : ", d.itemName || d.s2Name, undefined],
      ["2. 구매 목표(사유) : ", d.buyGoal, undefined],
      ["3. 구매 세부내용 : ", d.buyDetail, undefined],
      ["4. 구매 업체정보", "", undefined],
      ["  (1) 업체명 : ", d.vdName, undefined],
      ["  (2) 인력 현황 : ", d.vdStaff, undefined],
      ["  (3) 주요 실적 : ", d.vdRecord, undefined],
      ["5. 구매(납품) 계획 (구매수량, 일정 등)", d.buyPlan, undefined],
      ["6. 결과물 (구매물품규격, 사양 등)", d.buyResult, undefined],
      ["7. 기타 (추가증빙자료 등 별첨)", d.buyEtc, undefined],
    ]
    : [
      ["1. 계약(개발)명 : ", d.osName, undefined],
      ["2. 계약(개발) 목표 : ", d.osGoal, undefined],
      ["3. 계약(개발) 내용 : ", d.osDetail, undefined],
      ["4. 위탁계약(개발) 업체정보", "", undefined],
      ["  (1) 업체명 : ", d.vdName, undefined],
      ["  (2) 인력 현황 : ", d.vdStaff, undefined],
      ["  (3) 주요 실적 : ", d.vdRecord, undefined],
      ["5. 계약(개발) 계획 (개발계획, 일정 등)", d.osPlan, undefined],
      ["6. 예상 결과물 (결과보고서, 최종산출물 등)", d.osResult, undefined],
      ["7. 기타 (추가증빙자료 등 별첨)", d.osEtc, "별첨 : 위탁개발 계획서 (위탁업체 작성용)"],
    ];
  return (
    <div>
      <TitleBox>구매▪계약 세부내역서 ({buy ? "구매" : "계약"})</TitleBox>
      <p style={{ fontSize: "10pt", margin: "0 0 1mm" }}>* 다음 내용이 반드시 포함될 수 있도록 3page 내외로 대표자가 직접 작성</p>
      <table className="gt gx" style={{ fontSize: "10.5pt" }}><tbody>
        <tr style={{ height: "7mm" }}>
          <th style={{ width: "22%" }}>입교자명</th><th style={{ width: "45%" }}>과제명</th><th>사업비사용금액<br />(VAT 제외)</th>
        </tr>
        <tr style={{ height: "9mm" }}>
          <td style={{ textAlign: "center" }}>{info.trainee || p.ceo}</td>
          <td style={{ textAlign: "center" }}>{info.taskName}</td>
          <td style={{ textAlign: "right", paddingRight: "2mm" }}>{money(d.useAmount) ? money(d.useAmount) + "원" : ""}</td>
        </tr>
      </tbody></table>
      <table className="gt gx" style={{ marginTop: "2mm" }}><tbody>
        <tr><td style={{ ...body, minHeight: "180mm", height: "205mm" }}>
          {rows.map(([label, val, extra], i) => (
            <div key={i} style={{ marginBottom: val ? "3mm" : "5mm" }}>
              <b>{label}</b>{val ? <span style={{ whiteSpace: "pre-wrap" }}>{label.endsWith(": ") ? val : <><br />{val}</>}</span> : ""}
              {extra && <div style={{ marginTop: "4mm" }}>{extra}</div>}
            </div>
          ))}
        </td></tr>
      </tbody></table>
    </div>
  );
}

// ── 3. 위탁개발 계획서 (위탁업체 작성 — 표지 확인서 + 본문) ──
function S3({ d }: SspProps) {
  return (
    <div>
      <div className="gpage">
        <p style={{ textAlign: "right", fontSize: "11pt", margin: "0 0 20mm" }}>(위탁업체 작성용)</p>
        <h2 style={{ textAlign: "center", fontSize: "24pt", fontWeight: 700, margin: "26mm 0 24mm" }}>[위탁개발 계획서]</h2>
        <p style={{ textAlign: "center", fontSize: "12pt", margin: "0 0 22mm" }}>위탁개발 계획서의 내용이 사실과 다르지 않음을 확인합니다.</p>
        <table style={{ margin: "0 auto", fontSize: "13pt", lineHeight: 2.4 }}><tbody>
          <tr><td style={{ paddingRight: "6mm" }}>업 체 명 :</td><td style={{ minWidth: "55mm" }}>{d.vdName}</td><td /></tr>
          <tr><td>대표자명 :</td><td>{d.vdCeo}</td><td /></tr>
          <tr><td>작성일자 :</td><td>{kdate(d.writeDate, "")}</td><td style={{ paddingLeft: "8mm" }}>(인)</td></tr>
        </tbody></table>
      </div>
      <div>
        <TitleBox>【 위탁개발 계획서 】</TitleBox>
        <table className="gt gx"><tbody>
          <tr><td style={{ ...body, height: "230mm" }}>
            <p style={{ fontSize: "9.5pt", margin: "0 0 3mm" }}>* 다음 내용이 반드시 포함될 수 있도록 작성, 필요시 업체양식 별첨 가능</p>
            {[
              ["1. 계약(개발)명 : ", d.osName],
              ["2. 계약(개발) 목표 : ", d.osGoal],
              ["3. 계약(개발) 내용 : ", d.osDetail],
              ["4. 위탁계약(개발) 업체정보", ""],
              ["  (1) 업체명 : ", d.vdName],
              ["  (2) 인력 현황 : ", d.vdStaff],
              ["  (3) 주요 실적 : ", d.vdRecord],
              ["5. 계약(개발) 계획 (개발계획, 일정 등)", d.osPlan],
              ["6. 예상 결과물 (결과보고서, 최종산출물 등)", d.osResult],
              ["7. 기타 (추가증빙자료 등 별첨)", d.osEtc],
            ].map(([label, val], i) => (
              <div key={i} style={{ marginBottom: val ? "3mm" : "6mm" }}>
                <b>{label}</b>{val ? <span style={{ whiteSpace: "pre-wrap" }}>{String(label).endsWith(": ") ? val : <><br />{val}</>}</span> : ""}
              </div>
            ))}
          </td></tr>
        </tbody></table>
      </div>
    </div>
  );
}

// ── 4. 사업비 사용내역서 (구매건 — 단순 구매 시) ──
function S4({ v, p, d, photos, img, sign }: SspProps) {
  const rows: any[] = Array.isArray(d.buyRows) ? d.buyRows : [];
  const total = rows.reduce((s, r) => s + (num(r.sum) || (num(r.unit) * num(r.qty))), 0);
  const info = sspInfo(p, v);
  const cell: React.CSSProperties = { fontSize: "10pt", textAlign: "center", height: "6.4mm" };
  const show = rows.length ? rows : Array.from({ length: 4 }, () => ({}));
  const ph = (i: number) => photos[i] && img(photos[i].path)
    ? <img src={img(photos[i].path)} alt="" style={{ maxWidth: "100%", maxHeight: "44mm", objectFit: "contain" }} />
    : <span className="gph">[증빙 사진]</span>;
  return (
    <div>
      <TitleBox>【 사업비 사용내역서 】</TitleBox>
      <p style={{ fontSize: "10pt", margin: "0 0 2mm" }}>* 단순 구매 건인 경우 작성합니다.</p>
      <table className="gt gx" style={{ fontSize: "10.5pt" }}><tbody>
        <tr style={{ height: "7.5mm" }}>
          <th style={{ width: "16%" }}>구매일자</th><td style={{ width: "34%", textAlign: "center" }}>{kdate(d.buyDate, "20  년     월     일")}</td>
          <th style={{ width: "16%" }}>납품일자</th><td style={{ textAlign: "center" }}>{kdate(d.deliverDate, "20  년     월     일")}</td>
        </tr>
        <tr style={{ height: "7.5mm" }}><th>제 품 명</th><td colSpan={3} style={{ textAlign: "center" }}>{d.itemName}</td></tr>
        <tr><th style={{ height: "14mm" }}>구매사유</th><td colSpan={3} style={{ ...body }}>{d.buyReason}</td></tr>
      </tbody></table>
      <table className="gt gx" style={{ marginTop: "2mm" }}><tbody>
        <tr style={{ height: "6.8mm" }}>
          <th style={{ fontSize: "10pt" }}>세부내역<br />(종류)</th><th style={{ fontSize: "10pt", width: "17%" }}>단가</th>
          <th style={{ fontSize: "10pt", width: "11%" }}>수량</th><th style={{ fontSize: "10pt", width: "20%" }}>합계(VAT제외)</th><th style={{ fontSize: "10pt", width: "16%" }}>비고</th>
        </tr>
        {show.map((r, i) => (
          <tr key={i}>
            <td style={{ ...cell, textAlign: "left", paddingLeft: "1.5mm" }}>{r.kind || ""}</td>
            <td style={{ ...cell, textAlign: "right", paddingRight: "1.5mm" }}>{money(r.unit) || ""}</td>
            <td style={cell}>{r.qty || ""}</td>
            <td style={{ ...cell, textAlign: "right", paddingRight: "1.5mm" }}>{money(num(r.sum) || (num(r.unit) * num(r.qty)) || "") || ""}</td>
            <td style={cell}>{r.note || ""}</td>
          </tr>
        ))}
        <tr style={{ height: "6.8mm" }}>
          <th colSpan={3} style={{ fontSize: "10pt" }}>총계(VAT제외)</th>
          <td style={{ fontSize: "10pt", textAlign: "right", paddingRight: "1.5mm", fontWeight: 700 }}>{total ? money(total) : "0"}</td><td />
        </tr>
      </tbody></table>
      <p style={{ fontSize: "10pt", margin: "3mm 0 1mm" }}>* 증빙 사진</p>
      <table className="gt gx"><tbody>
        <tr style={{ height: "6.5mm" }}>
          <th style={{ fontSize: "10pt", width: "50%" }}>[증빙1] {photos[0]?.name || "내용"}</th>
          <th style={{ fontSize: "10pt" }}>[증빙2] {photos[1]?.name || "내용"}</th>
        </tr>
        <tr><td style={{ height: "46mm", textAlign: "center", verticalAlign: "middle" }}>{ph(0)}</td><td style={{ textAlign: "center", verticalAlign: "middle" }}>{ph(1)}</td></tr>
        <tr style={{ height: "6.5mm" }}>
          <th style={{ fontSize: "10pt" }}>[증빙3] {photos[2]?.name || "내용"}</th>
          <th style={{ fontSize: "10pt" }}>[증빙4] {photos[3]?.name || "내용"}</th>
        </tr>
        <tr><td style={{ height: "46mm", textAlign: "center", verticalAlign: "middle" }}>{ph(2)}</td><td style={{ textAlign: "center", verticalAlign: "middle" }}>{ph(3)}</td></tr>
      </tbody></table>
      <p style={{ fontSize: "9.5pt", margin: "1mm 0 4mm" }}>* 필요시 증빙사진 추가</p>
      <p style={{ textAlign: "center", fontSize: "11.5pt", margin: "4mm 0 0" }}>위의 구매 활동이 정상적으로 진행되었음을 확인합니다.</p>
      <DateSign d={d.writeDate} label="대표자명" who={info.trainee || p.ceo} sign={sign} />
    </div>
  );
}

// ── 5. 위탁기관 등록 신청서 (전자결재) ──
function S5({ v, d, sign: _s }: SspProps) {
  const t = sspTerm(v);
  const fields = [
    "디자인", "설계", "제작", "프로그램(S/W, 게임, App 개발 등)", "콘텐츠", "식품", "공예품", "회로개발", "금형", "기타",
  ];
  const checked = String(d.vdField || "");
  const cb = (name: string) => <span key={name} style={{ marginRight: "2.5mm", whiteSpace: "nowrap" }}>{checked.includes(name.split("(")[0]) ? "■" : "□"} {name}</span>;
  const H = { height: "7.6mm" };
  return (
    <div>
      <div className="gpage">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "2mm" }}>
          <h2 style={{ fontSize: "17pt", fontWeight: 700, margin: 0 }}>위탁기관 등록 신청서</h2>
          <table className="gt gx" style={{ width: "42%" }}><tbody>
            <tr style={{ height: "5mm" }}><th rowSpan={2} style={{ width: "24%", fontSize: "9pt" }}>전 자<br />결 재</th><th style={{ fontSize: "9pt" }}>코칭교수</th><th style={{ fontSize: "9pt" }}>팀 장</th><th style={{ fontSize: "9pt" }}>부서장</th></tr>
            <tr style={{ height: "9mm" }}><td /><td /><td /></tr>
          </tbody></table>
        </div>
        <table className="gt gx" style={{ fontSize: "10pt" }}><tbody>
          <tr style={H}><th style={{ width: "18%" }}>제품 제작분야</th><td colSpan={3} style={{ paddingLeft: "1.5mm", fontSize: "9pt", lineHeight: 1.8 }}>{fields.map(cb)}</td></tr>
          <tr style={H}><th>업   체   명</th><td style={{ width: "34%", textAlign: "center" }}>{d.vdName}</td><th style={{ width: "16%" }}>대  표  자</th><td style={{ textAlign: "center" }}>{d.vdCeo}</td></tr>
          <tr style={H}><th>법인등록번호</th><td style={{ textAlign: "center" }}>{d.vdCorpNo}</td><th>업     종</th><td style={{ textAlign: "center" }}>{d.vdSector}</td></tr>
          <tr style={H}><th>사업자등록번호</th><td style={{ textAlign: "center" }}>{d.vdBizno}</td><th>회사설립일</th><td style={{ textAlign: "center" }}>{kdate(d.vdFounded, "    년     월     일")}</td></tr>
          <tr style={H}><th>홈페이지</th><td style={{ textAlign: "center" }}>{d.vdWeb}</td><th>팩스번호</th><td style={{ textAlign: "center" }}>{d.vdFax}</td></tr>
          <tr style={H}><th>매출액(전년도)</th><td style={{ textAlign: "center" }}>{d.vdSales ? `${money(d.vdSales)} 백만 원` : "백만 원"}</td><th>종업원 수</th><td style={{ textAlign: "center" }}>{d.vdHeads ? `${d.vdHeads} 명` : "명"}</td></tr>
          <tr style={H}><th>현장평가 면제여부</th>
            <td style={{ textAlign: "center" }}>{d.vdSiteSkip === true ? "■" : "□"} 해당(현장평가 미실시)</td>
            <td colSpan={2} style={{ textAlign: "center" }}>{d.vdSiteSkip === false ? "■" : "□"} 미해당(현장평가 실시)</td></tr>
          <tr style={H}><th>본사 소재지</th><td colSpan={3} style={{ paddingLeft: "1.5mm" }}>{d.vdAddr}</td></tr>
          <tr style={H}><th>공장 소재지</th><td colSpan={3} style={{ paddingLeft: "1.5mm" }}>{d.vdPlant}</td></tr>
          <tr style={H}><th>대표자 연락처</th><td colSpan={3} style={{ paddingLeft: "1.5mm" }}>{d.vdTel}</td></tr>
          <tr style={H}>
            <th>담당자</th>
            <td colSpan={3} style={{ paddingLeft: "1.5mm" }}>
              성명: {d.vdMgr || "        "} / 직위: {d.vdMgrTitle || "        "} / 연락처: {d.vdMgrTel || "            "} / 이메일: {d.vdMgrEmail || ""}
            </td>
          </tr>
        </tbody></table>
        <div style={{ fontSize: "10.5pt", lineHeight: 1.9, marginTop: "4mm" }}>
          <p style={{ margin: 0 }}>창업성공패키지 사업의 위탁기관 등록 신청서를 제출하며, 아래의 사항을 준수할 것을 확인 및 동의합니다.</p>
          <p style={{ margin: "1mm 0 0" }}>1. 동 사업에서 습득한 지식 및 아이디어를 외부에 유출 또는 사용하지 않으며, 유출로 인한 분쟁 발생 시 법적 책임은 본 기업에 있음에 동의합니다.</p>
          <p style={{ margin: 0 }}>2. 제출한 내용에 대해서 중소벤처기업부, 중소벤처기업진흥공단, 창업진흥원 등이 활용할 수 있으며, {t.schoolTag} 홈페이지에 공개하는 것에 동의합니다.</p>
          <p style={{ margin: 0 }}>3. 위탁기관의 부도‧폐업‧해산, 신청서 내용에 허위 사실이 기재되어 있는 경우, 위탁기관 등록일로부터 3년간 {t.founder}와 거래기록이 없는 경우, 고의 또는 중대한 과실로 {t.founder}나 중진공에 손해를 끼친 경우에는 위탁기관 등록을 취소하는 것에 동의합니다.</p>
        </div>
        <div style={{ marginTop: "6mm" }}>
          <p style={{ textAlign: "center", fontSize: "11.5pt", margin: "0 0 3mm" }}>{(() => { const dp = dateParts(d.writeDate); return `20${(dp.y || "  ").slice(2)} 년 ${dp.m || "  "} 월 ${dp.d || "  "} 일`; })()}</p>
          <p style={{ textAlign: "center", fontSize: "11.5pt", margin: "0 0 4mm" }}>신청인(대표) : {d.vdCeo || "          "} (인)</p>
          <p style={{ fontSize: "13pt", fontWeight: 700, margin: 0 }}>중소벤처기업진흥공단 이사장 귀하</p>
        </div>
        <div style={{ fontSize: "9.5pt", lineHeight: 1.7, marginTop: "4mm" }}>
          ※ 신청서 제출 시 첨부서류<br />
          &nbsp;1. 사업자등록증 1부&nbsp;&nbsp;2. 원천징수이행상황신고서 1부&nbsp;&nbsp;3. 주요 전문기술인력 확인 증빙(직원의 경력증명서 등)<br />
          &nbsp;4. 전년도 관련분야 수행 건수 실적 증빙(전자세금계산서합계표 상세조회(매출) 등)&nbsp;&nbsp;5. 전년도 매출액 실적 증빙(부가가치세 과세표준증명원 등)<br />
          &nbsp;6. 대표자의 건강보험자격득실확인서 또는 국민연금가입자명부&nbsp;&nbsp;7. 개인정보 수집‧이용 및 제3자 제공 동의서(위탁기관의 대표 및 담당자)<br />
          &nbsp;8. 위탁기관 회사 소개서(주요사업, 위탁개발가능 분야, 개발 및 납품실적 등)
        </div>
      </div>
      {/* 2쪽 — 위탁개발업체 현황 */}
      <div>
        <TitleBox>위탁개발업체 현황</TitleBox>
        <table className="gt gx" style={{ fontSize: "10.5pt" }}><tbody>
          <tr><th style={{ width: "18%", height: "10mm" }}>생산품목</th><td style={body}>{d.vdProducts}</td></tr>
          <tr><th style={{ height: "34mm" }}>회사소개<br /><span style={{ fontWeight: 400, fontSize: "9pt" }}>(5줄 이내 작성)</span></th><td style={body}>{d.vdIntro}</td></tr>
        </tbody></table>
        <div style={{ fontSize: "11pt", fontWeight: 700, margin: "4mm 0 1mm" }}>보유 장비 목록</div>
        <table className="gt gx"><tbody>
          <tr style={{ height: "7mm" }}><th style={{ fontSize: "10pt" }}>장 비 명</th><th style={{ fontSize: "10pt", width: "30%" }}>규 격</th><th style={{ fontSize: "10pt", width: "30%" }}>용 도</th></tr>
          {(Array.isArray(d.vdEquip) && d.vdEquip.length ? d.vdEquip : Array.from({ length: 6 }, () => ({}))).map((r: any, i: number) => (
            <tr key={i} style={{ height: "7.5mm" }}>
              <td style={{ fontSize: "10pt", paddingLeft: "1.5mm" }}>{r.name || ""}</td>
              <td style={{ fontSize: "10pt", textAlign: "center" }}>{r.spec || ""}</td>
              <td style={{ fontSize: "10pt", textAlign: "center" }}>{r.use || ""}</td>
            </tr>
          ))}
        </tbody></table>
        <p style={{ fontSize: "9.5pt", marginTop: "2mm" }}>※ IT기업의 경우 보유인력 내역 첨부</p>
      </div>
    </div>
  );
}

// ── 6. 위탁개발 계약서 (제1~12조 — 원문 조문 그대로, 용어만 공고별 분기) ──
function S6({ v, p, d, sign }: SspProps) {
  const t = sspTerm(v);
  const F = t.founder; // 청년창업자/창업자
  const art: React.CSSProperties = { fontSize: "10.5pt", lineHeight: 1.7, margin: "0 0 2.5mm", whiteSpace: "pre-wrap" };
  const dp = dateParts(d.writeDate);
  return (
    <div>
      <div className="gpage">
        <p style={{ textAlign: "center", fontSize: "13pt", margin: "0 0 2mm" }}>「창업성공패키지{v === "gsa" ? " 사업화지원" : ""}」</p>
        <TitleBox>위탁개발계약서</TitleBox>
        <div style={{ fontSize: "11.5pt", lineHeight: 2.1, margin: "4mm 0" }}>
          ◦ 위탁 사업명&nbsp;&nbsp;&nbsp;&nbsp;: {d.osName}<br />
          &nbsp;&nbsp;(사업과제명 : {sspInfo(p, v).taskName || ""})<br />
          ◦ 위탁사업기간&nbsp;&nbsp; : {kdate(d.osFrom, "20   년    월    일")} ~ {kdate(d.osTo, "20  년    월    일")}<br />
          ◦ 위탁 사업비&nbsp;&nbsp;&nbsp;&nbsp;: {d.osAmount ? `${money(d.osAmount)} 원 (VAT 제외)` : "               원 (VAT 제외)"}<br />
          ◦ 위탁사업 책임자(대표자) : 소속 {d.vdName || "          "}  직위 {d.vdCeoTitle || "      "}  성명 {d.vdCeo || "        "}
        </div>
        <p style={art}> 「창업성공패키지」에 따른 위탁수행에 관하여 {F}와 위탁기관은 다음과 같이 계약을 체결하고, 중진공은 계약사항을 확인하고 사업비의 집행을 한다.</p>
        <p style={art}><b>제1조 (사업수행목표 및 범위)</b> 첨부의「위탁사업계획서」상의 기술(제품)을 개발 하는 것을 목표로 한다.</p>
        <p style={art}><b>제2조 (업무 수행)</b>{"\n"} ① “{F}”와 “위탁기관”은 본 계약을 충실히 수행하기 위하여 필요한 모든 지식과 기술을 활용하는 신의, 성실, 근면의 의무를 갖는다.{"\n"} ② “{F}”와 “위탁기관”은 첨부의 위탁사업계획서에 따라 계약사항 이행을 위해 “중소벤처기업진흥공단”(이하 “중진공”)으로부터 조정과 감독을 받아 업무를 수행한다.</p>
        <p style={art}><b>제3조 (사업비의 지급)</b>{"\n"}  “{F}”와 “위탁기관”은 다음과 같이 위탁사업비를 “중진공”이 “위탁기관”에게 지급하는 것에 동의한다.{"\n"} ① 사업비는 “{F}”가 납부한 부담금과 “중진공”의 정부지원금으로 구성되며 지급 조건은 선급금, 중도금, 잔금으로 하고, 지급율 범위 이내에서 지급한다.{"\n"} ② 사업비중 “{F}”와 “위탁기관”이 서명한 지급요청서를 “중진공”에게 제출하여 “위탁기관”이 수령한다.{"\n"} ③ 잔금의 지급 요청 시에는 “위탁기관”이 작성한 완료보고서를 첨부하여야 한다.{"\n"} ④ “{F}”의 귀책사유에 의하여 “{F}”와 “위탁기관”이 체결한 표준협약이 해지되는 경우 모든 사업비용은 “{F}”가 부담한다.{"\n"} ⑤ “위탁기관”의 귀책사유에 의하여 사업을 중단하는 경우 “위탁기관”은 기 지급된 사업비를 “중진공”에게 반환하고 본 계약을 해지한다.{"\n"} ⑥ “중진공”에 의해 사업중단 판정이 된 경우 “{F}”와 “위탁기관”은 사업비를 “중진공”에게 청구할 수 없다.</p>
        <p style={art}><b>제4조 (사업의 진행 및 결과보고)</b>{"\n"} ① “위탁기관”은 “{F}” 또는 “{F}”가 지정하는 자의 사업수행현장 확인, 관계서류의 열람, 자료의 제출요청이 있을 경우 위탁사업 책임자가 성실히 응하여야 하고, 이에 불응할 시에는 “중진공”은 본 계약을 해지할 수 있다.{"\n"} ② “위탁기관”은 “{F}”와 “중진공”이 요구하는 바에 따라 위탁사업 책임자가 사업내용을 보완 또는 시정하도록 하여야 한다.{"\n"} ③ “위탁기관”은 위탁사업기간 종료일로부터 7일 이내 완료보고서(증빙자료 포함)를 제출하여야 한다.</p>
        <p style={art}><b>제5조 (검수)</b>{"\n"} ① “위탁기관”이 제4조에 따른 업무수행의 결과를 “{F}”에게 인도할 때, “{F}”는「위탁사업계획서」상의 목표가 달성되었는가를 확인하고, 검수확인서를 “{F}”가 “위탁기관”에게 전달함으로써 본 계약의 이행이 완료된 것으로 한다.{"\n"} ② “{F}”로부터 이의가 제기되었을 경우 “위탁기관”은 보완하여 “{F}”에게 보완사항에 대하여 검수확인을 받아야 한다.{"\n"} ③ “{F}”는 검수확인이 완료된 경우 “위탁기관”이 제출한 완료보고서와 결과물을 “중진공”에 제출하여 사업수행의 점검을 받아야 한다.</p>
        <p style={art}><b>제6조 (계약의 변경)</b>{"\n"}  “{F}”와 “위탁기관”은 상호 협의 하에 계약의 내용과 별첨의 위탁사업계획서 내용을 변경하는 경우 “중진공”의 승인을 받아야 한다.</p>
      </div>
      <div className="gpage">
        <p style={art}><b>제7조 (계약의 양도)</b>{"\n"}  “{F}”와 “위탁기관”은 본 계약상의 권리와 의무를 “중진공”의 사전 승인 없이 제3자에게 양도하거나 하청할 수 없다.</p>
        <p style={art}><b>제8조 (계약의 해지)</b>{"\n"} ① “{F}”와 “위탁기관”은 상대방이 본 계약에 대하여 중대한 위반을 하였을 경우에는 각각 본 계약을 해약할 수 있다.{"\n"} ② “{F}”는 다음 사유가 발생하였을 경우에는 계약을 해지할 수 있다.{"\n"}    가. “위탁기관”의 태만으로 인하여 사업수행이 정지상태가 되어 소기의 사업수행성과를 기대하기 극히 곤란하거나 완수할 능력이 없어졌다고 인정될 때{"\n"}    나. “위탁기관”이 “{F}”의 사전 승인 없이 본 계약의 일부 또는 전부를 제 3자에게 양도하거나 하청하였을 때{"\n"}    다. “위탁기관”의 기타 중대한 사유로 인하여 사업을 계속할 수 없다고 인정될 때{"\n"} ③ “위탁기관”은 다음 사유가 발생하였을 경우에는 계약을 해지할 수 있다.{"\n"}    가. “{F}”가 업무수행을 위한 자료 및 기술을 제공하지 않는 경우{"\n"}    나. “{F}”의 기타 중대한 사유로 인하여 사업을 계속할 수 없다고 인정될 때{"\n"} ④ “{F}”와 “위탁기관”은 “중진공”의 사업수행 점검결과 사업중단으로 판정되면 본 계약은 해지된다.{"\n"} ⑤ “위탁기관”이 다음의 사항에 해당하는 경우 본 계약을 체결 할 수 없다.{"\n"}    가. “{F}”의 직계존비속, 형제, 자매, 배우자(대표로 있는 기업, 사실혼 관계 포함){"\n"}    나. “{F}”가 재직 중인 기업, 재직 중인 기업의 임직원</p>
        <p style={art}><b>제9조 (비밀누설금지 의무)</b>{"\n"} ① “위탁기관”은 업무 수행과정을 통하여 취득한 “{F}”에 관한 정보 및 자료 등에 대하여 정당한 사유 없이 누설하여서는 아니 된다.{"\n"} ② “{F}”의 기밀에 관한 사항을 누설하여 “{F}”가 손해를 입었을 경우 “위탁기관”은 이에 대하여 배상할 책임이 있다.</p>
        <p style={art}><b>제10조 (산출물에 대한 권리)</b>{"\n"} ① 본 계약이행으로 인하여 발생한 최종 성과물 및 기타 모든 산출물에 대한 권리는 “위탁기관”이 대금 전부를 지급 받음과 동시에 “{F}”에게 귀속된다.{"\n"} ② “위탁기관”은 “{F}”의 동의 없이 본 계약에 의한 수행 또는 그 결과의 활용으로 취득한 일체의 사항을 제3자에게 제공하거나 양도 할 수 없다.</p>
        <p style={art}><b>제11조 (분쟁 해결)</b>{"\n"} ① 본 계약과 관련하여 “{F}”와 “위탁기관”간의 분쟁이 발생할 경우 “{F}”와 “위탁기관”은 “중진공”에게 분쟁사실을 즉시 통보하여야 한다.{"\n"} ② 본 계약과 관련하여 재판의 관할은 “{F}”의 주소지 관할 법원으로 한다.</p>
        <p style={art}><b>제12조 (계약의 유보사항)</b>{"\n"} ① 본 계약서의 해석상 의문이 있을 경우에는 “중진공”의 해석에 따른다.{"\n"} ② 본 계약서는 3부를 작성하고 “{F}”, “위탁기관”, “중진공”이 각각 1부씩 보관한다.</p>
        <p style={{ ...art, marginTop: "4mm" }}>[첨부] 위탁개발 계획서 1부.</p>
        <p style={{ textAlign: "center", fontSize: "12pt", margin: "8mm 0 6mm" }}>{dp.y || "20  "} 년 {dp.m || "  "} 월 {dp.d || "  "} 일</p>
        <div style={{ fontSize: "11.5pt", lineHeight: 2, display: "flex", gap: "4%" }}>
          <div style={{ width: "48%" }}>
            <b>{F}</b><br />
            기업명 : {p.company}<br />
            주&nbsp;&nbsp;소 : <span style={{ fontSize: "9.5pt" }}>{p.address}</span><br />
            성&nbsp;&nbsp;명 : {p.ceo} <Stamp sign={sign} />
          </div>
          <div style={{ width: "48%" }}>
            <b>위탁기관</b><br />
            기업명 : {d.vdName}<br />
            주&nbsp;&nbsp;소 : <span style={{ fontSize: "9.5pt" }}>{d.vdAddr}</span><br />
            대표자 : {d.vdCeo} (인)
          </div>
        </div>
        <div style={{ fontSize: "11.5pt", lineHeight: 2, marginTop: "5mm" }}>
          <b>중소벤처기업진흥공단</b><br />
          주&nbsp;&nbsp;소 : <br />
          이사장 : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; (인)
        </div>
      </div>
    </div>
  );
}

// ── 7. 위탁개발 (중간)완료 보고서 (용역건) ──
function S7({ v, p, d, sign }: SspProps) {
  const t = sspTerm(v);
  const info = sspInfo(p, v);
  const rows: any[] = Array.isArray(d.osItems) ? d.osItems : [];
  const show = rows.length ? rows : Array.from({ length: 3 }, () => ({}));
  const FIELDS = ["디자인", "설계", "제작(가공,조립)", "금형", "프로그램", "콘텐츠", "식품", "공예품", "회로개발", "기타"];
  const osField = String(d.osField || "");
  const isDone = (d.s7Kind || "완료") === "완료";
  const H = { height: "7.6mm" };
  return (
    <div>
      <div className="gpage">
        <table className="gt gx"><tbody>
          <tr><td style={{ height: "12mm", textAlign: "center", fontSize: "15pt", fontWeight: 700 }}>
            「창업성공패키지 사업화지원」 위탁개발 보고서 [{isDone ? "□중간 ■완료" : "■중간 □완료"}]
          </td></tr>
        </tbody></table>
        <table className="gt gx" style={{ marginTop: "2mm", fontSize: "10pt" }}><tbody>
          <tr style={H}>
            <th rowSpan={3} style={{ width: "11%" }}>위탁개발<br />개    요</th>
            <th style={{ width: "13%" }}>위탁분야</th>
            <td colSpan={3} style={{ fontSize: "9pt", paddingLeft: "1.5mm", lineHeight: 1.8 }}>
              {FIELDS.map(f => <span key={f} style={{ marginRight: "2mm", whiteSpace: "nowrap" }}>{osField.includes(f.split("(")[0]) ? "■" : "□"} {f}</span>)}
            </td>
          </tr>
          <tr style={H}><th>개 발 명</th><td colSpan={3} style={{ textAlign: "center" }}>{d.osName}</td></tr>
          <tr style={H}>
            <th>계약기간</th><td style={{ textAlign: "center", width: "43%" }}>{kdate(d.osFrom, "년  월  일")} ~ {kdate(d.osTo, "년   월   일")}</td>
            <th style={{ width: "12%" }}>사 업 비</th><td style={{ textAlign: "center" }}>{d.osAmount ? `${money(d.osAmount)}원 (V.A.T 제외)` : "원 (V.A.T 제외)"}</td>
          </tr>
          <tr style={H}>
            <th rowSpan={2}>위탁개발<br />업    체</th>
            <th>업 체 명</th><td style={{ textAlign: "center" }}>{d.vdName}</td><th>대 표 자</th><td style={{ textAlign: "center" }}>{d.vdCeo}</td>
          </tr>
          <tr style={H}><th>주    소</th><td style={{ textAlign: "center", fontSize: "9pt" }}>{d.vdAddr}</td><th>연 락 처</th><td style={{ textAlign: "center" }}>{d.vdTel}</td></tr>
        </tbody></table>
        <table className="gt gx" style={{ marginTop: "2mm" }}><tbody>
          <tr style={{ height: "7mm" }}>
            <th style={{ fontSize: "10pt", width: "8%" }}>No.</th><th style={{ fontSize: "10pt" }}>위탁개발 항목(범위)</th>
            <th style={{ fontSize: "10pt", width: "17%" }}>진척도</th><th style={{ fontSize: "10pt", width: "20%" }}>결과평가</th>
          </tr>
          {show.map((r: any, i: number) => (
            <tr key={i} style={{ height: "9mm" }}>
              <td style={{ fontSize: "10pt", textAlign: "center" }}>{i + 1}</td>
              <td style={{ fontSize: "10pt", paddingLeft: "1.5mm" }}>{r.item || ""}</td>
              <td style={{ fontSize: "10pt", textAlign: "center" }}>{r.progress || ""}</td>
              <td style={{ fontSize: "10pt", textAlign: "center" }}>{r.grade || ""}</td>
            </tr>
          ))}
        </tbody></table>
        <table className="gt gx" style={{ marginTop: "2mm", fontSize: "9.5pt" }}><tbody>
          <tr>
            <td style={{ ...body, width: "58%", lineHeight: 1.8 }}>
              ※ 별첨. 위탁개발 보고서 필수포함 내용<br />
              &nbsp;&nbsp;1. 위탁개발 목적<br />&nbsp;&nbsp;2. 위탁개발 내용<br />&nbsp;&nbsp;3. 추진일정별 작업 내용<br />
              &nbsp;&nbsp;4. 결과물 (output, spec 등)<br />&nbsp;&nbsp;5. 증빙자료 (사진, 도면, CD, USB 등)<br />&nbsp;&nbsp;6. 시금형개발은 시금형보관증 필수 첨부
            </td>
            <td style={{ ...body, lineHeight: 1.8 }}>
              가. 별첨 보고서는 위탁개발 업체가 작성<br />
              나. 표지에 위탁개발 업체 대표자의 날인 필수 포함<br />
              다. 5번 증빙자료를 제외하고, 3page 내외 작성
            </td>
          </tr>
        </tbody></table>
        <table className="gt gx" style={{ marginTop: "2mm", fontSize: "10.5pt" }}><tbody>
          <tr><td colSpan={2} style={{ height: "8mm", textAlign: "center" }}>위탁개발 보고서의 내용이 사실과 다르지 않음을 확인합니다.</td></tr>
          <tr style={{ height: "13mm" }}>
            <td style={{ textAlign: "center", width: "40%" }}>확인일자 : {kdate(d.writeDate, "20  년   월    일")}</td>
            <td style={{ paddingLeft: "4mm" }}>위탁업체명 : {d.vdName}<br />대표자명 : {d.vdCeo} (인)</td>
          </tr>
          <tr><td colSpan={2} style={{ height: "8mm", textAlign: "center" }}>위와 같이 위탁개발 추진이 정상적으로 진행되었음을 확인합니다.</td></tr>
          <tr style={{ height: "13mm" }}>
            <td style={{ textAlign: "center" }}>확인일자 : {kdate(d.writeDate, "20  년   월    일")}</td>
            <td style={{ paddingLeft: "4mm" }}>업체명 : {p.company}<br />입교자 : {info.trainee || p.ceo} <Stamp sign={sign} /></td>
          </tr>
        </tbody></table>
      </div>
      {/* 별첨 — 위탁개발 보고서 (위탁업체 작성용) */}
      <div>
        <p style={{ textAlign: "right", fontSize: "10.5pt", margin: "0 0 3mm" }}>(위탁업체 작성용)</p>
        <TitleBox>【 위탁개발 보고서 】</TitleBox>
        <table className="gt gx"><tbody>
          <tr><td style={{ ...body, height: "215mm" }}>
            <p style={{ fontSize: "9.5pt", margin: "0 0 3mm" }}>* 다음 내용을 반드시 포함하여 상세하게 작성할 것, 필요시 업체양식으로 작성 가능</p>
            {[
              ["1. 계약(개발)명 : ", d.osName],
              ["2. 계약(개발) 목표 : ", d.osGoal],
              ["3. 계약(개발) 내용 : ", d.osDetail],
              ["4. 추진일정별 작업내용", d.osTimeline],
              ["5. 결과물 (output, spec 등 상세하게 작성할 것)", d.osOutput],
              ["6. 증빙자료 (사진, 도면, CD, USB 등 원본파일 오프라인 제출)", d.osEvidence],
            ].map(([label, val], i) => (
              <div key={i} style={{ marginBottom: val ? "3mm" : "7mm" }}>
                <b>{label}</b>{val ? <span style={{ whiteSpace: "pre-wrap" }}>{String(label).endsWith(": ") ? val : <><br />{val}</>}</span> : ""}
              </div>
            ))}
            <p style={{ fontSize: "9pt", margin: "2mm 0 0" }}>* 증빙사진, 이미지 캡처본(영상제작), 개발결과물 상세 이미지 첨부<br />※ 금형개발은 금형보관증 필수 첨부</p>
          </td></tr>
        </tbody></table>
      </div>
    </div>
  );
}

// ── 8. 금형 견적서 (위탁업체 제출) ──
function S8({ p, d }: SspProps) {
  const rows: any[] = Array.isArray(d.moldRows) ? d.moldRows : [];
  const show = [...rows]; while (show.length < 11) show.push({});
  const total = rows.reduce((s, r) => s + num(r.price), 0);
  const totalFix = rows.reduce((s, r) => s + num(r.fixed), 0);
  const cell: React.CSSProperties = { fontSize: "10pt", textAlign: "center", height: "6.6mm" };
  const L = { height: "7.4mm" };
  return (
    <div>
      <p style={{ textAlign: "center", fontSize: "10.5pt", margin: "0 0 1mm" }}>&lt;중소벤처기업진흥공단 창업성공패키지 사업화지원 금형 제작용&gt;</p>
      <TitleBox>【 금 형 견 적 서 】</TitleBox>
      <div style={{ display: "flex", gap: "3%" }}>
        <table className="gt gx" style={{ width: "50%", fontSize: "10pt" }}><tbody>
          <tr style={L}><th style={{ width: "34%" }}>수  신  인 :</th><td style={{ paddingLeft: "1.5mm" }}>{p.company}</td></tr>
          <tr style={L}><th>M o d e l :</th><td style={{ paddingLeft: "1.5mm" }}>{d.moldModel}</td></tr>
          <tr style={L}><th>금형 / No :</th><td style={{ paddingLeft: "1.5mm" }}>{d.moldNo}</td></tr>
          <tr style={L}><th>금  형  명 :</th><td style={{ paddingLeft: "1.5mm" }}>{d.moldName}</td></tr>
          <tr style={L}><th>작  성  일 :</th><td style={{ paddingLeft: "1.5mm" }}>{kdate(d.writeDate, "20   .   .   .")}</td></tr>
          <tr><td colSpan={2} style={{ height: "8mm", textAlign: "center", fontSize: "10.5pt" }}>하기와 같이 견적서를 제출합니다.</td></tr>
        </tbody></table>
        <table className="gt gx" style={{ width: "47%", fontSize: "10pt" }}><tbody>
          <tr style={L}><th style={{ width: "36%" }}>업  체  명 :</th><td style={{ paddingLeft: "1.5mm" }}>{d.vdName}</td></tr>
          <tr style={L}><th>사업자번호 :</th><td style={{ paddingLeft: "1.5mm" }}>{d.vdBizno}</td></tr>
          <tr style={L}><th>연  락  처 :</th><td style={{ paddingLeft: "1.5mm" }}>{d.vdTel}</td></tr>
          <tr style={L}><th>F  a  x :</th><td style={{ paddingLeft: "1.5mm" }}>{d.vdFax}</td></tr>
          <tr style={L}><th>주      소 :</th><td style={{ paddingLeft: "1.5mm", fontSize: "9pt" }}>{d.vdAddr}</td></tr>
          <tr style={L}><th>대  표  자 :</th><td style={{ paddingLeft: "1.5mm" }}>{d.vdCeo} &nbsp;&nbsp;&nbsp;(인)</td></tr>
        </tbody></table>
      </div>
      <div style={{ fontSize: "11pt", fontWeight: 700, margin: "3mm 0 1mm" }}>&lt;세부내역&gt;</div>
      <table className="gt gx"><tbody>
        <tr style={{ height: "7mm" }}>
          <th style={{ fontSize: "10pt", width: "8%" }}>No</th><th style={{ fontSize: "10pt" }}>공 정 명</th><th style={{ fontSize: "10pt", width: "10%" }}>수 량</th>
          <th style={{ fontSize: "10pt", width: "18%" }}>견 적 금 액</th><th style={{ fontSize: "10pt", width: "18%" }}>결 정 가 격</th><th style={{ fontSize: "10pt", width: "14%" }}>비  고</th>
        </tr>
        {show.map((r: any, i: number) => (
          <tr key={i}>
            <td style={cell}>{i + 1}</td>
            <td style={{ ...cell, textAlign: "left", paddingLeft: "1.5mm" }}>{r.proc || ""}</td>
            <td style={cell}>{r.qty || ""}</td>
            <td style={{ ...cell, textAlign: "right", paddingRight: "1.5mm" }}>{money(r.price) || ""}</td>
            <td style={{ ...cell, textAlign: "right", paddingRight: "1.5mm" }}>{money(r.fixed) || ""}</td>
            <td style={cell}>{r.note || ""}</td>
          </tr>
        ))}
        <tr style={{ height: "7mm" }}>
          <th colSpan={3} style={{ fontSize: "10pt" }}>TOTAL</th>
          <td style={{ ...cell, textAlign: "right", paddingRight: "1.5mm", fontWeight: 700 }}>{total ? money(total) : ""}</td>
          <td style={{ ...cell, textAlign: "right", paddingRight: "1.5mm", fontWeight: 700 }}>{totalFix ? money(totalFix) : ""}</td><td />
        </tr>
      </tbody></table>
      <table className="gt gx" style={{ marginTop: "2mm" }}><tbody>
        <tr>
          <td style={{ ...body, width: "62%", lineHeight: 1.9 }}>
            1. 부가세(V.A.T)는 별도임<br />
            2. 제작기일 : 제작일로부터 {d.moldDays || "   "} 일<br />
            3. 유효기간 : 견적제출일로부터 {d.moldValid || "    "} 일<br />
            4. 세부견적 : 첨부서류 {d.moldAttach || "     "} 부
          </td>
          <td style={{ ...body }}><b>REMARK</b><br />{d.moldRemark}</td>
        </tr>
      </tbody></table>
      <p style={{ fontSize: "10.5pt", marginTop: "3mm" }}>별첨. 시금형설계 도면 (금형조립도, 주요 금형부품도)</p>
    </div>
  );
}

// ── 9. 전산장비 구매 세부내역서 ──
function S9({ v, p, d }: SspProps) {
  const info = sspInfo(p, v);
  const rows: any[] = Array.isArray(d.pcRows) ? d.pcRows : [];
  const show = [...rows]; while (show.length < 8) show.push({});
  const total = rows.reduce((s, r) => s + num(r.amount), 0);
  const hired = num(d.pcHired);
  // 구매한도 — 집행계획서 기준(사용자 확정): 600만 + 신규고용 1명당 200만(최대 3인), 상한 1,200만.
  // (전산장비 내역서 xlsx 수식 1,000만+250만×인원과 상이 — 원본 문서 간 모순으로 집행계획서를 따름)
  const limit = Math.min(6000000 + 2000000 * Math.min(3, hired), 12000000);
  const cell: React.CSSProperties = { fontSize: "9.5pt", textAlign: "center", height: "9mm" };
  return (
    <div>
      <TitleBox>【 전산장비 구매 세부내역 】</TitleBox>
      <table className="gt gx" style={{ width: "62%", fontSize: "10.5pt" }}><tbody>
        <tr style={{ height: "7.5mm" }}>
          <th style={{ width: "45%" }}>{v === "gsa" ? "글로벌" : "딥테크"} 기수</th><td style={{ textAlign: "center" }}>{d.cohort || (v === "gsa" ? "" : "딥테크 1기")}</td>
        </tr>
        <tr style={{ height: "7.5mm" }}><th>입교자명</th><td style={{ textAlign: "center" }}>{info.trainee || p.ceo}</td></tr>
      </tbody></table>
      <p style={{ fontSize: "10pt", margin: "3mm 0 1mm" }}>[구매예정 또는 구매한 전산장비 내역을 모두 작성]</p>
      <table className="gt gx"><tbody>
        <tr style={{ height: "8.5mm" }}>
          {["구매일", "구분", "모델명", "제조사", "구입처", "수량", "금액(원)\n(VAT제외)", "사용자/이용장소/용도"].map(h => (
            <th key={h} style={{ fontSize: "9.5pt", whiteSpace: "pre-wrap" }}>{h}</th>
          ))}
        </tr>
        {show.map((r: any, i: number) => (
          <tr key={i}>
            <td style={cell}>{r.date || ""}</td>
            <td style={cell}>{r.kind || ""}</td>
            <td style={cell}>{r.model || ""}</td>
            <td style={cell}>{r.maker || ""}</td>
            <td style={cell}>{r.shop || ""}</td>
            <td style={cell}>{r.qty || ""}</td>
            <td style={{ ...cell, textAlign: "right", paddingRight: "1.5mm" }}>{money(r.amount) || ""}</td>
            <td style={{ ...cell, fontSize: "8.5pt", whiteSpace: "pre-wrap" }}>{r.use || ""}</td>
          </tr>
        ))}
        <tr style={{ height: "7.5mm" }}>
          <th colSpan={6} style={{ fontSize: "10pt" }}>총합</th>
          <td style={{ fontSize: "10pt", textAlign: "right", paddingRight: "1.5mm", fontWeight: 700 }}>{total ? money(total) : ""}</td><td />
        </tr>
        <tr style={{ height: "9mm" }}>
          <th colSpan={4} style={{ fontSize: "9.5pt" }}>구매한도<br /><span style={{ fontWeight: 400, fontSize: "8.5pt" }}>(채용승인 받은 직원수)</span></th>
          <td colSpan={2} style={{ fontSize: "10pt", textAlign: "center" }}>{hired}명</td>
          <td style={{ fontSize: "10pt", textAlign: "right", paddingRight: "1.5mm" }}>{money(limit)}</td><td />
        </tr>
      </tbody></table>
    </div>
  );
}

// ── 10. 전시회 참가 결과보고서 ──
function S10({ v, p, d, photos, img, sign }: SspProps) {
  const info = sspInfo(p, v);
  const list: any[] = Array.isArray(d.expoList) ? d.expoList : [];
  const showList = [...list]; while (showList.length < 6) showList.push({});
  const st = d.expoStats || {};
  const bullets = (s?: string) => String(s || "").split("\n").filter(Boolean);
  const pcell = (i: number) => photos[i] && img(photos[i].path)
    ? <img src={img(photos[i].path)} alt="" style={{ maxWidth: "100%", maxHeight: "40mm", objectFit: "contain" }} /> : null;
  return (
    <div>
      <TitleBox>【 전시회 참가 결과보고서 】</TitleBox>
      <div style={{ fontSize: "11.5pt", lineHeight: 2.2 }}>
        □ 입교자명(업체명) : {info.trainee || p.ceo}{p.company ? ` (${p.company})` : ""}<br />
        □ 전시회명 : {d.expoName}<br />
        □ 개최기간 : {d.expoPeriod}<br />
        □ 참가결과
      </div>
      <table className="gt gx" style={{ marginTop: "1mm" }}><tbody>
        <tr style={{ height: "7mm" }}>
          {["총방문자수", "제품상담", "바이어 발굴", "투자유치", "관심", "거래확정"].map(h => <th key={h} style={{ fontSize: "10pt" }}>{h}</th>)}
        </tr>
        <tr style={{ height: "8mm" }}>
          {[["visit", "명"], ["consult", "건"], ["buyer", "건"], ["invest", "건"], ["interest", "건"], ["deal", "건"]].map(([k, u]) => (
            <td key={k} style={{ fontSize: "10.5pt", textAlign: "center" }}>{st[k] ? `${money(st[k])} ${u}` : u}</td>
          ))}
        </tr>
      </tbody></table>
      <div style={{ fontSize: "11pt", margin: "3mm 0 1mm" }}>○ 주요 상담실적</div>
      <div style={{ fontSize: "10.5pt", lineHeight: 1.9, minHeight: "16mm" }}>
        {bullets(d.expoResults).length ? bullets(d.expoResults).map((b, i) => <div key={i}>- {b}</div>) : <>- <br />- <br />- </>}
      </div>
      <div style={{ fontSize: "11pt", margin: "3mm 0 1mm" }}>○ 참가성과</div>
      <div style={{ fontSize: "10.5pt", lineHeight: 1.9, minHeight: "14mm" }}>
        {bullets(d.expoOutcome).length ? bullets(d.expoOutcome).map((b, i) => <div key={i}>- {b}</div>) : <>- <br />- <br />- </>}
      </div>
      <div style={{ fontSize: "11pt", margin: "3mm 0 1mm" }}>○ 전시회 참가 증빙사진</div>
      <table className="gt gx"><tbody>
        {[0, 2].map(row => (
          <tr key={row}><td style={{ width: "50%", height: "42mm", textAlign: "center", verticalAlign: "middle" }}>{pcell(row)}</td>
            <td style={{ height: "42mm", textAlign: "center", verticalAlign: "middle" }}>{pcell(row + 1)}</td></tr>
        ))}
      </tbody></table>
      <div style={{ fontSize: "11pt", margin: "3mm 0 1mm" }}>○ 상담업체 리스트</div>
      <table className="gt gx"><tbody>
        <tr style={{ height: "7mm" }}>
          <th style={{ fontSize: "10pt", width: "8%" }}>NO</th><th style={{ fontSize: "10pt", width: "40%" }}>회사 및 바이어명</th><th style={{ fontSize: "10pt" }}>주요 상담내용</th>
        </tr>
        {showList.map((r: any, i: number) => (
          <tr key={i} style={{ height: "13mm" }}>
            <td style={{ fontSize: "10pt", textAlign: "center" }}>{i + 1}</td>
            <td style={{ ...body, fontSize: "9.5pt" }}>업체명: {r.name || ""}{"\n"}담당자: {r.contact || ""}{"\n"}연락처: {r.tel || ""}</td>
            <td style={{ ...body, fontSize: "9.5pt" }}>{r.memo || ""}</td>
          </tr>
        ))}
      </tbody></table>
      <p style={{ textAlign: "center", fontSize: "11.5pt", margin: "5mm 0 0" }}>위와 같이 전시회 참가결과를 보고합니다.</p>
      <DateSign d={d.writeDate} label="대표자명" who={p.ceo} sign={sign} seal="(서명)" />
    </div>
  );
}

// ── 10-1. 해외 IR대회 참가 결과보고서 (딥테크 전용) ──
function S10b({ p, d, photos, img, sign, v }: SspProps) {
  const info = sspInfo(p, v);
  const list: any[] = Array.isArray(d.irList) ? d.irList : [];
  const showList = [...list]; while (showList.length < 3) showList.push({});
  const bullets = (s?: string) => String(s || "").split("\n").filter(Boolean);
  return (
    <div>
      <TitleBox>【 해외 IR대회 참가 결과보고서 】</TitleBox>
      <div style={{ fontSize: "11.5pt", lineHeight: 2.2 }}>
        □ 입교자명(업체명) : {info.trainee || p.ceo}{p.company ? ` (${p.company})` : ""}<br />
        □ IR대회명 : {d.irName}<br />
        □ 개최국 / 도시 : {d.irCity}<br />
        □ 참가기간 : {d.irPeriod}<br />
        □ 참가결과
      </div>
      <table className="gt gx" style={{ marginTop: "1mm" }}><tbody>
        <tr style={{ height: "8mm" }}>
          <th style={{ fontSize: "10pt", width: "22%" }}>피칭 여부<br />(O, X)</th>
          <th style={{ fontSize: "10pt", width: "22%" }}>부스설치 여부<br />(O, X)</th>
          <th style={{ fontSize: "10pt" }}>주요 활동 내용</th>
        </tr>
        <tr>
          <td style={{ fontSize: "11pt", textAlign: "center", height: "16mm" }}>{d.irPitch || ""}</td>
          <td style={{ fontSize: "11pt", textAlign: "center" }}>{d.irBooth || ""}</td>
          <td style={{ ...body, fontSize: "10pt" }}>{bullets(d.irActivity).map((b, i) => <div key={i}>- {b}</div>)}</td>
        </tr>
      </tbody></table>
      <div style={{ fontSize: "11pt", margin: "3mm 0 1mm" }}>○ 참가성과</div>
      <div style={{ fontSize: "10.5pt", lineHeight: 1.9, minHeight: "14mm" }}>
        {bullets(d.irOutcome).length ? bullets(d.irOutcome).map((b, i) => <div key={i}>- {b}</div>) : <>- <br />- <br />- </>}
      </div>
      <div style={{ fontSize: "11pt", margin: "3mm 0 1mm" }}>○ IR대회 참가 증빙사진</div>
      <table className="gt gx"><tbody>
        <tr>
          <td style={{ width: "50%", height: "42mm", textAlign: "center", verticalAlign: "middle" }}>{photos[0] && img(photos[0].path) ? <img src={img(photos[0].path)} alt="" style={{ maxWidth: "100%", maxHeight: "40mm", objectFit: "contain" }} /> : null}</td>
          <td style={{ height: "42mm", textAlign: "center", verticalAlign: "middle" }}>{photos[1] && img(photos[1].path) ? <img src={img(photos[1].path)} alt="" style={{ maxWidth: "100%", maxHeight: "40mm", objectFit: "contain" }} /> : null}</td>
        </tr>
      </tbody></table>
      <div style={{ fontSize: "11pt", margin: "3mm 0 1mm" }}>○ 투자자 접촉 및 상담 내역</div>
      <table className="gt gx"><tbody>
        <tr style={{ height: "7mm" }}>
          <th style={{ fontSize: "10pt", width: "8%" }}>NO</th><th style={{ fontSize: "10pt", width: "42%" }}>투자자</th><th style={{ fontSize: "10pt" }}>주요 상담내용 및 후속계획</th>
        </tr>
        {showList.map((r: any, i: number) => (
          <tr key={i} style={{ height: "20mm" }}>
            <td style={{ fontSize: "10pt", textAlign: "center" }}>{i + 1}</td>
            <td style={{ ...body, fontSize: "9.5pt" }}>
              투자자명: {r.name || ""}{"\n"}유형 : {r.type || "VC / AC / CVC"}{"\n"}국가 : {r.country || ""}{"\n"}담당자: {r.contact || ""}{"\n"}연락처: {r.tel || ""}
            </td>
            <td style={{ ...body, fontSize: "9.5pt" }}>{r.memo ? r.memo : "- (미팅내용)\n\n- (후속계획)"}</td>
          </tr>
        ))}
      </tbody></table>
      <p style={{ textAlign: "center", fontSize: "11.5pt", margin: "5mm 0 0" }}>위와 같이 IR대회 참가결과를 보고합니다.</p>
      <DateSign d={d.writeDate} label="대표자명" who={p.ceo} sign={sign} seal="(서명)" />
    </div>
  );
}

// ── 11. 자문 결과보고서 ──
function S11({ v, p, d, sign }: SspProps) {
  const info = sspInfo(p, v);
  const advisors: any[] = Array.isArray(d.advisors) ? d.advisors : [];
  const showAdv = [...advisors]; while (showAdv.length < 1) showAdv.push({});
  const H = { height: "8mm" };
  return (
    <div>
      <TitleBox>【 자문 결과보고서 】</TitleBox>
      <div style={{ fontSize: "11.5pt", fontWeight: 700, margin: "0 0 1mm" }}>󰊱 입교자 현황</div>
      <table className="gt gx" style={{ fontSize: "10.5pt" }}><tbody>
        <tr style={H}>
          <th style={{ width: "18%" }}>입교자명</th><td style={{ width: "32%", textAlign: "center" }}>{info.trainee || p.ceo}</td>
          <th style={{ width: "18%" }}>업 체 명</th><td style={{ textAlign: "center" }}>{p.company}</td>
        </tr>
        <tr style={H}><th>과 제 명</th><td colSpan={3} style={{ textAlign: "center" }}>{info.taskName}</td></tr>
      </tbody></table>
      <div style={{ fontSize: "11.5pt", fontWeight: 700, margin: "4mm 0 1mm" }}>󰊲 수행 현황</div>
      <table className="gt gx" style={{ fontSize: "10.5pt" }}><tbody>
        <tr style={H}><th style={{ width: "18%" }}>자문주제</th><td colSpan={4} style={{ paddingLeft: "2mm" }}>{d.advTopic}</td></tr>
        <tr style={H}><th>자문일자</th><td colSpan={4} style={{ paddingLeft: "2mm" }}>{kdate(d.advDate, "")}</td></tr>
        <tr style={H}>
          <th>입금정보</th>
          <td colSpan={4} style={{ paddingLeft: "2mm", fontSize: "9.5pt" }}>
            {d.advBank || <span className="gph">(은행명 / 계좌번호 / 예금주명) * 개인계좌로 사업비입금 불가, 자문인 소속업체로 지급</span>}
          </td>
        </tr>
        <tr style={{ height: "7mm" }}>
          <th rowSpan={showAdv.length + 1}>자 문 인</th>
          <th style={{ width: "22%" }}>소 속</th><th style={{ width: "16%" }}>직 위</th><th style={{ width: "16%" }}>성 명</th><th>주민번호(앞자리만)</th>
        </tr>
        {showAdv.map((a: any, i: number) => (
          <tr key={i} style={H}>
            <td style={{ textAlign: "center" }}>{a.org || ""}</td><td style={{ textAlign: "center" }}>{a.title || ""}</td>
            <td style={{ textAlign: "center" }}>{a.name || ""}</td><td style={{ textAlign: "center" }}>{a.idFront || ""}</td>
          </tr>
        ))}
      </tbody></table>
      <div style={{ fontSize: "11.5pt", fontWeight: 700, margin: "4mm 0 1mm" }}>󰊳 자문 내용요약 (자문인 작성)</div>
      <table className="gt gx"><tbody>
        <tr><td style={{ ...body, height: "52mm" }}>
          <p style={{ fontSize: "9pt", margin: "0 0 2mm" }}>* 자문인 별도 양식으로 자문결과보고서 별첨</p>
          {d.advSummary}
        </td></tr>
      </tbody></table>
      <div style={{ fontSize: "11.5pt", fontWeight: 700, margin: "4mm 0 1mm" }}>󰊴 자문 성과 (입교생 작성)</div>
      <table className="gt gx"><tbody>
        <tr><td style={{ ...body, height: "52mm" }}>{d.advOutcome}</td></tr>
      </tbody></table>
      <p style={{ textAlign: "center", fontSize: "11.5pt", margin: "6mm 0 0" }}>위와 같이 자문을 완료하였기에 이에 대한 결과를 보고합니다.</p>
      {(() => { const dp = dateParts(d.writeDate); return (
        <div style={{ marginTop: "5mm" }}>
          <p style={{ textAlign: "center", fontSize: "12pt", margin: "0 0 4mm" }}>{dp.y || "        "} 년 {dp.m || "    "} 월 {dp.d || "    "} 일</p>
          <p style={{ textAlign: "right", fontSize: "12pt", margin: "0 0 2mm", paddingRight: "10mm" }}>자 문 인 : {advisors[0]?.name || "          "} (서명)</p>
          <p style={{ textAlign: "right", fontSize: "12pt", margin: 0, paddingRight: "10mm" }}>대표자명 : {p.ceo || "          "} <Stamp sign={sign} label="(서명)" /></p>
        </div>
      ); })()}
    </div>
  );
}

// 서식 렌더 진입점 (창업성공패키지) — s12 이후는 GrantFormsSSP2로 위임
export default function GrantFormSSP({ form, ...props }: SspProps & { form: SspFormKey }) {
  switch (form) {
    case "s1": return <S1 {...props} />;
    case "s2": return <S2 {...props} />;
    case "s3": return <S3 {...props} />;
    case "s4": return <S4 {...props} />;
    case "s5": return <S5 {...props} />;
    case "s6": return <S6 {...props} />;
    case "s7": return <S7 {...props} />;
    case "s8": return <S8 {...props} />;
    case "s9": return <S9 {...props} />;
    case "s10": return <S10 {...props} />;
    case "s10b": return <S10b {...props} />;
    case "s11": return <S11 {...props} />;
    default: return <GrantFormSSP2 form={form} {...props} />;
  }
}
export { body };
