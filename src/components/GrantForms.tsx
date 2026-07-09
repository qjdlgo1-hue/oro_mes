// 창업중심대학사업 서식 12종 — 업로드된 HWP 원문 문구를 그대로 재현한 인쇄용(A4) 템플릿.
// 데이터는 GrantDocs.tsx의 건(d=data)·회사 프로필(p)·사진(photos)에서 채워진다.
import { GrantPhoto, GrantProfile } from "../lib/db";
import { FormKey, money, dateParts, shortDate, korShortDate } from "../lib/grantforms";

type P = {
  p: GrantProfile;
  d: Record<string, any>;
  photos: GrantPhoto[];
  img: (path: string) => string | undefined;
};

const B = ({ on }: { on: boolean }) => <span style={{ fontFamily: "sans-serif" }}>{on ? "■" : "□"}</span>;

// 공통 서명부: "2026년 월 일 / 기업명: / 대표자: (인) / 성균관대학교 창업지원단장 귀하"
function SignOff({ p, d, short }: { p: GrantProfile; d: Record<string, any>; short?: boolean }) {
  const dp = dateParts(d.writeDate);
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ textAlign: "center", margin: "18px 0" }}>
        {short ? shortDate(d.writeDate) : `${dp.y || "2026"}년  ${dp.m || "  "}월  ${dp.d || "  "}일`}
      </div>
      <div style={{ maxWidth: 330, marginLeft: "auto", display: "grid", gap: 6, fontSize: 14 }}>
        <div>기업명 : <b>{p.company || ""}</b></div>
        <div>대표자 : <b>{p.ceo || ""}</b> <span style={{ marginLeft: 20 }}>(인)</span></div>
      </div>
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 16, marginTop: 26 }}>성균관대학교 창업지원단장 귀하</div>
    </div>
  );
}

function PhotoGrid({ photos, img, cols = 2 }: { photos: GrantPhoto[]; img: P["img"]; cols?: number }) {
  if (!photos.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8, marginTop: 6 }}>
      {photos.map((ph, i) => (
        <div key={i} style={{ border: "1px solid #999", padding: 4, textAlign: "center" }}>
          {img(ph.path) ? <img src={img(ph.path)} alt="" style={{ maxWidth: "100%", maxHeight: 220, objectFit: "contain" }} /> : <div style={{ height: 120 }} />}
          {(ph.name || ph.qty) && <div style={{ fontSize: 11, marginTop: 2 }}>{ph.name}{ph.qty ? ` (수량: ${ph.qty})` : ""}</div>}
        </div>
      ))}
    </div>
  );
}

// f1. 사업비 지급요청서
function F1({ p, d }: P) {
  const ITEMS = ["재료비", "외주용역비", "기계장치비", "특허권 등 무형자산취득비", "인건비", "지급수수료", "여비", "교육훈련비", "광고선전비"];
  return (
    <div>
      <h2 className="gtitle">「2026년 창업중심대학사업」 창업기업 사업비 지급요청서</h2>
      <div className="gsec">□ 창업기업 정보</div>
      <table className="gt"><tbody>
        <tr><th style={{ width: "28%" }}>창 업 기 업 명</th><td>{p.company}</td></tr>
        <tr><th>과 제 명</th><td>{p.project}</td></tr>
      </tbody></table>
      <div className="gsec">□ 수령인 정보</div>
      <table className="gt"><tbody>
        <tr><th style={{ width: "28%" }}>기 업 명</th><td>{p.company}</td><th style={{ width: "18%" }}>대 표 자</th><td>{p.ceo}</td></tr>
        <tr><th>은 행 명</th><td>{p.bank}</td><th>예 금 주</th><td>{p.holder}</td></tr>
        <tr><th>계 좌 번 호</th><td colSpan={3}>{p.account}</td></tr>
      </tbody></table>
      <div className="gsec">□ 지급액 및 사유</div>
      <table className="gt"><tbody>
        <tr>
          <th style={{ width: "18%" }}>지급액</th><td style={{ width: "27%" }}>{money(d.payAmount)}원</td>
          <th style={{ width: "18%" }}>지출 항목</th>
          <td style={{ fontSize: 12, lineHeight: 1.9 }}>
            {ITEMS.map(it => <span key={it} style={{ whiteSpace: "nowrap", marginRight: 10 }}><B on={d.expenseItem === it} /> {it}</span>)}
          </td>
        </tr>
        <tr>
          <th>지급 사유</th>
          <td colSpan={3}>
            <div style={{ minHeight: 70, whiteSpace: "pre-wrap" }}>{d.payReason}</div>
            <div style={{ fontSize: 11, color: "#333" }}>※ 인건비의 경우 청구 인원(개인)별 월 급여, 참여율 기재 필수</div>
          </td>
        </tr>
      </tbody></table>
      <p style={{ fontSize: 12, margin: "10px 0 0" }}>* 별첨 : [별표 4] 창업기업 사업비 집행 증빙서류에 따른 지출항목별 증빙서류</p>
      <p style={{ marginTop: 22, textAlign: "center" }}>「2026년도 창업중심대학사업」과 관련하여 상기와 같이 사업비 지급을 요청하오니 지급하여 주시기 바랍니다.</p>
      <SignOff p={p} d={d} />
    </div>
  );
}

// f2. 과업지시서
function F2({ d }: P) {
  return (
    <div>
      <h2 className="gtitle">과업지시서</h2>
      <table className="gt"><tbody>
        <tr><th style={{ width: "30%" }}>1. 용역의 명칭</th><td>{d.svcName}</td></tr>
        <tr><th>2. 용역금액</th><td>{money(d.svcAmount)}원 (VAT별도)</td></tr>
        <tr><th>3. 용역기간</th><td>{shortDate(d.svcFrom)} ~ {shortDate(d.svcTo)}</td></tr>
        <tr><th>4. 용역절차</th><td style={{ whiteSpace: "pre-wrap" }}>{d.svcProc}</td></tr>
        <tr><th style={{ height: 300, verticalAlign: "top", paddingTop: 8 }}>5. 용역세부내용<br /><span style={{ fontWeight: 400, fontSize: 11 }}>(도면 등 예상결과물 첨부)</span></th>
          <td style={{ verticalAlign: "top", whiteSpace: "pre-wrap" }}>{d.svcDetail}</td></tr>
      </tbody></table>
    </div>
  );
}

// f3/f4. 검수조서 (①기본 / ②증빙사진)
function Inspect({ p, d, photos, img, withPhotos }: P & { withPhotos: boolean }) {
  return (
    <div>
      <h2 className="gtitle">검수조서</h2>
      <table className="gt"><tbody>
        <tr><th style={{ width: "30%" }}>1. 장비(물품)명</th><td>{d.itemName}</td></tr>
        <tr><th>2. 납품업체 명</th><td>{d.vendor}</td></tr>
        <tr><th>3. 납품일자</th><td>{korShortDate(d.deliverDate)}</td></tr>
        <tr>
          <th style={{ verticalAlign: "top", paddingTop: 8 }}>4. 세부사항<br /><span style={{ fontWeight: 400, fontSize: 12 }}>(증빙사진)</span></th>
          <td>
            {withPhotos && photos.length > 0 && (
              <table className="gt" style={{ margin: "0 0 8px" }}>
                <thead><tr><th style={{ width: "34%" }}>품명</th><th style={{ width: "16%" }}>수량</th><th>사진</th></tr></thead>
                <tbody>{photos.map((ph, i) => (
                  <tr key={i}>
                    <td>{ph.name || d.itemName}</td><td style={{ textAlign: "center" }}>{ph.qty || ""}</td>
                    <td style={{ textAlign: "center", padding: 4 }}>{img(ph.path) ? <img src={img(ph.path)} alt="" style={{ maxWidth: "100%", maxHeight: 200, objectFit: "contain" }} /> : null}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            <div style={{ textAlign: "center", padding: "6px 0" }}>물품의 정상 수령여부 및 상태 확인</div>
          </td>
        </tr>
        <tr><th>5. 검수확인자</th><td>{d.inspector || p.ceo}</td></tr>
      </tbody></table>
      <p style={{ marginTop: 22, textAlign: "center" }}>상기와 같이 주문물품을 정상적으로 수령 및 확인하였음</p>
      <SignOff p={p} d={d} short />
    </div>
  );
}

// f5. 기자재(기계장치/재료) 활용계획서
function F5({ p, d }: P) {
  const total = money(d.total) || (money(d.unitPrice) && d.qty ? "" : "");
  return (
    <div>
      <h2 className="gtitle">기자재(기계장치/재료) 활용계획서</h2>
      <table className="gt"><tbody>
        <tr><th style={{ width: "26%" }}>품  명</th><td colSpan={3}>{d.itemName}</td></tr>
        <tr><th>구매예정처 및 수량</th><th style={{ width: "20%", fontWeight: 400 }}>구매예정처</th><td>{d.vendor}</td><td style={{ width: "22%" }}><b>수량</b>  {d.qty}</td></tr>
        <tr><th>금  액</th><td colSpan={2}>단가 : {money(d.unitPrice)} (원) x {d.qty || "  "} (개)</td><td>합계 : {money(d.total) || total} (원)</td></tr>
      </tbody></table>
      <div className="gsec" style={{ textAlign: "center", border: "1px solid #000", borderBottom: "none", padding: "6px 0", marginTop: 16 }}>활  용  계  획  안</div>
      <table className="gt" style={{ marginTop: 0 }}><tbody>
        <tr>
          <th style={{ width: "26%", verticalAlign: "top", paddingTop: 8 }}>용  도 및 기  능</th>
          <td style={{ minHeight: 280, height: 280, verticalAlign: "top", whiteSpace: "pre-wrap" }}>{d.usagePlan || <span style={{ color: "#888", fontSize: 12 }}>과제 연관성 관련 내용 상세 기술</span>}</td>
        </tr>
      </tbody></table>
      <SignOff p={p} d={d} short />
    </div>
  );
}

// f6. 외주용역 (최종)결과보고서
function F6({ p, d, photos, img }: P) {
  return (
    <div>
      <h2 className="gtitle">외주용역 (최종)결과보고서</h2>
      <table className="gt"><tbody>
        <tr><th style={{ width: "32%" }}>1. 용역의 명칭</th><td>{d.svcName}</td></tr>
        <tr><th>2. 용역대상 업체 명</th><td>{d.svcVendor}</td></tr>
        <tr><th>3. 용역기간</th><td>{shortDate(d.svcFrom)} ~ {shortDate(d.svcTo)}</td></tr>
        <tr><th>4. 용역 총 금액</th><td>{money(d.svcAmount)} (원) (VAT별도)</td></tr>
        <tr><th>5. 잔금 금액(해당 시)</th><td>{money(d.svcBalance)}{d.svcBalance ? " (원) (VAT별도)" : ""}</td></tr>
        <tr><th>6. 잔금지급일</th><td>{d.svcBalanceDate ? `${shortDate(d.svcBalanceDate)}(예정)` : ""}</td></tr>
        <tr>
          <th style={{ verticalAlign: "top", paddingTop: 8 }}>7. 용역진행결과<br />
            <span style={{ fontWeight: 400, fontSize: 11 }}>(단계별 혹은 일자별로 나누어 용역기간동안의 진행상황을 기술하고, 최종적으로 개발된 디자인이나 해당 시제품의 사진 등을 첨부)</span></th>
          <td style={{ verticalAlign: "top" }}>
            <div style={{ minHeight: 160, whiteSpace: "pre-wrap" }}>{d.svcResult}</div>
            <PhotoGrid photos={photos} img={img} />
          </td>
        </tr>
        <tr>
          <th style={{ verticalAlign: "top", paddingTop: 8 }}>8. 차후 진행예정사항<br />
            <span style={{ fontWeight: 400, fontSize: 11 }}>(완성된 시제품이 개발단계의 일부일 경우, 잔여개발계획 등을 기재)</span></th>
          <td style={{ minHeight: 60, verticalAlign: "top", whiteSpace: "pre-wrap" }}>{d.svcNext}</td>
        </tr>
      </tbody></table>
      <p style={{ marginTop: 20, textAlign: "center" }}>본인은 2026년 창업중심대학사업 창업사업화지원 내 외주용역 건에 대한 최종결과를 상기와 같이 보고합니다.</p>
      <SignOff p={p} d={d} short />
    </div>
  );
}

// f7. 사유서(확인서)
function F7({ p, d }: P) {
  return (
    <div>
      <h2 className="gtitle">사유서(확인서)</h2>
      <table className="gt"><tbody>
        <tr><th style={{ width: "20%" }}>대 표 자</th><td>{p.ceo}</td><th style={{ width: "20%" }}>기 업 명</th><td>{p.company}</td></tr>
        <tr><th>과 제 명</th><td colSpan={3}>{p.project}</td></tr>
        <tr><td colSpan={4} style={{ height: 420, verticalAlign: "top", whiteSpace: "pre-wrap", padding: 10 }}>{d.reasonText}</td></tr>
      </tbody></table>
      <p style={{ marginTop: 18, textAlign: "center" }}>상기 서술내용과 관련하여 추후 분쟁이 발생할 경우, 모든 책임은 본인(창업기업)에게 있음을 확인합니다.</p>
      <SignOff p={p} d={d} />
    </div>
  );
}

// f8. 학회(전시회/박람회) 참가 보고서
function F8({ p, d, photos, img }: P) {
  return (
    <div>
      <h2 className="gtitle">「2026년 창업중심대학사업」 학회(전시회/박람회) 참가 보고서</h2>
      <table className="gt"><tbody>
        <tr><th style={{ width: "22%" }}>행 사 명</th><td>{d.evtName}</td></tr>
        <tr><th>일    시</th><td>{d.evtDate ? `${dateParts(d.evtDate).y}년 ${dateParts(d.evtDate).m}월 ${dateParts(d.evtDate).d}일` : "2026년    월    일"}</td></tr>
        <tr><th>장    소</th><td>{d.evtPlace}</td></tr>
        <tr>
          <th style={{ verticalAlign: "top", paddingTop: 8 }}>주요 내용</th>
          <td style={{ height: 300, verticalAlign: "top", whiteSpace: "pre-wrap" }}>{d.evtContent}</td>
        </tr>
      </tbody></table>
      <p style={{ marginTop: 20, textAlign: "center" }}>본인은 2026년 창업중심대학사업 창업사업화지원 학회(전시회/박람회) 참가 관련하여 상기와 같이 보고서를 제출합니다.</p>
      <SignOff p={p} d={d} short />
      <div style={{ marginTop: 16, fontSize: 13 }}>[첨 부] 참가사진 (필수)</div>
      <PhotoGrid photos={photos} img={img} />
    </div>
  );
}

// f9. 현물납부확인서
function F9({ p, d }: P) {
  const rows: { cat: string; detail: string; amount: string; calc: string; note: string }[] =
    Array.isArray(d.ik) && d.ik.length ? d.ik : [{ cat: "", detail: "", amount: "", calc: "", note: "" }];
  const checks: Record<string, boolean> = d.ikChecks || {};
  const sum = rows.reduce((s, r) => s + (Number(String(r.amount).replace(/[^\d.-]/g, "")) || 0), 0);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
        <span>【양식 제1호】창업중심대학 창업기업 현물납부확인서</span><span>[창업기업용]</span>
      </div>
      <h2 className="gtitle" style={{ marginTop: 10 }}>창업중심대학 창업기업 현물납부확인서</h2>
      <table className="gt"><tbody>
        <tr><th style={{ width: "24%" }}>창업중심대학명</th><td>성균관대학교</td><th style={{ width: "18%" }}>과제번호</th><td>{p.projectNo}</td></tr>
        <tr><th>창업기업명</th><td>{p.company}</td><th>대표자명</th><td>{p.ceo}</td></tr>
        <tr><th>현물 항목</th><td colSpan={3}>
          <B on={!!checks.labor} /> 인건비  <B on={!!checks.equip} /> 기자재  <B on={!!checks.mat} /> 재료  <B on={!!checks.space} /> 공간
        </td></tr>
      </tbody></table>
      <div className="gsec">□ 현물 납부 내역</div>
      <table className="gt">
        <thead><tr><th style={{ width: "14%" }}>항목</th><th style={{ width: "20%" }}>세부항목</th><th style={{ width: "17%" }}>현물환산액</th><th>산출내역</th><th style={{ width: "12%" }}>비고</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}><td>{r.cat}</td><td>{r.detail}</td><td style={{ textAlign: "right" }}>{money(r.amount)}{r.amount ? "천원" : ""}</td><td style={{ fontSize: 12 }}>{r.calc}</td><td>{r.note}</td></tr>
          ))}
          <tr><th>소계</th><td></td><td style={{ textAlign: "right", fontWeight: 700 }}>{sum ? money(sum) + "천원" : ""}</td><td></td><td></td></tr>
        </tbody>
      </table>
      <div className="gsec">□ 증빙 서류 (각 1부씩)</div>
      <table className="gt" style={{ fontSize: 11 }}><tbody>
        <tr><th style={{ width: "14%" }} rowSpan={2}>인건비</th><th style={{ width: "16%" }}>법인 사업자</th>
          <td>- 근로계약서(또는 급여대장, 급여명세서)  - 전년도 근로소득 원천징수영수증(최근 3년간 근로소득 원천징수확인서)  - 원천징수이행상황신고서</td></tr>
        <tr><th>개인 사업자</th>
          <td>- (사업소득자) 전년도 소득금액증명원  - (근로소득자) 전년도 근로소득 원천징수영수증(최근 3년간 근로소득 원천징수확인서)  - (최저임금 미만 계상 시) 최저임금표  - (상기 외 경우) 가입자 건강장기요양보험료 납부 확인서(월별)</td></tr>
        <tr><th>기자재</th><td colSpan={2}>구입ㆍ보유 증빙서류(세금계산서, 거래명세서, 기기 및 물품관리대장, 사진 등)</td></tr>
        <tr><th>재료</th><td colSpan={2}>구입ㆍ보유 증빙서류(세금계산서, 거래명세서, 기기 및 물품관리대장, 사진 등)</td></tr>
        <tr><th>공간</th><td colSpan={2}>임대차 계약서(날인포함) 사본 또는 공인감정가액(공시지가, 씨리얼)의 확인 가능 서류</td></tr>
      </tbody></table>
      <p style={{ fontSize: 10.5, margin: "6px 0" }}>※ 인건비 계상 범위는 최근 3년의 기간 중, 본인이 선택한 연도를 기준으로 해당 연도에 받은 인건비를 현물로 계상 가능 ※ 최근 3년 동안 인건비를 받은 적이 없는 대표자 또는 소속직원의 경우, 직전년도 최저임금표를 기준으로 해당 연도 1년에 대한 인건비를 계상할 수 있음</p>
      <p style={{ marginTop: 14, textAlign: "center" }}>위와 같이 「2026년 창업중심대학사업」 현물 납부 내역을 확인합니다.</p>
      <SignOff p={p} d={d} />
    </div>
  );
}

// f10. 자산관리번호 라벨(스티커 그리드)
function F10({ p, d }: P) {
  const count = Math.max(1, Math.min(30, Number(d.labelCount) || 10));
  const label = (
    <table className="gt glabel"><tbody>
      <tr><th>자산관리번호</th><td>{d.assetNo}</td></tr>
      <tr><th>품          명</th><td>{d.itemName}</td></tr>
      <tr><th>취    득    일</th><td>{d.acquireDate ? shortDate(d.acquireDate) : ""}</td></tr>
      <tr><th>관 리 책 임 자</th><td>{d.manager || p.manager || p.ceo}</td></tr>
      <tr><td colSpan={2} style={{ textAlign: "center", fontWeight: 700 }}>{p.company || "(기업명)"}</td></tr>
    </tbody></table>
  );
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {Array.from({ length: count }, (_, i) => <div key={i}>{label}</div>)}
      </div>
    </div>
  );
}

// f11. 선금 각서 3종
function F11({ p, d }: P) {
  const from = shortDate(d.svcFrom), to = shortDate(d.svcTo);
  const addr = d.address || p.address || "";
  const corp = d.corpNo || p.corpNo || "";
  const parts: React.ReactNode[] = [];
  if (d.advA !== false) parts.push(
    <div key="a" className="gpage">
      <h2 className="gtitle">선 금 지 급 각 서</h2>
      <table className="gt"><tbody>
        <tr><th style={{ width: "26%" }}>용  역  명</th><td>{d.svcName}</td></tr>
        <tr><th>계 약 금 액</th><td>{money(d.svcAmount)}{d.svcAmount ? "원" : ""}</td></tr>
        <tr><th>선  금  액</th><td>{money(d.advAmount)}{d.advAmount ? "원" : ""}</td></tr>
      </tbody></table>
      <p style={{ marginTop: 20, lineHeight: 1.9, textIndent: 10 }}>
        위 용역의 계약과 관련하여 선금을 지급받음에 있어, 선금의 반납을 보장하는 증권 또는 보증서의 제출을 면제 받았는 바, 반환사유가 발생하는 때에는 선금잔액을 현금으로 납부할 것을 확약합니다.
        만약 귀 기관에서 정하는 때 까지 납부하지 못하는 경우에는 국가를 당사자로 하는 계약에 관한 법률 제15조 제3항, 동시행령 제54조 제1항의 규정을 준용한 귀원의 귀속조치에 일체의 이의를 제기하지 않을 것임을 확약합니다.
      </p>
      <div style={{ textAlign: "center", margin: "20px 0" }}>{shortDate(d.writeDate).replace(/^(\d\d)/, "20$1")}</div>
      <div style={{ maxWidth: 380, marginLeft: "auto", display: "grid", gap: 6, fontSize: 14 }}>
        <div>주        소: {addr}</div>
        <div>기   관   명: {p.company}</div>
        <div>법인등록번호: {corp}</div>
        <div>대   표   자: {p.ceo} <span style={{ marginLeft: 16 }}>(인)</span></div>
      </div>
      <div style={{ textAlign: "center", fontWeight: 700, marginTop: 24 }}>성균관대학교 창업지원단장 귀하</div>
    </div>
  );
  if (d.advB) parts.push(
    <div key="b" className="gpage">
      <h2 className="gtitle">선 금 지 급 각 서</h2>
      <div style={{ display: "grid", gap: 8, fontSize: 14, margin: "16px 0" }}>
        <div>■ 계  약  명 : {d.svcName}</div>
        <div>■ 총계약금액 : {money(d.svcAmount)} 원 (VAT 별도)</div>
        <div>■ 선금신청액 : {money(d.advAmount)} 원 (VAT 별도)</div>
        <div>■ 계 약 기 간 : {from} ~ {to}</div>
      </div>
      <p style={{ marginTop: 14, lineHeight: 1.9, textIndent: 10 }}>
        위탁사업수행과 관련하여 지급받은 선급금은 위탁개발 목적 외 타 용도로는 절대 사용치 않을 것이며, 만일 본인의 귀책사유 또는 귀사의 사정에 의하여 선급금 전액에 관한 반환사유가 발생한 경우 귀사의 반환요구가 있을 시 즉시 반환 조치함은 물론 선급금의 정산에 이의가 없음을 각서로서 제출합니다.
      </p>
      <div style={{ textAlign: "center", margin: "20px 0" }}>{(() => { const q = dateParts(d.writeDate); return `${q.y || "2026"}년  ${q.m || "00"}월  ${q.d || "00"}일`; })()}</div>
      <div style={{ maxWidth: 380, marginLeft: "auto", display: "grid", gap: 6, fontSize: 14 }}>
        <div>주        소: {addr}</div>
        <div>업   체   명: {p.company}</div>
        <div>대   표   자: {p.ceo} <span style={{ marginLeft: 16 }}>(인)</span></div>
      </div>
      <div style={{ textAlign: "center", fontWeight: 700, marginTop: 24 }}>성균관대학교 창업지원단장 귀하</div>
    </div>
  );
  if (d.advC) parts.push(
    <div key="c" className="gpage">
      <h2 className="gtitle">선 금 사 용 각 서</h2>
      <div style={{ display: "grid", gap: 8, fontSize: 14, margin: "16px 0" }}>
        <div>1. 과  제  명 : {p.project}</div>
        <div>2. 계 약 기 간 : {from} ~ {to}</div>
        <div>3. 계 약 금 액 : {money(d.svcAmount)}원 (VAT 별도)</div>
        <div>4. 선  금  액 : {money(d.advAmount)}원 (VAT 별도)</div>
      </div>
      <p style={{ marginTop: 14, lineHeight: 1.9, textIndent: 10 }}>
        위 계약 건명에 대한 선금을 지급 받아 사용함에 있어 본 계약 목적 외 사용하지 않음을 각서로서 제출합니다.
      </p>
      <SignOff p={p} d={d} />
    </div>
  );
  return <>{parts}</>;
}

// f12. 사업비(일반용역비) 관련 규정 확인서
function F12({ p, d }: P) {
  return (
    <div>
      <h2 className="gtitle">「2026년 창업중심대학사업」 창업기업 사업비(일반용역비) 관련 규정 확인서</h2>
      <p style={{ fontSize: 11.5, margin: "4px 0 12px" }}>※ 일반용역비는 외주용역비와 용역계약을 체결하여 추진하는 광고선전비에 한함</p>
      <div className="gsec">□ 규정 확인사항</div>
      <table className="gt" style={{ fontSize: 12 }}>
        <thead><tr><th>주요내용</th><th style={{ width: "16%" }}>확인여부</th></tr></thead>
        <tbody>
          <tr><td style={{ lineHeight: 1.7 }}>
            다음 각 호의 어느 하나에 해당하는 업체와 계약을 체결하거나 사업비를 집행할 수 없다. (통합관리지침 제38조 제②항)<br />
            &nbsp;1. 시제품과 유사한 제품에 대한 제작 경험이 없는 업체<br />
            &nbsp;2. 외주용역 과업과 사업자등록증 상 업태·업종의 연관성이 없는 업체<br />
            &nbsp;3. 당해연도 동일사업에 참여한 창업기업등 ※ 동일 사업 : 2026년 지역기반, 대학발, 실험실특화형<br />
            &nbsp;4. 창업기업등의 대표자가 현재 재직 중이거나 사업 참여 전 재직하였던 기업
          </td><td style={{ textAlign: "center" }}>확인 완료</td></tr>
          <tr><td>광고 선전을 위해 외주용역을 진행하는 경우, 제38조(외주용역비)를 준용한다. (통합관리지침 제38조 제②항)</td><td style={{ textAlign: "center" }}>확인 완료</td></tr>
          <tr><td>일반용역비(외주용역비 및 광고선전비)를 사용하기 전 거래업체에 당해년도 ‘창업중심대학사업’ 수혜 여부(협약체결)를 확인하셨습니까?</td><td style={{ textAlign: "center" }}>확인 완료</td></tr>
        </tbody>
      </table>
      <div className="gsec">□ 거래기업 정보</div>
      <table className="gt"><tbody>
        <tr><th style={{ width: "22%" }}>거래기업명</th><td>{d.vName}</td><th style={{ width: "18%" }}>대표자명</th><td>{d.vCeo}</td></tr>
        <tr>
          <th>사업자번호</th><td>{d.vBizno}<span style={{ marginLeft: 12, fontSize: 12 }}>( <B on={d.vType === "개인"} /> 개인  <B on={d.vType === "법인"} /> 법인 )</span></td>
          <th>업종</th><td style={{ fontSize: 12 }}>(업태) {d.vSector}<br />(종목) {d.vCategory}</td>
        </tr>
      </tbody></table>
      <div className="gsec">□ 용역거래 내용</div>
      <table className="gt"><tbody>
        <tr><th style={{ width: "22%" }}>집행항목</th><td colSpan={3}>
          <B on={d.execItem !== "광고선전비"} /> 외주용역비(일반용역비)&nbsp;&nbsp;&nbsp;<B on={d.execItem === "광고선전비"} /> 광고선전비(일반용역비)
        </td></tr>
        <tr><th>과업내용</th><td colSpan={3} style={{ minHeight: 60, whiteSpace: "pre-wrap" }}>{d.taskDesc || d.svcDetail}</td></tr>
        <tr><th>계약금액</th>
          <td>(공급가액) {money(d.supply) || money(d.svcAmount)} 원</td>
          <td colSpan={2}>(부가세) {money(d.vat)} 원</td></tr>
      </tbody></table>
      <p style={{ marginTop: 16, lineHeight: 1.8, fontSize: 13, textIndent: 8 }}>
        본인은 통합관리지침 제38조(외주용역비) 제②항 및 광고선전비의 규정을 확인하고 외주용역비 및 광고선전비를 사용하고자 거래기업의 동일사업 수혜여부를 검토하고, 이후 이와 관련하여 발생하는 문제에 대해 적극적으로 소명 및 책임(환수, 제재 등)을 다 할 것을 확인합니다.
      </p>
      <p style={{ fontSize: 11.5 }}>※ 본 규정확인서는 일반용역비(외주용역비, 광고선전비) 집행 시 필수 제출</p>
      <SignOff p={p} d={d} />
    </div>
  );
}

// 서식 렌더 진입점
export default function GrantForm({ form, ...props }: P & { form: FormKey }) {
  switch (form) {
    case "f1": return <F1 {...props} />;
    case "f2": return <F2 {...props} />;
    case "f3": return <Inspect {...props} withPhotos={false} />;
    case "f4": return <Inspect {...props} withPhotos={true} />;
    case "f5": return <F5 {...props} />;
    case "f6": return <F6 {...props} />;
    case "f7": return <F7 {...props} />;
    case "f8": return <F8 {...props} />;
    case "f9": return <F9 {...props} />;
    case "f10": return <F10 {...props} />;
    case "f11": return <F11 {...props} />;
    case "f12": return <F12 {...props} />;
    default: return null;
  }
}
