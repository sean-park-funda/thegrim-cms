import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { computeAllStatements } from '@/lib/settlement/compute-all-statements';
import * as XLSX from 'xlsx';

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

// GET /api/accounting/settlement/export - 엑셀 내보내기
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
    const type = searchParams.get('type') || 'settlement-summary';

    if (!month) {
      return NextResponse.json({ error: '월은 필수입니다.' }, { status: 400 });
    }

    const workbook = XLSX.utils.book_new();

    if (type === 'revenue') {
      const { data: revenues } = await supabase
        .from('rs_revenues')
        .select('*, work:rs_works(name)')
        .eq('month', month)
        .order('work_id');

      const rows = (revenues || []).map((r: any) => ({
        '작품명': r.work?.name || '',
        '국내유료수익': Number(r.domestic_paid),
        '글로벌유료수익': Number(r.global_paid),
        '국내광고': Number(r.domestic_ad),
        '국내광고차액': Number(r.domestic_ad_diff),
        '글로벌광고': Number(r.global_ad),
        '2차사업': Number(r.secondary),
        '합계': Number(r.total),
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, ws, '매출액 집계');

    } else if (type === 'settlement-summary' || type === 'settlement') {
      // 실시간 계산 기반 정산 집계
      const { partners } = await computeAllStatements(supabase, month);

      const rows = partners
        .sort((a, b) => Math.abs(b.result.final_payment) - Math.abs(a.result.final_payment))
        .map(({ partner, result, notes }, idx) => ({
          'NO': idx + 1,
          '대상자': partner.name,
          '거래처명': partner.company_name || '',
          '소득구분': incomeTypeMap[partner.partner_type] || '기타',
          '신고구분': partner.report_type || defaultReportTypeMap[partner.partner_type] || '-',
          '사업자번호': partner.tax_id || '',
          '작품명': result.works.map(w => w.work_name).join(', '),
          '수익분배금': result.grand_total_net_share,
          '수익정산금': result.subtotal,
          '부가세': result.tax_breakdown.vat,
          '소득세': -result.tax_breakdown.income_tax,
          '지방세': -result.tax_breakdown.local_tax,
          '예고료': -result.insurance,
          'MG차감': -result.total_mg_deduction,
          '조정': result.total_adjustment,
          '지급금액': result.final_payment,
          '세금계산서합계': result.tax_invoice_total,
          '특이사항': notes,
        }));

      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, ws, '수익정산금 집계');

    } else if (type === 'contracts') {
      const { data: workPartners } = await supabase
        .from('rs_work_partners')
        .select('*, work:rs_works(name), partner:rs_partners(name, company_name, partner_type, report_type)')
        .order('created_at');

      const cycleMap: Record<string, string> = { monthly: '매월', semi_annual: '반기' };

      const rows = (workPartners || []).map((wp: any) => ({
        '대상자': wp.partner?.name || '',
        '거래처명': wp.partner?.company_name || '',
        '소득구분': incomeTypeMap[wp.partner?.partner_type] || wp.partner?.partner_type || '',
        '신고구분': wp.partner?.report_type || '',
        '정산주기': cycleMap[wp.settlement_cycle] || '매월',
        '작품명': wp.work?.name || '',
        '매출액적용율': wp.revenue_rate ?? 1,
        'MG적용': wp.is_mg_applied ? 'O' : 'X',
        'RS요율': wp.rs_rate,
        '특이사항': wp.note || '',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, ws, '계약 테이블');

    } else if (type === 'mg-summary') {
      // MG entries + deductions 기반 현황
      const { data: entries } = await supabase
        .from('rs_mg_entries')
        .select('id, partner_id, amount, contracted_at, note, rs_partners(name, company_name, partner_type)')
        .order('partner_id');

      const entryIds = (entries || []).map((e: any) => e.id);
      let entryWorks: any[] = [];
      let deductions: any[] = [];
      if (entryIds.length > 0) {
        const [{ data: ew }, { data: deds }] = await Promise.all([
          supabase.from('rs_mg_entry_works').select('mg_entry_id, work_id, rs_works(name)').in('mg_entry_id', entryIds),
          supabase.from('rs_mg_deductions').select('mg_entry_id, month, amount').in('mg_entry_id', entryIds),
        ]);
        entryWorks = ew || [];
        deductions = deds || [];
      }

      const rows = (entries || []).map((e: any, i: number) => {
        const p = e.rs_partners || {};
        const works = entryWorks.filter((ew: any) => ew.mg_entry_id === e.id);
        const workNames = works.map((w: any) => w.rs_works?.name || '').filter(Boolean).join(', ');
        const monthDeds = deductions.filter((d: any) => d.mg_entry_id === e.id && d.month === month);
        const totalDeducted = deductions.filter((d: any) => d.mg_entry_id === e.id).reduce((s: number, d: any) => s + Number(d.amount), 0);
        const monthDeducted = monthDeds.reduce((s: number, d: any) => s + Number(d.amount), 0);
        return {
          'NO': i + 1,
          '파트너명': p.name || '',
          '거래처명': p.company_name || '',
          '소득구분': incomeTypeMap[p.partner_type] || '',
          '작품': workNames,
          'MG 총액': Number(e.amount),
          '총 차감': totalDeducted,
          '당월 차감': monthDeducted,
          'MG 잔액': Number(e.amount) - totalDeducted,
          '비고': e.note || '',
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, ws, 'MG 현황');
    }

    const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const fileNames: Record<string, string> = {
      revenue: `매출액_집계_${month}.xlsx`,
      settlement: `수익정산금_집계_${month}.xlsx`,
      'settlement-summary': `수익정산금_집계_${month}.xlsx`,
      contracts: `계약_테이블.xlsx`,
      'mg-summary': `MG_현황_${month}.xlsx`,
    };
    const fileName = fileNames[type] || `정산_${month}.xlsx`;

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    console.error('내보내기 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
