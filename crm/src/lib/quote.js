// ---------------------------------------------------------------------------
// 견적 계산 + 견적서 엑셀 생성
// 엑셀 '국내' 시트의 계산식을 그대로 옮김:
//   재료비 = Ni자재 + PGC사용량×PGC평균가 + AgCN사용량×AgCN평균가 + 기타(고정)
//   공정비용(원/g) = 재료비 ÷ 수율(g)
//   판가(구간 i) = 공정비용 ÷ (1 − (마진율 − 1.1%p×i)) 를 100원 단위 올림
//   구간: 0.5KG / 1KG / 3KG / 5KG (수량이 클수록 마진 1.1%p씩 낮춤)
// ---------------------------------------------------------------------------

export const TIER_LABELS = ["0.5KG", "1KG", "3KG", "5KG"];
export const TIER_STEP = 0.011; // 구간당 마진 감소폭 (엑셀 헤더의 '할인률 1.10%')

export function calcItem(item, pgcPrice, agcnPrice, globalEtc) {
  // 사급 = Ni 자재를 고객이 지급 → Ni 재료비 미적용 (값이 있어도 0으로 계산)
  const isSagup = (item.gubun || "").trim() === "사급";
  const niCost = isSagup ? 0 : (Number(item.material_ni) || 0);
  // 재료비(PGC) = PGC 투입량×PGC평균가 + AgCN 투입량×AgCN평균가 (귀금속 투입액 합)
  const pgcCost =
    (Number(item.pgc_grams) || 0) * (Number(pgcPrice) || 0) +
    (Number(item.agcn_grams) || 0) * (Number(agcnPrice) || 0);
  // 재료비(기타) = 기준 정보에서 입력한 값을 모든 품목에 동일 적용 (전 품목 공통, 전역값)
  const etcCost = Number(globalEtc) || 0;
  const total = niCost + pgcCost + etcCost;
  const yieldG = Number(item.yield_grams) || 50;
  const cost = yieldG > 0 ? total / yieldG : 0; // 공정비용(원/g)
  const margin = Number(item.margin_rate) || 0;
  const tiers = TIER_LABELS.map((_, i) => {
    const m = Math.max(0, margin - TIER_STEP * i);
    if (cost <= 0 || m >= 1) return 0;
    return Math.ceil(cost / (1 - m) / 100) * 100;
  });
  return { isSagup, niCost, pgcCost, etcCost, total, cost, tiers };
}

// 판가와 공정비용으로 실제 마진율 계산
export function marginOf(price, cost) {
  const p = Number(price) || 0;
  return p > 0 ? (p - cost) / p : 0;
}

const won = (n) => (Number(n) || 0).toLocaleString("ko-KR");

// 고객 전달용 견적서 엑셀 생성 + 다운로드 (원가·마진 정보는 절대 포함하지 않음)
export async function downloadQuoteXlsx({ companyName, ym, pgcPrice, agcnPrice, rows }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("견적서", { pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 } });

  const NAVY = "FF0A1F3D";
  const LINE = "FFD7DDE2";
  const thin = { style: "thin", color: { argb: LINE } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  ws.columns = [
    { width: 5 },   // No
    { width: 8 },   // 구분
    { width: 22 },  // 모델명
    { width: 34 },  // 사양
    { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, // 단가 4구간
    { width: 16 },  // 비고
  ];

  // 제목
  ws.mergeCells("A1:I1");
  const title = ws.getCell("A1");
  title.value = "견   적   서";
  title.font = { size: 20, bold: true, color: { argb: NAVY } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 34;

  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();

  // 수신/공급자
  ws.getCell("A3").value = `수  신 : ${companyName} 귀중`;
  ws.getCell("A3").font = { size: 12, bold: true };
  ws.getCell("A4").value = `견적일자 : ${dateStr}`;
  ws.getCell("A5").value = `유효기간 : ${ym}-${String(lastDay).padStart(2, "0")} 까지`;
  ws.getCell("G3").value = "공급자 : 오알오 주식회사 (ORO Co., Ltd.)";
  ws.getCell("G3").font = { size: 12, bold: true };
  ws.getCell("G4").value = "담당 : 이동욱 대표";

  ws.getCell("A7").value = `※ ${ym} 기준 — PGC 평균가 ₩${won(pgcPrice)}/g${agcnPrice ? `, AgCN(청화은) 평균가 ₩${won(agcnPrice)}/g` : ""} 적용`;
  ws.getCell("A7").font = { size: 10, color: { argb: "FF66717D" } };

  // 표 머리글 (2줄: 단가 그룹)
  const h1 = 9, h2 = 10;
  ws.mergeCells(`A${h1}:A${h2}`); ws.getCell(`A${h1}`).value = "No";
  ws.mergeCells(`B${h1}:B${h2}`); ws.getCell(`B${h1}`).value = "구분";
  ws.mergeCells(`C${h1}:C${h2}`); ws.getCell(`C${h1}`).value = "모델명";
  ws.mergeCells(`D${h1}:D${h2}`); ws.getCell(`D${h1}`).value = "사양";
  ws.mergeCells(`E${h1}:H${h1}`); ws.getCell(`E${h1}`).value = "단가 (원/g, VAT 별도)";
  TIER_LABELS.forEach((t, i) => { ws.getCell(h2, 5 + i).value = t; });
  ws.mergeCells(`I${h1}:I${h2}`); ws.getCell(`I${h1}`).value = "비고";
  for (const rowIdx of [h1, h2]) {
    for (let c = 1; c <= 9; c++) {
      const cell = ws.getCell(rowIdx, c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      cell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 10 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = border;
    }
  }

  // 품목 행
  rows.forEach((r, i) => {
    const rowIdx = h2 + 1 + i;
    const vals = [i + 1, r.gubun || "", r.model, r.spec || "", ...r.prices, r.note || ""];
    vals.forEach((v, c) => {
      const cell = ws.getCell(rowIdx, c + 1);
      cell.value = v;
      cell.border = border;
      cell.font = { size: 10 };
      if (c >= 4 && c <= 7) {
        cell.numFmt = "#,##0";
        cell.alignment = { horizontal: "right" };
      } else if (c === 0 || c === 1) {
        cell.alignment = { horizontal: "center" };
      }
    });
    if (i % 2 === 1) {
      for (let c = 1; c <= 9; c++) {
        ws.getCell(rowIdx, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F6F8" } };
      }
    }
  });

  // 하단 특기사항
  const f = h2 + rows.length + 2;
  ws.getCell(`A${f}`).value = "특기사항";
  ws.getCell(`A${f}`).font = { bold: true, size: 10 };
  const notes = [
    "1. 상기 단가는 부가세(VAT) 별도 금액입니다.",
    `2. 본 견적은 ${ym} PGC 평균가 기준이며, 귀금속 시세 변동 시 재협의될 수 있습니다.`,
    "3. 납기는 발주 후 협의하며, 기타 문의는 담당자에게 연락 바랍니다.",
  ];
  notes.forEach((n, i) => {
    ws.getCell(f + 1 + i, 1).value = n;
    ws.getCell(f + 1 + i, 1).font = { size: 9, color: { argb: "FF66717D" } };
  });

  // 다운로드
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `견적서_${companyName}_${ym}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
