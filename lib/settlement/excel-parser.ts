import * as XLSX from 'xlsx';
import { RevenueType, ExcelParseResult, ParsedRevenueRow } from '@/lib/types/settlement';

/**
 * 작품명 정규화: 부제 제거, 공백 제거, 끝 느낌표/물음표 제거
 * "캐슬2:만인지상" → "캐슬2"
 * "매지컬 급식:암살법사" → "매지컬급식"
 * "쇼미더럭키짱!" → "쇼미더럭키짱"
 */
export function normalizeWorkName(name: string): string {
  let normalized = name.trim();
  // 콜론 뒤 부제 제거
  const colonIdx = normalized.indexOf(':');
  if (colonIdx > 0) {
    normalized = normalized.substring(0, colonIdx);
  }
  // 공백 제거
  normalized = normalized.replace(/\s+/g, '');
  // 끝 느낌표/물음표 제거
  normalized = normalized.replace(/[!?！？]+$/, '');
  return normalized;
}

/**
 * 네이버 매출 엑셀 파일을 파싱하여 작품별 수익을 추출
 * Python aggregate_revenue.py 포팅
 */
export function parseRevenueExcel(
  buffer: Buffer,
  fileName: string,
  revenueType: RevenueType,
  month: string
): ExcelParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const errors: string[] = [];
  let rows: ParsedRevenueRow[] = [];
  const adjustments: ParsedRevenueRow[] = [];

  try {
    switch (revenueType) {
      case 'domestic_paid':
        rows = parseDomesticPaid(workbook, fileName, errors);
        break;
      case 'global_paid':
        rows = parseGlobalPaid(workbook, fileName, errors, adjustments);
        break;
      case 'domestic_ad':
        rows = parseDomesticAd(workbook, fileName, errors);
        break;
      case 'global_ad':
        rows = parseGlobalAd(workbook, fileName, errors);
        break;
      case 'secondary':
        rows = parseSecondary(workbook, fileName, errors);
        break;
      default:
        errors.push(`알 수 없는 수익 유형: ${revenueType}`);
    }
  } catch (e) {
    errors.push(`파싱 오류: ${e instanceof Error ? e.message : String(e)}`);
  }

  const total_amount = rows.reduce((sum, r) => sum + r.amount, 0);

  return {
    rows,
    total_amount,
    errors,
    ...(adjustments.length > 0 ? { adjustments } : {}),
  };
}

/**
 * 국내유료수익 파싱
 * 1순위: "정산내역서" 시트 → 헤더에서 "CP 정산액" 컬럼 동적 탐색 → "총 합계" 행 읽기
 * 2순위: "컨텐츠별 매출 통계" 시트 → "확정 합계" 또는 "더그림" 컬럼
 * 작품명은 파일명에서 추출
 */
function parseDomesticPaid(
  workbook: XLSX.WorkBook,
  fileName: string,
  errors: string[]
): ParsedRevenueRow[] {
  const rows: ParsedRevenueRow[] = [];

  // 1) "작품별 집계" 시트 — 브랜드 파일 (다수 작품이 한 파일에)
  const summarySheetName = workbook.SheetNames.find(n => n.includes('작품별 집계'));
  if (summarySheetName) {
    const sheet = workbook.Sheets[summarySheetName];
    const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // 헤더 행(5행 = idx 4)에서 "매출 확정" 컬럼 동적 탐색
    let revenueColIdx = 81; // CD열 기본값
    const headerRow = data[4];
    if (headerRow) {
      for (let i = 0; i < headerRow.length; i++) {
        const val = String(headerRow[i] || '');
        if (val.includes('매출') && val.includes('확정')) {
          revenueColIdx = i;
          break;
        }
      }
    }

    // 7행(idx 6)부터 데이터: A열=작품명
    for (let i = 6; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[0]) continue;

      const workName = String(row[0]).trim();
      if (!workName) continue;

      const revenue = parseNumber(row[revenueColIdx]);
      if (revenue !== 0) {
        rows.push({ work_name: workName, amount: revenue });
      }
    }

    if (rows.length > 0) return rows;
  }

  // 2) "정산내역서" 시트에서 CP 정산액 읽기 (단일 작품 파일)
  const settlementSheetName = workbook.SheetNames.find(n => n.includes('정산내역서'));
  if (settlementSheetName) {
    const sheet = workbook.Sheets[settlementSheetName];
    const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // 헤더에서 "CP 정산액" 컬럼 동적 탐색 (기본값: H열 = index 7)
    let cpColIdx = 7;
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i];
      if (!row) continue;
      for (let j = 0; j < row.length; j++) {
        const val = String(row[j] || '');
        if (val.includes('CP') && val.includes('정산')) {
          cpColIdx = j;
          break;
        }
      }
    }

    // "총 합계" 행 우선, 없으면 마지막 "합계" 행
    let revenue = 0;
    let lastSubtotal = 0;
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;
      const firstCell = String(row[0] || '').trim();
      if (firstCell.includes('총') && firstCell.includes('합계')) {
        revenue = parseNumber(row[cpColIdx]);
        break;
      }
      if (firstCell === '합계') {
        lastSubtotal = parseNumber(row[cpColIdx]);
      }
    }
    if (revenue === 0) revenue = lastSubtotal;

    const workName = extractWorkNameFromDomesticPaidFileName(fileName);
    if (workName && revenue !== 0) {
      rows.push({ work_name: workName, amount: revenue });
      return rows;
    }
  }

  // 3) Fallback: "컨텐츠별 매출 통계" 시트에서 작품별 파싱
  const statsSheetName = workbook.SheetNames.find(n => n.includes('컨텐츠별 매출 통계'));
  if (statsSheetName) {
    const sheet = workbook.Sheets[statsSheetName];
    const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // 헤더에서 "매출 확정" → "확정 합계" → "더그림" 순으로 컬럼 탐색
    let revenueColIdx = 81;
    const headerRow = data[4];
    if (headerRow) {
      let found = false;
      for (let i = 0; i < headerRow.length; i++) {
        const val = String(headerRow[i] || '');
        if (val.includes('매출') && val.includes('확정')) {
          revenueColIdx = i;
          found = true;
          break;
        }
      }
      if (!found) {
        for (let i = 0; i < headerRow.length; i++) {
          const val = String(headerRow[i] || '');
          if (val.includes('확정') && val.includes('합계')) {
            revenueColIdx = i;
            found = true;
            break;
          }
        }
      }
      if (!found) {
        for (let i = 0; i < headerRow.length; i++) {
          if (headerRow[i] && String(headerRow[i]).includes('더그림')) {
            revenueColIdx = i;
            break;
          }
        }
      }
    }

    for (let i = 6; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[0]) continue;

      const workName = String(row[0]).trim();
      if (!workName) continue;

      const revenue = parseNumber(row[revenueColIdx]);
      if (revenue !== 0) {
        rows.push({ work_name: workName, amount: revenue });
      }
    }

    if (rows.length > 0) return rows;
  }

  // 4) 최종 Fallback: 파일명에서 작품명만이라도 추출
  const workName = extractWorkNameFromDomesticPaidFileName(fileName);
  if (workName) {
    errors.push(`매출액을 찾을 수 없습니다: ${fileName} (작품: ${workName})`);
  } else {
    errors.push(`파싱 실패: ${fileName}`);
  }

  return rows;
}

/**
 * 국내유료 파일명에서 작품명 추출
 * 예: "2026-01월_국내유상이용권_공주님학교가신다(MG)_20260202.xlsx" → "공주님학교가신다"
 * 예: "2026-01월_국내유상이용권_이섭의연애(다중상점)_20260205.xlsx" → "이섭의연애"
 */
function extractWorkNameFromDomesticPaidFileName(fileName: string): string | null {
  const base = fileName.replace(/\.(xlsx|xls)$/i, '');
  const parts = base.split('_');
  // 3번째 부분에서 괄호 내용 제거 (MG, RS, 다중상점 등)
  if (parts.length >= 3) {
    return parts[2].replace(/\(.*?\)/g, '').trim() || null;
  }
  return null;
}

/**
 * 글로벌유료수익 파싱
 * 시트: invoice (또는 첫 시트)
 * 7행부터 데이터: col B (idx 1) = 작품명, col I (idx 8) = Payment (KRW)
 *
 * Payment에는 수수료 10%가 포함되어 있으므로 행별 /1.1 처리.
 * "Prior Period Adjustment" 합산 행은 스킵.
 * "Prior Period Adjustment_상세" 시트의 추가지급액(col 10)은 수수료 미포함이므로 그대로 합산.
 */
function parseGlobalPaid(
  workbook: XLSX.WorkBook,
  fileName: string,
  errors: string[],
  adjustments?: ParsedRevenueRow[]
): ParsedRevenueRow[] {
  const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('invoice')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    errors.push(`시트를 찾을 수 없습니다: ${fileName}`);
    return [];
  }

  const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // 행별로 Payment / 1.1 처리 후 작품별 합산
  // 라인웹툰 인보이스 금액은 부가세(VAT 10%) 포함이므로 공급가액 산출 위해 ÷1.1
  const workAmounts = new Map<string, number>();

  for (let i = 6; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[1]) continue;

    const itemName = String(row[1]).trim();
    if (!itemName || itemName === 'Prior Period Adjustment') continue;

    const payment = parseNumber(row[8]);
    if (payment !== 0) {
      // 부가세 10% 제외 (행별 반올림)
      const net = Math.round(payment / 1.1);
      workAmounts.set(itemName, (workAmounts.get(itemName) || 0) + net);
    }
  }

  // "Prior Period Adjustment_상세" 시트에서 소급 추가지급액 합산
  // 어드저스트 금액도 부가세 포함이므로 동일하게 ÷1.1
  const adjSheetName = workbook.SheetNames.find(n => n.includes('Prior Period Adjustment') && n.includes('상세'));
  if (adjSheetName) {
    const adjSheet = workbook.Sheets[adjSheetName];
    const adjData: (string | number | null)[][] = XLSX.utils.sheet_to_json(adjSheet, { header: 1 });

    for (let i = 2; i < adjData.length; i++) {
      const row = adjData[i];
      if (!row || !row[1]) continue;

      const itemName = String(row[1]).trim();
      if (!itemName) continue;

      // col 10 = 추가지급액 (부가세 포함 → ÷1.1로 공급가액 산출)
      const adjAmount = parseNumber(row[10]);
      if (adjAmount !== 0) {
        const net = Math.round(adjAmount / 1.1);
        workAmounts.set(itemName, (workAmounts.get(itemName) || 0) + net);
        if (adjustments) {
          adjustments.push({ work_name: itemName, amount: net });
        }
      }
    }
  }

  const rows: ParsedRevenueRow[] = [];
  for (const [name, amount] of workAmounts) {
    if (amount !== 0) {
      rows.push({ work_name: name, amount });
    }
  }

  return rows;
}

/**
 * 국내광고수익 파싱
 * WEBTOON AD: 정산리포트 시트, Row 8부터, col B(idx 1)=작품명, col G(idx 6)=발생 수익
 * SERIES AD:  정산리포트 시트, Row 8부터, col C(idx 2)=작품명, col J(idx 9)=최종매출액
 * 헤더 행에서 "작품명" 컬럼과 마지막 숫자 컬럼을 동적으로 탐색
 */
function parseDomesticAd(
  workbook: XLSX.WorkBook,
  fileName: string,
  errors: string[]
): ParsedRevenueRow[] {
  const rows: ParsedRevenueRow[] = [];
  const sheetName = workbook.SheetNames.find(n => n.includes('정산리포트')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    errors.push(`시트를 찾을 수 없습니다: ${fileName}`);
    return rows;
  }

  const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // 헤더 행 탐색 (Row 7 = idx 7)
  let headerRowIdx = 7;
  let nameColIdx = 1;
  let revenueColIdx = 6;

  for (let i = 5; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    const rowStr = row.map(c => String(c || ''));
    const nameIdx = rowStr.findIndex(c => c === '작품명');
    if (nameIdx >= 0) {
      headerRowIdx = i;
      nameColIdx = nameIdx;
      // "최종매출액" 컬럼 우선, 없으면 "발생 수익"
      const finalIdx = rowStr.findIndex(c => c.includes('최종매출액'));
      if (finalIdx >= 0) {
        revenueColIdx = finalIdx;
      } else {
        const revenueIdx = rowStr.findIndex(c => c.includes('발생 수익'));
        if (revenueIdx >= 0) revenueColIdx = revenueIdx;
      }
      break;
    }
  }

  // 헤더 다음 행부터 데이터
  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[nameColIdx]) continue;

    const workName = normalizeWorkName(String(row[nameColIdx]).trim());
    if (!workName) continue;

    const revenue = parseNumber(row[revenueColIdx]);
    if (revenue !== 0) {
      rows.push({ work_name: workName, amount: revenue });
    }
  }

  return rows;
}

/**
 * 글로벌광고수익 파싱
 * 시트: invoice (또는 첫 시트)
 * 7행부터 데이터: col B (idx 1) = 작품명, col F (idx 5) = Payment
 */
function parseGlobalAd(
  workbook: XLSX.WorkBook,
  fileName: string,
  errors: string[]
): ParsedRevenueRow[] {
  const rows: ParsedRevenueRow[] = [];
  const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('invoice')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    errors.push(`시트를 찾을 수 없습니다: ${fileName}`);
    return rows;
  }

  const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // 7행부터 (0-indexed: 6)
  for (let i = 6; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[1]) continue;

    const itemName = String(row[1]).trim();
    if (!itemName) continue;

    const payment = parseNumber(row[5]);
    if (payment !== 0) {
      rows.push({ work_name: itemName, amount: payment });
    }
  }

  return rows;
}

/**
 * 2차사업 수익 파싱 (SuperLike + Management + 카카오 이모티콘)
 * SuperLike: invoice 시트, 7행부터, col B = 작품명, col I (idx 8) = Payment, "Carryover" 스킵
 * Management: 첫 시트, '총' 포함 행, col J (idx 9) = 금액, 파일명에서 작품명 추출
 * 카카오 이모티콘: "정산 상세 내역" 시트, Row 8 "총합" 행의 공급가(C열), 작품명은 파일명 끝에서 추출
 */
function parseSecondary(
  workbook: XLSX.WorkBook,
  fileName: string,
  errors: string[]
): ParsedRevenueRow[] {
  const rows: ParsedRevenueRow[] = [];

  if (fileName.includes('이모티콘') && fileName.includes('카카오')) {
    // 카카오 이모티콘 파일
    return parseKakaoEmoticon(workbook, fileName, errors);
  } else if (fileName.includes('Super Like') || fileName.includes('SuperLike')) {
    // SuperLike 파일
    const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('invoice')) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      errors.push(`시트를 찾을 수 없습니다: ${fileName}`);
      return rows;
    }

    const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    for (let i = 6; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[1]) continue;

      const itemName = String(row[1]).trim();
      if (!itemName || itemName === 'Carryover') continue;

      const payment = parseNumber(row[8]);
      if (payment !== 0) {
        rows.push({ work_name: itemName, amount: payment });
      }
    }
  } else if (fileName.includes('매니지먼트') || fileName.includes('Management')) {
    // 매니지먼트 파일: 개별 항목 파싱 후 작품별 합산
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      errors.push(`시트를 찾을 수 없습니다: ${fileName}`);
      return rows;
    }

    const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // 개별 항목 파싱: 번호(idx 0) + 구분(idx 1) + 설명(idx 2) + 금액(idx 9)
    const workAmounts = new Map<string, number>();
    let publishingTotal = 0; // [출판] 항목 별도 합산
    let inUnpaidSection = false; // "미지급 항목" 섹션 진입 여부

    for (let i = 10; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;

      // "실 지급 총 합계" 행이면 중단
      const anyCell = row.map(c => String(c || '')).join('');
      if (anyCell.includes('실 지급 총 합계')) break;

      // "미지급 항목" 섹션 감지 → 이후 항목은 스킵
      const col2Str = String(row[2] || '');
      if (col2Str.includes('미지급')) {
        inUnpaidSection = true;
        continue;
      }

      // 미지급 섹션 내 항목은 건너뜀 (정산서에서 미반영)
      if (inUnpaidSection) continue;

      // 번호가 있고 금액이 있는 행만 처리
      if (typeof row[0] !== 'number') continue;
      const amount = parseNumber(row[9]);
      if (amount === 0) continue;

      const desc = col2Str;
      const workName = extractWorkNameFromMgDescription(desc);
      if (workName) {
        workAmounts.set(workName, (workAmounts.get(workName) || 0) + amount);
      } else if (desc.includes('[출판]')) {
        // 출판 항목은 작품명 추출 불가 → 별도 합산 후 파일명 기준 배분
        publishingTotal += amount;
      }
    }

    // 출판 합산액을 파일명의 마지막 작품에 전액 배정
    if (publishingTotal !== 0) {
      const names = extractWorkNamesFromMgFileName(fileName);
      if (names.length > 0) {
        const targetName = names[names.length - 1];
        workAmounts.set(targetName, (workAmounts.get(targetName) || 0) + publishingTotal);
      }
    }

    // 금액이 0이 아닌 작품만 추가
    for (const [name, amount] of workAmounts) {
      if (amount !== 0) {
        rows.push({ work_name: name, amount });
      }
    }

    // 파싱 결과 없으면 파일명에서 작품명 + "실 지급 총 합계"로 폴백
    if (rows.length === 0) {
      let totalPayment = 0;
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;
        const cellStr = row.map(c => String(c || '')).join('');
        if (cellStr.includes('실 지급 총 합계')) {
          totalPayment = parseNumber(row[9]);
          break;
        }
      }
      if (totalPayment !== 0) {
        const names = extractWorkNamesFromMgFileName(fileName);
        if (names.length > 0) {
          const perWork = Math.round(totalPayment / names.length);
          for (const name of names) {
            rows.push({ work_name: name, amount: perWork });
          }
        } else {
          rows.push({ work_name: extractWorkNameFromFileName(fileName), amount: totalPayment });
        }
      }
    }
  } else {
    // 기본: SuperLike 형식으로 시도
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      errors.push(`시트를 찾을 수 없습니다: ${fileName}`);
      return rows;
    }

    const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    for (let i = 6; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[1]) continue;

      const itemName = String(row[1]).trim();
      if (!itemName || itemName === 'Carryover') continue;

      const payment = parseNumber(row[8]);
      if (payment !== 0) {
        rows.push({ work_name: itemName, amount: payment });
      }
    }
  }

  return rows;
}

/**
 * 카카오 이모티콘 수익 파싱
 * "정산 상세 내역" 시트, Row 8 "총합" 행의 공급가(C열, VAT별도)
 * 작품명은 파일명 마지막 _구분자 뒤에서 추출
 * 예: "...카카오 이모티콘 수익 accounts report(202512)_외모지상주의.xlsx"
 */
function parseKakaoEmoticon(
  workbook: XLSX.WorkBook,
  fileName: string,
  errors: string[]
): ParsedRevenueRow[] {
  const rows: ParsedRevenueRow[] = [];

  // 작품명: 파일명 마지막 _ 뒤
  const workName = extractWorkNameFromSecondaryFileName(fileName);
  if (!workName) {
    errors.push(`카카오 이모티콘 파일명에서 작품명 추출 실패: ${fileName}`);
    return rows;
  }

  const sheetName = workbook.SheetNames.find(n => n.includes('정산 상세 내역')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    errors.push(`시트를 찾을 수 없습니다: ${fileName}`);
    return rows;
  }

  const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // "총합" 행에서 공급가(C열 = idx 2) 읽기
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const label = String(row[1] || '').trim();
    if (label === '총합') {
      const amount = parseNumber(row[2]); // 공급가 (VAT 별도)
      if (amount !== 0) {
        rows.push({ work_name: workName, amount });
      }
      break;
    }
  }

  if (rows.length === 0) {
    errors.push(`카카오 이모티콘 총합을 찾을 수 없습니다: ${fileName}`);
  }

  return rows;
}

/**
 * 2차사업 파일명에서 작품명 추출 (마지막 _ 뒤)
 * "더그림_2026-01월발행_카카오 이모티콘 수익 accounts report(202512)_외모지상주의.xlsx" → "외모지상주의"
 */
function extractWorkNameFromSecondaryFileName(fileName: string): string | null {
  const base = fileName.replace(/\.(xlsx|xls)$/i, '');
  const parts = base.split('_');
  const lastPart = parts[parts.length - 1]?.trim();
  if (lastPart && !lastPart.match(/^\d/) && !lastPart.includes('정산')) {
    return lastPart;
  }
  return null;
}

function parseNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    const num = Number(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

function extractWorkNameFromFileName(fileName: string): string {
  // 확장자 제거 후 파일명 반환
  return fileName.replace(/\.(xlsx|xls)$/i, '').trim();
}

/**
 * 매니지먼트 항목 설명에서 작품명 추출
 * "25년 11월 이모티콘_인생존망" → "인생존망"
 * "25년 11월 이모티콘_싸움독학" → "싸움독학"
 * "[출판][웹툰] 25년 12월 인세 정산(주식회사 블루픽)" → null
 */
function extractWorkNameFromMgDescription(desc: string): string | null {
  // 패턴: "YY년 MM월 카테고리_작품명"
  const underscoreMatch = desc.match(/_([^_()]+)$/);
  if (underscoreMatch) {
    return underscoreMatch[1].trim();
  }
  return null;
}

/**
 * 매니지먼트 파일명에서 작품명들 추출
 * "더그림_2026-01월발행_매니지먼트 수익 정산리포트(202512)_인생존망,싸움독학.xlsx" → ["인생존망", "싸움독학"]
 */
function extractWorkNamesFromMgFileName(fileName: string): string[] {
  const base = fileName.replace(/\.(xlsx|xls)$/i, '');
  const parts = base.split('_');
  // 마지막 부분이 쉼표로 구분된 작품명 목록
  const lastPart = parts[parts.length - 1];
  if (lastPart && !lastPart.match(/^\d/) && !lastPart.includes('정산')) {
    return lastPart.split(',').map(n => n.trim()).filter(Boolean);
  }
  return [];
}
