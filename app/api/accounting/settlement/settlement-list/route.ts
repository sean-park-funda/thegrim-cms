import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { computeAllStatements } from '@/lib/settlement/compute-all-statements';

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

// GET /api/accounting/settlement/settlement-list?month=YYYY-MM
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

    const { partners } = await computeAllStatements(supabase, month);

    const summary = partners.map(({ partner, result, isConfirmed, notes }) => ({
      partner_id: partner.id,
      partner_name: partner.name,
      company_name: partner.company_name || '',
      income_type: incomeTypeMap[partner.partner_type] || '기타',
      report_type: partner.report_type || defaultReportTypeMap[partner.partner_type] || '-',
      tax_id: partner.tax_id || '',
      works_list: result.works.map(w => w.work_name).join(', '),
      revenue_share: result.grand_total_net_share,
      production_cost: result.total_production_cost,
      settlement_amount: result.subtotal,
      vat: result.tax_breakdown.vat,
      income_tax: -result.tax_breakdown.income_tax,
      local_tax: -result.tax_breakdown.local_tax,
      insurance: -result.insurance,
      mg_deduction: -result.total_mg_deduction,
      adjustment: result.total_adjustment,
      final_payment: result.final_payment,
      tax_invoice_total: result.tax_invoice_total,
      is_confirmed: isConfirmed,
      notes,
    }));

    summary.sort((a, b) => Math.abs(b.final_payment) - Math.abs(a.final_payment));

    return NextResponse.json({ summary });
  } catch (error) {
    console.error('정산 목록 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
