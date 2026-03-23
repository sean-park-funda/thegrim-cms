import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/settlement/partner-revenue - 작가별 수익 조회
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

    // 1) 해당 월의 작품별 수익
    const { data: revenues, error: revError } = await supabase
      .from('rs_revenues')
      .select('work_id, domestic_paid, global_paid, domestic_ad, global_ad, secondary, total, work:rs_works(id, name)')
      .eq('month', month);

    if (revError) {
      console.error('수익 조회 오류:', revError);
      return NextResponse.json({ error: '수익 조회 실패' }, { status: 500 });
    }

    if (!revenues || revenues.length === 0) {
      return NextResponse.json({ partner_revenues: [] });
    }

    // 2) 작품-파트너 연결 (RS비율 포함)
    const workIds = revenues.map(r => r.work_id);
    const { data: workPartners, error: wpError } = await supabase
      .from('rs_work_partners')
      .select('work_id, partner_id, rs_rate, is_mg_applied, settlement_cycle, partner:rs_partners(id, name, company_name, partner_type)')
      .in('work_id', workIds);

    if (wpError) {
      console.error('작품-파트너 조회 오류:', wpError);
      return NextResponse.json({ error: '작품-파트너 조회 실패' }, { status: 500 });
    }

    // 3) 작가별로 수익 집계
    const partnerMap = new Map<string, {
      partner_id: string;
      partner_name: string;
      company_name: string;
      partner_type: string;
      works: {
        work_name: string;
        rs_rate: number;
        total: number;
        revenue_share: number;
      }[];
      total_revenue: number;
      total_revenue_share: number;
      has_semi_annual: boolean;
    }>();

    for (const wp of (workPartners || [])) {
      const rev = revenues.find(r => r.work_id === wp.work_id);
      if (!rev) continue;

      const partner = wp.partner as unknown as { id: string; name: string; company_name: string; partner_type: string } | null;
      if (!partner) continue;

      const workTotal = Number(rev.total);
      const revenueShare = Math.round(workTotal * Number(wp.rs_rate));

      if (!partnerMap.has(partner.id)) {
        partnerMap.set(partner.id, {
          partner_id: partner.id,
          partner_name: partner.name,
          company_name: partner.company_name || '',
          partner_type: partner.partner_type,
          works: [],
          total_revenue: 0,
          total_revenue_share: 0,
          has_semi_annual: false,
        });
      }

      const entry = partnerMap.get(partner.id)!;
      const work = rev.work as unknown as { id: string; name: string } | null;
      entry.works.push({
        work_name: work?.name || '',
        rs_rate: Number(wp.rs_rate),
        total: workTotal,
        revenue_share: revenueShare,
      });
      entry.total_revenue += workTotal;
      entry.total_revenue_share += revenueShare;
      if (wp.settlement_cycle === 'semi_annual') entry.has_semi_annual = true;
    }

    const partner_revenues = Array.from(partnerMap.values())
      .sort((a, b) => b.total_revenue_share - a.total_revenue_share);

    return NextResponse.json({ partner_revenues });
  } catch (error) {
    console.error('작가별 수익 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
