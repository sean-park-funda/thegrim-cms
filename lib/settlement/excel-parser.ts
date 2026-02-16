import * as XLSX from 'xlsx';
import { RevenueType, ExcelParseResult, ParsedRevenueRow } from '@/lib/types/settlement';

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

  try {
    switch (revenueType) {
      case 'domestic_paid':
        rows = parseDomesticPaid(workbook, fileName, errors);
        break;
      case 'global_paid':
        rows = parseGlobalPaid(workbook, fileName, errors);
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

  return { rows, total_amount, errors };
}

/**
 * 국내유료수익 파싱
 * 시트: "컨텐츠별 매출 통계" → Row 7 (0-indexed: 6)부터 데이터
 *   idx 0 = 작품명, idx 81 = 더그림 수익 (CP 정산액)
 * Fallback: 파일명에서 작품명 추출 + "N월_정산내역서" 시트에서 CP정산액
 */
function parseDomesticPaid(
  workbook: XLSX.WorkBook,
  fileName: string,
  errors: string[]
): ParsedRevenueRow[] {
  const rows: ParsedRevenueRow[] = [];

  // 1) "컨텐츠별 매출 통계" 시트에서 파싱 (가장 정확)
  const statsSheetName = workbook.SheetNames.find(n => n.includes('컨텐츠별 매출 통계'));
  if (statsSheetName) {
    const sheet = workbook.Sheets[statsSheetName];
    const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // 헤더에서 "더그림" 수익 컬럼 인덱스 동적 탐색
    let revenueColIdx = 81; // 기본값
    const headerRow = data[4]; // Row 5 = 헤더
    if (headerRow) {
      for (let i = 0; i < headerRow.length; i++) {
        if (headerRow[i] && String(headerRow[i]).includes('더그림')) {
          revenueColIdx = i;
          break;
        }
      }
    }

    // Row 7부터 데이터 (0-indexed: 6)
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

  // 2) Fallback: "N월_정산내역서" 시트에서 CP정산액 + 파일명에서 작품명
  const settlementSheetName = workbook.SheetNames.find(n => n.includes('정산내역서'));
  if (settlementSheetName) {
    const sheet = workbook.Sheets[settlementSheetName];
    const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // "총" 또는 "합계" 포함 행에서 CP정산액 찾기
    let revenue = 0;
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;
      const firstCell = String(row[0] || '');
      if (firstCell.includes('총') || firstCell.includes('합계')) {
        // CP 정산액은 보통 idx 7 (H열)
        for (let j = 5; j < Math.min(row.length, 15); j++) {
          const val = parseNumber(row[j]);
          if (val > revenue) revenue = val;
        }
      }
    }

    const workName = extractWorkNameFromDomesticPaidFileName(fileName);
    if (workName && revenue !== 0) {
      rows.push({ work_name: workName, amount: revenue });
      return rows;
    }
  }

  // 3) 최종 Fallback: 파일명에서 작품명만이라도 추출
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
 */
function parseGlobalPaid(
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
    if (!itemName || itemName === 'Prior Period Adjustment') continue;

    const payment = parseNumber(row[8]);
    if (payment !== 0) {
      rows.push({ work_name: itemName, amount: payment });
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

    const workName = String(row[nameColIdx]).trim();
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
 * 2차사업 수익 파싱 (SuperLike + Management)
 * SuperLike: invoice 시트, 7행부터, col B = 작품명, col I (idx 8) = Payment, "Carryover" 스킵
 * Management: 첫 시트, '총' 포함 행, col J (idx 9) = 금액, 파일명에서 작품명 추출
 */
function parseSecondary(
  workbook: XLSX.WorkBook,
  fileName: string,
  errors: string[]
): ParsedRevenueRow[] {
  const rows: ParsedRevenueRow[] = [];

  if (fileName.includes('Super Like') || fileName.includes('SuperLike')) {
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

    for (let i = 10; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;

      // "실 지급 총 합계" 행이면 중단
      const anyCell = row.map(c => String(c || '')).join('');
      if (anyCell.includes('실 지급 총 합계')) break;

      // 번호가 있고 금액이 있는 행만 처리
      if (typeof row[0] !== 'number') continue;
      const amount = parseNumber(row[9]);
      if (amount === 0) continue;

      const desc = String(row[2] || '');
      const workName = extractWorkNameFromMgDescription(desc);
      if (workName) {
        workAmounts.set(workName, (workAmounts.get(workName) || 0) + amount);
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
