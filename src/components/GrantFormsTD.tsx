// 기술닥터사업 상용화지원 서식 8종 — 업로드된 표준서식 HWPX(2025.01.13)에서 추출한
// 실제 치수(셀 폭 비율·행 높이 mm·글자 pt)와 동일하게 재현. 수신처 (재)경기테크노파크 원장.
import { Fragment } from "react";
import { GrantPhoto, GrantProfile } from "../lib/db";
import { TdFormKey, TD_ITEMS, TD_ITEM_GROUP, money, num, dateParts } from "../lib/grantforms";
import { Stamp } from "./GrantForms";

type P = {
  p: GrantProfile;
  d: Record<string, any>;
  photos: GrantPhoto[];
  img: (path: string) => string | undefined;
  sign?: string;
};

// 원장(제8호) 행: 세목별 집행 내역
export type TdLedgerRow = { item?: string; desc?: string; date?: string; payee?: string; amount?: string; evNo?: string };
export const ledgerRows = (d: Record<string, any>): TdLedgerRow[] => (Array.isArray(d.ledger) ? d.ledger : []);
// 비목(그룹)별 집행 합계 — 제7호 사용실적 자동 집계
export function tdGroupSum(d: Record<string, any>, group: string): number {
  return ledgerRows(d).filter(r => TD_ITEM_GROUP[r.item || ""] === group).reduce((s, r) => s + num(r.amount), 0);
}

const kdate = (iso?: string, blank = "    년   월   일") =>
  iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(0, 4)}년 ${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일` : blank;

// [상용화서식 제○호] 우측 상단 라벨
const FormNo = ({ no }: { no: string }) => <p style={{ fontSize: "13pt", margin: "0 0 2mm" }}>[상용화서식 {no}]</p>;

// 제2호. 협약체결 및 지원금 입금계좌 제출 공문
function T2({ p, d, sign }: P) {
  const td = p.td || {};
  const total = num(td.support) + num(td.share);
  const name = `「2026년 기술닥터사업 상용화지원」`;
  const secRow: React.CSSProperties = { fontSize: "12pt", fontWeight: 700, verticalAlign: "bottom", border: "none", padding: "3mm 0 1mm" };
  const th12: React.CSSProperties = { fontSize: "12pt" };
  return (
    <div>
      <FormNo no="제2호" />
      <table className="gt gx"><tbody>
        <tr><td style={{ height: "22.2mm", textAlign: "center" }}>
          <div style={{ fontSize: "20pt", fontWeight: 700 }}>{name}</div>
          <div style={{ fontSize: "18pt", fontWeight: 700 }}>협약체결 및 지원금 입금계좌 제출</div>
        </td></tr>
      </tbody></table>
      <table className="gt gx" style={{ fontSize: "12pt", marginTop: "3mm" }}><tbody>
        {[["문서번호", d.docNo || td.docNo || ""], ["시행일자", d.sendDate ? kdate(d.sendDate) : ""], ["수신", "(재)경기테크노파크 원장"], ["참조", "기술지원팀장"], ["제목", `${name} 협약체결 및 지원금 입금계좌 제출`]].map(([l, v]) => (
          <tr key={l} style={{ height: "7.2mm" }}><th style={{ width: "16%", ...th12 }}>{l}</th><td style={{ paddingLeft: "2.5mm" }}>{v}</td></tr>
        ))}
      </tbody></table>
      <p style={{ fontSize: "12pt", fontWeight: 700, margin: "5mm 0", lineHeight: 1.8, textAlign: "justify" }}>
        &nbsp;{name} 수행에 관한 협약체결 및 동 협약에 의한 지원금 수령을 위하여 다음과 같이 관련서류를 제출합니다.
      </p>
      <div style={secRow}>1. 기업정보</div>
      <table className="gt gx" style={{ fontSize: "12pt" }}><tbody>
        <tr style={{ height: "7.2mm" }}><th style={{ width: "25%" }}>기업명</th><th style={{ width: "25%" }}>사업자등록번호</th><th>주소</th></tr>
        <tr style={{ height: "9.2mm" }}><td style={{ textAlign: "center" }}>{p.company}</td><td style={{ textAlign: "center" }}>{p.bizno}</td><td style={{ textAlign: "center", fontSize: "10.5pt" }}>{p.address}</td></tr>
      </tbody></table>
      <div style={secRow}>2. 입금계좌</div>
      <table className="gt gx" style={{ fontSize: "12pt" }}><tbody>
        <tr style={{ height: "7.2mm" }}><th style={{ width: "25%" }}>은행명</th><th style={{ width: "50%" }}>입금계좌</th><th>예금주</th></tr>
        <tr style={{ height: "9.2mm" }}><td style={{ textAlign: "center" }}>{p.bank}</td><td style={{ textAlign: "center" }}>{p.account}</td><td style={{ textAlign: "center" }}>{p.holder}</td></tr>
      </tbody></table>
      <div style={secRow}>3. 사업비</div>
      <table className="gt gx" style={{ fontSize: "12pt" }}><tbody>
        <tr style={{ height: "7.2mm" }}><th style={{ width: "33.3%" }}>지원금</th><th style={{ width: "33.3%" }}>기업부담금(현금)</th><th>총 사업비(합계)</th></tr>
        <tr style={{ height: "9.2mm" }}>
          <td style={{ textAlign: "right", paddingRight: "3mm" }}>{money(td.support)}{td.support ? "원" : ""}</td>
          <td style={{ textAlign: "right", paddingRight: "3mm" }}>{money(td.share)}{td.share ? "원" : ""}</td>
          <td style={{ textAlign: "right", paddingRight: "3mm" }}>{total ? money(total) + "원" : ""}</td>
        </tr>
      </tbody></table>
      <p style={{ fontSize: "12pt", margin: "8mm 0 0", lineHeight: 1.9 }}>
        첨부서류 1. 협약서, 상용화지원 사업계획서 각 2부.<br />
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 2. 사업신청시 제출서류 각 1부(사업자등록증명원 등)<br />
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 3. 통장사본 1부.<br />
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 4. 지급이행보증보험증권(원본) 1부.&nbsp;&nbsp;끝.
      </p>
      <div style={{ textAlign: "center", fontSize: "20pt", marginTop: "14mm" }}>
        {p.company || "OO기업"} {p.ceo || "O O O"} 대표 <Stamp sign={sign} />
      </div>
    </div>
  );
}

// 제4호. 상용화지원 결과보고서 — 4개 페이지(.gpage)로 원본 구성 그대로
function T4({ p, d, photos, img, sign }: P) {
  const td = p.td || {};
  const dp = dateParts(d.writeDate);
  const lbl: React.CSSProperties = { fontSize: "11pt" };
  const val: React.CSSProperties = { fontSize: "11pt", textAlign: "center" };
  const H = { height: "9.9mm" };
  const secH: React.CSSProperties = { fontSize: "14pt", fontWeight: 700, margin: "5mm 0 2mm" };
  const bodyCell: React.CSSProperties = { verticalAlign: "top", padding: "2mm 2.5mm", fontSize: "10.5pt", whiteSpace: "pre-wrap", lineHeight: 1.6 };
  const goals: any[] = Array.isArray(d.rptGoals) ? d.rptGoals : [];
  const tasks: any[] = Array.isArray(d.rptTasks) ? d.rptTasks : [];
  const sched: any[] = Array.isArray(d.rptSched) ? d.rptSched : [];
  const rounds: any[] = Array.isArray(d.rptRounds) ? d.rptRounds : [];
  const eff: Record<string, any> = d.rptEffect || {};
  const months = [1, 2, 3, 4, 5, 6];
  const hasMonth = (csv: string | undefined, m: number) => String(csv || "").split(/[,\s]+/).includes(String(m));
  const EFFECT_ROWS = [
    ["sales", "매출액 (단위: 천원)"], ["export", "수출액 (단위: 천원)"], ["saving", "비용절감 (단위: 천원)"], ["staff", "재직인원 수(명)"],
    ["patentReg", "지식재산권 보유(건) — 특허등록"], ["patentApp", "지식재산권 보유(건) — 출원"], ["cert", "인증 보유(건)"], ["tech", "기술 도입 및 판매(건)"], ["rnd", "R&D비용(예상금액: 천원)"],
  ] as const;
  const mini: React.CSSProperties = { fontSize: "8.5pt", textAlign: "center", padding: "0.7mm 1mm" };
  const cap = (i: number) => photos[i]?.name || "";
  const pimg = (i: number, maxH: string) => photos[i] && img(photos[i].path)
    ? <img src={img(photos[i].path)} alt="" style={{ maxWidth: "100%", maxHeight: maxH, objectFit: "contain" }} />
    : <span className="gph">[과정{i + 1}]</span>;
  return (
    <div>
      {/* ── 1페이지: 표지/과제개요 ── */}
      <div className="gpage">
        <FormNo no="제4호" />
        <table className="gt gx" style={{ width: "72%", margin: "6mm auto 4mm" }}><tbody>
          <tr><td style={{ height: "24.4mm", textAlign: "center", fontSize: "22pt", fontWeight: 700 }}>상용화지원 결과보고서</td></tr>
        </tbody></table>
        <p style={{ textAlign: "center", fontSize: "12pt", margin: "0 0 6mm" }}>{dp.y || "    "}년  {dp.m || "  "}월  {dp.d || "  "}일</p>
        <table className="gt gx"><tbody>
          <tr style={H}><th rowSpan={2} style={{ width: "10.6%", ...lbl }}>과제개요</th><th style={{ width: "10.6%", ...lbl }}>과제명</th><td colSpan={4} style={val}>{td.project}</td></tr>
          <tr style={H}><th style={lbl}>과제기간</th><td colSpan={4} style={val}>{kdate(td.periodFrom, "  년  월  일")} ~ {kdate(td.periodTo, "  년  월  일")} (6개월)</td></tr>
          <tr style={H}><th style={lbl}>기술닥터</th><th style={lbl}>소속</th><td style={{ width: "35.3%", ...val }}>{td.doctorOrg}</td><th style={{ width: "9%", ...lbl }}>이름</th><td style={val}>{td.doctor}</td></tr>
          <tr style={H}><th rowSpan={5} style={lbl}>수행기업</th><th style={lbl}>기업명</th><td style={val}>{p.company}</td><th style={lbl}>대표자</th><td style={val}>{p.ceo} <Stamp sign={sign} /></td></tr>
          <tr style={H}><th style={lbl}>주소</th><td colSpan={3} style={val}>{p.address}</td></tr>
          <tr style={H}><th style={lbl}>실무<br />담당자<br />이름</th><td style={val}>{td.mgrName}</td><th style={lbl}>e-mail</th><td style={val}>{td.mgrEmail}</td></tr>
          <tr style={H}><th style={lbl}>부서</th><td style={val}>{td.mgrDept}</td><th style={lbl}>직위</th><td style={val}>{td.mgrTitle}</td></tr>
          <tr style={H}><th style={lbl}>일반전화</th><td style={val}>{td.mgrTel}</td><th style={lbl}>휴대폰</th><td style={val}>{td.mgrPhone}</td></tr>
        </tbody></table>
      </div>

      {/* ── 2페이지: 1. 과제 수행 결과 ── */}
      <div className="gpage">
        <div style={secH}>1. 과제 수행 결과</div>
        <table className="gt gx"><tbody>
          <tr><th style={{ width: "14.2%", fontSize: "10.5pt" }}>기술닥터의<br />현장애로<br />기술지원 내용</th>
            <td style={{ ...bodyCell, height: "17.3mm" }}>{d.rptField || <span className="gph">※ 현장애로기술지원 내용 요약</span>}</td></tr>
          <tr><th style={{ fontSize: "10.5pt" }}>기술닥터의<br />중기애로<br />기술지원 내용</th>
            <td style={{ ...bodyCell, height: "46.4mm" }}>{d.rptMid || <span className="gph">※ 중기애로기술지원 과제 중 기술닥터의 지원내용 요약</span>}</td></tr>
          <tr><th style={{ fontSize: "10.5pt" }}>기술닥터의<br />상용화지원 내용</th>
            <td style={{ ...bodyCell, height: "56.2mm" }}>{d.rptCom || <span className="gph">※ 상용화지원 과제 중 기술닥터의 지원내용 요약</span>}</td></tr>
          <tr><th style={{ fontSize: "10.5pt" }}>과제 수행<br />결과물</th>
            <td style={{ ...bodyCell, height: "47.9mm" }}>{d.rptResult || <span className="gph">※ 제작도면과의 비교, 완성도, 제품외형, 성능 등 과제 수행의 결과물 기술</span>}</td></tr>
          <tr><th style={{ fontSize: "10.5pt" }}>사업계획<br />대비<br />목표달성정도</th>
            <td style={{ ...bodyCell }}>
              <div style={{ minHeight: "16mm" }}>{d.rptGoalText || <span className="gph">※ 사업계획 대비 정량/정성목표 달성성과 — 관련사진, data, 표, 그래프 등을 종합적으로 이용하여 작성. 정량 목표는 객관적 증빙자료(공인인증기관 성능테스트 등) 삽입</span>}</div>
              <div style={{ fontWeight: 700, fontSize: "9.5pt", margin: "2mm 0 1mm" }}>목표달성</div>
              <table className="gt gx" style={{ marginBottom: "2mm" }}><tbody>
                <tr><th style={mini}>No.</th><th style={mini}>본 과제를 통한<br />달성 성능 지표명</th><th style={mini}>시장 충족 성능<br />OR 기준이 되는 성능</th><th style={mini}>본 과제를 통한<br />달성목표</th><th style={mini}>목표달성 결과</th><th style={mini}>달성도<br />(%)</th><th style={mini}>달성여부 증빙</th></tr>
                {(goals.length ? goals : [{}]).map((g, i) => (
                  <tr key={i}><td style={mini}>{i + 1}</td><td style={mini}>{g.name || ""}</td><td style={mini}>{g.market || ""}</td><td style={mini}>{g.target || ""}</td><td style={mini}>{g.result || ""}</td><td style={mini}>{g.rate || ""}</td><td style={mini}>{g.evidence || ""}</td></tr>
                ))}
              </tbody></table>
              <div style={{ fontWeight: 700, fontSize: "9.5pt", margin: "2mm 0 1mm" }}>2. 세부추진내용</div>
              <table className="gt gx" style={{ marginBottom: "2mm" }}><tbody>
                <tr><th style={{ ...mini, width: "8%" }}>No.</th><th style={{ ...mini, width: "26%" }}>추진항목</th><th style={mini}>추진내용 및 방법</th></tr>
                {(tasks.length ? tasks : [{}]).map((t, i) => (
                  <tr key={i}><td style={mini}>{i + 1}</td><td style={mini}>{t.item || ""}</td><td style={{ ...mini, textAlign: "left" }}>{t.method || ""}</td></tr>
                ))}
              </tbody></table>
              <div style={{ fontWeight: 700, fontSize: "9.5pt", margin: "2mm 0 1mm" }}>3. 추진일정 <span style={{ fontWeight: 400 }}>(세부 근거는 과제 성격에 맞게 수정가능)</span></div>
              <table className="gt gx"><tbody>
                <tr><th style={{ ...mini, width: "7%" }}>구분</th><th style={{ ...mini, width: "24%" }}>항목</th><th style={{ ...mini, width: "9%" }} />{months.map(m => <th key={m} style={mini}>{m}월</th>)}</tr>
                {(sched.length ? sched : [{ item: "" }]).map((s, i) => (
                  <Fragment key={i}>
                    <tr><td rowSpan={2} style={mini}>{i + 1}</td><td rowSpan={2} style={{ ...mini, textAlign: "left" }}>{s.item || ""}</td><td style={mini}>계획</td>
                      {months.map(m => <td key={m} style={{ ...mini, background: hasMonth(s.plan, m) ? "#9db8d9" : undefined }} />)}</tr>
                    <tr><td style={mini}>실적</td>
                      {months.map(m => <td key={m} style={{ ...mini, background: hasMonth(s.actual, m) ? "#5b7fb0" : undefined }} />)}</tr>
                  </Fragment>
                ))}
              </tbody></table>
            </td></tr>
          <tr><th style={{ fontSize: "10.5pt" }}>상품화계획<br />및<br />사업성</th>
            <td style={{ ...bodyCell, height: "75.3mm" }}>{d.rptBiz || <span className="gph">※ 사업성평가, 사업화/상용화 계획, 예상매출액 등 상세하게 기술</span>}</td></tr>
          <tr><th rowSpan={2} style={{ fontSize: "10.5pt" }}>지원(기대)<br />효과</th>
            <td style={{ ...bodyCell }}>
              <div style={{ fontSize: "9pt" }}>※ 정량적 기대효과 (예상지원성과) — 매출, 수출, 재직인원수 필수</div>
              <table className="gt gx" style={{ marginTop: "1mm" }}><tbody>
                <tr><th style={mini}>구  분</th><th style={mini}>전년도</th><th style={mini}>해당연도<br />예상</th><th style={mini}>차년도<br />예상</th><th style={mini}>차차년도<br />예상</th><th style={{ ...mini, width: "28%" }}>세부근거</th></tr>
                {EFFECT_ROWS.map(([k, label]) => {
                  const e = eff[k] || {};
                  return (
                    <tr key={k}>
                      <th style={{ ...mini, textAlign: "left" }}>{label}</th>
                      <td style={mini}>{e.y0 || ""}</td><td style={mini}>{e.y1 || ""}</td><td style={mini}>{e.y2 || ""}</td><td style={mini}>{e.y3 || ""}</td>
                      <td style={{ ...mini, textAlign: "left" }}>{e.basis || ""}</td>
                    </tr>
                  );
                })}
              </tbody></table>
              <div style={{ fontSize: "9pt", marginTop: "1mm" }}>※ 기타 기대성과 (벤처등록/이노비즈인증/기업부설연구소설립/특허 취득/기타 성과)<br />{d.rptEtcEffect}</div>
            </td></tr>
          <tr><td style={{ ...bodyCell, height: "60mm" }}>{d.rptQualEffect || <span className="gph">※ 정성적 기대효과(매출상승, 비용절감, 신규인력 채용, 제품이미지 개선 등의 예상성과를 구체적이고 객관적인 수치로 표시){"\n"}※ 기타 파급효과</span>}</td></tr>
        </tbody></table>
      </div>

      {/* ── 3페이지: 2. 세부 수행과정 ── */}
      <div className="gpage">
        <div style={secH}>2. 세부 수행과정 (제작과정 등 상세설명)</div>
        <table className="gt gx"><tbody>
          {[0, 1, 2].map(i => (
            <Fragment key={i}>
              <tr><td style={{ height: "58.8mm", textAlign: "center", verticalAlign: "middle", padding: "2mm" }}>{pimg(i, "55mm")}</td></tr>
              <tr><td style={{ height: "16.4mm", verticalAlign: "top", padding: "1.5mm 2.5mm", fontSize: "10.5pt", whiteSpace: "pre-wrap" }}>{cap(i) || <span className="gph">[과정설명]</span>}</td></tr>
            </Fragment>
          ))}
        </tbody></table>
        <p style={{ fontSize: "10.5pt", margin: "3mm 0 1mm" }}>※ 제품제작과정 실물사진 등 3매 이상 첨부</p>
        <table className="gt gx"><tbody>
          {[3, 4, 5].map(i => (
            <tr key={i}>
              <td style={{ width: "50%", height: "68.8mm", textAlign: "center", verticalAlign: "middle", padding: "2mm" }}>{pimg(i, "64mm")}</td>
              <td style={{ verticalAlign: "top", padding: "2mm 2.5mm", fontSize: "10.5pt", whiteSpace: "pre-wrap" }}>{cap(i) || <span className="gph">[과정설명]</span>}</td>
            </tr>
          ))}
        </tbody></table>
      </div>

      {/* ── 4페이지: 3. 기술닥터 지원내용 ── */}
      <div>
        <div style={secH}>3. 기술닥터 지원내용</div>
        <table className="gt gx"><tbody>
          <tr style={{ height: "9.8mm" }}>
            <th style={{ width: "13.7%", ...lbl }}>기술닥터</th><th style={{ width: "8.2%", ...lbl }}>소속</th><td style={{ width: "27.3%", ...val }}>{td.doctorOrg}</td>
            <th style={{ width: "7.1%", ...lbl }}>이름</th><td style={{ width: "17.8%", ...val }}>{td.doctor}</td><th style={{ width: "7.1%", ...lbl }}>직위</th><td style={val}>{td.doctorTitle}</td>
          </tr>
          <tr><th style={lbl}>기술적<br />달성 목표</th><td colSpan={6} style={{ ...bodyCell, height: "17mm" }}>{d.rptGoalTech || <span className="gph">※ 정량적/구체적으로 기술</span>}</td></tr>
          <tr><th style={lbl}>목표 대비<br />지원결과</th><td colSpan={6} style={{ ...bodyCell, height: "17mm" }}>{d.rptGoalResult || <span className="gph">※ 정량적/구체적으로 기술</span>}</td></tr>
          <tr><th style={lbl}>회차별<br />기술지원내용</th><td colSpan={6} style={{ ...bodyCell }}>
            <table className="gt gx" style={{ marginBottom: "1.5mm" }}><tbody>
              <tr><th style={{ ...mini, width: "10%" }}>회차</th><th style={mini}>기술지원 주요내용</th></tr>
              {Array.from({ length: 10 }, (_, i) => (
                <tr key={i} style={{ height: "12.5mm" }}><td style={mini}>{i + 1}</td><td style={{ ...mini, textAlign: "left", whiteSpace: "pre-wrap" }}>{rounds[i]?.content || ""}</td></tr>
              ))}
            </tbody></table>
            <div style={{ fontSize: "9pt" }}>※ 기술지도에 관한 내용만 가능하며, 마케팅 등 기술지도 범위를 벗어난 내용은 불인정</div>
          </td></tr>
        </tbody></table>
        <p style={{ fontSize: "10.5pt", margin: "2mm 0 0" }}>&nbsp;&nbsp;※ 첨부 : 기술지원일지[상용화서식 제5호] 각 1부.</p>
      </div>
    </div>
  );
}

// 제5호. 기술지원 일지
function T5({ p, d, photos, img, sign: _s }: P) {
  const td = p.td || {};
  return (
    <div>
      <FormNo no="제5호" />
      <h2 style={{ textAlign: "center", fontSize: "20pt", fontWeight: 400, margin: "2mm 0 5mm" }}>기술지원 일지 - {d.round || "○"}회차</h2>
      <table className="gt gx" style={{ fontSize: "11pt" }}><tbody>
        <tr style={{ height: "8.8mm" }}>
          <th style={{ width: "11.9%" }}>기업명</th><td style={{ width: "35.5%", textAlign: "center" }}>{p.company}</td>
          <th style={{ width: "13%" }}>기술닥터</th><td style={{ textAlign: "center" }}>{td.doctor}</td>
        </tr>
        <tr style={{ height: "8.8mm" }}>
          <th>지원일자</th><td style={{ textAlign: "center" }}>{d.logDate ? kdate(d.logDate) : ""}</td>
          <th>장소</th><td style={{ textAlign: "center" }}>{d.place}</td>
        </tr>
      </tbody></table>
      <table className="gt gx" style={{ fontSize: "11pt", marginTop: "3mm" }}><tbody>
        <tr style={{ height: "8.9mm" }}><th style={{ width: "12.2%" }}>구분</th><th>지원내용</th></tr>
        <tr style={{ height: "8.9mm" }}><th>주제</th><td style={{ paddingLeft: "2.5mm" }}>{d.topic}</td></tr>
        <tr>
          <th style={{ height: "128mm" }}>내용</th>
          <td style={{ verticalAlign: "top", padding: "2mm 2.5mm", whiteSpace: "pre-wrap" }}>
            {d.logContent || <span className="gph">※ 실제 지도한 과정(내용) 위주로 6하 원칙에 의거 자세히 작성{"\n"}(문제점(애로사항), 분석내용, 개선방안, 지도내용 등)</span>}
          </td>
        </tr>
        <tr>
          <th style={{ height: "41.9mm" }}>관련<br />이미지</th>
          <td style={{ verticalAlign: "top", padding: "2mm" }}>
            {photos.length
              ? <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>{photos.map((ph, i) => img(ph.path) ? <img key={i} src={img(ph.path)} alt="" style={{ maxWidth: "100%", maxHeight: "36mm", objectFit: "contain" }} /> : null)}</div>
              : <span className="gph">※ 회의사진, 현장사진, 지도결과물사진 등</span>}
          </td>
        </tr>
      </tbody></table>
    </div>
  );
}

// 제6호. 사업비 사용실적 보고서
function T6({ p, d, sign }: P) {
  const td = p.td || {};
  const total = num(td.support) + num(td.share);
  const dp = dateParts(d.writeDate);
  return (
    <div style={{ margin: "0 5mm" }}>
      <FormNo no="제6호" />
      <table className="gt gx"><tbody>
        <tr><td colSpan={5} style={{ height: "16.9mm", textAlign: "center", fontSize: "20pt", fontWeight: 700 }}>사업비 사용실적 보고서</td></tr>
        <tr style={{ height: "14.9mm" }}><th style={{ width: "20.2%", fontSize: "11pt" }}>과 제 명</th><td colSpan={4} style={{ textAlign: "center", fontSize: "11pt" }}>{td.project}</td></tr>
        <tr style={{ height: "15.2mm" }}>
          <th style={{ fontSize: "11pt" }}>기 업 명</th><td colSpan={2} style={{ width: "40%", textAlign: "center", fontSize: "11pt" }}>{p.company}</td>
          <th style={{ width: "20%", fontSize: "11pt" }}>대표자</th><td style={{ textAlign: "center", fontSize: "11pt" }}>{p.ceo}</td>
        </tr>
        <tr style={{ height: "14.4mm" }}>
          <th rowSpan={2} style={{ fontSize: "11pt" }}>총 사업예산<br />(원)</th>
          <th style={{ width: "20%", fontSize: "11pt" }}>지원금</th><th style={{ width: "20%", fontSize: "11pt" }}>기업부담금(현금)</th>
          <th style={{ fontSize: "11pt" }}>계</th><th style={{ fontSize: "11pt" }}>비고</th>
        </tr>
        <tr style={{ height: "15.2mm" }}>
          <td style={{ textAlign: "right", paddingRight: "2mm", fontSize: "11pt" }}>{money(td.support)}</td>
          <td style={{ textAlign: "right", paddingRight: "2mm", fontSize: "11pt" }}>{money(td.share)}</td>
          <td style={{ textAlign: "right", paddingRight: "2mm", fontSize: "11pt" }}>{total ? money(total) : ""}</td>
          <td style={{ fontSize: "11pt" }}>{d.remark}</td>
        </tr>
        <tr style={{ height: "16.2mm" }}><td colSpan={5} style={{ textAlign: "center", fontSize: "11pt", fontWeight: 700 }}>
          과제기간 : {kdate(td.periodFrom, "2026년 06월 01일")} ~ {kdate(td.periodTo, "2026년 11월 30일")}
        </td></tr>
        <tr><td colSpan={5} style={{ height: "132mm", verticalAlign: "top", padding: "4mm 3mm", fontSize: "12pt", lineHeight: 2 }}>
          &nbsp;기술닥터사업의 운영요령 및 지침에 따라 기술닥터사업 사업비의 사용실적을 보고합니다.<br /><br />
          붙임&nbsp;&nbsp;1. 사업비사용명세서[상용화서식 제7호] 1부.<br />
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2. 비목별 사용명세서[상용화서식 제8호] 1부.<br />
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3. 비목별 관련증빙서류(견적서, 거래명세표, 전자세금계산서, 송금확인증, 사업비 사용 결과물 증빙 등) 사본 각 1부.<br />
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;4. 통장사본 1부(첫 면~마지막 면).<br />
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;5. 사업비 관련 변경 신청 및 승인 내역 각 1부.<br /><br />
          <div style={{ textAlign: "center", margin: "6mm 0" }}>{dp.y || "    "}년  {dp.m || "  "}월  {dp.d || "  "}일</div>
          <div style={{ textAlign: "right", paddingRight: "8mm" }}>기 업 명 : {p.company}&nbsp;
            <span style={{ position: "relative", display: "inline-block", minWidth: 40, textAlign: "center" }}>
              {sign && <img src={sign} alt="" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", height: 48, pointerEvents: "none" }} />}(직인)
            </span>
          </div>
          <div style={{ textAlign: "right", paddingRight: "8mm", marginTop: "2mm" }}>대 표 자 : {p.ceo} <Stamp sign={sign} /></div>
          <div style={{ fontSize: "14pt", fontWeight: 700, marginTop: "8mm" }}>(재)경기테크노파크 원장 귀하</div>
        </td></tr>
      </tbody></table>
    </div>
  );
}

// 제7호. 사업비 사용 명세서 — 비목(인건비/직접비/이자) 계획 대비 실적, 실적은 원장(제8호)에서 자동 집계
function T7({ p, d }: P) {
  const groups: [string, string][] = [["인건비", "planLabor"], ["직접비", "planDirect"], ["이자", "planInterest"]];
  const rows = groups.map(([g, planKey]) => {
    const plan = num(d[planKey]); const actual = tdGroupSum(d, g);
    return { g, plan, actual, rest: plan - actual };
  });
  const tp = rows.reduce((s, r) => s + r.plan, 0), ta = rows.reduce((s, r) => s + r.actual, 0);
  const cell: React.CSSProperties = { textAlign: "right", paddingRight: "3mm", fontSize: "11pt" };
  return (
    <div>
      <FormNo no="제7호" />
      <h2 style={{ textAlign: "center", fontSize: "20pt", fontWeight: 700, margin: "2mm 0 3mm" }}>사업비 사용 명세서</h2>
      <p style={{ textAlign: "right", fontSize: "10pt", margin: "0 0 1mm" }}>(단위 : 원)</p>
      <table className="gt gx" style={{ fontSize: "11pt" }}><tbody>
        <tr style={{ height: "24.2mm" }}>
          <th style={{ width: "12.9%" }}>구분<br /><br />비목</th>
          <th style={{ width: "26.3%" }}>당초계획</th><th style={{ width: "30.4%" }}>사용실적</th><th>잔&nbsp;&nbsp;&nbsp;액</th>
        </tr>
        {rows.map(r => (
          <tr key={r.g} style={{ height: "19.5mm" }}>
            <th>{r.g}</th>
            <td style={cell}>{r.plan ? money(r.plan) : ""}</td>
            <td style={cell}>{r.actual ? money(r.actual) : ""}</td>
            <td style={cell}>{r.plan || r.actual ? money(r.rest) : ""}</td>
          </tr>
        ))}
        <tr style={{ height: "19.5mm" }}>
          <th colSpan={3} style={{ textAlign: "center" }}>합 계&nbsp;&nbsp;&nbsp;{tp ? `(계획 ${money(tp)} / 실적 ${money(ta)})` : ""}</th>
          <td style={{ ...cell, fontWeight: 700 }}>{tp || ta ? money(tp - ta) : ""}</td>
        </tr>
      </tbody></table>
    </div>
  );
}

// 제8호. 비목별 사용 명세서 — 원장 행을 원본 표 구조(비목/세목 rowspan)대로 배치
function T8({ d }: P) {
  const rows = ledgerRows(d);
  const byItem = (it: string) => rows.filter(r => r.item === it);
  const direct = TD_ITEMS.filter(it => TD_ITEM_GROUP[it] === "직접비");
  const laborSum = tdGroupSum(d, "인건비"), directSum = tdGroupSum(d, "직접비"), interSum = tdGroupSum(d, "기타");
  const c: React.CSSProperties = { fontSize: "10pt", textAlign: "center" };
  const amt: React.CSSProperties = { fontSize: "10pt", textAlign: "right", paddingRight: "1.5mm" };
  const H = { height: "8.5mm" };
  // 세목별 표시 행: 입력된 행이 없으면 빈 행 1개
  const itemRows = (it: string) => (byItem(it).length ? byItem(it) : [{} as TdLedgerRow]);
  const docRows = itemRows("기술지원인력 수당");
  const partRows = itemRows("참여연구인력 인건비");
  // 원본과 동일: 비목(인건비/직접비) 세로 병합은 소계 행까지 포함
  const laborRowCount = 1 + docRows.length + 1 + partRows.length + 1; // 원천세 + 수당행들 + 계 + 참여연구 + 소계
  const directTotal = direct.reduce((a, it) => a + itemRows(it).length, 0) + 1; // + 소계
  return (
    <div>
      <FormNo no="제8호" />
      <h2 style={{ textAlign: "center", fontSize: "20pt", fontWeight: 700, margin: "2mm 0 3mm" }}>비목별 사용 명세서</h2>
      <table className="gt gx"><tbody>
        <tr style={{ height: "10.8mm" }}>
          <th style={{ width: "8.9%", fontSize: "11pt" }}>비목</th><th style={{ width: "13.6%", fontSize: "11pt" }}>세목</th>
          <th style={{ width: "18.1%", fontSize: "11pt" }}>내&nbsp;&nbsp;&nbsp;역<br />(품명)</th><th style={{ width: "16.9%", fontSize: "11pt" }}>집행일<br />(년월일)</th>
          <th style={{ width: "14%", fontSize: "11pt" }}>지급처</th><th style={{ width: "17.8%", fontSize: "11pt" }}>집행금액<br />(부가세 제외)</th><th style={{ fontSize: "11pt" }}>증빙자료번호</th>
        </tr>
        {/* 인건비 */}
        <tr style={H}>
          <th rowSpan={laborRowCount} style={{ fontSize: "10pt" }}>인건비</th>
          <th rowSpan={docRows.length + 2} style={{ fontSize: "10pt" }}>기술닥터<br />수당</th>
          <td style={c}>원천세</td><td style={c} /><td style={c} /><td style={amt}>{money(d.tdTax)}</td><td style={c} />
        </tr>
        {docRows.map((r, i) => (
          <tr key={"doc" + i} style={H}>
            <td style={c}>{r.desc || "실지급액"}</td><td style={c}>{r.date || ""}</td><td style={c}>{r.payee || ""}</td><td style={amt}>{money(r.amount)}</td><td style={c}>{r.evNo || ""}</td>
          </tr>
        ))}
        <tr style={H}><td style={c}>계</td><td style={c} /><td style={c} /><td style={amt}>{(() => { const v = num(d.tdTax) + byItem("기술지원인력 수당").reduce((s, r) => s + num(r.amount), 0); return v ? money(v) : ""; })()}</td><td style={c} /></tr>
        {partRows.map((r, i) => (
          <tr key={"part" + i} style={H}>
            {i === 0 && <th rowSpan={partRows.length} style={{ fontSize: "10pt" }}>참여연구인력 인건비</th>}
            <td style={c}>{r.desc || ""}</td><td style={c}>{r.date || ""}</td><td style={c}>{r.payee || ""}</td><td style={amt}>{money(r.amount)}</td><td style={c}>{r.evNo || ""}</td>
          </tr>
        ))}
        <tr style={{ height: "6.5mm" }}><th colSpan={4} style={{ fontSize: "10pt" }}>소 계</th><td style={amt}>{laborSum + num(d.tdTax) ? money(laborSum + num(d.tdTax)) : ""}</td><td style={c} /></tr>
        {/* 직접비 */}
        {direct.map((it, gi) => itemRows(it).map((r, i) => (
          <tr key={it + i} style={H}>
            {gi === 0 && i === 0 && <th rowSpan={directTotal} style={{ fontSize: "10pt" }}>직접비</th>}
            {i === 0 && <th rowSpan={itemRows(it).length} style={{ fontSize: "10pt" }}>{it === "(실험)재료비" ? <>(실험)<br />재료비</> : it === "시험분석·인증비" ? <>시험분석<br />·<br />인증비</> : it === "지식재산보호비" ? <>지식재산<br />보호비</> : it}</th>}
            <td style={c}>{r.desc || ""}</td><td style={c}>{r.date || ""}</td><td style={c}>{r.payee || ""}</td><td style={amt}>{money(r.amount)}</td><td style={c}>{r.evNo || ""}</td>
          </tr>
        )))}
        <tr style={{ height: "7.4mm" }}><th colSpan={4} style={{ fontSize: "10pt" }}>소 계</th><td style={amt}>{directSum ? money(directSum) : ""}</td><td style={c} /></tr>
        {/* 기타/이자 */}
        <tr style={{ height: "6.2mm" }}>
          <th style={{ fontSize: "10pt" }}>기타</th><th style={{ fontSize: "10pt" }}>이자</th>
          <td style={c}>-</td><td style={c}>-</td><td style={c}>-</td><td style={amt}>{interSum ? money(interSum) : ""}</td><td style={c} />
        </tr>
        <tr style={{ height: "7.3mm" }}><th colSpan={5} style={{ fontSize: "10pt" }}>합&nbsp;&nbsp;&nbsp;계</th><td style={{ ...amt, fontWeight: 700 }}>{(() => { const v = laborSum + directSum + interSum + num(d.tdTax); return v ? money(v) : ""; })()}</td><td style={c} /></tr>
      </tbody></table>
      <p style={{ fontSize: "10pt", margin: "1.5mm 0 0", lineHeight: 1.6 }}>
        * 분량이 많을 경우 칸수 조정하여 작성가능<br />* 사업기간 시 발생한 수입이자 작성<br />* 항목별 관련 증빙서류 첨부
      </p>
    </div>
  );
}

// 제11-1호/제11-2호. 협약변경 승인요청서 / 협약변경 보고
function T11({ p, d, sign: _s, report }: P & { report?: boolean }) {
  const td = p.td || {};
  return (
    <div>
      <FormNo no={report ? "제11-2호" : "제11-1호"} />
      <h2 style={{ textAlign: "center", fontSize: "20pt", fontWeight: 700, margin: "2mm 0 5mm" }}>{report ? "협약변경 보고" : "협약변경 승인요청서"}</h2>
      <table className="gt gx" style={{ fontSize: "11pt" }}><tbody>
        <tr style={{ height: "11.9mm" }}>
          <th style={{ width: "13.4%" }}>기업명</th><td style={{ width: "45.8%", textAlign: "center" }}>{p.company}</td>
          <th style={{ width: "11.7%" }}>대표자</th><td style={{ textAlign: "center" }}>{p.ceo}</td>
        </tr>
        <tr style={{ height: "13.7mm" }}><th>과제명</th><td colSpan={3} style={{ textAlign: "center" }}>{td.project}</td></tr>
        <tr style={{ height: "7.9mm" }}>
          <th rowSpan={2} style={{ width: "6.3%" }}>변<br />경<br />내<br />용</th>
          <th style={{ width: "46.9%" }}>변경전</th><th colSpan={2}>변경후</th>
        </tr>
        <tr>
          <td style={{ height: "59.2mm", verticalAlign: "top", padding: "2mm", whiteSpace: "pre-wrap" }}>{d.changeBefore}</td>
          <td colSpan={2} style={{ verticalAlign: "top", padding: "2mm", whiteSpace: "pre-wrap" }}>{d.changeAfter}</td>
        </tr>
        <tr style={{ height: "8.2mm" }}><th colSpan={4}>변경사유</th></tr>
        <tr><td colSpan={4} style={{ height: "56mm", verticalAlign: "top", padding: "2mm", whiteSpace: "pre-wrap" }}>{d.changeReason}</td></tr>
        <tr style={{ height: "8.2mm" }}><th colSpan={4}>기타사항</th></tr>
        <tr><td colSpan={4} style={{ height: "27mm", verticalAlign: "top", padding: "2mm", whiteSpace: "pre-wrap" }}>{d.changeEtc}</td></tr>
      </tbody></table>
      <p style={{ fontSize: "11pt", margin: "2mm 0 0", lineHeight: 1.7 }}>
        &nbsp;※ 사업계획서상 변경된 부분만 수정해서 첨부<br />&nbsp;※ 신규 항목 추가시(또는 주관기관 요청시) 견적서 첨부
      </p>
    </div>
  );
}

// 서식 렌더 진입점 (기술닥터 상용화지원)
export default function GrantFormTD({ form, ...props }: P & { form: TdFormKey }) {
  switch (form) {
    case "t2": return <T2 {...props} />;
    case "t4": return <T4 {...props} />;
    case "t5": return <T5 {...props} />;
    case "t6": return <T6 {...props} />;
    case "t7": return <T7 {...props} />;
    case "t8": return <T8 {...props} />;
    case "t11": return <T11 {...props} />;
    case "t11b": return <T11 {...props} report />;
    default: return null;
  }
}
