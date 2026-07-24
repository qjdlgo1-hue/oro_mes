// 지원사업 탭 — 서류 자동작성(GrantDocs)이 본체.
// 예전의 독립 '검수조서' 모드는 기술닥터 상용화 공고 안(TdInspect, 건 목록의 [🏛️ 검수조서])으로
// 이전됐다. 데이터(projects/inspections)는 그대로라 기존 검수조서가 그 안에서 계속 보인다.
import GrantDocs from "./GrantDocs";

export default function Support() {
  return <GrantDocs />;
}
