import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/sales/works/[id] - 작품별 매출 상세
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workId } = await params;
    const auth = await getAuthenticatedClient(request);
    if (!auth) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const { supabase } = auth;

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', auth.userId).single();
    if (!profile || !canViewAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    // 작품 기본 정보
    const { data: work, error: workError } = await supabase
      .from('rs_works')
      .select('*')
      .eq('id', workId)
      .single();

    if (workError || !work) {
      return NextResponse.json({ error: '작품을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 쿼리 파라미터
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // 일별 매출 데이터
    let salesQuery = supabase
      .from('rs_daily_sales')
      .select('sale_date, amount, work_name')
      .eq('work_id', workId)
      .order('sale_date', { ascending: true });

    if (from) salesQuery = salesQuery.gte('sale_date', from);
    if (to) salesQuery = salesQuery.lte('sale_date', to);

    const { data: sales } = await salesQuery;

    // 월별 매출 집계
    const monthlyMap: Record<string, number> = {};
    let totalSales = 0;
    for (const s of sales || []) {
      const month = s.sale_date.slice(0, 7);
      const amount = Number(s.amount);
      monthlyMap[month] = (monthlyMap[month] || 0) + amount;
      totalSales += amount;
    }
    const monthlySales = Object.entries(monthlyMap)
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // 일별 매출
    const dailySales = (sales || []).map(s => ({
      date: s.sale_date,
      amount: Number(s.amount),
    }));

    // 일평균
    const dayCount = dailySales.length;
    const dailyAverage = dayCount > 0 ? totalSales / dayCount : 0;

    // 파트너 정보
    const { data: workPartners } = await supabase
      .from('rs_work_partners')
      .select('*, partner:rs_partners(*)')
      .eq('work_id', workId);

    // 해외 론칭 정보
    const { data: globalLaunches } = await supabase
      .from('rs_work_global_launches')
      .select('*')
      .eq('work_id', workId)
      .order('country_code');

    // 2차 사업 정보
    const { data: secondaryBiz } = await supabase
      .from('rs_work_secondary_biz')
      .select('*')
      .eq('work_id', workId)
      .order('created_at');

    // 정산 매출 (rs_revenues - 월별 국내/해외)
    const { data: revenues } = await supabase
      .from('rs_revenues')
      .select('month, domestic_paid, global_paid, domestic_ad, global_ad, secondary, total')
      .eq('work_id', workId)
      .order('month', { ascending: false })
      .limit(12);

    return NextResponse.json({
      work,
      dailySales,
      monthlySales,
      partners: workPartners || [],
      globalLaunches: globalLaunches || [],
      secondaryBiz: secondaryBiz || [],
      revenues: revenues || [],
      summary: {
        totalSales,
        dailyAverage,
        dayCount,
      },
    });
  } catch (error) {
    console.error('작품 매출 상세 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
