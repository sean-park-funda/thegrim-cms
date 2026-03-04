/**
 * 정산서 Excel "수익정산금 집계" 시트에서 제작비용, 추가조정, 기타공제, 신고구분을 추출하여 DB에 반영
 *
 * - rs_settlements에 production_cost, adjustment, other_deduction 업데이트
 * - rs_partners에 report_type 업데이트
 *
 * Usage: node scripts/seed-settlement-details.mjs [path-to-xlsm] [month]
 * Default: ./docs/accounting_sample/2026-01 RS정산(26년02월지급).xlsm, 2026-01
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

const filePath = process.argv[2] || './docs/accounting_sample/2026-01 RS정산(26년02월지급).xlsm';
const MONTH = process.argv[3] || '2026-01';

const wb = XLSX.readFile(filePath);

async function supaGet(table, select, filter = '') {
  const res = await fetch(`${SURL}/rest/v1/${table}?select=${encodeURIComponent(select)}${filter}`, {
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` },
  });
  return res.json();
}

async function supaPatch(table, filter, data) {
  const res = await fetch(`${SURL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      'apikey': KEY,
      'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  });
  return res.ok;
}

// --- 1) 수익정산금 집계 시트 파싱 ---
console.log('=== 1. 수익정산금 집계 시트 파싱 ===');
const sheet = wb.Sheets['수익정산금 집계'];
if (!sheet) { console.error('수익정산금 집계 시트를 찾을 수 없습니다.'); process.exit(1); }

const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
// Header at row 7: [3]=대상자, [7]=신고구분, [8]=작품명, [10]=수익분배금, [11]=제작비용, [12]=추가조정, [17]=예고료, [18]=기타

const entries = [];
for (let i = 8; i < data.length; i++) {
  const row = data[i];
  if (!row || !row[3]) continue;

  const partnerName = String(row[3]).trim();
  const reportType = row[7] ? String(row[7]).trim() : null;
  const workNames = row[8] ? String(row[8]).trim() : '';
  const productionCost = Number(row[11]) || 0;
  const adjustment = Number(row[12]) || 0;
  const otherDeduction = Number(row[18]) || 0;

  // 제작비용, 조정, 기타공제 중 하나라도 있으면 기록
  if (productionCost !== 0 || adjustment !== 0 || otherDeduction !== 0 || reportType) {
    entries.push({ partnerName, reportType, workNames, productionCost, adjustment, otherDeduction });
  }
}
console.log(`  ${entries.length}건 추출 (제작비/조정/기타공제/신고구분 있는 행)`);

// --- 2) DB에서 파트너/작품 매핑 조회 ---
console.log('\n=== 2. DB 매핑 조회 ===');
const partners = await supaGet('rs_partners', 'id,name');
const works = await supaGet('rs_works', 'id,name');

const partnerMap = new Map();
for (const p of partners) {
  partnerMap.set(p.name, p.id);
  partnerMap.set(p.name.toLowerCase(), p.id);
}

function normalize(name) {
  return name.trim().split(':')[0].replace(/\s+/g, '').replace(/[!?！？]+$/, '').toLowerCase();
}
const workMap = new Map(works.map(w => [w.name, w.id]));
const normalizedWorkMap = new Map();
for (const [name, id] of workMap) {
  normalizedWorkMap.set(normalize(name), id);
}

console.log(`  파트너: ${partnerMap.size}, 작품: ${workMap.size}`);

// --- 3) 정산 데이터에 제작비/조정/기타공제 업데이트 ---
console.log('\n=== 3. 정산 데이터 업데이트 ===');
let settlementUpdated = 0;
let settlementSkipped = 0;
let reportTypeUpdated = 0;

for (const e of entries) {
  // ☆ 파트너 이름 매칭 (☆ 제거 시도)
  let partnerId = partnerMap.get(e.partnerName) || partnerMap.get(e.partnerName.toLowerCase());
  if (!partnerId) {
    // ☆ 뒤 제거해서 재시도: "스튜디오정연(김봉혁)☆" → "스튜디오정연(김봉혁)"
    const cleanName = e.partnerName.replace(/☆$/, '').trim();
    partnerId = partnerMap.get(cleanName) || partnerMap.get(cleanName.toLowerCase());
  }
  if (!partnerId) {
    // 괄호 포함 제거: "김동균(스튜디오숭늉)" → "김동균"
    const baseName = e.partnerName.split('(')[0].trim();
    partnerId = partnerMap.get(baseName) || partnerMap.get(baseName.toLowerCase());
  }

  if (!partnerId) {
    console.error(`  파트너 없음: "${e.partnerName}"`);
    settlementSkipped++;
    continue;
  }

  // 신고구분 업데이트
  if (e.reportType) {
    const ok = await supaPatch('rs_partners', `id=eq.${partnerId}`, { report_type: e.reportType });
    if (ok) reportTypeUpdated++;
  }

  // 제작비/조정/기타공제가 없으면 정산 업데이트 스킵
  if (e.productionCost === 0 && e.adjustment === 0 && e.otherDeduction === 0) continue;

  // 해당 파트너의 정산 레코드 조회
  const settlements = await supaGet(
    'rs_settlements',
    'id,work_id,production_cost,adjustment,other_deduction',
    `&month=eq.${MONTH}&partner_id=eq.${partnerId}`
  );

  if (!settlements || settlements.length === 0) {
    console.error(`  정산 레코드 없음: "${e.partnerName}" (${MONTH})`);
    settlementSkipped++;
    continue;
  }

  // 첫 번째 정산 레코드에 값 할당 (파트너 레벨 → 첫 번째 작품에 배분)
  const target = settlements[0];
  const updateData = {};
  if (e.productionCost !== 0) updateData.production_cost = e.productionCost;
  if (e.adjustment !== 0) updateData.adjustment = e.adjustment;
  if (e.otherDeduction !== 0) updateData.other_deduction = Math.abs(e.otherDeduction);

  const ok = await supaPatch('rs_settlements', `id=eq.${target.id}`, updateData);
  if (ok) {
    settlementUpdated++;
    process.stdout.write('.');
  } else {
    console.error(`\n  업데이트 실패: "${e.partnerName}"`);
    settlementSkipped++;
  }
}

console.log(`\n\n=== 완료 ===`);
console.log(`정산 업데이트: ${settlementUpdated}건, 스킵: ${settlementSkipped}건`);
console.log(`신고구분 업데이트: ${reportTypeUpdated}건`);
