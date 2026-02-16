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
 * 시트: 활성 시트 (월별 선수수익(MG) 또는 N월_정산내역서)
 * IP명: 4~6행 C열 (idx 2), 매출액: 4~6행 J열 (idx 9)
 */
function parseDomesticPaid(
  workbook: XLSX.WorkBook,
  fileName: string,
  errors: string[]
): ParsedRevenueRow[] {
  const rows: ParsedRevenueRow[] = [];
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    errors.push(`시트를 찾을 수 없습니다: ${fileName}`);
    return rows;
  }

  const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  let ipName: string | null = null;
  let revenue = 0;

  // 4~6행에서 IP명과 매출액 추출 (0-indexed: rows 3~5)
  for (let i = 3; i <= 5 && i < data.length; i++) {
    const row = data[i];
    if (!row) continue;

    if (!ipName && row[2]) {
      ipName = String(row[2]).trim();
    }
    if (row[9] && typeof row[9] === 'number') {
      revenue = row[9];
      break;
    }
    if (row[9] && !isNaN(Number(row[9]))) {
      revenue = Number(row[9]);
      break;
    }
  }

  // H12 (CP정산액) 대안 검사
  if (revenue === 0 && data.length > 11) {
    const row11 = data[11];
    if (row11 && row11[7] && !isNaN(Number(row11[7]))) {
      revenue = Number(row11[7]);
    }
  }

  if (ipName && revenue !== 0) {
    rows.push({ work_name: ipName, amount: revenue });
  } else if (ipName) {
    errors.push(`매출액을 찾을 수 없습니다: ${fileName} (IP: ${ipName})`);
  } else {
    errors.push(`IP명을 찾을 수 없습니다: ${fileName}`);
  }

  return rows;
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
    if (!itemName) continue;

    const payment = parseNumber(row[8]);
    if (payment !== 0) {
      rows.push({ work_name: itemName, amount: payment });
    }
  }

  return rows;
}

/**
 * 국내광고수익 파싱
 * 시트: 정산리포트 (또는 첫 시트)
 * 9행부터 데이터: col B (idx 1) = 작품명, col G (idx 6) = 발생 수익
 */
function parseDomesticAd(
  workbook: XLSX.WorkBook,
  fileName: string,
  errors: string[]
): ParsedRevenueRow[] {
  const rows: ParsedRevenueRow[] = [];
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    errors.push(`시트를 찾을 수 없습니다: ${fileName}`);
    return rows;
  }

  const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // 9행부터 (0-indexed: 8)
  for (let i = 8; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[1]) continue;

    const workName = String(row[1]).trim();
    if (!workName) continue;

    const revenue = parseNumber(row[6]);
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
    // 매니지먼트 파일
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      errors.push(`시트를 찾을 수 없습니다: ${fileName}`);
      return rows;
    }

    const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    for (let i = 9; i < Math.min(data.length, 30); i++) {
      const row = data[i];
      if (!row || !row[1]) continue;

      if (String(row[1]).includes('총')) {
        const total = parseNumber(row[9]);
        if (total !== 0) {
          // 파일명에서 작품명 추출 시도
          rows.push({ work_name: extractWorkNameFromFileName(fileName), amount: total });
        }
        break;
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
