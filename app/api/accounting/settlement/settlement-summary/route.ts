import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { calculateTax, calculateInsurance } from '@/lib/settlement/calculator';

// GET /api/accounting/settlement/settlement-summary?month=YYYY-MM
// 파트너별 정산 집계 (수익정산금 집계 시트 대응)
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedClient(request);
    if (!auth) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const { supabase } = auth;

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', auth.userId).single();
    if (!profile || !canViewAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    if (!month) {
      return NextResponse.json({ error: '월은 필수입니다.' }, { status: 400 });
    }

    // 1) 해당 월 정산 데이터 (파트너+작품 join)
    const { data: settlements, error: sErr } = await supabase
      .from('rs_settlements')
      .select('*, partner:rs_partners(*), work:rs_works(name)')
      .eq('month', month);

    if (sErr) {
      console.error('정산 조회 오류:', sErr);
      return NextResponse.json({ error: '조회 실패' }, { status: 500 });
    }

    if (!settlements || settlements.length === 0) {
      return NextResponse.json({ summary: [] });
    }

    // 2) 작품-파트너 연결 (특이사항 note 조회)
    const { data: workPartners } = await supabase
      .from('rs_work_partners')
      .select('partner_id, note');

    // 파트너별 특이사항 맵
    const partnerNotesMap = new Map<string, string[]>();
    for (const wp of (workPartners || [])) {
      if (wp.note) {
        const notes = partnerNotesMap.get(wp.partner_id) || [];
        if (!notes.includes(wp.note)) notes.push(wp.note);
        partnerNotesMap.set(wp.partner_id, notes);
      }
    }

    // 3) 세금 계산 — calculateTax (10원 미만 절사) 사용
    const calcTaxes = (partnerType: string, amount: number) => calculateTax(amount, partnerType);

    // 4) 파트너별 그룹핑 — 건별 세금 계산 후 합산
    const partnerMap = new Map<string, {
      partner_id: string;
      partner_name: string;
      company_name: string;
      partner_type: string;
      report_type: string | null;
      tax_id: string;
      works: string[];
      revenue_share: number;
      production_cost: number;
      adjustment: number;
      vat: number;
      income_tax: number;
      local_tax: number;
      insurance: number;
      mg_deduction: number;
      other_deduction: number;
      final_payment: number;
    }>();

    for (const s of settlements) {
      const partner = s.partner as { id: string; name: string; company_name: string; partner_type: string; report_type: string | null; tax_id: string; tax_rate: number; salary_deduction: number } | null;
      const work = s.work as { name: string } | null;
      if (!partner) continue;

      if (!partnerMap.has(partner.id)) {
        partnerMap.set(partner.id, {
          partner_id: partner.id,
          partner_name: partner.name,
          company_name: partner.company_name || '',
          partner_type: partner.partner_type || 'individual',
          report_type: partner.report_type || null,
          tax_id: partner.tax_id || '',
          works: [],
          revenue_share: 0,
          production_cost: 0,
          adjustment: 0,
          vat: 0,
          income_tax: 0,
          local_tax: 0,
          insurance: 0,
          mg_deduction: 0,
          other_deduction: 0,
          final_payment: 0,
        });
      }

      const entry = partnerMap.get(partner.id)!;
      if (work?.name && !entry.works.includes(work.name)) {
        entry.works.push(work.name);
      }

      const revenueShare = Number(s.revenue_share) || 0;
      const prodCost = Number(s.production_cost) || 0;
      const adj = Number(s.adjustment) || 0;
      const rowSettlement = revenueShare + prodCost + adj;

      // 건별 세금 계산
      const taxes = calcTaxes(partner.partner_type || 'individual', rowSettlement);

      entry.revenue_share += revenueShare;
      entry.production_cost += prodCost;
      entry.adjustment += adj;
      entry.vat += taxes.vat;
      entry.income_tax += taxes.income_tax;
      entry.local_tax += taxes.local_tax;
      entry.insurance += Number(s.insurance) || 0;
      entry.mg_deduction += Number(s.mg_deduction) || 0;
      entry.other_deduction += Number(s.other_deduction) || 0;
      entry.final_payment += Number(s.final_payment) || 0;
    }

    // 5) 응답 생성
    const incomeTypeMap: Record<string, string> = {
      individual: '개인',
      individual_employee: '개인(임직원)',
      individual_simple_tax: '개인(간이)',
      domestic_corp: '사업자(국내)',
      foreign_corp: '사업자(해외)',
      naver: '네이버',
    };

    const defaultReportTypeMap: Record<string, string> = {
      individual: '기타소득',
      individual_employee: '기타소득',
      individual_simple_tax: '사업소득',
      domestic_corp: '세금계산서',
      foreign_corp: '기타소득',
      naver: '세금계산서',
    };

    const summary = Array.from(partnerMap.values()).map((entry, idx) => {
      const settlementAmount = entry.revenue_share + entry.production_cost + entry.adjustment;
      // DB에 저장된 insurance 사용, 없으면 재계산
      const insurance = entry.insurance > 0 ? entry.insurance : calculateInsurance(settlementAmount, entry.partner_type);
      const taxTotal = -(entry.income_tax + entry.local_tax); // 세금은 차감이므로 음수
      const paymentAmount = settlementAmount + entry.vat + taxTotal - insurance + entry.mg_deduction - entry.other_deduction;

      return {
        no: idx + 1,
        month,
        partner_id: entry.partner_id,
        partner_name: entry.partner_name,
        company_name: entry.company_name,
        income_type: incomeTypeMap[entry.partner_type] || '기타',
        report_type: entry.report_type || defaultReportTypeMap[entry.partner_type] || '-',
        tax_id: entry.tax_id,
        works_list: entry.works.join(', '),
        revenue_share: entry.revenue_share,
        production_cost: entry.production_cost,
        adjustment: entry.adjustment,
        settlement_amount: settlementAmount,
        vat: entry.vat,
        income_tax: -entry.income_tax, // 차감 표시
        local_tax: -entry.local_tax,   // 차감 표시
        insurance: -insurance,          // 예고료 차감 표시
        mg_deduction: entry.mg_deduction,
        other_deduction: -entry.other_deduction, // 기타 공제 차감
        final_payment: entry.final_payment || paymentAmount,
        notes: partnerNotesMap.get(entry.partner_id)?.join('; ') || '',
      };
    }).sort((a, b) => Math.abs(b.final_payment) - Math.abs(a.final_payment));

    return NextResponse.json({ summary });
  } catch (error) {
    console.error('정산 집계 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
