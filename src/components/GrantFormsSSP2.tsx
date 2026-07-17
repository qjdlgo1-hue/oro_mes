// 창업성공패키지 서식 후반부(12~24) — GrantFormsSSP.tsx에서 위임. 원문 문구 그대로 재현.
import { dateParts, money, num, settleSummary, SSP_ITEMS, SspFormKey, SspProgramKey } from "../lib/grantforms";
import { Stamp } from "./GrantForms";
import { SspProps, sspTerm, sspInfo, kdate, DateSign, body } from "./GrantFormsSSP";

import { TitleBox } from "./grantformsShared";

// ── 12. 사업비 권리의무 이전 확인서 (개인→법인 전환 시) ──
function S12({ v, p, d, sign }: SspProps) {
  const t = sspTerm(v);
  const info = sspInfo(p, v);
  const H = { height: "7.6mm" };
  const amt: React.CSSProperties = { fontSize: "9.5pt", textAlign: "right", paddingRight: "1.5mm" };
  const tr: Record<string, any> = d.trRows || {}; // {gov:{planCash,planIn,useCash,useIn}, own:{...}}
  const row = (k: string) => tr[k] || {};
  const line = (k: string) => {
    const r = row(k);
    const plan = num(r.planCash) + num(r.planIn), use = num(r.useCash) + num(r.useIn);
    return { plan, use, restCash: num(r.planCash) - num(r.useCash), restIn: num(r.planIn) - num(r.useIn), rate: plan ? (use / plan * 100) : 0 };
  };
  const totPlanCash = num(row("gov").planCash) + num(row("own").planCash);
  const totPlanIn = num(row("gov").planIn) + num(row("own").planIn);
  const totUseCash = num(row("gov").useCash) + num(row("own").useCash);
  const totUseIn = num(row("gov").useIn) + num(row("own").useIn);
  const totPlan = totPlanCash + totPlanIn, totUse = totUseCash + totUseIn;
  return (
    <div>
      <TitleBox>「창업성공패키지 사업화지원」 사업비 권리․의무 이전 확인서</TitleBox>
      <table className="gt gx" style={{ fontSize: "10.5pt" }}><tbody>
        <tr style={H}><th style={{ width: "20%" }}>입 교 자 명</th><td colSpan={3} style={{ textAlign: "center" }}>{info.trainee || p.ceo}</td></tr>
        <tr style={H}><th>과  제  명</th><td colSpan={3} style={{ textAlign: "center" }}>{info.taskName}</td></tr>
        <tr style={H}><th>협 약 기 간</th><td colSpan={3} style={{ textAlign: "center" }}>{kdate(info.periodFrom, "20   년  월  일")} ~ {kdate(info.periodTo, "20   년  월  일")}</td></tr>
        <tr style={H}>
          <th>총 사 업 비</th><td style={{ width: "32%", textAlign: "center" }}>{money(num(info.govFund) + num(info.ownCash) + num(info.ownInkind)) || ""}</td>
          <th style={{ width: "20%" }}>대 표 이 사</th><td style={{ textAlign: "center" }}>{d.newCeo || p.ceo}</td>
        </tr>
        <tr style={H}>
          <th>법  인  명</th><td style={{ textAlign: "center" }}>{d.newCorp || p.company}</td>
          <th>법인등록번호</th><td style={{ textAlign: "center" }}>{d.newCorpNo || p.corpNo}</td>
        </tr>
        <tr style={H}>
          <th>사업자등록번호</th><td style={{ textAlign: "center" }}>{d.newBizno || p.bizno}</td>
          <th>법인설립일자</th><td style={{ textAlign: "center" }}>{kdate(d.newFounded, "")}</td>
        </tr>
        <tr style={H}><th>소  재  지</th><td colSpan={3} style={{ paddingLeft: "2mm" }}>{d.newAddr || p.address}</td></tr>
        <tr style={H}>
          <th>업      종</th><td style={{ textAlign: "center" }}>{d.newSector}</td>
          <th>업    태</th><td style={{ textAlign: "center" }}>{d.newType}</td>
        </tr>
      </tbody></table>
      <div style={{ fontSize: "11pt", fontWeight: 700, margin: "4mm 0 1mm" }}>□ 사업비 집행내역 및 신규법인 이전금액 <span style={{ float: "right", fontWeight: 400, fontSize: "9.5pt" }}>(단위: 원)</span></div>
      <table className="gt gx"><tbody>
        <tr style={{ height: "6.5mm" }}>
          <th rowSpan={2} style={{ fontSize: "9.5pt", width: "18%" }}>세부항목</th>
          <th colSpan={2} style={{ fontSize: "9.5pt" }}>사업비(a)</th><th colSpan={2} style={{ fontSize: "9.5pt" }}>집행(b)</th>
          <th colSpan={2} style={{ fontSize: "9.5pt" }}>잔액(a-b)</th><th rowSpan={2} style={{ fontSize: "9.5pt", width: "12%" }}>집행비율<br />(b/a)(%)</th>
        </tr>
        <tr style={{ height: "6mm" }}>
          {["현금", "현물", "현금", "현물", "현금", "현물"].map((h, i) => <th key={i} style={{ fontSize: "9pt" }}>{h}</th>)}
        </tr>
        {[["gov", "정부지원금"], ["own", `${t.founder} 부담금`]].map(([k, label]) => {
          const r = row(k), ln = line(k);
          return (
            <tr key={k} style={{ height: "7.5mm" }}>
              <th style={{ fontSize: "9.5pt" }}>{label}</th>
              <td style={amt}>{money(r.planCash) || ""}</td><td style={amt}>{money(r.planIn) || ""}</td>
              <td style={amt}>{money(r.useCash) || ""}</td><td style={amt}>{money(r.useIn) || ""}</td>
              <td style={amt}>{r.planCash ? money(ln.restCash) : ""}</td><td style={amt}>{r.planIn ? money(ln.restIn) : ""}</td>
              <td style={{ fontSize: "9.5pt", textAlign: "center" }}>{ln.plan ? ln.rate.toFixed(2) : ""}</td>
            </tr>
          );
        })}
        <tr style={{ height: "7.5mm" }}>
          <th style={{ fontSize: "9.5pt" }}>합  계</th>
          <td style={amt}>{money(totPlanCash)}</td><td style={amt}>{money(totPlanIn)}</td>
          <td style={amt}>{money(totUseCash)}</td><td style={amt}>{money(totUseIn)}</td>
          <td style={amt}>{money(totPlanCash - totUseCash)}</td><td style={amt}>{money(totPlanIn - totUseIn)}</td>
          <td style={{ fontSize: "9.5pt", textAlign: "center" }}>{totPlan ? (totUse / totPlan * 100).toFixed(2) : "0.00"}</td>
        </tr>
      </tbody></table>
      <p style={{ fontSize: "10pt", margin: "2mm 0 0" }}>별첨 1. 사업자등록증 사본&nbsp;&nbsp;&nbsp;2. 법인등기부 등본 원본 각 1부.</p>
      <p style={{ fontSize: "11pt", lineHeight: 1.9, margin: "5mm 0 0", textAlign: "justify" }}>
        &nbsp;{sspTerm(v).school} 선정자인 {info.trainee || p.ceo || "        "} 의 사업 수행 및 사업비 집행에 대한 권리·의무가 위와 같이 법인에 이전됨을 확인합니다.
      </p>
      {(() => { const dp = dateParts(d.writeDate); return (
        <div style={{ marginTop: "6mm" }}>
          <p style={{ textAlign: "center", fontSize: "12pt", margin: "0 0 5mm" }}>{dp.y || "20  "} 년 {dp.m || "  "} 월 {dp.d || "  "} 일</p>
          <p style={{ textAlign: "right", fontSize: "11.5pt", margin: "0 0 2mm", paddingRight: "6mm" }}>확인신청인 {t.founder} : {info.trainee || p.ceo} &nbsp;자필(개인) <Stamp sign={sign} /></p>
          <p style={{ textAlign: "right", fontSize: "11.5pt", margin: "0 0 2mm", paddingRight: "6mm" }}>업 체 명 : {d.newCorp || p.company}</p>
          <p style={{ textAlign: "right", fontSize: "11.5pt", margin: 0, paddingRight: "6mm" }}>대표이사 : {d.newCeo || p.ceo} &nbsp;자필(개인) (인) 법인인감</p>
          <p style={{ fontSize: "13pt", fontWeight: 700, margin: "6mm 0 0" }}>중소벤처기업진흥공단 이사장 귀하</p>
        </div>
      ); })()}
    </div>
  );
}

// ── 13. 위탁개발 계약 승계 약정서 ── (두 변형 문구 동일)
function S13({ v, p, d, sign }: SspProps) {
  const info = sspInfo(p, v);
  return (
    <div>
      <TitleBox>【 위탁개발 계약 승계 약정서 】</TitleBox>
      <p style={{ fontSize: "11pt", lineHeight: 2, textAlign: "justify" }}>
        「창업성공패키지」에 따른 위탁수행에 관하여 입교자(갑)과 위탁기관(을), 중소벤처기업진흥공단(병)은 {kdate(d.osSignDate, "20  년   월   일")} 체결한
        위탁개발 계약을 다음과 같은 사유로 승계 약정하며 계약당사자의 날인으로 확인한다.
      </p>
      <p style={{ textAlign: "center", fontSize: "11.5pt", margin: "4mm 0" }}>{kdate(d.writeDate, "20   년    월    일")}</p>
      <div style={{ fontSize: "11pt", lineHeight: 2.2 }}>
        계약 승계 사유 : {d.sucReason}<br />
        당초 계약자 : {d.sucFrom}<br />
        계약 승계자 : {d.sucTo}
      </div>
      <div style={{ fontSize: "11.5pt", fontWeight: 700, margin: "5mm 0 1mm" }}>□ 위탁개발 계약 내용</div>
      <div style={{ fontSize: "11pt", lineHeight: 2.2 }}>
        &nbsp;◯ 개 발 명 : {d.osName}<br />
        &nbsp;&nbsp;&nbsp;&nbsp;(사업과제명 : {info.taskName || "                       "})<br />
        &nbsp;◯ 개발기간 : {kdate(d.osFrom, "20   년    월    일")} ~ {kdate(d.osTo, "20  년    월    일")}<br />
        &nbsp;◯ 사 업 비 : {d.osAmount ? `${money(d.osAmount)} 원 (VAT 제외)` : "                원 (VAT 제외)"}
      </div>
      <div style={{ fontSize: "11pt", lineHeight: 2, marginTop: "8mm" }}>
        &nbsp;&nbsp;(갑) 입교자<br />
        &nbsp;&nbsp;기업명 : {p.company}<br />
        &nbsp;&nbsp;주&nbsp;&nbsp;소 : <span style={{ fontSize: "10pt" }}>{p.address}</span><br />
        &nbsp;&nbsp;성&nbsp;&nbsp;명 : {info.trainee || p.ceo} <Stamp sign={sign} /><br /><br />
        &nbsp;&nbsp;(을) 위탁기관<br />
        &nbsp;&nbsp;기업명 : {d.vdName}<br />
        &nbsp;&nbsp;주&nbsp;&nbsp;소 : <span style={{ fontSize: "10pt" }}>{d.vdAddr}</span><br />
        &nbsp;&nbsp;대표자 : {d.vdCeo} (인)<br /><br />
        &nbsp;&nbsp;(병) 주관기관 (중소벤처기업진흥공단 본사)<br />
        &nbsp;&nbsp;기업명 : 중소벤처기업진흥공단<br />
        &nbsp;&nbsp;주&nbsp;&nbsp;소 : 경상남도 진주시 동진로 430 (충무공동)<br />
        &nbsp;&nbsp;이사장 : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; (인)
      </div>
    </div>
  );
}

// ── 14. 선금(중도금) 지급 확약서 ──
function S14({ v, p, d, sign }: SspProps) {
  const t = sspTerm(v);
  const H = { height: "8.6mm" };
  const won = (x: any) => (num(x) ? `${money(x)} 원 (VAT제외)` : "                       원 (VAT제외)");
  return (
    <div>
      <TitleBox>선금(중도금) 지급에 대한 확약서</TitleBox>
      <table className="gt gx" style={{ fontSize: "11pt" }}><tbody>
        <tr style={H}><th style={{ width: "34%" }}>계  약  명</th><td style={{ paddingLeft: "2mm" }}>{d.osName}</td></tr>
        <tr style={H}><th>계  약  금 (선금+중도금+잔금)</th><td style={{ textAlign: "right", paddingRight: "2mm" }}>{won(d.advTotal)}</td></tr>
        <tr style={H}><th>선      금 ({d.advRate1 || "   "}%)</th><td style={{ textAlign: "right", paddingRight: "2mm" }}>{won(d.advAmt1)}</td></tr>
        <tr style={H}><th>중  도  금 ({d.advRate2 || "   "}%)</th><td style={{ textAlign: "right", paddingRight: "2mm" }}>{won(d.advAmt2)}</td></tr>
        <tr style={H}><th>잔      금</th><td style={{ textAlign: "right", paddingRight: "2mm" }}>{won(num(d.advTotal) ? num(d.advTotal) - num(d.advAmt1) - num(d.advAmt2) : d.advRest)}</td></tr>
      </tbody></table>
      <p style={{ fontSize: "11pt", lineHeight: 2, margin: "5mm 0", textAlign: "justify" }}>
        &nbsp;&nbsp;창업성공패키지 사업에 참여하는 {t.founder} <u>&nbsp;{p.company || "기업명"}&nbsp;</u> (과)와 계약을 수행하는 상대자
        <u>&nbsp;{d.vdName || "기업명"}&nbsp;</u> (이)가 계약체결하여 진행하고 있는 상기계약 건에 대하여
        선금(중도금) <u>&nbsp;{num(d.advAmt1) + num(d.advAmt2) ? money(num(d.advAmt1) + num(d.advAmt2)) : "              "}&nbsp;</u> 원(VAT제외)을 청구, 수령함에 있어
        계약목적 달성 이외의 타 목적에는 사용하지 않겠으며, 계약상대자는 위탁업체로서의 의무를 성실히 이행할 것을 확약합니다.
        또한 계약 상 의무를 위반하거나 허위·부정한 방법으로 계약을 수행한 경우, 관련 계약 및 관계 규정에 따른 손해배상 등 필요한 조치에 따를 것을
        서약하며 이에 확약서를 제출합니다.
      </p>
      <p style={{ textAlign: "center", fontSize: "12pt", margin: "6mm 0" }}>{(() => { const dp = dateParts(d.writeDate); return `20${(dp.y || "    ").slice(2)} 년 ${dp.m || "    "} 월 ${dp.d || "    "} 일`; })()}</p>
      <div style={{ display: "flex", gap: "4%", fontSize: "11pt", lineHeight: 2.2 }}>
        <div style={{ width: "48%" }}>
          <b>“{t.founder}”</b><br />
          주&nbsp;&nbsp;소 : <span style={{ fontSize: "9.5pt" }}>{p.address}</span><br />
          업체명 : {p.company}<br />
          성&nbsp;&nbsp;명 : {p.ceo} <Stamp sign={sign} />
        </div>
        <div style={{ width: "48%" }}>
          <b>“계약상대자”</b><br />
          주&nbsp;&nbsp;소 : <span style={{ fontSize: "9.5pt" }}>{d.vdAddr}</span><br />
          업체명 : {d.vdName}<br />
          성&nbsp;&nbsp;명 : {d.vdCeo} (인)
        </div>
      </div>
      <p style={{ fontSize: "13pt", fontWeight: 700, margin: "8mm 0 0" }}>중소벤처기업진흥공단 귀하</p>
    </div>
  );
}

// ── 15·16. 업체정보/사업화 과제 변경 승인 신청서 (전자결재) ──
function S15({ v, p, d, sign, task }: SspProps & { task?: boolean }) {
  const info = sspInfo(p, v);
  const title = task ? "사업화 과제 변경 승인 신청서" : "업체정보 변경 승인 신청서";
  const H = { height: "8mm" };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "3mm" }}>
        <h2 style={{ fontSize: "16pt", fontWeight: 700, margin: 0 }}>【 {title} 】</h2>
        <table className="gt gx" style={{ width: "36%" }}><tbody>
          <tr style={{ height: "5mm" }}><th style={{ fontSize: "9pt" }}>교  수</th><th style={{ fontSize: "9pt" }}>팀  장</th><th style={{ fontSize: "9pt" }}>부서장</th></tr>
          <tr style={{ height: "9mm" }}><td /><td /><td /></tr>
        </tbody></table>
      </div>
      {!task && <p style={{ fontSize: "10pt", margin: "0 0 2mm" }}>※ 업체정보 변경사유 발생일로 7일이내 전담 교수님께 통보하고 본 신청서 제출</p>}
      <table className="gt gx" style={{ fontSize: "10.5pt" }}><tbody>
        {task ? (
          <>
            <tr style={H}><th rowSpan={2} style={{ width: "10%" }}>기존</th><th style={{ width: "14%" }}>과제명</th><td colSpan={2} style={{ paddingLeft: "2mm" }}>{d.chFromTask || info.taskName}</td></tr>
            <tr><th style={{ height: "13mm" }}>과제개요</th><td colSpan={2} style={body}>{d.chFromOutline || info.taskOutline}</td></tr>
            <tr style={H}><th rowSpan={2}>변경</th><th>과제명</th><td colSpan={2} style={{ paddingLeft: "2mm" }}>{d.chToTask}</td></tr>
            <tr><th style={{ height: "13mm" }}>과제개요</th><td colSpan={2} style={body}>{d.chToOutline}</td></tr>
          </>
        ) : (
          <>
            <tr style={H}>
              <th rowSpan={1} style={{ width: "10%" }}>기 존</th><th style={{ width: "13%" }}>업 체 명</th><td style={{ width: "23%", textAlign: "center" }}>{d.chFromName || p.company}</td>
              <th style={{ width: "13%" }}>대 표 자</th><td style={{ width: "16%", textAlign: "center" }}>{d.chFromCeo || p.ceo}</td>
              <th style={{ width: "10%" }}>주 소</th><td style={{ fontSize: "9pt", paddingLeft: "1.5mm" }}>{d.chFromAddr || p.address}</td>
            </tr>
            <tr style={H}>
              <th>변 경</th><th>업 체 명</th><td style={{ textAlign: "center" }}>{d.chToName}</td>
              <th>대 표 자</th><td style={{ textAlign: "center" }}>{d.chToCeo}</td>
              <th>주 소</th><td style={{ fontSize: "9pt", paddingLeft: "1.5mm" }}>{d.chToAddr}</td>
            </tr>
          </>
        )}
        <tr><th style={{ height: "26mm", width: "18%" }}>변경요청 사유</th><td colSpan={task ? 3 : 6} style={body}>
          {d.chReason || <span className="gph">{task ? "변경 요청하게 된 동기에 대해 자세히 기술 (예. 외부전문가 코칭 및 시장성 검토 과정에서 국내시장 규모가 너무 협소하고 진입장벽이 높아 매출발생 불가 등)" : "업체명, 사업장 소재지 등 변경 요청하게 된 사유 기술 (예. 직관적인 아이템 이미지 전달 위해 업체명 변경 등)"}</span>}
        </td></tr>
        <tr><th style={{ height: "30mm" }}>{task ? <>주요 변경내용<br />및 사업화<br />추진계획</> : "주요 변경내용"}</th><td colSpan={task ? 3 : 6} style={body}>
          {d.chDetail || <span className="gph">{task ? "기존 과제와의 차이점(기능, 타겟 시장 등) 구체적으로 기술하고 협약기간내 사업화 추진완료(제품제작 완성, 매출발생 등) 근거에 대해 반드시 기술" : "공동․각자대표 추가/제외, 사업장소재지 변경 또는 지분 변동사항 등 주요 변경사항 반드시 기재"}</span>}
        </td></tr>
        {task && (
          <tr><th style={{ height: "20mm" }}>기대 효과</th><td colSpan={3} style={body}>
            {d.chEffect || <span className="gph">매출 증대, 투자유치 가능성, 고용창출 등 가시적 기대효과 기술하되, 반드시 구체적 근거를 제시할 것</span>}
          </td></tr>
        )}
        <tr><th style={{ height: "20mm" }}>전담교수<br />검토의견</th><td colSpan={task ? 3 : 6} style={body}>
          <span className="gph">{task ? "사전면담 및 코칭 경과를 반드시 구체적으로 기재하고(일자, 내용) 변경승인 요청의 당위성 및 기대효과 등에 대해 기술" : "신청자의 대표자 지위 및 최대주주 지위 유지 여부 등 확인"}</span>
        </td></tr>
      </tbody></table>
      <p style={{ fontSize: "10pt", margin: "2mm 0 0" }}>{task ? "* 별첨 : 수정사업계획서 1부." : "* 입교생활 가이드을 참고하여, 필수 제출서류를 확인하고 전담교수님께 제출"}</p>
      <p style={{ textAlign: "center", fontSize: "11.5pt", margin: "6mm 0 0" }}>위 내용이 사실과 다르지 않음을 확인하며 {task ? "사업화 과제 변경승인" : "업체정보 변경승인"}을 요청합니다.</p>
      <DateSign d={d.writeDate} label="대표자명" who={p.ceo} sign={sign} />
    </div>
  );
}

// ── 17. 위탁개발계약 해지사유서 + (별첨1) 해지확약서 ──
function S17({ v, p, d, sign }: SspProps) {
  const t = sspTerm(v);
  const F = t.founder;
  const art: React.CSSProperties = { fontSize: "10.5pt", lineHeight: 1.75, margin: "0 0 2.5mm", whiteSpace: "pre-wrap" };
  return (
    <div>
      <div className="gpage">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "2mm" }}>
          <table className="gt gx" style={{ width: "40%" }}><tbody>
            <tr style={{ height: "5mm" }}><th rowSpan={2} style={{ width: "18%", fontSize: "9pt" }}>결<br />재</th><th style={{ fontSize: "9pt" }}>교  수</th><th style={{ fontSize: "9pt" }}>팀  장</th><th style={{ fontSize: "9pt" }}>교 장</th></tr>
            <tr style={{ height: "9mm" }}><td /><td /><td /></tr>
          </tbody></table>
        </div>
        <TitleBox>【 위탁개발계약 해지사유서 】</TitleBox>
        <p style={{ fontSize: "11pt", lineHeight: 1.9, textAlign: "justify" }}>
          「창업성공패키지 사업화지원」에 따른 위탁수행에 관하여 {F}와 위탁기관이 체결한 위탁개발계약을 다음과 같은 사유로 해지하고자 합니다.
        </p>
        <table className="gt gx" style={{ fontSize: "10.5pt", marginTop: "2mm" }}><tbody>
          <tr style={{ height: "8mm" }}><th style={{ width: "22%" }}>위탁 개발명</th><td style={{ paddingLeft: "2mm" }}>{d.osName}<br /><span style={{ fontSize: "9pt" }}>- 사업과제명 : {sspInfo(p, v).taskName || ""}</span></td></tr>
          <tr style={{ height: "8mm" }}><th>위탁 계약기간</th><td style={{ paddingLeft: "2mm" }}>{kdate(d.osFrom, "20  년    월    일")} ~ {kdate(d.osTo, "20  년    월    일")}</td></tr>
          <tr style={{ height: "8mm" }}><th>위탁 사업비</th><td style={{ paddingLeft: "2mm" }}>{d.osAmount ? `${money(d.osAmount)} 원 (VAT제외)` : "원 (VAT제외)"}</td></tr>
          <tr><th style={{ height: "22mm" }}>계약 진행경과</th><td style={body}>{d.tmProgress}</td></tr>
          <tr><th style={{ height: "20mm" }}>계약 해지사유</th><td style={body}>{d.tmReason || <span className="gph">“{F}”와 “위탁기관”의 위탁개발의 진행 및 개발방향에 대한 의견이 상이하여 상호합의를 통해 위탁개발 중단 및 계약해지</span>}</td></tr>
          <tr><th style={{ height: "16mm" }}>사업비 지급방법</th><td style={body}>{d.tmPay || <span className="gph">(예시) “중진공”과 “{F}”는 계약이 중도에 해지됨에 따라 위탁사업비 중 (         )원(VAT제외)을 지급하지 않기로 한다.</span>}</td></tr>
          <tr><th style={{ height: "14mm" }}>전담교수 검토의견</th><td style={body}><span className="gph">(전담교수 작성)</span></td></tr>
        </tbody></table>
        <p style={{ fontSize: "9.5pt", margin: "2mm 0 0" }}>※ 유의사항 : 동일 위탁개발 내용으로 기완료된 부분에 대한 추가 사업비 지급은 불가<br />별첨1. 위탁개발 계약해지확약서&nbsp;&nbsp;별첨2. 위탁개발 결과보고서 각 1부.</p>
        <p style={{ textAlign: "center", fontSize: "11.5pt", margin: "5mm 0 0" }}>위 내용이 사실과 다르지 않음을 확인하며 계약해지사유서를 제출합니다.</p>
        <DateSign d={d.writeDate} label="대표자명" who={p.ceo} sign={sign} />
      </div>
      {/* (별첨1) 위탁개발 계약해지확약서 */}
      <div>
        <p style={{ fontSize: "10.5pt", margin: "0 0 2mm" }}>(별첨1) 위탁개발 계약해지확약서</p>
        <p style={{ textAlign: "center", fontSize: "12pt", margin: "0 0 1mm" }}>「창업성공패키지 사업화지원」</p>
        <TitleBox>위탁개발 계약해지확약서</TitleBox>
        <div style={{ fontSize: "11pt", lineHeight: 2 }}>
          ◯ 위탁 개발명 : {d.osName}<br />
          &nbsp;&nbsp;- 사업 과제명 : {sspInfo(p, v).taskName || ""}<br />
          ◯ 위탁 계약기간 : {kdate(d.osFrom, "20  년    월    일")} ~ {kdate(d.osTo, "20  년    월    일")}<br />
          ◯ 위탁 사업비 : {d.osAmount ? `${money(d.osAmount)} 원 (VAT 제외)` : "원 (VAT 제외)"}<br />
          ◯ 위탁 사업책임자 : (소속) {d.vdName || "        "} (직위) {d.vdCeoTitle || "    "} (성명) {d.vdCeo || "      "}
        </div>
        <p style={{ ...art, marginTop: "3mm" }}>
          &nbsp;「창업성공패키지 사업화지원」에 따른 위탁수행에 관하여 “{F}와 위탁기관은 {kdate(d.osSignDate, "20  년  월  일")} 체결한 위탁개발 계약을 다음과 같은 사유로 해지하며, 그에 따라 본 계약해지확약서를 작성한다.
        </p>
        <p style={{ textAlign: "center", fontSize: "11pt", fontWeight: 700, margin: "2mm 0" }}>- 위탁개발 계약 해지사유 -</p>
        <p style={art}>{d.tmReason || `“${F}”와 “위탁기관”의 위탁개발의 진행 및 개발방향에 대한 의견이 상이하여 상호 합의를 통해 위탁개발 중단 및 계약해지`}</p>
        <p style={art}><b>제 1조 (목적)</b>{"\n"}본 합의서는 “{p.company || `${F} 회사명`}”(이하 “{F}”)과 “{d.vdName || "위탁기관명"}”(이하 ”위탁기관”)이 {kdate(d.osSignDate, "20  년  월  일")} 체결한 ‘“{d.osName || "위탁 개발명"}” 위탁개발에 관한 계약’ (이하 ‘위탁개발계약’이라 칭함)의 합의해지 및 그에 따른 정산·위탁개발 결과물의 귀속에 관한 사항 등을 정함을 목적으로 한다.</p>
        <p style={art}><b>제 2조 (합의해지)</b>{"\n"}“위탁개발계약”을 {kdate(d.tmDate, "20  년   월   일")}로 합의해지한다.</p>
        <p style={art}><b>제 3조 (산출물의 귀속 등)</b>{"\n"}1. 현재까지 개발된 ‘{d.tmOutput || "(예시)시제품디자인 초안과 수정안"}’과 위탁개발 기간 동안 진행된 “위탁개발계약”의 결과물 기타 모든 산출물 및 지적재산권은 “{F}”에게 귀속된다.{"\n"}2. “위탁기관”은 위탁개발계약에서 개발된 내용을 어떠한 형태로도 “{F}”의 서면동의 없이 제 3자에게 제공할 수 없다.</p>
        <p style={art}><b>제 4조 (정산)</b>{"\n"}{d.tmSettle || `(예시) 중소벤처기업진흥공단(이하 “중진공”)과 “${F}”는 계약이 중도에 해지됨에 따라 위탁사업비 중 (         )원(VAT제외)을 지급하지 않기로 한다.`}</p>
        <p style={art}><b>제 5조 (위약금)</b>{"\n"} “{F}”와 “위탁기관”은 본 해지확약서에 따른 계약의 해지는 양사 간의 상호 합의로 진행되는 것으로서 상대방(“중진공”을 포함)에게 일체의 손해배상금 또는 위약금을 청구하지 않는다.</p>
        <p style={{ textAlign: "center", fontSize: "11.5pt", margin: "6mm 0 4mm" }}>{(() => { const dp = dateParts(d.writeDate); return `20${(dp.y || "  ").slice(2)} 년 ${dp.m || "   "} 월 ${dp.d || "  "} 일`; })()}</p>
        <div style={{ display: "flex", gap: "4%", fontSize: "10.5pt", lineHeight: 1.9 }}>
          <div style={{ width: "48%" }}>
            <b>{F}</b><br />기업명 : {p.company}<br />주&nbsp;&nbsp;소 : <span style={{ fontSize: "9pt" }}>{p.address}</span><br />성&nbsp;&nbsp;명 : {p.ceo} <Stamp sign={sign} />
          </div>
          <div style={{ width: "48%" }}>
            <b>위탁기관</b><br />기업명 : {d.vdName}<br />주&nbsp;&nbsp;소 : <span style={{ fontSize: "9pt" }}>{d.vdAddr}</span><br />대표자 : {d.vdCeo} (인)
          </div>
        </div>
        <div style={{ fontSize: "10.5pt", lineHeight: 1.9, marginTop: "3mm" }}>
          <b>중소벤처기업진흥공단</b><br />주&nbsp;&nbsp;소 : 경상남도 진주시 동진로 430 (충무공동)<br />이사장 : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; (인)
        </div>
      </div>
    </div>
  );
}

// ── 19. 인건비 지급 확약서 ──
function S19({ v, p, d, sign }: SspProps) {
  const info = sspInfo(p, v);
  const H = { height: "9mm" };
  const dl = dateParts(d.laborDeadline);
  return (
    <div>
      <TitleBox>창업성공패키지 인건비 지급 확약서</TitleBox>
      <table className="gt gx" style={{ fontSize: "11pt" }}><tbody>
        <tr style={H}>
          <th style={{ width: "18%" }}>대 표 자</th><td style={{ width: "32%", textAlign: "center" }}>{p.ceo}</td>
          <th style={{ width: "18%" }}>기 업 명</th><td style={{ textAlign: "center" }}>{p.company}</td>
        </tr>
        <tr style={H}><th>과 제 명</th><td colSpan={3} style={{ textAlign: "center" }}>{info.taskName}</td></tr>
        <tr style={H}><th>근 로 자</th><td colSpan={3} style={{ textAlign: "center" }}>{d.laborName}</td></tr>
        <tr style={H}><th>근로기간</th><td colSpan={3} style={{ textAlign: "center" }}>{kdate(d.laborFrom, "20  년    월    일")} ~ {kdate(d.laborTo, "20  년    월    일")}</td></tr>
        <tr style={H}><th>인건비 선지급액</th><td colSpan={3} style={{ textAlign: "center" }}>일금 {num(d.laborAmount) ? money(d.laborAmount) : "          "} 원 (₩ {num(d.laborAmount) ? money(d.laborAmount) : "000,000"})</td></tr>
      </tbody></table>
      <p style={{ fontSize: "11.5pt", lineHeight: 2.1, margin: "7mm 0", textAlign: "justify" }}>
        &nbsp;본인은 위 내용과 같이 중소벤처기업진흥공단(이하, “중진공”)으로부터 선지급 받은 인건비를
        <b> {dl.y || "0000"}년 {dl.m ? String(dl.m).padStart(2, "0") : "00"}월 {dl.d ? String(dl.d).padStart(2, "0") : "00"}일</b>까지 근로자에게 지급할 것이며,
        인건비 미지급 사례 발생 시 선지급금에 해당하는 전액을 중진공에 즉시 반납할 것을 확약합니다.
      </p>
      <p style={{ textAlign: "center", fontSize: "12pt", margin: "8mm 0" }}>{(() => { const dp = dateParts(d.writeDate); return `20${(dp.y || "   ").slice(2)} 년 ${dp.m || "   "} 월 ${dp.d || "   "} 일`; })()}</p>
      <div style={{ textAlign: "right", fontSize: "12pt", lineHeight: 2.4, paddingRight: "8mm" }}>
        기  업  명 : {p.company}<br />
        대  표  자 : {p.ceo} <Stamp sign={sign} /><br />
        근  로  자 : {d.laborName} (인)
      </div>
      <p style={{ fontSize: "13pt", fontWeight: 700, margin: "10mm 0 0", textAlign: "center" }}>중소벤처기업진흥공단 이사장 귀하</p>
    </div>
  );
}

// ── 20. 사업비 사용실적보고서 (회계감사용) — 집행 건에서 자동 집계 ──
function S20({ v, p, d, sign, settleDocs }: SspProps) {
  const t = sspTerm(v);
  const info = sspInfo(p, v);
  const budgets = (p.budgetsBy?.[v] || {}) as Record<string, string>;
  const { lines } = settleSummary(settleDocs || [], budgets, SSP_ITEMS);
  const byItem = new Map(lines.map(l => [l.item, l]));
  const gov = num(info.govFund), cash = num(info.ownCash), inkind = num(info.ownInkind);
  const inPlan = num(d.inkindPlan) || inkind, inUse = num(d.inkindUsed);
  const rows = SSP_ITEMS.map(it => {
    const l = byItem.get(it);
    const plan = num(budgets[it]), use = l?.amount || 0;
    return { name: it, planCash: plan, planIn: 0, useCash: use, useIn: 0 };
  });
  const etc = { name: "기타(현물 등)", planCash: 0, planIn: inPlan, useCash: 0, useIn: inUse };
  const all = [...rows, etc];
  const tot = all.reduce((a, r) => ({ planCash: a.planCash + r.planCash, planIn: a.planIn + r.planIn, useCash: a.useCash + r.useCash, useIn: a.useIn + r.useIn }), { planCash: 0, planIn: 0, useCash: 0, useIn: 0 });
  const amt: React.CSSProperties = { fontSize: "9.5pt", textAlign: "right", paddingRight: "1.5mm" };
  const rate = (r: { planCash: number; planIn: number; useCash: number; useIn: number }) => {
    const plan = r.planCash + r.planIn; return plan ? ((r.useCash + r.useIn) / plan * 100).toFixed(1) : "";
  };
  const H = { height: "8.5mm" };
  return (
    <div>
      <TitleBox>「창업성공패키지 {t.school}」 사업비 사용실적보고서</TitleBox>
      <div style={{ fontSize: "11.5pt", fontWeight: 700, margin: "0 0 1mm" }}>1. 사업화 과제</div>
      <table className="gt gx" style={{ fontSize: "10.5pt" }}><tbody>
        <tr style={H}>
          <th style={{ width: "20%" }}>{t.founder}명</th><td style={{ width: "30%", textAlign: "center" }}>{info.trainee || p.ceo}</td>
          <th style={{ width: "16%" }}>기 업 명</th><td style={{ textAlign: "center" }}>{p.company}</td>
        </tr>
        <tr style={H}><th>창업과제</th><td colSpan={3} style={{ textAlign: "center" }}>{info.taskName}</td></tr>
        <tr style={H}><th>사업기간</th><td colSpan={3} style={{ textAlign: "center" }}>{kdate(info.periodFrom, "20    .    .    .")} ~ {kdate(info.periodTo, "20    .    .    .")}</td></tr>
        <tr style={{ height: "7mm" }}>
          <th>사업비(원)</th>
          <td colSpan={3} style={{ padding: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
              <tr style={{ height: "7mm" }}>
                {["총사업비", "정부지원금", `${t.founder}부담금(현금)`, "현물", "계"].map(h => (
                  <th key={h} style={{ fontSize: "9pt", border: "0.3mm solid #000", background: "#efefef" }}>{h}</th>
                ))}
              </tr>
              <tr style={{ height: "8mm" }}>
                {[gov + cash + inkind, gov, cash, inkind, gov + cash + inkind].map((x, i) => (
                  <td key={i} style={{ ...amt, border: "0.3mm solid #000" }}>{x ? money(x) : ""}</td>
                ))}
              </tr>
            </tbody></table>
          </td>
        </tr>
      </tbody></table>
      <div style={{ fontSize: "11.5pt", fontWeight: 700, margin: "4mm 0 1mm" }}>2. 사업비 세부 집행내역 <span style={{ float: "right", fontWeight: 400, fontSize: "9.5pt" }}>(단위 : 원)</span></div>
      <table className="gt gx"><tbody>
        <tr style={{ height: "6.5mm" }}>
          <th rowSpan={2} style={{ fontSize: "9.5pt", width: "16%" }}>비목</th>
          <th colSpan={2} style={{ fontSize: "9.5pt" }}>계획(a)</th><th colSpan={2} style={{ fontSize: "9.5pt" }}>집행(b)</th>
          <th colSpan={2} style={{ fontSize: "9.5pt" }}>잔액(a-b)</th><th rowSpan={2} style={{ fontSize: "9.5pt", width: "11%" }}>집행비율<br />(b/a)(%)</th>
        </tr>
        <tr style={{ height: "6mm" }}>{["현금", "현물", "현금", "현물", "현금", "현물"].map((h, i) => <th key={i} style={{ fontSize: "9pt" }}>{h}</th>)}</tr>
        {all.map(r => (
          <tr key={r.name} style={{ height: "7.5mm" }}>
            <th style={{ fontSize: "9.5pt" }}>{r.name}</th>
            <td style={amt}>{r.planCash ? money(r.planCash) : "0"}</td><td style={amt}>{r.planIn ? money(r.planIn) : "0"}</td>
            <td style={amt}>{r.useCash ? money(r.useCash) : "0"}</td><td style={amt}>{r.useIn ? money(r.useIn) : "0"}</td>
            <td style={amt}>{r.planCash || r.useCash ? money(r.planCash - r.useCash) : "0"}</td><td style={amt}>{r.planIn || r.useIn ? money(r.planIn - r.useIn) : "0"}</td>
            <td style={{ fontSize: "9.5pt", textAlign: "center" }}>{rate(r)}</td>
          </tr>
        ))}
        <tr style={{ height: "7.5mm" }}>
          <th style={{ fontSize: "9.5pt" }}>계</th>
          <td style={amt}>{money(tot.planCash)}</td><td style={amt}>{money(tot.planIn)}</td>
          <td style={amt}>{money(tot.useCash)}</td><td style={amt}>{money(tot.useIn)}</td>
          <td style={amt}>{money(tot.planCash - tot.useCash)}</td><td style={amt}>{money(tot.planIn - tot.useIn)}</td>
          <td style={{ fontSize: "9.5pt", textAlign: "center" }}>{rate(tot)}</td>
        </tr>
      </tbody></table>
      <p style={{ fontSize: "11pt", lineHeight: 2, margin: "6mm 0 0", textAlign: "justify" }}>
        &nbsp;{t.school} 운영사업 운영지침 및 사업비 관리기준 등에 의하여 사용한 사업비 사용내역을 위와 같이 보고합니다.
      </p>
      {(() => { const dp = dateParts(d.writeDate); return (
        <div style={{ marginTop: "6mm" }}>
          <p style={{ textAlign: "center", fontSize: "12pt", margin: "0 0 5mm" }}>20{(dp.y || "    ").slice(2)} 년 {dp.m || "  "} 월 {dp.d || "  "} 일</p>
          <p style={{ textAlign: "right", fontSize: "11.5pt", margin: "0 0 2mm", paddingRight: "8mm" }}>기   업   명 : {p.company}</p>
          <p style={{ textAlign: "right", fontSize: "11.5pt", margin: 0, paddingRight: "8mm" }}>{t.founder}(대표) : {p.ceo} <Stamp sign={sign} label="(직인)" /></p>
          <p style={{ fontSize: "13pt", fontWeight: 700, margin: "7mm 0 0" }}>중소벤처기업진흥공단 이사장 귀하</p>
        </div>
      ); })()}
    </div>
  );
}

// ── 21. 출장 결과보고서(딥테크) / 국내 출장 여비 신청서(글창사) ──
function S21({ v, p, d, photos, img, sign: _s }: SspProps) {
  const info = sspInfo(p, v);
  if (v === "gsa") {
    const rows: any[] = Array.isArray(d.tripRows) ? d.tripRows : [];
    const show = [...rows]; while (show.length < 8) show.push({});
    return (
      <div>
        <TitleBox>글로벌창업사관학교 {d.tripMonth || "    "}월분 국내 출장 여비 신청서</TitleBox>
        <table className="gt gx" style={{ fontSize: "10.5pt" }}><tbody>
          <tr style={{ height: "8mm" }}>
            <th style={{ width: "20%" }}>팀    명</th><td style={{ width: "30%", textAlign: "center" }}>{d.teamName || p.company}</td>
            <th style={{ width: "20%" }}>대 표 자</th><td style={{ textAlign: "center" }}>{p.ceo}</td>
          </tr>
        </tbody></table>
        <table className="gt gx" style={{ marginTop: "2mm" }}><tbody>
          <tr style={{ height: "7.5mm" }}>
            <th style={{ fontSize: "10pt", width: "18%" }}>날짜</th><th style={{ fontSize: "10pt" }}>프로그램명</th><th style={{ fontSize: "10pt", width: "30%" }}>프로그램 주관 기관</th>
          </tr>
          {show.map((r: any, i: number) => (
            <tr key={i} style={{ height: "9mm" }}>
              <td style={{ fontSize: "10pt", textAlign: "center" }}>{r.date || ""}</td>
              <td style={{ fontSize: "10pt", paddingLeft: "2mm" }}>{r.program || ""}</td>
              <td style={{ fontSize: "10pt", textAlign: "center" }}>{r.host || ""}</td>
            </tr>
          ))}
        </tbody></table>
        <p style={{ fontSize: "10.5pt", fontWeight: 700, marginTop: "4mm" }}>위 내용이 사실이 아닌경우에는 출장비는 전액 환수 처리 될수 있음</p>
      </div>
    );
  }
  return (
    <div>
      <TitleBox>【 출장결과보고서 】</TitleBox>
      <div style={{ fontSize: "11pt", fontWeight: 700, margin: "0 0 1mm" }}>□ 대상자</div>
      <table className="gt gx" style={{ fontSize: "10.5pt" }}><tbody>
        <tr style={{ height: "8mm" }}>
          <th style={{ width: "18%" }}>입교자명</th><td style={{ width: "32%", textAlign: "center" }}>{info.trainee || p.ceo}</td>
          <th style={{ width: "16%" }}>업체명</th><td style={{ textAlign: "center" }}>{p.company}</td>
        </tr>
        <tr style={{ height: "8mm" }}><th>과제명</th><td colSpan={3} style={{ textAlign: "center" }}>{info.taskName}</td></tr>
      </tbody></table>
      <div style={{ fontSize: "11pt", fontWeight: 700, margin: "4mm 0 1mm" }}>□ 출장개요</div>
      <table className="gt gx" style={{ fontSize: "10.5pt" }}><tbody>
        <tr style={{ height: "8mm" }}><th style={{ width: "18%" }}>출장일시</th><td colSpan={3} style={{ paddingLeft: "2mm" }}>· {d.tripWhen || ""}</td></tr>
        <tr style={{ height: "8mm" }}>
          <th>출장지</th><td style={{ width: "38%", paddingLeft: "2mm" }}>· {d.tripPlace || ""}</td>
          <th style={{ width: "14%" }}>출장거리</th><td style={{ paddingLeft: "2mm" }}>( {d.tripKm || "    "} ) km <span style={{ fontSize: "8.5pt" }}>* 사관학교부터 거리</span></td>
        </tr>
        <tr><th style={{ height: "12mm" }}>출장목적</th><td colSpan={3} style={body}>· {d.tripGoal || ""}</td></tr>
        <tr><th style={{ height: "12mm" }}>출장대상</th><td colSpan={3} style={body}>· {d.tripTarget || ""} <span className="gph">{d.tripTarget ? "" : "* 미팅 진행 회사, 미팅 참석자 등"}</span></td></tr>
      </tbody></table>
      <div style={{ fontSize: "11pt", fontWeight: 700, margin: "4mm 0 1mm" }}>□ 출장결과</div>
      <table className="gt gx"><tbody>
        <tr><td style={{ ...body, height: "56mm" }}>{d.tripResult}</td></tr>
      </tbody></table>
      <div style={{ fontSize: "11pt", fontWeight: 700, margin: "4mm 0 1mm" }}>□ 증빙자료</div>
      <table className="gt gx"><tbody>
        <tr>
          <td style={{ width: "50%", height: "52mm", textAlign: "center", verticalAlign: "middle" }}>
            {photos[0] && img(photos[0].path) ? <img src={img(photos[0].path)} alt="" style={{ maxWidth: "100%", maxHeight: "48mm", objectFit: "contain" }} /> : null}
          </td>
          <td style={{ height: "52mm", textAlign: "center", verticalAlign: "middle" }}>
            {photos[1] && img(photos[1].path) ? <img src={img(photos[1].path)} alt="" style={{ maxWidth: "100%", maxHeight: "48mm", objectFit: "contain" }} /> : null}
          </td>
        </tr>
      </tbody></table>
    </div>
  );
}

// ── 평가. 월간 활동보고서 — 비목별 당월/누적 집행을 건 목록에서 자동 집계 ──
function S22({ v, p, d, settleDocs }: SspProps) {
  const t = sspTerm(v);
  const info = sspInfo(p, v);
  const budgets = (p.budgetsBy?.[v] || {}) as Record<string, string>;
  const ym = String(d.month || "").slice(0, 7); // YYYY-MM
  const docs = settleDocs || [];
  const dateOf = (r: { data: Record<string, any>; created_at?: string }) => String(r.data?.writeDate || r.created_at || "").slice(0, 7);
  const amountOf = (r: { data: Record<string, any> }) => {
    const dd = r.data || {}; // docAmount와 동일 순서 (grantforms.docAmount 재사용 대신 순환 의존 없이 단순 재계산)
    const rowSum = (rows: any) => Array.isArray(rows) ? rows.reduce((s: number, x: any) => s + num(x?.sum ?? x?.amount), 0) : 0;
    return num(dd.payAmount) || num(dd.total) || (num(dd.unitPrice) * num(dd.qty)) || num(dd.svcAmount) || rowSum(dd.buyRows) || rowSum(dd.pcRows) || num(dd.useAmount);
  };
  const acts: Record<string, string> = d.mmActs || {};
  const rows = SSP_ITEMS.map(it => {
    const mine = docs.filter(r => (r.expense_item || "") === it);
    const cur = mine.filter(r => ym && dateOf(r) === ym).reduce((s, r) => s + amountOf(r), 0);
    const cum = mine.filter(r => !ym || dateOf(r) <= ym).reduce((s, r) => s + amountOf(r), 0);
    const budget = num(budgets[it]);
    return { it, cur, cum, budget, rate: budget ? Math.round(cum / budget * 100) : 0 };
  });
  const tot = rows.reduce((a, r) => ({ cur: a.cur + r.cur, cum: a.cum + r.cum, budget: a.budget + r.budget }), { cur: 0, cum: 0, budget: 0 });
  const amt: React.CSSProperties = { fontSize: "9.5pt", textAlign: "right", paddingRight: "1.5mm" };
  const perf: Record<string, any> = d.mmPerf || {};
  const ROW_LABEL: Record<string, string> = { 재료비: "재  료  비", 외주용역비: "외주용역비", 기계장치: "기 계 장 치", 인건비: "인  건  비", 지급수수료: "지급수수료" };
  return (
    <div>
      <TitleBox>{ym ? `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월` : "2026년 00월"} 창업활동보고서</TitleBox>
      <div style={{ fontSize: "11.5pt", fontWeight: 700, margin: "0 0 1mm" }}>1. 업체현황</div>
      <table className="gt gx" style={{ fontSize: "10.5pt" }}><tbody>
        <tr style={{ height: "8mm" }}>
          <th style={{ width: "18%" }}>대표자명</th><td style={{ width: "32%", textAlign: "center" }}>{p.ceo}</td>
          <th style={{ width: "16%" }}>업 체 명</th><td style={{ textAlign: "center" }}>{p.company}</td>
        </tr>
        <tr style={{ height: "8mm" }}><th>과 제 명</th><td colSpan={3} style={{ textAlign: "center" }}>{info.taskName}</td></tr>
        <tr><th style={{ height: "13mm" }}>과제개요</th><td colSpan={3} style={body}>{info.taskOutline}</td></tr>
      </tbody></table>
      <div style={{ fontSize: "11.5pt", fontWeight: 700, margin: "4mm 0 1mm" }}>2. 주요 활동(요약) <span style={{ float: "right", fontWeight: 400, fontSize: "9.5pt" }}>(단위 : 원)</span></div>
      <table className="gt gx"><tbody>
        <tr style={{ height: "7mm" }}>
          <th style={{ fontSize: "9.5pt", width: "14%" }}>비  목</th><th style={{ fontSize: "9.5pt" }}>활동 내용</th>
          <th style={{ fontSize: "9.5pt", width: "14%" }}>당월집행액</th><th style={{ fontSize: "9.5pt", width: "14%" }}>누적집행액</th>
          <th style={{ fontSize: "9.5pt", width: "14%" }}>사업비예산</th><th style={{ fontSize: "9.5pt", width: "10%" }}>집행율(%)</th>
        </tr>
        {rows.map(r => (
          <tr key={r.it} style={{ height: "9mm" }}>
            <th style={{ fontSize: "9.5pt" }}>{ROW_LABEL[r.it] || r.it}</th>
            <td style={{ fontSize: "9pt", paddingLeft: "1.5mm", whiteSpace: "pre-wrap" }}>{acts[r.it] || ""}</td>
            <td style={amt}>{r.cur ? money(r.cur) : ""}</td><td style={amt}>{r.cum ? money(r.cum) : ""}</td>
            <td style={amt}>{r.budget ? money(r.budget) : ""}</td>
            <td style={{ fontSize: "9.5pt", textAlign: "center" }}>{r.budget ? r.rate : ""}</td>
          </tr>
        ))}
        <tr style={{ height: "7.5mm" }}>
          <th colSpan={2} style={{ fontSize: "9.5pt" }}>합 계</th>
          <td style={amt}>{tot.cur ? money(tot.cur) : ""}</td><td style={amt}>{tot.cum ? money(tot.cum) : ""}</td>
          <td style={amt}>{tot.budget ? money(tot.budget) : ""}</td>
          <td style={{ fontSize: "9.5pt", textAlign: "center" }}>{tot.budget ? Math.round(tot.cum / tot.budget * 100) : ""}</td>
        </tr>
      </tbody></table>
      <div style={{ fontSize: "11.5pt", fontWeight: 700, margin: "4mm 0 1mm" }}>3. 주요 경영성과(요약)</div>
      <table className="gt gx"><tbody>
        <tr style={{ height: "8mm" }}>
          <th style={{ fontSize: "9.5pt", width: "16%" }}>구분</th><th style={{ fontSize: "9.5pt" }}>목표 (졸업시점)</th>
          <th style={{ fontSize: "9.5pt" }}>당월 (실적)</th><th style={{ fontSize: "9.5pt" }}>누계{v === "gsa" ? " (입교이후)" : " (25년 1월~당월)"}</th>
          <th style={{ fontSize: "9.5pt", width: "16%" }}>목표 (누적) 달성율(%)</th>
        </tr>
        <tr style={{ height: "8.5mm" }}>
          <th style={{ fontSize: "9.5pt" }}>매출액(천원)</th>
          <td style={amt}>{perf.salesGoal ? `${money(perf.salesGoal)} 천원` : "천원"}</td>
          <td style={amt}>{perf.salesMon ? `${money(perf.salesMon)} 천원` : "천원"}</td>
          <td style={amt}>{perf.salesCum ? `${money(perf.salesCum)} 천원` : "천원"}</td>
          <td style={{ fontSize: "9.5pt", textAlign: "center" }}>{num(perf.salesGoal) ? Math.round(num(perf.salesCum) / num(perf.salesGoal) * 100) + "%" : "%"}</td>
        </tr>
        <tr style={{ height: "8.5mm" }}>
          <th style={{ fontSize: "9.5pt" }}>인력채용(명)</th>
          <td style={{ ...amt, textAlign: "center" }}>{perf.hireGoal ? `${perf.hireGoal} 명` : "명"}</td>
          <td style={{ ...amt, textAlign: "center" }}>{perf.hireMon ? `${perf.hireMon} 명` : "명"}</td>
          <td style={{ ...amt, textAlign: "center" }}>{perf.hireCum ? `${perf.hireCum} 명` : "명"}</td>
          <td style={{ fontSize: "9.5pt", textAlign: "center" }}>{num(perf.hireGoal) ? Math.round(num(perf.hireCum) / num(perf.hireGoal) * 100) + "%" : "%"}</td>
        </tr>
        <tr>
          <th style={{ fontSize: "9.5pt", height: "22mm" }}>지식재산권(건)</th>
          <td style={{ ...body, fontSize: "8.5pt" }}>{perf.ipGoal || "- 특허출원: 0건\n- 특허등록: 0건\n- 실용실안: 0건\n- 상표등록: 0건\n- 기    타: 0건"}</td>
          <td style={{ ...body, fontSize: "8.5pt" }}>{perf.ipMon || ""}</td>
          <td style={{ ...body, fontSize: "8.5pt" }}>{perf.ipCum || ""}</td>
          <td style={{ ...body, fontSize: "8.5pt" }}>{perf.ipRate || ""}</td>
        </tr>
        <tr>
          <th style={{ fontSize: "9pt", height: "14mm" }}>기타 경영성과<br /><span style={{ fontWeight: 400, fontSize: "8pt" }}>(투자유치, 수상실적, 언론홍보 등)</span></th>
          <td colSpan={4} style={{ ...body, fontSize: "9pt" }}>{d.mmEtc || "-"}</td>
        </tr>
      </tbody></table>
      <div style={{ fontSize: "11.5pt", fontWeight: 700, margin: "4mm 0 1mm" }}>4. 주요 경영성과 (세부내용)</div>
      <table className="gt gx"><tbody>
        <tr style={{ height: "7mm" }}><th style={{ fontSize: "9.5pt", width: "20%" }}>구 분</th><th style={{ fontSize: "9.5pt" }}>세부 내용</th></tr>
        <tr><th style={{ fontSize: "9.5pt", height: "30mm" }}>사업과제<br />추진현황</th><td style={body}>
          {d.mmProgress || <span className="gph">- 해당 월 진행된 주요 성과 내용을 기록{"\n"}- 필요 시 도표, 그림, 사진 등 추가{"\n"}- 주요 경영성과(세부내용)는 2페이지 이내로 작성</span>}
        </td></tr>
        <tr><th style={{ fontSize: "9.5pt", height: "14mm" }}>코칭사항</th><td style={body}>{d.mmCoach}</td></tr>
        <tr><th style={{ fontSize: "9.5pt", height: "14mm" }}>교육사항</th><td style={body}>{d.mmEdu}</td></tr>
        <tr><th style={{ fontSize: "9.5pt", height: "14mm" }}>기타사항</th><td style={body}>{d.mmMisc}</td></tr>
      </tbody></table>
      <p style={{ textAlign: "center", fontSize: "11.5pt", margin: "5mm 0 0" }}>상기와 같이 {t.school} 창업활동보고서를 제출합니다.</p>
    </div>
  );
}

// ── 청렴수행 이행서약서 (위탁기관용 — 딥테크 전용) ──
function S23({ v, d }: SspProps) {
  const t = sspTerm(v);
  const li: React.CSSProperties = { fontSize: "11pt", lineHeight: 1.95, margin: "0 0 3mm", textAlign: "justify" };
  return (
    <div>
      <TitleBox>청렴수행 이행서약서(위탁기관)</TitleBox>
      <p style={{ fontSize: "12pt", fontWeight: 700, margin: "0 0 5mm" }}>중소벤처기업진흥공단 이사장 귀하</p>
      <p style={li}>
        &nbsp;&nbsp;&nbsp;당사 임직원과 대리인은 정부의 부패방지 및 청렴 활동 취지에 적극 호응하여, “2026년 창업성공패키지 지원사업” 위탁기관 참여와 관련,
        해당 법령 및 규정 등에 정해진 절차 및 기준에 따라 공정한 사업추진이 되도록 협조하겠으며,
      </p>
      <p style={li}>&nbsp;◦ 당사(기관)는 {t.school} 입교기업과의 계약 체결 및 이행, 사업수행 과정 일체에서 직․간접적으로 금품․향응 제공, 사업비를 부당하게 이용하거나 유용하는 일체의 부정행위를 하지 않겠습니다.</p>
      <p style={li}>&nbsp;◦ 당사(기관)는 위탁기관 등록 및 사업 수행과 관련하여 공정한 직무수행을 방해하는 일체의 알선․청탁, 특정 정보의 부당 제공요구 및 수수 행위를 하지 않겠습니다.</p>
      <p style={li}>&nbsp;◦ 당사(기관)의 부적절한 행위나 사업비 집행관련 부정 정황 등이 의심될 경우, 중소벤처기업진흥공단의 위탁기관 자격 정지 조치 및 관련 조사(자료제출, 현장실사 등) 요구에 성실히 협조하겠습니다.</p>
      <p style={li}>&nbsp;◦ 상기 서약 내용을 위반하거나 부적절한 행위가 적발될 경우, 본 서약에 근거하여 위탁기관 등록 해제(취소) 및 참여 제한 등의 제재 조치를 감수하겠으며, 이에 대하여 민·형사상 어떠한 이의도 제기하지 않겠습니다.</p>
      <p style={{ textAlign: "center", fontSize: "12pt", margin: "10mm 0 8mm" }}>{(() => { const dp = dateParts(d.writeDate); return `${dp.y || "2026"}. ${dp.m ? String(dp.m).padStart(2, "0") : "    "}. ${dp.d ? String(dp.d).padStart(2, "0") : "    "}.`; })()}</p>
      <div style={{ fontSize: "11.5pt", lineHeight: 2.4, paddingLeft: "20mm" }}>
        서 약 자 :<br />
        기업명 : {d.vdName || "                    "} (인)<br />
        대표자 : {d.vdCeo || "                    "} (인)
      </div>
    </div>
  );
}

// ── 근로소득 원천징수 및 임금수준 진단결과 제출양식 (딥테크 전용) ──
function S24({ d }: SspProps) {
  const li: React.CSSProperties = { fontSize: "10pt", lineHeight: 1.8, margin: "0 0 2mm", textAlign: "justify", whiteSpace: "pre-wrap" };
  const H = { height: "16mm" };
  return (
    <div>
      <TitleBox>과제참여 인건비 산정 가이드라인</TitleBox>
      <p style={li}><b> 1) 인건비는 전년도 근로소득기준(최근 3년간 근로소득 원천징수 확인서)으로 계상</b>{"\n"}
        &nbsp;&nbsp;- “최근 3년”은 26년 1기 입교생 기준으로 23년, 24년, 25년을 의미하며, 23년부터 25년까지의 기간을 말합니다.{"\n"}
        &nbsp;&nbsp;&nbsp;*1년 기간 중 6개월 초과하여 소득이 있는 경우에만 연간 근로소득으로 인정함{"\n"}
        &nbsp;&nbsp;&nbsp;&nbsp;ex1) 23년 6개월만 일한 경우 23년 근로소득 인정되지 않아 3년간 근로소득 불인정{"\n"}
        &nbsp;&nbsp;&nbsp;&nbsp;ex2) 25년 8개월 일한 경우 (8개월 소득/8)×12로 계산하여 전년도 근로소득 인정{"\n"}
        &nbsp;&nbsp;- 26년 기준으로 전년도는 25년을 의미합니다. 따라서 최근 3년간 근로소득 인정 시 25년 근로소득 원천징수 확인서로 인건비를 산정하시면 됩니다.{"\n"}
        &nbsp;&nbsp;☞ 전년도 근로소득기준 인정되지 않거나 최저임금보다 낮은 경우 2)로 이동</p>
      <p style={li}><b> 2) 최근 3년 이내 근로소득이 없는 경우</b> 법정최저 급여와 임금근로시간 정보시스템(http://www.wagework.go.kr)의 사업체 규모별·산업별·직업별 평균 연봉기준으로 인건비 산정{"\n"}
        &nbsp;&nbsp;- 26년 법정 최저 연봉 25,882,560원(고용노동부) [하한] &nbsp;*법정 최저 연봉 = 정액급여 + 상여금 포함, 성과급 미포함{"\n"}
        &nbsp;&nbsp;- 임금직업포털(wagework.go.kr) → 임금정보 → 맞춤형 임금정보 → 사업체 규모별(입교기업 규모)·산업별(입교기업 업종)·직업별(대상 직무) → 임금수준 결과에서 확인되는 평균연봉 [상한]{"\n"}
        &nbsp;&nbsp;&nbsp;* 사업체 규모별 선택 시 입교기업 근로자 수 5인 미만일 경우에도 ‘5~29인’ 선택{"\n"}
        &nbsp;&nbsp;- [하한] ~ [상한] 기준 내의 근로계약상 임금을 인건비로 신청하여 지급</p>
      <table className="gt gx" style={{ marginTop: "3mm" }}><tbody>
        <tr style={H}><th style={{ fontSize: "10pt", width: "18%" }}>양식1</th><td style={body}><b>23년 근로소득 원천징수</b><br />{d.wage23 || "(2023년 근로소득 원천징수 첨부, 홈택스 발급 불가능한 경우 공란)"}</td></tr>
        <tr style={H}><th style={{ fontSize: "10pt" }}>양식2</th><td style={body}><b>24년 근로소득 원천징수</b><br />{d.wage24 || "(2024년 근로소득 원천징수 첨부, 홈택스 발급 불가능한 경우 공란)"}</td></tr>
        <tr style={H}><th style={{ fontSize: "10pt" }}>양식3</th><td style={body}><b>25년 근로소득 원천징수</b><br />{d.wage25 || "(2025년 근로소득 원천징수 첨부, 홈택스 발급 불가능한 경우 공란)"}</td></tr>
        <tr style={H}><th style={{ fontSize: "10pt" }}>양식4</th><td style={body}><b>임금수준 진단결과</b><br />{d.wageDiag || "(1) 전년도 근로소득기준 인정되는 경우 첨부하지 않아도 됨. 단, 인정되지 않거나 확인이 어려운 경우 임금수준 진단결과 첨부)"}</td></tr>
      </tbody></table>
      <p style={{ fontSize: "9.5pt", margin: "2mm 0 0" }}>담당자 검토 후 보완이 필요한 경우 추가자료 요청할 수 있음.</p>
      <table className="gt gx" style={{ marginTop: "3mm" }}><tbody>
        <tr style={{ height: "13mm" }}><th style={{ fontSize: "10pt", width: "18%" }}>붙임1</th><td style={{ ...body, fontSize: "9.5pt" }}>
          근로소득 원천징수 발급 및 확인 — 홈택스 – 나의 홈택스 – 소득·연말정산 – 지급명세서·원천징수영수증 내역<br />
          (홈택스에서 발급 불가능한 경우 근로소득 인정되지 않음) / 근로소득 원천징수상 근무기간, 근로소득(급여+상여)
        </td></tr>
        <tr style={{ height: "13mm" }}><th style={{ fontSize: "10pt" }}>붙임2</th><td style={{ ...body, fontSize: "9.5pt" }}>
          임금수준 진단결과 확인 방법 — 사업체규모별(입교기업 근로자 수/5인 미만도 5~29인 선택)·산업별(입교기업 업종)·직업별(대상 직무)<br />
          임금수준 진단결과(사업체규모별, 산업별, 직업별 및 임금평균)
        </td></tr>
      </tbody></table>
    </div>
  );
}

export default function GrantFormSSP2({ form, ...props }: SspProps & { form: SspFormKey }) {
  switch (form) {
    case "s12": return <S12 {...props} />;
    case "s13": return <S13 {...props} />;
    case "s14": return <S14 {...props} />;
    case "s15": return <S15 {...props} />;
    case "s16": return <S15 {...props} task />;
    case "s17": return <S17 {...props} />;
    case "s19": return <S19 {...props} />;
    case "s20": return <S20 {...props} />;
    case "s21": return <S21 {...props} />;
    case "s22": return <S22 {...props} />;
    case "s23": return <S23 {...props} />;
    case "s24": return <S24 {...props} />;
    default: return null;
  }
}
