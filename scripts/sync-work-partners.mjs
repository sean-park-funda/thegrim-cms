/**
 * 정산서 Excel의 "개별RS 검증" 시트에서 작품-파트너 연결을 추출하여 DB와 동기화
 * - 없는 파트너 자동 등록
 * - 없는 작품-파트너 연결 자동 추가
 */
import XLSX from 'xlsx';
import { readFileSync } from 'fs';

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
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }
  });
  return res.json();
}

async function supaPost(table, data) {
  const res = await fetch(`${SURL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': KEY, 'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${table} failed (${res.status}): ${text}`);
  }
  return res.json();
}

const filePath = process.argv[2] || './docs/accounting_sample/2026-01 RS정산(26년02월지급).xlsm';
const wb = XLSX.readFile(filePath);

// --- 1) 개별RS 검증 시트에서 작품-파트너-요율 추출 ---
const vSheet = wb.Sheets['개별RS 검증'];
const vData = XLSX.utils.sheet_to_json(vSheet, { header: 1 });

// Header at row 8 (index 7): NO, 귀속월, 대상자, 거래처명, 소득구분, 사업자번호, 정산대상, 작품명, 매출액, 적용율, 정산대상금, RS요율, ...
// Col indices: 3=대상자, 4=거래처명, 5=소득구분, 8=작품명, 12=RS요율, 19=MG적용, 20=MG요율, 21=RS요율(별도)

const entries = [];
for (let i = 8; i < vData.length; i++) {
  const row = vData[i];
  if (!row || !row[3] || !row[8]) continue;
  const partnerName = String(row[3]).trim();
  const companyName = String(row[4] || '').trim();
  const incomeType = String(row[5] || '').trim();
  const workName = String(row[8]).trim();
  const rsRate = Number(row[12]) || 0;
  const isMg = row[19] === true || row[19] === 'TRUE' || row[19] === 1;
  const mgRate = Number(row[20]) || 0;

  if (!partnerName || !workName) continue;

  // 소득구분 -> partner_type
  let partnerType = 'individual';
  if (incomeType.includes('사업자(국내)')) partnerType = 'domestic_corp';
  else if (incomeType.includes('사업자(해외)')) partnerType = 'foreign_corp';
  else if (incomeType.includes('네이버')) partnerType = 'naver';

  entries.push({ partnerName, companyName, partnerType, workName, rsRate, isMg, mgRate });
}
console.log(`개별RS 검증에서 ${entries.length}개 항목 추출`);

// --- 2) 수익정산금 집계에서 파트너-거래처명 보강 ---
const sSheet = wb.Sheets['수익정산금 집계'];
const sData = XLSX.utils.sheet_to_json(sSheet, { header: 1 });
const summaryPartners = new Map();
for (let i = 8; i < sData.length; i++) {
  const row = sData[i];
  if (!row || !row[3]) continue;
  const name = String(row[3]).trim();
  const company = String(row[4] || '').trim();
  const type = String(row[5] || '').trim();
  if (name && !summaryPartners.has(name)) {
    summaryPartners.set(name, { company, type });
  }
}

// --- 3) DB 현황 조회 ---
const works = await supaGet('rs_works', 'id,name');
const partners = await supaGet('rs_partners', 'id,name');
const wps = await supaGet('rs_work_partners', 'id,work_id,partner_id');

const workMap = new Map(works.map(w => [w.name, w.id]));
const partnerMap = new Map();
for (const p of partners) {
  partnerMap.set(p.name, p.id);
  partnerMap.set(p.name.toLowerCase(), p.id);
}
const wpSet = new Set(wps.map(wp => `${wp.work_id}:${wp.partner_id}`));

console.log(`DB: ${workMap.size} works, ${partnerMap.size} partners, ${wpSet.size} links`);

// --- 4) 없는 파트너 등록 ---
const uniquePartners = new Map();
for (const e of entries) {
  if (!uniquePartners.has(e.partnerName)) {
    const summary = summaryPartners.get(e.partnerName);
    uniquePartners.set(e.partnerName, {
      partnerType: e.partnerType,
      companyName: summary?.company || e.companyName || '',
    });
  }
}

let newPartners = 0;
for (const [name, info] of uniquePartners) {
  if (partnerMap.has(name) || partnerMap.has(name.toLowerCase())) continue;
  try {
    const [p] = await supaPost('rs_partners', {
      name,
      company_name: info.companyName,
      partner_type: info.partnerType,
      tax_rate: info.partnerType === 'domestic_corp' ? 0.1 : info.partnerType === 'foreign_corp' ? 0.22 : 0.033,
    });
    partnerMap.set(name, p.id);
    partnerMap.set(name.toLowerCase(), p.id);
    newPartners++;
    process.stdout.write('+');
  } catch (e) {
    console.error(`\n파트너 등록 실패 [${name}]: ${e.message}`);
  }
}
if (newPartners) console.log(`\n${newPartners}명 파트너 신규 등록`);

// --- 5) 없는 작품 등록 ---
let newWorks = 0;
for (const e of entries) {
  if (workMap.has(e.workName)) continue;
  try {
    const [w] = await supaPost('rs_works', {
      name: e.workName, naver_name: e.workName,
      contract_type: 'exclusive', settlement_level: 'work', is_active: true,
    });
    workMap.set(e.workName, w.id);
    newWorks++;
    process.stdout.write('w');
  } catch (e2) {
    console.error(`\n작품 등록 실패 [${e.workName}]: ${e2.message}`);
  }
}
if (newWorks) console.log(`\n${newWorks}개 작품 신규 등록`);

// --- 6) 없는 연결 추가 ---
let newLinks = 0;
let skipped = 0;
for (const e of entries) {
  const workId = workMap.get(e.workName);
  const partnerId = partnerMap.get(e.partnerName) || partnerMap.get(e.partnerName.toLowerCase());
  if (!workId || !partnerId) { skipped++; continue; }
  if (wpSet.has(`${workId}:${partnerId}`)) continue;

  try {
    await supaPost('rs_work_partners', {
      work_id: workId,
      partner_id: partnerId,
      rs_rate: e.rsRate,
      is_mg_applied: e.isMg,
      role: 'author',
    });
    wpSet.add(`${workId}:${partnerId}`);
    newLinks++;
    process.stdout.write('.');
  } catch (err) {
    console.error(`\n연결 실패 [${e.workName} - ${e.partnerName}]: ${err.message}`);
  }
}

console.log(`\n\n=== 결과 ===`);
console.log(`파트너: +${newPartners} (총 ${partnerMap.size})`);
console.log(`작품: +${newWorks} (총 ${workMap.size})`);
console.log(`연결: +${newLinks} (총 ${wpSet.size})`);
if (skipped) console.log(`스킵: ${skipped}`);
