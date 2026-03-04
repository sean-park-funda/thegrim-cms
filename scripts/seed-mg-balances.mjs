/**
 * 정산서 Excel "MG현황 집계" 시트에서 MG 잔액 데이터를 추출하여 rs_mg_balances에 시드
 *
 * Usage: node scripts/seed-mg-balances.mjs [path-to-xlsm]
 * Default: ./docs/accounting_sample/2026-01 RS정산(26년02월지급).xlsm
 */
import XLSX from 'xlsx';
import { readFileSync } from 'fs';

// Load env
const envContent = readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
});

const SURL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

async function supaGet(table, select) {
  const res = await fetch(`${SURL}/rest/v1/${table}?select=${encodeURIComponent(select)}`, {
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` },
  });
  return res.json();
}

async function supaUpsert(table, data) {
  const res = await fetch(`${SURL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': KEY,
      'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation,resolution=merge-duplicates',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`UPSERT ${table} failed (${res.status}): ${text}`);
  }
  return res.json();
}

const filePath = process.argv[2] || './docs/accounting_sample/2026-01 RS정산(26년02월지급).xlsm';
const wb = XLSX.readFile(filePath);

// --- 1) MG현황 집계 시트 파싱 ---
const mgSheet = wb.Sheets['MG현황 집계'];
if (!mgSheet) {
  console.error('MG현황 집계 시트를 찾을 수 없습니다.');
  process.exit(1);
}
const mgData = XLSX.utils.sheet_to_json(mgSheet, { header: 1 });

// Header at row 7 (index 7):
// [1]=NO, [2]=귀속월, [3]=파트너명, [4]=거래처명, [5]=사업자등록번호, [6]=소득구분, [7]=신고구분, [8]=작품명
// [9]=전월이월, [10]=당월MG추가, [11]=당월MG차감, [12]=MG잔액, [13]=정산서, [14]=특이사항
const entries = [];
for (let i = 8; i < mgData.length; i++) {
  const row = mgData[i];
  if (!row || !row[3] || !row[8]) continue;

  const partnerName = String(row[3]).trim();
  const workNames = String(row[8]).trim();
  const month = String(row[2] || '2026-01').trim();
  const previousBalance = Number(row[9]) || 0;
  const mgAdded = Number(row[10]) || 0;
  const mgDeducted = Math.abs(Number(row[11]) || 0); // Excel has negative values
  const currentBalance = Number(row[12]) || 0;
  const reportType = row[7] ? String(row[7]).trim() : null;
  const note = row[14] ? String(row[14]).trim() : null;

  // 쉼표로 구분된 작품명 → 여러 작품이 있어도 각 행이 별도 행(예: 하승범)
  // 따라서 각 행을 그대로 하나의 작품으로 처리
  // 만약 쉼표 구분이면 첫 번째 작품 사용 (인생존망,인생존망2,얼짱시대 같은 케이스)
  const primaryWork = workNames.split(',')[0].trim();

  entries.push({
    partnerName,
    workName: primaryWork,
    allWorkNames: workNames,
    month,
    previousBalance,
    mgAdded,
    mgDeducted,
    currentBalance,
    reportType,
    note,
  });
}
console.log(`MG현황 집계에서 ${entries.length}건 추출`);

// --- 2) DB에서 파트너/작품 매핑 조회 ---
const partners = await supaGet('rs_partners', 'id,name');
const works = await supaGet('rs_works', 'id,name');

const partnerMap = new Map();
/** 파트너명 정규화 — ☆★ 제거, 괄호 내용 제거, 공백 정리 */
function normalizePartner(name) {
  return name.replace(/[☆★]/g, '').trim();
}
for (const p of partners) {
  partnerMap.set(p.name, p.id);
  partnerMap.set(p.name.toLowerCase(), p.id);
  partnerMap.set(normalizePartner(p.name), p.id);
  partnerMap.set(normalizePartner(p.name).toLowerCase(), p.id);
}
const workMap = new Map(works.map(w => [w.name, w.id]));

// 정규화 매칭용
function normalize(name) {
  return name.trim()
    .split(':')[0]
    .replace(/\s+/g, '')
    .replace(/[!?！？]+$/, '')
    .toLowerCase();
}
const normalizedWorkMap = new Map();
for (const [name, id] of workMap) {
  normalizedWorkMap.set(normalize(name), id);
}

console.log(`DB: ${partnerMap.size} partners, ${workMap.size} works`);

// --- 3) MG 잔액 데이터 upsert ---
let success = 0;
let failed = 0;

for (const e of entries) {
  const partnerId = partnerMap.get(e.partnerName) || partnerMap.get(e.partnerName.toLowerCase())
    || partnerMap.get(normalizePartner(e.partnerName)) || partnerMap.get(normalizePartner(e.partnerName).toLowerCase());
  if (!partnerId) {
    console.error(`  파트너 없음: "${e.partnerName}"`);
    failed++;
    continue;
  }

  // 작품 매칭: 정확 매칭 → 정규화 매칭
  let workId = workMap.get(e.workName) || normalizedWorkMap.get(normalize(e.workName));

  // 쉼표 구분 작품명인 경우 개별 시도
  if (!workId && e.allWorkNames.includes(',')) {
    const names = e.allWorkNames.split(',').map(n => n.trim());
    for (const n of names) {
      workId = workMap.get(n) || normalizedWorkMap.get(normalize(n));
      if (workId) break;
    }
  }

  if (!workId) {
    console.error(`  작품 없음: "${e.workName}" (파트너: ${e.partnerName})`);
    failed++;
    continue;
  }

  try {
    await supaUpsert('rs_mg_balances', {
      month: e.month,
      partner_id: partnerId,
      work_id: workId,
      previous_balance: e.previousBalance,
      mg_added: e.mgAdded,
      mg_deducted: e.mgDeducted,
      current_balance: e.currentBalance,
      note: e.note,
    });
    success++;
    process.stdout.write('.');
  } catch (err) {
    console.error(`\n  upsert 실패 [${e.partnerName} - ${e.workName}]: ${err.message}`);
    failed++;
  }
}

// --- 4) MG 기록 있는 작품-파트너에 is_mg_applied=true 설정 ---
console.log('\n\n=== 4. is_mg_applied 플래그 설정 ===');
const mgPartnerWorkPairs = new Set();
const partnerReportTypes = new Map(); // partnerId -> reportType

for (const e of entries) {
  const partnerId = partnerMap.get(e.partnerName) || partnerMap.get(e.partnerName.toLowerCase())
    || partnerMap.get(normalizePartner(e.partnerName)) || partnerMap.get(normalizePartner(e.partnerName).toLowerCase());
  const workId = workMap.get(e.workName) || normalizedWorkMap.get(normalize(e.workName));
  if (partnerId && workId) {
    mgPartnerWorkPairs.add(`${workId}:${partnerId}`);
    if (e.reportType && !partnerReportTypes.has(partnerId)) {
      partnerReportTypes.set(partnerId, e.reportType);
    }
  }
}

let mgFlagCount = 0;
for (const pair of mgPartnerWorkPairs) {
  const [workId, partnerId] = pair.split(':');
  try {
    const res = await fetch(`${SURL}/rest/v1/rs_work_partners?work_id=eq.${workId}&partner_id=eq.${partnerId}`, {
      method: 'PATCH',
      headers: {
        'apikey': KEY,
        'Authorization': `Bearer ${KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ is_mg_applied: true }),
    });
    if (res.ok) mgFlagCount++;
  } catch (e) { /* ignore */ }
}
console.log(`  is_mg_applied=true 설정: ${mgFlagCount}건`);

// --- 5) 파트너 report_type 업데이트 ---
console.log('\n=== 5. 파트너 신고구분(report_type) 업데이트 ===');
let rtCount = 0;
for (const [partnerId, reportType] of partnerReportTypes) {
  try {
    const res = await fetch(`${SURL}/rest/v1/rs_partners?id=eq.${partnerId}`, {
      method: 'PATCH',
      headers: {
        'apikey': KEY,
        'Authorization': `Bearer ${KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ report_type: reportType }),
    });
    if (res.ok) rtCount++;
  } catch (e) { /* ignore */ }
}
console.log(`  report_type 업데이트: ${rtCount}건`);

console.log('\n=== 완료 ===');
console.log(`MG 잔액: 성공 ${success}건, 실패 ${failed}건 (총 ${entries.length}건)`);
console.log(`is_mg_applied: ${mgFlagCount}건, report_type: ${rtCount}건`);
