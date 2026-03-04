/**
 * 정산서(xlsm)에서 작품, 파트너, 작품-파트너 연결(RS비율)을 추출하여 DB에 등록
 *
 * Usage: node scripts/seed-from-settlement.mjs [path-to-xlsm]
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

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const filePath = process.argv[2] || './docs/accounting_sample/2026-01 RS정산(26년02월지급).xlsm';
const wb = XLSX.readFile(filePath);

// --- Helper: Supabase REST API ---
async function supabasePost(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${table} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function supabaseUpsert(table, data, onConflict) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
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

// --- 1) 더그림 시트에서 작품 목록 추출 ---
console.log('=== 1. 작품 목록 추출 (더그림 시트) ===');
const dgSheet = wb.Sheets['더그림'];
const dgData = XLSX.utils.sheet_to_json(dgSheet, { header: 1 });

/** Excel serial number → YYYY-MM-DD */
function excelDateToISO(serial) {
  if (!serial || typeof serial !== 'number') return null;
  const d = new Date((serial - 25569) * 86400 * 1000);
  return d.toISOString().split('T')[0];
}

const workEntries = []; // { name, serial_start_date, serial_end_date }
for (let i = 6; i < dgData.length; i++) {
  const row = dgData[i];
  if (!row || !row[2]) continue;
  const name = String(row[2]).trim();
  if (name) workEntries.push({
    name,
    serial_start_date: excelDateToISO(row[23]),
    serial_end_date: excelDateToISO(row[24]),
  });
}
const workNames = workEntries.map(w => w.name);
console.log(`  ${workNames.length}개 작품 발견`);

// --- 2) 작가RS 시트에서 파트너 정보 + RS 비율 추출 ---
console.log('\n=== 2. 파트너 + RS 비율 추출 (작가RS 시트) ===');
const rsSheet = wb.Sheets['작가RS'];
const rsData = XLSX.utils.sheet_to_json(rsSheet, { header: 1 });

// Row 2 = header: 작품명(B), 파트너명(C), 필명, 파트너구분, 부가세계약, 부가세협의, R/S요율, MG R/S요율, 공제항목, 계약구분
const relationships = [];
const partnerSet = new Map(); // name -> { partner_type, ... }

for (let i = 3; i < rsData.length; i++) {
  const row = rsData[i];
  if (!row || !row[0] || !row[1]) continue;

  const workName = String(row[0]).trim();
  const partnerName = String(row[1]).trim();
  const partnerTypeRaw = String(row[3] || '').trim();
  const rsRate = Number(row[6]) || 0;
  const mgRsRate = row[7] != null && row[7] !== '' ? Number(row[7]) : null;
  const contractType = String(row[9] || 'RS').trim();

  if (!workName || !partnerName || rsRate === 0) continue;

  // 파트너 구분 매핑
  let partnerType = 'individual';
  if (partnerTypeRaw === '사업자') partnerType = 'domestic_corp';
  else if (partnerTypeRaw === '해외사업자') partnerType = 'foreign_corp';

  if (!partnerSet.has(partnerName)) {
    partnerSet.set(partnerName, { partner_type: partnerType });
  }

  relationships.push({ workName, partnerName, rsRate, mgRsRate, contractType });
}

console.log(`  ${partnerSet.size}개 파트너, ${relationships.length}개 작품-파트너 연결`);

// --- Helper: fetch existing data ---
async function supabaseGet(table, select = '*') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
  });
  return res.json();
}

// --- 3) DB에 작품 등록 (기존 있으면 스킵) ---
console.log('\n=== 3. 작품 등록 ===');
const workMap = new Map(); // name -> id

const existingWorks = await supabaseGet('rs_works', 'id,name');
for (const w of existingWorks) {
  workMap.set(w.name, w.id);
}
console.log(`  기존 ${workMap.size}개 작품`);

let newWorkCount = 0;
let updatedWorkCount = 0;
for (const entry of workEntries) {
  if (workMap.has(entry.name)) {
    // 기존 작품 — 연재기간 업데이트
    if (entry.serial_start_date || entry.serial_end_date) {
      try {
        const updateData = {};
        if (entry.serial_start_date) updateData.serial_start_date = entry.serial_start_date;
        if (entry.serial_end_date) updateData.serial_end_date = entry.serial_end_date;
        const existingId = workMap.get(entry.name);
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rs_works?id=eq.${existingId}`, {
          method: 'PATCH',
          headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData),
        });
        if (res.ok) updatedWorkCount++;
      } catch (e) { /* ignore update errors */ }
    }
    continue;
  }
  try {
    const workData = {
      name: entry.name,
      naver_name: entry.name,
      contract_type: 'exclusive',
      settlement_level: 'work',
      is_active: true,
    };
    if (entry.serial_start_date) workData.serial_start_date = entry.serial_start_date;
    if (entry.serial_end_date) workData.serial_end_date = entry.serial_end_date;
    const [work] = await supabasePost('rs_works', workData);
    workMap.set(entry.name, work.id);
    newWorkCount++;
    process.stdout.write('.');
  } catch (e) {
    console.error(`\n  작품 등록 실패 [${entry.name}]: ${e.message}`);
  }
}
console.log(`\n  신규 ${newWorkCount}개, 연재기간 업데이트 ${updatedWorkCount}개, 총 ${workMap.size}개`);

// --- 4) DB에 파트너 등록 (기존 있으면 스킵) ---
console.log('\n=== 4. 파트너 등록 ===');
const partnerMap = new Map(); // name -> id

const existingPartners = await supabaseGet('rs_partners', 'id,name');
for (const p of existingPartners) {
  partnerMap.set(p.name, p.id);
  partnerMap.set(p.name.toLowerCase(), p.id);
}
console.log(`  기존 ${partnerMap.size}개 파트너`);

let newPartnerCount = 0;
for (const [name, info] of partnerSet) {
  if (partnerMap.has(name) || partnerMap.has(name.toLowerCase())) continue;
  try {
    const [partner] = await supabasePost('rs_partners', {
      name,
      partner_type: info.partner_type,
      tax_rate: info.partner_type === 'domestic_corp' ? 0.033 : 0.033,
    });
    partnerMap.set(name, partner.id);
    partnerMap.set(name.toLowerCase(), partner.id);
    newPartnerCount++;
    process.stdout.write('.');
  } catch (e) {
    console.error(`\n  파트너 등록 실패 [${name}]: ${e.message}`);
  }
}
console.log(`\n  신규 ${newPartnerCount}개 등록, 총 ${partnerMap.size}개`);

// --- 5) 작품-파트너 연결 등록 ---
console.log('\n=== 5. 작품-파트너 연결 등록 ===');

// 정규화 매칭용 맵 구축
function normalize(name) {
  return name.trim()
    .split(':')[0]           // 부제 제거
    .replace(/\s+/g, '')    // 공백 제거
    .replace(/[!?！？]+$/, '') // 끝 느낌표/물음표 제거
    .toLowerCase();          // 대소문자 통일
}
const normalizedWorkMap = new Map();
for (const [name, id] of workMap) {
  normalizedWorkMap.set(normalize(name), id);
}

// 기존 연결 조회
const existingWP = await supabaseGet('rs_work_partners', 'work_id,partner_id');
const wpExistSet = new Set(existingWP.map(wp => `${wp.work_id}:${wp.partner_id}`));
console.log(`  기존 ${wpExistSet.size}개 연결`);

let wpCount = 0;
let wpSkipped = 0;
let wpExisted = 0;

for (const rel of relationships) {
  const workId = workMap.get(rel.workName) || normalizedWorkMap.get(normalize(rel.workName));
  const partnerId = partnerMap.get(rel.partnerName) || partnerMap.get(rel.partnerName.toLowerCase());

  if (!workId || !partnerId) {
    wpSkipped++;
    if (!workId) console.error(`  작품 없음: ${rel.workName} (normalized: ${normalize(rel.workName)})`);
    if (!partnerId) console.error(`  파트너 없음: ${rel.partnerName}`);
    continue;
  }

  if (wpExistSet.has(`${workId}:${partnerId}`)) {
    wpExisted++;
    continue;
  }

  try {
    const wpData = {
      work_id: workId,
      partner_id: partnerId,
      rs_rate: rel.rsRate,
      role: rel.contractType === 'MG' ? 'MG' : 'RS',
    };
    if (rel.mgRsRate != null) wpData.mg_rs_rate = rel.mgRsRate;
    await supabasePost('rs_work_partners', wpData);
    wpCount++;
    wpExistSet.add(`${workId}:${partnerId}`);
    process.stdout.write('.');
  } catch (e) {
    console.error(`\n  연결 실패 [${rel.workName} - ${rel.partnerName}]: ${e.message}`);
  }
}
console.log(`\n  신규 ${wpCount}개, 기존 ${wpExisted}개, 스킵 ${wpSkipped}개`);

// --- Summary ---
console.log('\n=== 완료 ===');
console.log(`작품: ${workMap.size}/${workNames.length}`);
console.log(`파트너: ${partnerMap.size}/${partnerSet.size}`);
console.log(`연결: ${wpCount}/${relationships.length}`);
