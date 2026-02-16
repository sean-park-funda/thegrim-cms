import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import * as XLSX from 'xlsx';

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
    const type = searchParams.get('type') || 'settlement'; // 'settlement' or 'revenue'

    if (!month) {
      return NextResponse.json({ error: '월은 필수입니다.' }, { status: 400 });
    }

    const workbook = XLSX.utils.book_new();

    if (type === 'revenue') {
      // 수익 내보내기
      const { data: revenues } = await supabase
        .from('rs_revenues')
        .select('*, work:rs_works(name)')
        .eq('month', month)
        .order('work_id');

      const rows = (revenues || []).map(r => ({
        '작품명': r.work?.name || '',
        '국내유료수익': Number(r.domestic_paid),
        '글로벌유료수익': Number(r.global_paid),
        '국내광고': Number(r.domestic_ad),
        '글로벌광고': Number(r.global_ad),
        '2차사업': Number(r.secondary),
        '합계': Number(r.total),
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, ws, '매출액 집계');
    } else {
      // 정산 내보내기
      const { data: settlements } = await supabase
        .from('rs_settlements')
        .select('*, partner:rs_partners(name, company_name), work:rs_works(name)')
        .eq('month', month)
        .order('partner_id');

      const rows = (settlements || []).map(s => ({
        '작품명': s.work?.name || '',
        '파트너': s.partner?.name || '',
        '회사명': s.partner?.company_name || '',
        '총매출': Number(s.gross_revenue),
        'RS비율': Number(s.rs_rate),
        '수익배분': Number(s.revenue_share),
        '제작비': Number(s.production_cost),
        '조정액': Number(s.adjustment),
        '세율': Number(s.tax_rate),
        '세액': Number(s.tax_amount),
        'MG 차감': Number(s.mg_deduction),
        '최종 지급액': Number(s.final_payment),
        '상태': s.status === 'draft' ? '임시' : s.status === 'confirmed' ? '확정' : '지급완료',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, ws, '정산 내역');
    }

    const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const fileName = type === 'revenue'
      ? `매출액_집계_${month}.xlsx`
      : `RS_정산_${month}.xlsx`;

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
