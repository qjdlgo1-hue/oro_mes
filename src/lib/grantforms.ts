// 지원사업 서식 레지스트리 — 공고(프로그램)별 서식 목록·지출항목(비목)·기본 서식 매핑·증빙 가이드
// 서식 본문(문구)은 업로드된 HWP/HWPX 원문에서 추출한 그대로 GrantForms(.TD).tsx에 재현됨.

// ===== 공고(프로그램) =====
export type ProgramKey = "cud" | "td" | "ysc" | "gsa";
export const PROGRAMS: { key: ProgramKey; name: string; short: string; org: string }[] = [
  { key: "cud", name: "2026년 창업중심대학사업", short: "창업중심대학", org: "성균관대학교 창업지원단장" },
  { key: "td", name: "2026년 기술닥터사업 상용화지원", short: "기술닥터 상용화", org: "(재)경기테크노파크 원장" },
  { key: "ysc", name: "2026년 청년창업사관학교(딥테크) 1기", short: "딥테크 1기", org: "중소벤처기업진흥공단 이사장" },
  { key: "gsa", name: "2026년 글로벌창업사관학교", short: "글창사", org: "중소벤처기업진흥공단 이사장" },
];

export type FormKey = "f1" | "f2" | "f3" | "f4" | "f5" | "f6" | "f7" | "f8" | "f9" | "f10" | "f11" | "f12";

// 폼 입력 섹션: 선택된 서식이 요구하는 섹션만 편집 화면에 표시
export type FieldSection = "purchase" | "service" | "event" | "reason" | "inkind" | "advance" | "vendor";

export const FORMS: { key: FormKey; no: string; title: string; sections: FieldSection[] }[] = [
  { key: "f1", no: "1", title: "사업비 지급요청서", sections: [] },
  { key: "f2", no: "2", title: "과업지시서", sections: ["service"] },
  { key: "f3", no: "3", title: "검수조서 ①(기본)", sections: ["purchase"] },
  { key: "f4", no: "4", title: "검수조서 ②(증빙사진)", sections: ["purchase"] },
  { key: "f5", no: "5", title: "기자재(기계장치/재료) 활용계획서", sections: ["purchase"] },
  { key: "f6", no: "6", title: "외주용역 (최종)결과보고서", sections: ["service"] },
  { key: "f7", no: "7", title: "사유서(확인서)", sections: ["reason"] },
  { key: "f8", no: "8", title: "학회(전시회/박람회) 참가 보고서", sections: ["event"] },
  { key: "f9", no: "9", title: "현물납부확인서", sections: ["inkind"] },
  { key: "f10", no: "10", title: "자산관리번호 라벨", sections: ["purchase"] },
  { key: "f11", no: "11", title: "선금 지급/사용 각서", sections: ["service", "advance"] },
  { key: "f12", no: "12", title: "일반용역비 규정 확인서", sections: ["service", "vendor"] },
];

// 지급요청서의 지출항목 9종 (서식 원문 순서 그대로)
export const EXPENSE_ITEMS = [
  "재료비", "외주용역비", "기계장치비", "특허권 등 무형자산취득비", "인건비",
  "지급수수료", "여비", "교육훈련비", "광고선전비",
] as const;

// 지출항목 → 기본 추천 서식 (사용자 확정 매핑이 오면 이 상수만 교체)
// f7(사유서)·f9(현물)·f11(선금)은 상황에 따라 수동 추가
export const FORM_PRESETS: Record<string, FormKey[]> = {
  "재료비": ["f1", "f4", "f5"],
  "외주용역비": ["f1", "f2", "f12", "f4", "f6"],
  "기계장치비": ["f1", "f4", "f5", "f10"],
  "특허권 등 무형자산취득비": ["f1"],
  "인건비": ["f1"],
  "지급수수료": ["f1"],
  "여비": ["f1", "f8"],
  "교육훈련비": ["f1", "f8"],
  "광고선전비": ["f1", "f12"],
};

// ===== 기술닥터사업 상용화지원 (경기테크노파크) =====
// 근거: 「기술닥터사업」 관리지침(2025.02.05) 제35·37·39조, 표준서식(2025.01.13)
export type TdFormKey = "t2" | "t4" | "t5" | "t6" | "t7" | "t8" | "t11" | "t11b";
export type TdFieldSection = "tdproj" | "tdbank" | "tdlog" | "tdledger" | "tdchange" | "tdreport";

export const TD_FORMS: { key: TdFormKey; no: string; title: string; sections: TdFieldSection[] }[] = [
  { key: "t2", no: "제2호", title: "협약체결·입금계좌 제출 공문", sections: ["tdproj", "tdbank"] },
  { key: "t4", no: "제4호", title: "상용화지원 결과보고서", sections: ["tdproj", "tdreport"] },
  { key: "t5", no: "제5호", title: "기술지원 일지", sections: ["tdproj", "tdlog"] },
  { key: "t6", no: "제6호", title: "사업비 사용실적 보고서", sections: ["tdproj"] },
  { key: "t7", no: "제7호", title: "사업비 사용 명세서", sections: ["tdproj", "tdledger"] },
  { key: "t8", no: "제8호", title: "비목별 사용 명세서", sections: ["tdproj", "tdledger"] },
  { key: "t11", no: "제11-1호", title: "협약변경 승인요청서", sections: ["tdproj", "tdchange"] },
  { key: "t11b", no: "제11-2호", title: "협약변경 보고", sections: ["tdproj", "tdchange"] },
];

// 비목(세목) — 관리지침 제35조② 사업비 비목별 계상기준 순서 그대로
export const TD_ITEMS = [
  "기술지원인력 수당", "참여연구인력 인건비",
  "(실험)재료비", "외주용역비", "시험분석·인증비", "홍보·마케팅비", "지식재산보호비", "이자",
] as const;
// 세목 → 상위 비목 (제7·8호 명세서의 구분)
export const TD_ITEM_GROUP: Record<string, "인건비" | "직접비" | "기타"> = {
  "기술지원인력 수당": "인건비", "참여연구인력 인건비": "인건비",
  "(실험)재료비": "직접비", "외주용역비": "직접비", "시험분석·인증비": "직접비",
  "홍보·마케팅비": "직접비", "지식재산보호비": "직접비", "이자": "기타",
};

// 세목 → 기본 서식 (정산 3종은 항상 세트, 집행 성격에 따라 추가)
export const TD_PRESETS: Record<string, TdFormKey[]> = {
  "기술지원인력 수당": ["t5", "t6", "t7", "t8"],
  "참여연구인력 인건비": ["t6", "t7", "t8"],
  "(실험)재료비": ["t6", "t7", "t8"],
  "외주용역비": ["t6", "t7", "t8"],
  "시험분석·인증비": ["t6", "t7", "t8"],
  "홍보·마케팅비": ["t6", "t7", "t8"],
  "지식재산보호비": ["t6", "t7", "t8"],
  "이자": ["t6", "t7", "t8"],
};

// 세목별 챙겨야 할 증빙서류·한도(관리지침 제35·39조 그대로)
export const TD_EVIDENCE: Record<string, { docs: string[]; limits: string[] }> = {
  "기술지원인력 수당": {
    docs: ["기술지원 일지 [제5호]", "이체확인증 (기술닥터 통장 입금, 세금 제외 후)", "원천징수영수증"],
    limits: ["1회 30만원 이내(세금 포함), 총 10회 이내", "반드시 기술닥터 1명 이상 참여"],
  },
  "참여연구인력 인건비": {
    docs: ["근로계약서", "4대보험 가입 증빙자료", "이체확인증(급여 이체)", "원천징수영수증"],
    limits: ["총 사업비의 15% 이내", "공고일 기준 신규 고용인력만 가능(기존 직원 편성 불가)", "급여총액×과제참여율 (기본급+내부규정 제수당, 4대보험 사측부담금 미포함)"],
  },
  "(실험)재료비": {
    docs: ["견적서", "거래명세표", "전자세금계산서(공급받는자 보관용 — 간이영수증 불인정)", "이체확인증(상대방 계좌번호 포함)", "거래처 사업자등록증", "상대통장사본", "물품증명사진·납품자료"],
    limits: ["시약·재료 구입비 등", "범용성/자산성 비용 편성 불가, 부가세·관세 등 제수수료 불가"],
  },
  "외주용역비": {
    docs: ["견적서", "거래명세표", "전자세금계산서(공급받는자 보관용)", "이체확인증", "거래처 사업자등록증", "상대통장사본", "결과물 증빙(사진·산출물)", "※ 공급가액 200만원 이상: 외주용역계약서(과업지시서 — 주문내역·설계도 등 포함) 필수"],
    limits: ["총 사업비의 60% 이내", "제품 디자인·PCB 설계·금형설계 등", "생산금형 제작 불가(시작금형까지만)"],
  },
  "시험분석·인증비": {
    docs: ["견적서", "전자세금계산서", "이체확인증", "시험분석 결과지·인증서 사본", "※ 민간기관 이용 시: 공공기관·대학 또는 타 국가공인기관 비교견적 1부 이상 필수"],
    limits: ["기관 선정 순위: ①기술닥터 협약기관 ②정부·지방 공공기관/대학/국가공인기관 ③민간기관(주관기관 사전승인 필요)", "산업/시장분석 등 마케팅성 비용·자체 시험분석비 제외"],
  },
  "홍보·마케팅비": {
    docs: ["견적서", "거래명세표", "전자세금계산서", "이체확인증", "결과물 증빙(홍보물 실물사진·게재 화면 등)"],
    limits: ["총 사업비의 15% 이내", "홍보물 제작·광고료·홈페이지 구축(최대 200만원)·행사장 임차료·전시회 참가비(참가비만, 출장비 불가)"],
  },
  "지식재산보호비": {
    docs: ["출원서 사본", "관납료·대리인수수료 영수증(세금계산서)", "이체확인증"],
    limits: ["총 6,000천원 이내 — 국내 건당 150만원 / 해외 건당 300만원", "과제 관련 지식재산권 출원비용·중간사건 대응 제비용"],
  },
  "이자": {
    docs: ["통장사본(이자 발생 내역 표시)"],
    limits: ["사업기간 중 발생한 수입이자 — 직접비에 한해 원금 산입 사용 가능"],
  },
};

// 정산 제출물 안내 (관리지침 제37조)
export const TD_SETTLE_DOCS = [
  "사업비 사용실적 보고서 1부 [제6호]", "사업비 사용 명세서 1부 [제7호]", "비목별 사용 명세서 1부 [제8호]",
  "비목별 관련 증빙서류 사본 각 1부 (우측 상단 일련번호, 명세서 순서로 편철)",
  "통장사본 1부 (표지 이면 + 개설일~제출일 전체 거래내역)",
  "협약변경 신청서류 일체 및 승인 내역 (해당 시)",
];

// ===== 창업성공패키지(중진공 창업사관학교) — ysc=청년창업사관학교 딥테크 1기 / gsa=글로벌창업사관학교 =====
// 근거: 업로드된 각종 서류양식 ZIP(2026) 원문. 두 변형은 용어("청년창업자"↔"창업자")와 일부 서식 유무만 다름.
export type SspProgramKey = "ysc" | "gsa";
export type SspFormKey =
  | "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "s7" | "s8" | "s9" | "s10" | "s10b" | "s11"
  | "s12" | "s13" | "s14" | "s15" | "s16" | "s17" | "s19" | "s20" | "s21" | "s22" | "s23" | "s24";
export type SspFieldSection =
  | "spplan" | "spbuy" | "spvendor" | "spoutsrc" | "spmold" | "sppc" | "spexpo" | "spir"
  | "spadvise" | "sptransfer" | "spadvance" | "splabor" | "spchange" | "spterm" | "sptrip" | "spmonthly" | "spsettle";

// only: 해당 공고에만 있는 서식 / noGsa·titleGsa: 글창사 원본의 번호·제목이 다른 경우
export const SSP_FORMS: { key: SspFormKey; no: string; title: string; sections: SspFieldSection[]; only?: SspProgramKey; noGsa?: string; titleGsa?: string }[] = [
  { key: "s1", no: "1", title: "사업비 집행계획서", sections: ["spplan"] },
  { key: "s2", no: "2", title: "구매▪계약 세부내역서", sections: ["spbuy"] },
  { key: "s3", no: "3", title: "위탁개발 계획서 (위탁업체 작성)", sections: ["spvendor", "spoutsrc"] },
  { key: "s4", no: "4", title: "사업비 사용내역서 (구매건)", sections: ["spbuy"] },
  { key: "s5", no: "5", title: "위탁기관 등록 신청서 (전자결재)", sections: ["spvendor"] },
  { key: "s6", no: "6", title: "위탁개발 계약서", sections: ["spvendor", "spoutsrc"] },
  { key: "s7", no: "7", title: "위탁개발 (중간)완료 보고서 (용역건)", sections: ["spvendor", "spoutsrc"] },
  { key: "s8", no: "8", title: "금형 견적서", sections: ["spvendor", "spmold"] },
  { key: "s9", no: "9", title: "전산장비 구매 세부내역서", sections: ["sppc"] },
  { key: "s10", no: "10", title: "전시회 참가 결과보고서", sections: ["spexpo"] },
  { key: "s10b", no: "10-1", title: "해외 IR대회 참가 결과보고서", sections: ["spir"], only: "ysc" },
  { key: "s11", no: "11", title: "자문 결과보고서", sections: ["spadvise"] },
  { key: "s12", no: "12", title: "사업비 권리의무 이전 확인서", sections: ["sptransfer"] },
  { key: "s13", no: "13", title: "위탁개발 계약 승계 약정서", sections: ["spvendor", "spoutsrc", "spchange"] },
  { key: "s14", no: "14", title: "선금(중도금) 지급 확약서", sections: ["spvendor", "spadvance"] },
  { key: "s15", no: "15", title: "업체정보 변경 승인 신청서 (전자결재)", sections: ["spchange"] },
  { key: "s16", no: "16", title: "사업화 과제 변경 승인 신청서 (전자결재)", sections: ["spchange"] },
  { key: "s17", no: "17", title: "위탁개발계약 해지사유서·해지확약서", sections: ["spvendor", "spoutsrc", "spterm"] },
  { key: "s19", no: "19", title: "인건비 지급 확약서", sections: ["splabor"] },
  { key: "s20", no: "20", noGsa: "21", title: "사업비 사용실적보고서 (회계감사용)", sections: ["spsettle"] },
  { key: "s21", no: "21", noGsa: "20", title: "출장 결과보고서", titleGsa: "국내 출장 여비 신청서", sections: ["sptrip"] },
  { key: "s22", no: "평가", title: "월간 활동보고서", sections: ["spmonthly"] },
  { key: "s23", no: "-", title: "청렴수행 이행서약서 (위탁기관)", sections: ["spvendor"], only: "ysc" },
  { key: "s24", no: "★", title: "근로소득 원천징수·임금수준 진단결과 제출양식", sections: ["splabor"], only: "ysc" },
];
export const sspFormsFor = (prog: SspProgramKey) => SSP_FORMS.filter(f => !f.only || f.only === prog);
export const sspFormNo = (f: { no: string; noGsa?: string }, prog: SspProgramKey) => (prog === "gsa" && f.noGsa) || f.no;
export const sspFormTitle = (f: { title: string; titleGsa?: string }, prog: SspProgramKey) => (prog === "gsa" && f.titleGsa) || f.title;

// 비목 5종 — 사업비 집행계획서(xlsx) 순서 그대로
export const SSP_ITEMS = ["재료비", "외주용역비", "기계장치", "인건비", "지급수수료"] as const;

// 비목 → 세목(+한도 문구·전용 서식) — 사업비 집행계획서(xlsx) 산출내역 비고 그대로.
// forms: 그 세목에 ZIP 원본 전용 서식이 있는 경우만 지정 — 없으면 일반 증빙(영수증류)으로 처리하는 세목.
export const SSP_SUBITEMS: Record<string, { name: string; note?: string; forms?: SspFormKey[] }[]> = {
  "재료비": [{ name: "재료비" }],
  "외주용역비": [
    { name: "개발기획비" }, { name: "제품제작비" }, { name: "시험설비제작비" },
    { name: "금형 생산비", forms: ["s2", "s3", "s6", "s7", "s8"] },
  ],
  "기계장치": [
    { name: "기자재구입비" },
    { name: "벤치마킹 제품 구매비", note: "최대 500만원 한도" },
    { name: "전산장비/통신장비 구매비", note: "최대 600만원 한도 — 신규고용 1명당 200만원 추가(최대 3인), 총 구매 1,200만원 한도", forms: ["s2", "s4", "s9"] },
  ],
  "인건비": [
    { name: "과제참여인력 인건비", note: "인건비 산정 시 공고문 참고(현물계상기준 준용), 타 인건비 지원사업 참여자 지급 불가" },
  ],
  "지급수수료": [
    { name: "기자재 사용료" }, { name: "전문기관 시험/인증비" }, { name: "지재권 출원비" },
    { name: "기술 및 경영자문비", note: "자문비용 30만원/1일", forms: ["s11"] },
    { name: "교육비" },
    { name: "기술서적 구입비", note: "단행본 구입만 허용(300만원 한도)" },
    { name: "세미나 및 학회 참가비", forms: ["s10"] },
    { name: "개별전시회 참가비", note: "정부/타 공공기관/지자체 등 비용지원 시 사업비 신청 불가", forms: ["s10"] },
    { name: "카탈로그 및 포장디자인 제작비" }, { name: "영상제작비" },
    { name: "홈페이지/온라인 쇼핑몰 제작비" }, { name: "온라인 쇼핑몰 입점비" },
    { name: "광고비" }, { name: "소비자반응조사비" },
    { name: "회계처리비", note: "졸업 시 사업비 회계감사 위해 최소 30만원 의무배정" },
    { name: "국내출장여비", note: "대표·직원 국내출장 시 지급 — 열차, 고속(시외)버스, 항공, 국내 숙박비 실비(한도)", forms: ["s21"] },
    { name: "해외출장여비", note: "대표·직원의 해외전시회 참가를 위한 왕복항공료 실비지급", forms: ["s21", "s10b"] },
    { name: "경영활동비", note: "출석일수 기준 1일 2만원 활동비(1일 3시간 이상 출석)" },
  ],
};

// 세목의 전용 서식 — 해당 공고에 없는 서식(only 불일치)은 제외. 전용 서식이 없는 세목은 빈 배열.
export function sspSubForms(item: string, sub: string, prog: SspProgramKey): SspFormKey[] {
  const forms = (SSP_SUBITEMS[item] || []).find(s => s.name === sub)?.forms || [];
  const avail = new Set(sspFormsFor(prog).map(f => f.key));
  return forms.filter(k => avail.has(k));
}

// 비목 → 기본 추천 서식
export const SSP_PRESETS: Record<string, SspFormKey[]> = {
  "재료비": ["s2", "s4"],
  "외주용역비": ["s2", "s3", "s6", "s7"],
  "기계장치": ["s2", "s4", "s9"],
  "인건비": ["s19"],
  "지급수수료": ["s11"],
};

// 비목별 챙길 서류·한도 — ZIP 원문(서식 본문·집행계획서 비고)에 있는 내용만 수록
export const SSP_EVIDENCE: Record<string, { docs: string[]; limits: string[] }> = {
  "재료비": {
    docs: ["구매▪계약 세부내역서 (구매) — 대표자가 직접 3page 내외 작성", "사업비 사용내역서 (구매건) — 세부내역·증빙 사진 포함"],
    limits: ["사업비 사용금액은 VAT 제외 기준으로 작성"],
  },
  "외주용역비": {
    docs: [
      "구매▪계약 세부내역서 (계약) + 별첨 위탁개발 계획서(위탁업체 작성)",
      "위탁기관 등록 신청서(전자결재) — 사업자등록증·원천징수이행상황신고서 등 첨부",
      "위탁개발 계약서 (3부 작성 — 창업자·위탁기관·중진공 각 1부)",
      "위탁개발 (중간)완료 보고서 — 별첨 보고서는 위탁업체 작성, 표지에 위탁업체 대표자 날인, 3page 내외",
      "※ 금형: 금형 견적서 + 시금형설계 도면(금형조립도·주요 금형부품도), 시금형개발은 시금형보관증 필수 첨부",
      "※ 선금(중도금) 수령 시: 선금(중도금) 지급 확약서",
    ],
    limits: ["세목: 개발기획비·제품제작비·시험설비제작비·금형 생산비", "잔금 지급 요청 시 위탁기관 작성 완료보고서 첨부"],
  },
  "기계장치": {
    docs: ["구매▪계약 세부내역서 (구매)", "사업비 사용내역서 (구매건)", "※ 전산장비: 전산장비 구매 세부내역서(구매일·모델·제조사·구입처·수량·금액·사용자/장소/용도)"],
    limits: ["벤치마킹 제품 구매비 최대 500만원", "전산장비/통신장비 최대 600만원(신규고용 1명당 200만원 추가·최대 3인, 총 1,200만원)"],
  },
  "인건비": {
    docs: ["인건비 지급 확약서 — 기업명·대표자·근로자 날인", "(딥테크) 근로소득 원천징수(최근 3년) 및 임금수준 진단결과 제출양식"],
    limits: [
      "전년도 근로소득기준(최근 3년간 원천징수 확인서)으로 계상 — 1년 중 6개월 초과 소득만 연간 근로소득 인정",
      "근로소득이 없으면 법정 최저 연봉(26년 25,882,560원)~임금직업포털 평균연봉 내에서 산정",
      "선지급 인건비 미지급 시 전액 중진공 반납",
    ],
  },
  "지급수수료": {
    docs: [
      "※ 자문: 자문 결과보고서 — 자문인 소속업체 계좌로 지급(개인계좌 불가), 자문인 별도 결과보고서 별첨",
      "※ 전시회: 전시회 참가 결과보고서 — 상담실적·증빙사진·상담업체 리스트",
      "※ 해외 IR(딥테크): 해외 IR대회 참가 결과보고서 — 피칭·부스·투자자 상담내역",
      "※ 출장: 출장 결과보고서(딥테크) / 국내 출장 여비 신청서(글창사)",
    ],
    limits: [
      "기술 및 경영자문비 30만원/1일", "기술서적 단행본만 300만원 한도", "개별전시회 참가비 — 타 기관 비용지원 시 신청 불가",
      "회계처리비 최소 30만원 의무배정", "국내출장여비 실비(열차·버스·항공·숙박 한도)", "해외출장여비 — 해외전시회 왕복항공료 실비", "경영활동비 1일 2만원(3시간 이상 출석)",
    ],
  },
};

export const money = (v: any): string => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return isFinite(n) && String(v ?? "").trim() !== "" ? n.toLocaleString("ko-KR") : "";
};

// 문자열 금액 → 숫자 (콤마·원 등 제거, 숫자 아니면 0)
export const num = (v: any): number => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : 0;
};

// 건 하나의 집행액: 지급요청서 지급액 → 합계 → 단가×수량 → 용역금액 → 원장(기술닥터 제8호) → 창업성공패키지 내역표 순으로 채택
export function docAmount(data: Record<string, any>): number {
  const ledger = Array.isArray(data?.ledger)
    ? data.ledger.reduce((s: number, r: any) => s + num(r?.amount), 0) + num(data?.tdTax) : 0;
  const rowSum = (rows: any) => Array.isArray(rows) ? rows.reduce((s: number, r: any) => s + num(r?.sum ?? r?.amount), 0) : 0;
  return num(data?.payAmount) || num(data?.total) || (calcTotal(data?.unitPrice, data?.qty) ?? 0) || num(data?.svcAmount)
    || ledger || rowSum(data?.buyRows) || rowSum(data?.pcRows) || num(data?.useAmount);
}

// 정산 현황: 지출항목별 건수·집행액 집계 (+예산이 있으면 잔액/집행률)
export type SettleLine = { item: string; count: number; amount: number; budget: number };
export function settleSummary(
  docs: { expense_item?: string; data: Record<string, any> }[],
  budgets: Record<string, any> = {},
  items: readonly string[] = EXPENSE_ITEMS, // 공고별 비목 순서 (cud=지출항목 9종, td=세목 8종)
): { lines: SettleLine[]; totalAmount: number; totalBudget: number } {
  const by = new Map<string, { count: number; amount: number }>();
  for (const d of docs) {
    const k = d.expense_item || "기타";
    const cur = by.get(k) || { count: 0, amount: 0 };
    cur.count++; cur.amount += docAmount(d.data || {});
    by.set(k, cur);
  }
  // 규정 순서(items) 우선, 예산만 있는 항목도 표시, 그 외는 뒤에
  const keys = [
    ...items.filter(i => by.has(i) || num(budgets[i]) > 0),
    ...[...by.keys()].filter(k => !items.includes(k)),
  ];
  const lines = keys.map(item => ({
    item,
    count: by.get(item)?.count || 0,
    amount: by.get(item)?.amount || 0,
    budget: num(budgets[item]),
  }));
  return {
    lines,
    totalAmount: lines.reduce((s, l) => s + l.amount, 0),
    totalBudget: lines.reduce((s, l) => s + l.budget, 0),
  };
}

// 단가 × 수량 = 합계 (숫자 아닌 입력은 빈 값)
export function calcTotal(unitPrice: any, qty: any): number | null {
  const u = Number(String(unitPrice ?? "").replace(/[^\d.-]/g, ""));
  const q = Number(String(qty ?? "").replace(/[^\d.-]/g, ""));
  if (!isFinite(u) || !isFinite(q) || u === 0 || q === 0) return null;
  return u * q;
}

// "2026-07-09" → {y:"2026", m:"7", d:"9"} / 빈 값은 공백 유지(인쇄 후 수기 기입 가능)
export function dateParts(iso?: string): { y: string; m: string; d: string } {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { y: "", m: "", d: "" };
  return { y: iso.slice(0, 4), m: String(Number(iso.slice(5, 7))), d: String(Number(iso.slice(8, 10))) };
}
// "26.  07.  09." 형식 (검수조서 등)
export function shortDate(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "26.    .    .";
  return `${iso.slice(2, 4)}. ${iso.slice(5, 7)}. ${iso.slice(8, 10)}.`;
}
// "26년 07월 09일" 형식 (검수조서 납품일자)
export function korShortDate(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "26년 00월 00일";
  return `${iso.slice(2, 4)}년 ${iso.slice(5, 7)}월 ${iso.slice(8, 10)}일`;
}
