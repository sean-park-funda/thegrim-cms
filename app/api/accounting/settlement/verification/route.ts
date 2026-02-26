import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/settlement/verification?month=YYYY-MM
// 개별 RS 검증 (작품×파트너별 RS 계산 검증)
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

    // 1) 해당 월 매출
    const { data: revenues } = await supabase
      .from('rs_revenues')
      .select('work_id, total')
      .eq('month', month);

    // 2) 작품-파트너 연결
    const { data: workPartners } = await supabase
      .from('rs_work_partners')
      .select('*, work:rs_works(id, name, is_active), partner:rs_partners(id, name, company_name, partner_type, tax_id)')
      .order('created_at');

    // 3) 해당 월 정산 (검증 비교용)
    const { data: settlements } = await supabase
      .from('rs_settlements')
      .select('work_id, partner_id, revenue_share, final_payment')
      .eq('month', month);

    if (!workPartners || !revenues) {
      return NextResponse.json({ verification: [] });
    }

    const revenueMap = new Map<string, number>();
    for (const r of revenues) {
      revenueMap.set(r.work_id, Number(r.total) || 0);
    }

    const settlementMap = new Map<string, { revenue_share: number; final_payment: number }>();
    for (const s of (settlements || [])) {
      settlementMap.set(`${s.work_id}:${s.partner_id}`, {
        revenue_share: Number(s.revenue_share) || 0,
        final_payment: Number(s.final_payment) || 0,
      });
    }

    const incomeTypeMap: Record<string, string> = {
      individual: '기타소득',
      domestic_corp: '사업소득',
      foreign_corp: '해외사업소득',
      naver: '네이버',
    };

    const verification = workPartners.map((wp) => {
      const work = wp.work as { id: string; name: string; is_active: boolean } | null;
      const partner = wp.partner as { id: string; name: string; company_name: string; partner_type: string; tax_id: string } | null;
      if (!work || !partner) return null;

      const grossRevenue = revenueMap.get(wp.work_id) || 0;
      const rsRate = Number(wp.rs_rate) || 0;
      const computedShare = Math.round(grossRevenue * rsRate);

      const dbRecord = settlementMap.get(`${wp.work_id}:${wp.partner_id}`);
      const dbShare = dbRecord?.revenue_share ?? null;
      const hasDiscrepancy = dbShare !== null && Math.abs(computedShare - dbShare) > 1;

      return {
        partner_name: partner.name,
        company_name: partner.company_name || '',
        income_type: incomeTypeMap[partner.partner_type] || '기타',
        tax_id: partner.tax_id || '',
        is_target: work.is_active ? '대상' : '미대상',
        work_name: work.name,
        gross_revenue: grossRevenue,
        rs_rate: rsRate,
        computed_share: computedShare,
        db_share: dbShare,
        has_discrepancy: hasDiscrepancy,
        is_mg: wp.is_mg_applied ? 'O' : 'X',
        note: wp.note || '',
      };
    }).filter(Boolean);

    return NextResponse.json({ verification });
  } catch (error) {
    console.error('RS 검증 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
