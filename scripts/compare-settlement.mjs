import XLSX from 'xlsx';
import { readFileSync } from 'fs';

// Load env
const envContent = readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

// 1) Fetch DB revenues
const MONTH = process.argv[2] || '2026-01';
const res = await fetch(`${SUPABASE_URL}/rest/v1/rs_revenues?select=*,rs_works(name)&month=eq.${MONTH}&order=total.desc`, {
  headers: {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
  }
});
const dbRevenues = await res.json();

// Build DB map: work_name -> { domestic_paid, global_paid, domestic_ad, global_ad, secondary, total }
const dbMap = new Map();
for (const r of dbRevenues) {
  const name = r.rs_works?.name;
  if (!name) continue;
  dbMap.set(name, {
    domestic_paid: r.domestic_paid,
    global_paid: r.global_paid,
    domestic_ad: r.domestic_ad,
    global_ad: r.global_ad,
    secondary: r.secondary,
    total: r.total,
  });
}

// 2) Parse Excel "더그림" sheet for work-level revenue breakdown
const wb = XLSX.readFile('./docs/accounting_sample/2026-01 RS정산(26년02월지급).xlsm');
const dgSheet = wb.Sheets['더그림'];
const dgData = XLSX.utils.sheet_to_json(dgSheet, { header: 1 });

// Headers at row 5 (idx 5): 작품명(idx 2), 국내유료(idx 4), 글로벌유료(idx 5), 국내광고(idx 6), 글로벌광고(idx 7), 2차사업(idx 8), 순수익계(idx 9)
const excelWorks = [];
for (let i = 6; i < dgData.length; i++) {
  const row = dgData[i];
  if (!row || !row[2]) continue;
  const name = String(row[2]).trim();
  if (!name) continue;

  excelWorks.push({
    name,
    domestic_paid: Number(row[4]) || 0,
    global_paid: Number(row[5]) || 0,
    domestic_ad: Number(row[6]) || 0,
    global_ad: Number(row[7]) || 0,
    secondary: Number(row[8]) || 0,
    total: Number(row[9]) || 0,
  });
}

// 3) Compare
console.log('='.repeat(120));
console.log(`작품별 매출 비교: Excel 정산서 vs DB (month=${MONTH})`);
console.log('='.repeat(120));
console.log('');

// Normalize work names for matching
function normalize(name) {
  return name.replace(/[\s:!?·]/g, '').replace(/[！？]/g, '');
}

const matched = new Set();
const diffs = [];
const missing_in_db = [];
const missing_in_excel = [];

for (const excel of excelWorks) {
  // Try exact match first, then normalized match
  let dbEntry = dbMap.get(excel.name);
  let matchedName = excel.name;

  if (!dbEntry) {
    const normExcel = normalize(excel.name);
    for (const [dbName, dbVal] of dbMap.entries()) {
      if (normalize(dbName) === normExcel) {
        dbEntry = dbVal;
        matchedName = dbName;
        break;
      }
    }
  }

  if (!dbEntry) {
    missing_in_db.push(excel);
    continue;
  }

  matched.add(matchedName);

  // Compare each field
  const fields = ['domestic_paid', 'global_paid', 'domestic_ad', 'global_ad', 'secondary', 'total'];
  const fieldDiffs = [];

  for (const f of fields) {
    const excelVal = excel[f];
    const dbVal = dbEntry[f];
    if (Math.abs(excelVal - dbVal) > 1) { // Allow 1원 rounding
      fieldDiffs.push({ field: f, excel: excelVal, db: dbVal, diff: dbVal - excelVal });
    }
  }

  if (fieldDiffs.length > 0) {
    diffs.push({ name: excel.name, dbName: matchedName, fieldDiffs });
  }
}

// Check DB works not in Excel
for (const [dbName, dbVal] of dbMap.entries()) {
  if (!matched.has(dbName) && dbVal.total > 0) {
    // Check if normalized match exists
    const normDb = normalize(dbName);
    const inExcel = excelWorks.some(e => normalize(e.name) === normDb);
    if (!inExcel) {
      missing_in_excel.push({ name: dbName, ...dbVal });
    }
  }
}

// Print results
if (diffs.length === 0 && missing_in_db.length === 0 && missing_in_excel.length === 0) {
  console.log('✅ 모든 작품 매출이 일치합니다!');
} else {
  if (diffs.length > 0) {
    console.log(`❌ 매출 불일치: ${diffs.length}건`);
    console.log('-'.repeat(120));
    for (const d of diffs) {
      console.log(`\n작품: ${d.name}${d.dbName !== d.name ? ` (DB: ${d.dbName})` : ''}`);
      for (const fd of d.fieldDiffs) {
        const label = { domestic_paid: '국내유료', global_paid: '글로벌유료', domestic_ad: '국내광고', global_ad: '글로벌광고', secondary: '2차사업', total: '합계' }[fd.field];
        console.log(`  ${label}: Excel=${fd.excel.toLocaleString()} | DB=${fd.db.toLocaleString()} | 차이=${fd.diff.toLocaleString()}`);
      }
    }
  }

  if (missing_in_db.length > 0) {
    console.log(`\n\n⚠️ Excel에는 있지만 DB에 없는 작품: ${missing_in_db.length}건`);
    console.log('-'.repeat(120));
    for (const m of missing_in_db) {
      console.log(`  ${m.name} (합계: ${m.total.toLocaleString()})`);
    }
  }

  if (missing_in_excel.length > 0) {
    console.log(`\n\n⚠️ DB에는 있지만 Excel에 없는 작품: ${missing_in_excel.length}건`);
    console.log('-'.repeat(120));
    for (const m of missing_in_excel) {
      console.log(`  ${m.name} (합계: ${m.total.toLocaleString()})`);
    }
  }
}

// Summary
console.log('\n\n=== 요약 ===');
console.log(`Excel 작품 수: ${excelWorks.length}`);
console.log(`DB 작품 수 (total>0): ${[...dbMap.values()].filter(v => v.total > 0).length}`);
console.log(`매칭 성공: ${matched.size}`);
console.log(`불일치: ${diffs.length}`);
console.log(`DB 누락: ${missing_in_db.length}`);
console.log(`Excel 누락: ${missing_in_excel.length}`);
