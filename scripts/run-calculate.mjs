/**
 * 정산 계산 트리거 — 모든 월의 rs_revenues + rs_work_partners로 rs_settlements 갱신
 *
 * Usage: node scripts/run-calculate.mjs [month]
 * Example: node scripts/run-calculate.mjs 2026-01
 * (month 생략 시 모든 월 계산)
 */
import { readFileSync } from 'fs';

const envContent = readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
};

async function supabaseGet(table, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers });
  if (!res.ok) throw new Error(`GET ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supabaseUpsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`UPSERT ${table} failed: ${res.status} ${await res.text()}`);
}

// 10원 미만 절사
const truncate10 = (n) => Math.floor(n / 10) * 10;

function calculateTax(amount, partnerType) {
  if (partnerType === 'individual') {
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
  return { income_tax: 0, local_tax: 0, vat: 0, total: 0 };
}

const targetMonth = process.argv[2] || null;

// 1) 수익 데이터 조회
const revenueParams = targetMonth ? `month=eq.${targetMonth}` : '';
const revenues = await supabaseGet('rs_revenues', revenueParams);
console.log(`수익 데이터: ${revenues.length}건`);

// 2) 작품-파트너 연결 조회
const workPartners = await supabaseGet('rs_work_partners', 'select=*,partner:partner_id(*)');
console.log(`작품-파트너: ${workPartners.length}건`);

// 3) 기존 정산 레코드 (수동 편집 필드 보존용)
const settParams = targetMonth ? `month=eq.${targetMonth}` : '';
const existingSettlements = await supabaseGet('rs_settlements', `${settParams}&select=month,partner_id,work_id,production_cost,adjustment,status,note`);
const existingMap = new Map();
for (const s of existingSettlements) {
  existingMap.set(`${s.month}|${s.partner_id}|${s.work_id}`, s);
}

// 4) MG 잔액 조회
const mgBalances = await supabaseGet('rs_mg_balances', 'select=partner_id,work_id,month,current_balance&order=month.desc');
const mgMap = new Map();
for (const mg of mgBalances) {
  const key = `${mg.partner_id}|${mg.work_id}`;
  if (!mgMap.has(key)) mgMap.set(key, Number(mg.current_balance)); // 최신만
}

// 5) 계산 및 UPSERT
let count = 0;
const months = [...new Set(revenues.map(r => r.month))].sort();
console.log(`대상 월: ${months.join(', ')}`);

for (const rev of revenues) {
  const partners = workPartners.filter(wp => wp.work_id === rev.work_id);
  for (const wp of partners) {
    const mgBalance = wp.is_mg_applied ? (mgMap.get(`${wp.partner_id}|${wp.work_id}`) || 0) : 0;
    const existing = existingMap.get(`${rev.month}|${wp.partner_id}|${wp.work_id}`);
    const productionCost = existing ? Number(existing.production_cost) : 0;
    const adjustment = existing ? Number(existing.adjustment) : 0;

    const revenue_share = Math.round(Number(rev.total) * Number(wp.rs_rate));
    const subtotal = revenue_share - productionCost + adjustment;
    const tax = calculateTax(subtotal, wp.partner.partner_type);
    const tax_amount = tax.total;

    let mg_deduction = 0;
    if (wp.is_mg_applied && mgBalance > 0) {
      const afterTax = subtotal - tax_amount;
      mg_deduction = Math.min(mgBalance, Math.max(0, afterTax));
    }
    const final_payment = subtotal - tax_amount - mg_deduction;

    await supabaseUpsert('rs_settlements', {
      month: rev.month,
      partner_id: wp.partner_id,
      work_id: wp.work_id,
      gross_revenue: Number(rev.total),
      rs_rate: Number(wp.rs_rate),
      revenue_share,
      production_cost: productionCost,
      adjustment,
      tax_rate: Number(wp.partner.tax_rate),
      tax_amount,
      mg_deduction,
      final_payment,
      ...(existing ? {} : { status: 'draft' }),
    });
    count++;
  }
}

console.log(`정산 계산 완료: ${count}건 upsert`);
