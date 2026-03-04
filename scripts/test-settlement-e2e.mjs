/**
 * E2E 정산 테스트 — 매출 엑셀 업로드 → 정산 계산 → 참조 엑셀 비교
 *
 * Usage: node scripts/test-settlement-e2e.mjs
 */
import XLSX from 'xlsx';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';

// ── Config ──────────────────────────────────────────────────────────────────
const envContent = readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const MONTH = '2026-01';
const DATA_DIR = process.argv[2] || '../_thegrim-account/매출액 data_extracted';
const REF_FILE = process.argv[3] || './docs/accounting_sample/2026-01 RS정산(26년02월지급).xlsm';

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
};

// ── Supabase REST helpers ───────────────────────────────────────────────────
async function supaGet(table, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers });
  if (!res.ok) throw new Error(`GET ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supaDelete(table, filter = '') {
  const url = filter
    ? `${SUPABASE_URL}/rest/v1/${table}?${filter}`
    : `${SUPABASE_URL}/rest/v1/${table}?id=neq.00000000-0000-0000-0000-000000000000`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { ...headers, 'Prefer': 'return=representation' },
  });
  if (!res.ok) throw new Error(`DELETE ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supaUpsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`UPSERT ${table} failed: ${res.status} ${await res.text()}`);
}

async function supaPatch(table, filter, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...headers, 'Prefer': 'return=minimal' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`PATCH ${table} failed: ${res.status} ${await res.text()}`);
}

async function supaInsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`INSERT ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Excel Parser (ported from excel-parser.ts) ──────────────────────────────
function normalizeWorkName(name) {
  let n = name.trim();
  const ci = n.indexOf(':');
  if (ci > 0) n = n.substring(0, ci);
  n = n.replace(/\s+/g, '');
  n = n.replace(/[!?！？]+$/, '');
  return n;
}

function parseNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const num = Number(value.replace(/,/g, '').trim());
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

function extractWorkNameFromDomesticPaidFileName(fileName) {
  const base = fileName.replace(/\.(xlsx|xls)$/i, '');
  const parts = base.split('_');
  if (parts.length >= 3) return parts[2].replace(/\(.*?\)/g, '').trim() || null;
  return null;
}

function extractWorkNameFromMgDescription(desc) {
  const m = desc.match(/_([^_()]+)$/);
  return m ? m[1].trim() : null;
}

function extractWorkNamesFromMgFileName(fileName) {
  const base = fileName.replace(/\.(xlsx|xls)$/i, '');
  const parts = base.split('_');
  const last = parts[parts.length - 1];
  if (last && !last.match(/^\d/) && !last.includes('정산')) {
    return last.split(',').map(n => n.trim()).filter(Boolean);
  }
  return [];
}

function parseDomesticPaid(workbook, fileName, errors) {
  const rows = [];
  const statsSheetName = workbook.SheetNames.find(n => n.includes('컨텐츠별 매출 통계'));
  if (statsSheetName) {
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[statsSheetName], { header: 1 });
    let revenueColIdx = 81;
    const headerRow = data[4];
    if (headerRow) {
      for (let i = 0; i < headerRow.length; i++) {
        if (headerRow[i] && String(headerRow[i]).includes('더그림')) { revenueColIdx = i; break; }
      }
    }
    for (let i = 6; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[0]) continue;
      const workName = String(row[0]).trim();
      if (!workName) continue;
      const revenue = parseNumber(row[revenueColIdx]);
      if (revenue !== 0) rows.push({ work_name: workName, amount: revenue });
    }
    if (rows.length > 0) return rows;
  }

  const settlementSheetName = workbook.SheetNames.find(n => n.includes('정산내역서'));
  if (settlementSheetName) {
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[settlementSheetName], { header: 1 });
    let revenue = 0;
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;
      const firstCell = String(row[0] || '');
      if (firstCell.includes('총') || firstCell.includes('합계')) {
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

  const workName = extractWorkNameFromDomesticPaidFileName(fileName);
  if (workName) errors.push(`매출액을 찾을 수 없습니다: ${fileName}`);
  else errors.push(`파싱 실패: ${fileName}`);
  return rows;
}

function parseGlobalPaid(workbook, fileName, errors) {
  const adjustments = [];
  const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('invoice')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) { errors.push(`시트 없음: ${fileName}`); return []; }
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const workAmounts = new Map();
  for (let i = 6; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[1]) continue;
    const itemName = String(row[1]).trim();
    if (!itemName || itemName === 'Prior Period Adjustment') continue;
    const payment = parseNumber(row[8]);
    if (payment !== 0) {
      const net = Math.round(payment / 1.1);
      workAmounts.set(itemName, (workAmounts.get(itemName) || 0) + net);
    }
  }
  const adjSheetName = workbook.SheetNames.find(n => n.includes('Prior Period Adjustment') && n.includes('상세'));
  if (adjSheetName) {
    const adjData = XLSX.utils.sheet_to_json(workbook.Sheets[adjSheetName], { header: 1 });
    for (let i = 2; i < adjData.length; i++) {
      const row = adjData[i];
      if (!row || !row[1]) continue;
      const itemName = String(row[1]).trim();
      if (!itemName) continue;
      const adjAmount = parseNumber(row[10]);
      if (adjAmount !== 0) {
        workAmounts.set(itemName, (workAmounts.get(itemName) || 0) + adjAmount);
        adjustments.push({ work_name: itemName, amount: adjAmount });
      }
    }
  }
  const rows = [];
  for (const [name, amount] of workAmounts) {
    if (amount !== 0) rows.push({ work_name: name, amount });
  }
  return rows;
}

function parseDomesticAd(workbook, fileName, errors) {
  const rows = [];
  const sheetName = workbook.SheetNames.find(n => n.includes('정산리포트')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) { errors.push(`시트 없음: ${fileName}`); return rows; }
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  let headerRowIdx = 7, nameColIdx = 1, revenueColIdx = 6;
  for (let i = 5; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    const rowStr = row.map(c => String(c || ''));
    const nameIdx = rowStr.findIndex(c => c === '작품명');
    if (nameIdx >= 0) {
      headerRowIdx = i;
      nameColIdx = nameIdx;
      const finalIdx = rowStr.findIndex(c => c.includes('최종매출액'));
      if (finalIdx >= 0) revenueColIdx = finalIdx;
      else {
        const revIdx = rowStr.findIndex(c => c.includes('발생 수익'));
        if (revIdx >= 0) revenueColIdx = revIdx;
      }
      break;
    }
  }
  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[nameColIdx]) continue;
    const workName = normalizeWorkName(String(row[nameColIdx]).trim());
    if (!workName) continue;
    const revenue = parseNumber(row[revenueColIdx]);
    if (revenue !== 0) rows.push({ work_name: workName, amount: revenue });
  }
  return rows;
}

function parseGlobalAd(workbook, fileName, errors) {
  const rows = [];
  const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('invoice')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) { errors.push(`시트 없음: ${fileName}`); return rows; }
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  for (let i = 6; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[1]) continue;
    const itemName = String(row[1]).trim();
    if (!itemName) continue;
    const payment = parseNumber(row[5]);
    if (payment !== 0) rows.push({ work_name: itemName, amount: payment });
  }
  return rows;
}

function parseSecondary(workbook, fileName, errors) {
  const rows = [];
  if (fileName.includes('Super Like') || fileName.includes('SuperLike')) {
    const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('invoice')) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) { errors.push(`시트 없음: ${fileName}`); return rows; }
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    for (let i = 6; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[1]) continue;
      const itemName = String(row[1]).trim();
      if (!itemName || itemName === 'Carryover') continue;
      const payment = parseNumber(row[8]);
      if (payment !== 0) rows.push({ work_name: itemName, amount: payment });
    }
  } else if (fileName.includes('매니지먼트') || fileName.includes('Management')) {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) { errors.push(`시트 없음: ${fileName}`); return rows; }
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const workAmounts = new Map();
    let publishingTotal = 0;
    let inUnpaidSection = false;
    for (let i = 10; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;
      const anyCell = row.map(c => String(c || '')).join('');
      if (anyCell.includes('실 지급 총 합계')) break;
      const col2Str = String(row[2] || '');
      if (col2Str.includes('미지급')) { inUnpaidSection = true; continue; }
      if (inUnpaidSection) continue;
      if (typeof row[0] !== 'number') continue;
      const amount = parseNumber(row[9]);
      if (amount === 0) continue;
      const workName = extractWorkNameFromMgDescription(col2Str);
      if (workName) {
        workAmounts.set(workName, (workAmounts.get(workName) || 0) + amount);
      } else if (col2Str.includes('[출판]')) {
        publishingTotal += amount;
      }
    }
    if (publishingTotal !== 0) {
      const names = extractWorkNamesFromMgFileName(fileName);
      if (names.length > 0) {
        const target = names[names.length - 1];
        workAmounts.set(target, (workAmounts.get(target) || 0) + publishingTotal);
      }
    }
    for (const [name, amount] of workAmounts) {
      if (amount !== 0) rows.push({ work_name: name, amount });
    }
    if (rows.length === 0) {
      let totalPayment = 0;
      const data2 = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      for (let i = 0; i < data2.length; i++) {
        const row = data2[i];
        if (!row) continue;
        const cellStr = row.map(c => String(c || '')).join('');
        if (cellStr.includes('실 지급 총 합계')) { totalPayment = parseNumber(row[9]); break; }
      }
      if (totalPayment !== 0) {
        const names = extractWorkNamesFromMgFileName(fileName);
        if (names.length > 0) {
          const perWork = Math.round(totalPayment / names.length);
          for (const name of names) rows.push({ work_name: name, amount: perWork });
        } else {
          rows.push({ work_name: fileName.replace(/\.(xlsx|xls)$/i, '').trim(), amount: totalPayment });
        }
      }
    }
  } else {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) { errors.push(`시트 없음: ${fileName}`); return rows; }
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    for (let i = 6; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[1]) continue;
      const itemName = String(row[1]).trim();
      if (!itemName || itemName === 'Carryover') continue;
      const payment = parseNumber(row[8]);
      if (payment !== 0) rows.push({ work_name: itemName, amount: payment });
    }
  }
  return rows;
}

function parseRevenueExcel(buffer, rawFileName, revenueType) {
  const fileName = rawFileName.normalize('NFC'); // macOS NFD → NFC
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const errors = [];
  let rows = [];
  try {
    switch (revenueType) {
      case 'domestic_paid': rows = parseDomesticPaid(workbook, fileName, errors); break;
      case 'global_paid': rows = parseGlobalPaid(workbook, fileName, errors); break;
      case 'domestic_ad': rows = parseDomesticAd(workbook, fileName, errors); break;
      case 'global_ad': rows = parseGlobalAd(workbook, fileName, errors); break;
      case 'secondary': rows = parseSecondary(workbook, fileName, errors); break;
    }
  } catch (e) { errors.push(`파싱 오류: ${e.message}`); }
  return { rows, total_amount: rows.reduce((s, r) => s + r.amount, 0), errors };
}

// ── Calculator (ported from calculator.ts) ──────────────────────────────────
const truncate10 = (n) => Math.floor(n / 10) * 10;

function calculateTax(amount, partnerType) {
  if (partnerType === 'individual' || partnerType === 'individual_employee' || partnerType === 'individual_simple_tax') {
    const income_tax = truncate10(amount * 0.03);
    const local_tax = truncate10(income_tax * 0.1);
    return { income_tax, local_tax, vat: 0, total: income_tax + local_tax };
  }
  if (partnerType === 'domestic_corp') {
    const vat = Math.round(amount * 0.1);
    return { income_tax: 0, local_tax: 0, vat, total: 0 };
  }
  if (partnerType === 'foreign_corp') {
    const income_tax = truncate10(amount * 0.2);
    const local_tax = truncate10(income_tax * 0.1);
    return { income_tax, local_tax, vat: 0, total: income_tax + local_tax };
  }
  if (partnerType === 'naver') {
    const vat = Math.round(amount * 0.1);
    return { income_tax: 0, local_tax: 0, vat, total: 0 };
  }
  return { income_tax: 0, local_tax: 0, vat: 0, total: 0 };
}

function calculateInsurance(amount, partnerType, ctx) {
  if ((partnerType !== 'individual' && partnerType !== 'individual_simple_tax') || amount <= 0) return 0;
  if (ctx) {
    if (amount <= 500000) return 0;
    if (ctx.serialEndDate && ctx.month) {
      if (new Date(ctx.serialEndDate) < new Date(ctx.month + '-01')) return 0;
    }
    if (ctx.reportType === '세금계산서') return 0;
  }
  return Math.floor(amount * 0.75 * 0.008);
}

function calculateSettlement(input) {
  const effectiveRate = input.is_mg_applied && input.mg_rs_rate != null ? input.mg_rs_rate : input.rs_rate;
  const revenue_share = Math.round(input.gross_revenue * effectiveRate);
  const subtotal = revenue_share - input.production_cost + input.adjustment - input.salary_deduction;
  const tax_breakdown = calculateTax(subtotal, input.partner_type);
  const tax_amount = tax_breakdown.total;
  const insurance = calculateInsurance(subtotal, input.partner_type, {
    serialEndDate: input.serial_end_date,
    reportType: input.report_type,
    month: input.month,
  });
  let mg_deduction = 0;
  if (input.is_mg_applied && input.mg_balance > 0) {
    const afterTaxAndInsurance = subtotal - tax_amount - insurance;
    mg_deduction = Math.min(input.mg_balance, Math.max(0, afterTaxAndInsurance));
  }
  const final_payment = subtotal - tax_amount - insurance - mg_deduction - input.other_deduction;
  return { revenue_share, subtotal, tax_amount, tax_breakdown, insurance, mg_deduction, final_payment };
}

// ── File Discovery ──────────────────────────────────────────────────────────
function findExcelFiles(baseDir) {
  const FILE_MAP = [
    { dir: '01. 네이버_국내 유료수익/01월', type: 'domestic_paid' },
    { dir: '02. 네이버_글로벌 유료수익', type: 'global_paid' },
    { dir: '03. 네이버_국내 광고수익/01. 국내광고(KR WEBTOON_AD)', type: 'domestic_ad' },
    { dir: '03. 네이버_국내 광고수익/02. 국내광고(KR SERIES_AD)', type: 'domestic_ad' },
    { dir: '04. 네이버_글로벌 광고수익/01. 글로벌광고(LINEWEBTOON_AD)', type: 'global_ad' },
    { dir: '05. 네이버_2차 사업 수익/01. 매니지먼트 수익', type: 'secondary' },
    { dir: '05. 네이버_2차 사업 수익/02. Super Like 수익', type: 'secondary' },
  ];

  const result = [];
  for (const mapping of FILE_MAP) {
    const dirPath = join(baseDir, mapping.dir);
    if (!existsSync(dirPath)) {
      console.warn(`  ⚠ 디렉토리 없음: ${mapping.dir}`);
      continue;
    }
    const files = readdirSync(dirPath).filter(f => f.match(/\.xlsx?$/i));
    for (const f of files) {
      result.push({ path: join(dirPath, f), name: f, revenueType: mapping.type });
    }
  }
  return result;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
console.log('═'.repeat(80));
console.log('  E2E Settlement Test');
console.log('═'.repeat(80));
console.log(`  월: ${MONTH}`);
console.log(`  데이터: ${DATA_DIR}`);
console.log(`  참조: ${REF_FILE}`);
console.log('');

// ── Step 1: 테이블 초기화 ───────────────────────────────────────────────────
console.log('─'.repeat(80));
console.log('[Step 1] 거래 테이블 초기화');
console.log('─'.repeat(80));

const CLEAR_TABLES = ['rs_settlements', 'rs_mg_balances', 'rs_upload_history', 'rs_revenues'];
for (const table of CLEAR_TABLES) {
  const data = await supaDelete(table);
  console.log(`  ${table}: ${Array.isArray(data) ? data.length : 0}건 삭제`);
}
console.log('');

// ── Step 2: MG 잔액 재시드 ──────────────────────────────────────────────────
console.log('─'.repeat(80));
console.log('[Step 2] MG 잔액 시드 (참조 Excel "MG현황 집계")');
console.log('─'.repeat(80));

const refWb = XLSX.readFile(REF_FILE);
const mgSheet = refWb.Sheets['MG현황 집계'];
if (!mgSheet) {
  console.error('  ❌ MG현황 집계 시트 없음');
  process.exit(1);
}
const mgData = XLSX.utils.sheet_to_json(mgSheet, { header: 1 });

// Fetch master data for matching
const partners = await supaGet('rs_partners', 'select=id,name,salary_deduction,partner_type,report_type');
const works = await supaGet('rs_works', 'select=id,name,naver_name');
const workPartners = await supaGet('rs_work_partners', 'select=*');

const partnerMap = new Map();
for (const p of partners) {
  partnerMap.set(p.name, p);
  partnerMap.set(p.name.toLowerCase(), p);
}
const workMap = new Map();
const normalizedWorkMap = new Map();
for (const w of works) {
  workMap.set(w.name, w.id);
  normalizedWorkMap.set(normalizeWorkName(w.name), w.id);
  if (w.naver_name) {
    workMap.set(w.naver_name, w.id);
    normalizedWorkMap.set(normalizeWorkName(w.naver_name), w.id);
  }
}

let mgSeeded = 0;
for (let i = 8; i < mgData.length; i++) {
  const row = mgData[i];
  if (!row || !row[3] || !row[8]) continue;
  const partnerName = String(row[3]).trim();
  const workNames = String(row[8]).trim();
  const month = String(row[2] || '2026-01').trim();
  const previousBalance = Number(row[9]) || 0;
  const mgAdded = Number(row[10]) || 0;
  const mgDeducted = Math.abs(Number(row[11]) || 0);
  const currentBalance = Number(row[12]) || 0;
  const note = row[14] ? String(row[14]).trim() : null;

  const partner = partnerMap.get(partnerName) || partnerMap.get(partnerName.toLowerCase());
  if (!partner) continue;

  const primaryWork = workNames.split(',')[0].trim();
  let workId = workMap.get(primaryWork) || normalizedWorkMap.get(normalizeWorkName(primaryWork));
  if (!workId && workNames.includes(',')) {
    for (const n of workNames.split(',').map(s => s.trim())) {
      workId = workMap.get(n) || normalizedWorkMap.get(normalizeWorkName(n));
      if (workId) break;
    }
  }
  if (!workId) continue;

  await supaUpsert('rs_mg_balances', {
    month, partner_id: partner.id, work_id: workId,
    previous_balance: previousBalance, mg_added: mgAdded, mg_deducted: mgDeducted,
    current_balance: currentBalance, note,
  });
  mgSeeded++;
}
console.log(`  MG 잔액: ${mgSeeded}건 시드 완료`);
console.log('');

// ── Step 3: 매출 엑셀 파싱 + 업로드 ────────────────────────────────────────
console.log('─'.repeat(80));
console.log('[Step 3] 매출 엑셀 파싱 + rs_revenues 업로드');
console.log('─'.repeat(80));

const excelFiles = findExcelFiles(DATA_DIR);
console.log(`  발견된 파일: ${excelFiles.length}개`);

// Group by revenue type for sequential processing
const byType = new Map();
for (const f of excelFiles) {
  if (!byType.has(f.revenueType)) byType.set(f.revenueType, []);
  byType.get(f.revenueType).push(f);
}

const allParsed = []; // { work_name, amount, revenueType }
const allErrors = [];

for (const [revenueType, files] of byType) {
  const typeParsed = [];
  for (const file of files) {
    const buffer = readFileSync(file.path);
    const result = parseRevenueExcel(buffer, file.name, revenueType);
    for (const row of result.rows) {
      typeParsed.push({ ...row, revenueType });
    }
    allErrors.push(...result.errors.map(e => `[${revenueType}] ${e}`));
  }

  // Aggregate by work (within this revenue type)
  const aggregated = new Map();
  for (const row of typeParsed) {
    // Match to DB work
    let workId = workMap.get(row.work_name) || normalizedWorkMap.get(normalizeWorkName(row.work_name));
    if (!workId) {
      // Auto-create
      try {
        const created = await supaInsert('rs_works', { name: row.work_name, naver_name: row.work_name });
        if (created && created[0]) {
          workId = created[0].id;
          workMap.set(row.work_name, workId);
          normalizedWorkMap.set(normalizeWorkName(row.work_name), workId);
        }
      } catch (e) {
        // May fail on unique constraint — try to find again
        const refreshed = await supaGet('rs_works', `name=eq.${encodeURIComponent(row.work_name)}&select=id`);
        if (refreshed.length > 0) workId = refreshed[0].id;
      }
    }
    if (!workId) {
      allErrors.push(`[${revenueType}] 작품 매칭 실패: ${row.work_name}`);
      continue;
    }
    const existing = aggregated.get(workId);
    if (existing) existing.amount += row.amount;
    else aggregated.set(workId, { work_name: row.work_name, work_id: workId, amount: row.amount });
  }

  // Upsert to rs_revenues
  const column = revenueType; // column name = revenue type
  for (const item of aggregated.values()) {
    const existing = await supaGet('rs_revenues', `work_id=eq.${item.work_id}&month=eq.${MONTH}&select=id`);
    if (existing.length > 0) {
      await supaPatch('rs_revenues', `id=eq.${existing[0].id}`, { [column]: item.amount });
    } else {
      await supaInsert('rs_revenues', { work_id: item.work_id, month: MONTH, [column]: item.amount });
    }
  }

  allParsed.push(...typeParsed);
  const typeTotal = [...aggregated.values()].reduce((s, v) => s + v.amount, 0);
  console.log(`  ${revenueType}: ${files.length}파일, ${aggregated.size}작품, ₩${typeTotal.toLocaleString()}`);
}

if (allErrors.length > 0) {
  console.log(`\n  ⚠ 파싱 경고 ${allErrors.length}건:`);
  for (const e of allErrors) console.log(`    ${e}`);
}

// Count total revenues
const revenues = await supaGet('rs_revenues', `month=eq.${MONTH}&select=id`);
console.log(`\n  rs_revenues 총 ${revenues.length}건 생성`);
console.log('');

// ── Step 4: 정산 계산 ──────────────────────────────────────────────────────
console.log('─'.repeat(80));
console.log('[Step 4] 정산 계산');
console.log('─'.repeat(80));

const allRevenues = await supaGet('rs_revenues', `month=eq.${MONTH}`);
const allWorkPartners = await supaGet('rs_work_partners', 'select=*,partner:partner_id(*),work:work_id(serial_start_date,serial_end_date)');

// MG balance map — use previous_balance + mg_added (= balance before this month's deduction)
const mgBalances = await supaGet('rs_mg_balances', 'select=partner_id,work_id,month,previous_balance,mg_added,current_balance&order=month.desc');
const mgBalanceMap = new Map();
for (const mg of mgBalances) {
  const key = `${mg.partner_id}|${mg.work_id}`;
  if (!mgBalanceMap.has(key)) {
    // Balance available for deduction = previous carry + new MG this month
    mgBalanceMap.set(key, Number(mg.previous_balance) + Number(mg.mg_added));
  }
}

let calcCount = 0;
for (const rev of allRevenues) {
  const wps = allWorkPartners.filter(wp => wp.work_id === rev.work_id);
  for (const wp of wps) {
    const mgBalance = wp.is_mg_applied ? (mgBalanceMap.get(`${wp.partner_id}|${wp.work_id}`) || 0) : 0;
    const salaryDeduction = Number(wp.partner?.salary_deduction) || 0;

    const workData = wp.work || {};
    const calc = calculateSettlement({
      gross_revenue: Number(rev.total),
      rs_rate: Number(wp.rs_rate),
      mg_rs_rate: wp.mg_rs_rate != null ? Number(wp.mg_rs_rate) : null,
      production_cost: 0,
      adjustment: 0,
      salary_deduction: salaryDeduction,
      other_deduction: 0,
      tax_rate: Number(wp.partner?.tax_rate || 0),
      partner_type: wp.partner?.partner_type || 'individual',
      is_mg_applied: wp.is_mg_applied,
      mg_balance: mgBalance,
      serial_end_date: workData.serial_end_date || null,
      report_type: wp.partner?.report_type || null,
      month: MONTH,
    });

    await supaUpsert('rs_settlements', {
      month: MONTH,
      partner_id: wp.partner_id,
      work_id: wp.work_id,
      gross_revenue: Number(rev.total),
      rs_rate: Number(wp.rs_rate),
      revenue_share: calc.revenue_share,
      production_cost: 0,
      adjustment: 0,
      tax_rate: Number(wp.partner?.tax_rate || 0),
      tax_amount: calc.tax_amount,
      insurance: calc.insurance,
      mg_deduction: calc.mg_deduction,
      other_deduction: 0,
      final_payment: calc.final_payment,
      status: 'draft',
    });
    calcCount++;
  }
}
console.log(`  정산 계산: ${calcCount}건 upsert`);
console.log('');

// ── Step 5: 비교 ────────────────────────────────────────────────────────────
console.log('─'.repeat(80));
console.log('[Step 5] 비교: DB vs 참조 Excel');
console.log('─'.repeat(80));

// 5-A: Revenue Comparison (더그림 sheet)
console.log('\n  ── 5-A. 매출 비교 (더그림 시트) ──');
const dgSheet = refWb.Sheets['더그림'];
if (!dgSheet) {
  console.log('  ❌ "더그림" 시트 없음 — 매출 비교 스킵');
} else {
  const dgData = XLSX.utils.sheet_to_json(dgSheet, { header: 1 });
  const excelRevenues = [];
  for (let i = 6; i < dgData.length; i++) {
    const row = dgData[i];
    if (!row || !row[2]) continue;
    const name = String(row[2]).trim();
    if (!name) continue;
    excelRevenues.push({
      name,
      domestic_paid: Number(row[4]) || 0,
      global_paid: Number(row[5]) || 0,
      domestic_ad: Number(row[6]) || 0,
      global_ad: Number(row[7]) || 0,
      secondary: Number(row[8]) || 0,
      total: Number(row[9]) || 0,
    });
  }

  const dbRevenues = await supaGet('rs_revenues', `select=*,rs_works(name)&month=eq.${MONTH}&order=total.desc`);
  const dbRevMap = new Map();
  for (const r of dbRevenues) {
    const name = r.rs_works?.name;
    if (!name) continue;
    dbRevMap.set(name, r);
    dbRevMap.set(normalizeWorkName(name), r);
  }

  let revMatch = 0, revDiff = 0, revMissing = 0;
  const revDiffs = [];
  for (const excel of excelRevenues) {
    let db = dbRevMap.get(excel.name);
    if (!db) db = dbRevMap.get(normalizeWorkName(excel.name));
    if (!db) { revMissing++; revDiffs.push(`  [MISS] ${excel.name} (₩${excel.total.toLocaleString()})`); continue; }

    const fields = ['domestic_paid', 'global_paid', 'domestic_ad', 'global_ad', 'secondary', 'total'];
    const diffs = [];
    for (const f of fields) {
      const ev = excel[f], dv = Number(db[f]);
      if (Math.abs(ev - dv) > 1) diffs.push(`${f}: Excel=${ev.toLocaleString()} DB=${dv.toLocaleString()} (${dv - ev >= 0 ? '+' : ''}${(dv - ev).toLocaleString()})`);
    }
    if (diffs.length > 0) {
      revDiff++;
      revDiffs.push(`  [DIFF] ${excel.name}:\n         ${diffs.join('\n         ')}`);
    } else {
      revMatch++;
    }
  }
  console.log(`  결과: ${revMatch} 일치 / ${revDiff} 차이 / ${revMissing} 누락`);
  if (revDiffs.length > 0) {
    console.log('');
    for (const d of revDiffs) console.log(d);
  }
}

// 5-B: Settlement Comparison (수익정산금 집계 sheet)
console.log('\n  ── 5-B. 정산 비교 (수익정산금 집계 시트) ──');
const summarySheet = refWb.Sheets['수익정산금 집계'];
if (!summarySheet) {
  console.log('  ❌ "수익정산금 집계" 시트 없음 — 정산 비교 스킵');
} else {
  const sumData = XLSX.utils.sheet_to_json(summarySheet, { header: 1 });

  // Find header row and column indices
  let headerIdx = -1;
  let colPartner = -1, colWork = -1, colRevenueShare = -1, colProductionCost = -1;
  let colAdjustment = -1, colSubtotal = -1, colVat = -1, colIncomeTax = -1;
  let colLocalTax = -1, colInsurance = -1, colOther = -1, colMg = -1, colFinal = -1;

  for (let i = 0; i < Math.min(15, sumData.length); i++) {
    const row = sumData[i];
    if (!row) continue;
    // Check for header row by looking at specific known positions
    const cell3 = row[3] != null ? String(row[3]) : '';
    if (cell3.includes('대상자')) {
      headerIdx = i;
      // Known column layout from actual Excel:
      colPartner = 3;       // 대상자
      colWork = 8;           // 작품명
      colRevenueShare = 10;  // 1. 수익분배금
      colProductionCost = 11; // 2. 제작비용
      colAdjustment = 12;    // 3. 추가조정
      colSubtotal = 13;      // 수익정산금(1~3)
      colVat = 14;           // 5. 부가세
      colIncomeTax = 15;     // 6. 소득세
      colLocalTax = 16;      // 7. 지방세
      colInsurance = 17;     // 8. 예고료
      colOther = 18;         // 9. 기타
      colMg = 19;            // 10. MG차감
      colFinal = 20;         // 지급금액(5~10)
      break;
    }
  }

  if (headerIdx < 0) {
    console.log('  ❌ 수익정산금 집계 헤더를 찾을 수 없습니다');
  } else {
    // Parse Excel settlement summary
    const excelSettlements = [];
    for (let i = headerIdx + 1; i < sumData.length; i++) {
      const row = sumData[i];
      if (!row) continue;
      const partnerName = colPartner >= 0 ? String(row[colPartner] || '').trim() : '';
      if (!partnerName) continue;
      // Skip total rows
      if (partnerName.includes('합계') || partnerName.includes('총계')) continue;

      excelSettlements.push({
        partner: partnerName,
        work: colWork >= 0 ? String(row[colWork] || '').trim() : '',
        revenue_share: colRevenueShare >= 0 ? Number(row[colRevenueShare]) || 0 : 0,
        production_cost: colProductionCost >= 0 ? Number(row[colProductionCost]) || 0 : 0,
        adjustment: colAdjustment >= 0 ? Number(row[colAdjustment]) || 0 : 0,
        subtotal: colSubtotal >= 0 ? Number(row[colSubtotal]) || 0 : 0,
        vat: colVat >= 0 ? Number(row[colVat]) || 0 : 0,
        income_tax: colIncomeTax >= 0 ? Number(row[colIncomeTax]) || 0 : 0,
        local_tax: colLocalTax >= 0 ? Number(row[colLocalTax]) || 0 : 0,
        insurance: colInsurance >= 0 ? Number(row[colInsurance]) || 0 : 0,
        other_deduction: colOther >= 0 ? Number(row[colOther]) || 0 : 0,
        mg_deduction: colMg >= 0 ? Math.abs(Number(row[colMg]) || 0) : 0,
        final_payment: colFinal >= 0 ? Number(row[colFinal]) || 0 : 0,
      });
    }

    // Fetch DB settlements
    const dbSettlements = await supaGet('rs_settlements',
      `month=eq.${MONTH}&select=*,partner:partner_id(name,partner_type),work:work_id(name)`
    );

    // Group DB settlements by partner name (sum across works, like the summary sheet)
    const dbByPartner = new Map();
    for (const s of dbSettlements) {
      const pName = s.partner?.name;
      if (!pName) continue;
      const existing = dbByPartner.get(pName);
      if (existing) {
        existing.revenue_share += Number(s.revenue_share);
        existing.production_cost += Number(s.production_cost);
        existing.adjustment += Number(s.adjustment);
        existing.tax_amount += Number(s.tax_amount);
        existing.insurance += Number(s.insurance);
        existing.mg_deduction += Number(s.mg_deduction);
        existing.other_deduction += Number(s.other_deduction);
        existing.final_payment += Number(s.final_payment);
        existing.works.push(s.work?.name);
      } else {
        dbByPartner.set(pName, {
          partner_type: s.partner?.partner_type,
          revenue_share: Number(s.revenue_share),
          production_cost: Number(s.production_cost),
          adjustment: Number(s.adjustment),
          tax_amount: Number(s.tax_amount),
          insurance: Number(s.insurance),
          mg_deduction: Number(s.mg_deduction),
          other_deduction: Number(s.other_deduction),
          final_payment: Number(s.final_payment),
          works: [s.work?.name],
        });
      }
    }

    // Excel summary is also grouped by partner — aggregate Excel rows by partner
    const excelByPartner = new Map();
    for (const es of excelSettlements) {
      const existing = excelByPartner.get(es.partner);
      if (existing) {
        existing.revenue_share += es.revenue_share;
        existing.production_cost += es.production_cost;
        existing.adjustment += es.adjustment;
        existing.subtotal += es.subtotal;
        existing.vat += es.vat;
        existing.income_tax += es.income_tax;
        existing.local_tax += es.local_tax;
        existing.insurance += es.insurance;
        existing.other_deduction += es.other_deduction;
        existing.mg_deduction += es.mg_deduction;
        existing.final_payment += es.final_payment;
      } else {
        excelByPartner.set(es.partner, { ...es });
      }
    }

    // ☆ 제거 매칭 헬퍼: Excel "박태준☆" → DB "박태준"
    function findDbMatch(name) {
      if (dbByPartner.has(name)) return dbByPartner.get(name);
      const clean = name.replace(/[☆★]/g, '').trim();
      if (clean !== name && dbByPartner.has(clean)) return dbByPartner.get(clean);
      return null;
    }
    function findDbMatchName(name) {
      if (dbByPartner.has(name)) return name;
      const clean = name.replace(/[☆★]/g, '').trim();
      if (clean !== name && dbByPartner.has(clean)) return clean;
      return null;
    }

    let settMatch = 0, settDiff = 0, settMissing = 0;
    const settDiffs = [];
    const matchedDbNames = new Set();

    for (const [partnerName, excel] of excelByPartner) {
      const db = findDbMatch(partnerName);
      const dbName = findDbMatchName(partnerName);
      if (dbName) matchedDbNames.add(dbName);
      if (!db) {
        settMissing++;
        settDiffs.push(`  [MISS] ${partnerName} (지급 ₩${excel.final_payment.toLocaleString()})`);
        continue;
      }

      // Excel stores tax/insurance as negative (deductions), DB stores as positive
      const excelTaxTotal = Math.abs(excel.income_tax + excel.local_tax);
      const excelInsurance = Math.abs(excel.insurance);
      const excelProductionCost = Math.abs(excel.production_cost);
      const excelAdjustment = excel.adjustment; // can be positive

      const comparisons = [
        ['수익분배금', excel.revenue_share, db.revenue_share],
        ['세액합계', excelTaxTotal, db.tax_amount],
        ['예고료', excelInsurance, db.insurance],
        ['MG차감', excel.mg_deduction, db.mg_deduction],
        ['제작비용', excelProductionCost, db.production_cost],
        ['추가조정', excelAdjustment, db.adjustment],
        ['지급금액', excel.final_payment, db.final_payment],
      ];

      const diffs = [];
      for (const [label, ev, dv] of comparisons) {
        if (Math.abs(ev - dv) > 2) {
          diffs.push(`${label}: Excel=${ev.toLocaleString()} DB=${dv.toLocaleString()} (${dv - ev >= 0 ? '+' : ''}${(dv - ev).toLocaleString()})`);
        }
      }

      if (diffs.length > 0) {
        settDiff++;
        settDiffs.push(`  [DIFF] ${partnerName}:\n         ${diffs.join('\n         ')}`);
      } else {
        settMatch++;
      }
    }

    // Check DB partners not in Excel
    for (const [pName, db] of dbByPartner) {
      if (!matchedDbNames.has(pName) && db.final_payment !== 0) {
        settDiffs.push(`  [DB만] ${pName}: 지급 ₩${db.final_payment.toLocaleString()}`);
      }
    }

    console.log(`  결과: ${settMatch} 일치 / ${settDiff} 차이 / ${settMissing} 누락`);
    if (settDiffs.length > 0) {
      console.log('');
      for (const d of settDiffs) console.log(d);
    }
  }
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(80));
console.log('  DONE');
console.log('═'.repeat(80));
