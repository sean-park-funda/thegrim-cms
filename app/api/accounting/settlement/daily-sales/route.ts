import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/settlement/daily-sales - 일별 매출 데이터 조회
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
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const workName = searchParams.get('workName');

    if (!from || !to) {
      return NextResponse.json({ error: 'from, to 파라미터가 필요합니다.' }, { status: 400 });
    }

    let query = supabase
      .from('rs_daily_sales')
      .select('*')
      .gte('sale_date', from)
      .lte('sale_date', to)
      .order('sale_date', { ascending: true });

    if (workName) query = query.eq('work_name', workName);

    const { data, error } = await query;
    if (error) {
      console.error('일별 매출 조회 오류:', error);
      return NextResponse.json({ error: '일별 매출 조회 실패' }, { status: 500 });
    }

    // 작품별로 그룹화하여 차트 데이터 형태로 변환
    const workMap: Record<string, { date: string; amount: number }[]> = {};
    const dailyTotals: Record<string, number> = {};

    for (const row of data || []) {
      const wn = row.work_name;
      if (!workMap[wn]) workMap[wn] = [];
      workMap[wn].push({ date: row.sale_date, amount: Number(row.amount) });
      dailyTotals[row.sale_date] = (dailyTotals[row.sale_date] || 0) + Number(row.amount);
    }

    // 요약 통계
    const totalSales = Object.values(dailyTotals).reduce((a, b) => a + b, 0);
    const days = Object.keys(dailyTotals).length;
    const dailyAverage = days > 0 ? totalSales / days : 0;

    // 작품별 합계 (TOP 순위용)
    const workTotals = Object.entries(workMap).map(([name, rows]) => ({
      name,
      total: rows.reduce((sum, r) => sum + r.amount, 0),
    })).sort((a, b) => b.total - a.total);

    return NextResponse.json({
      sales: data,
      works: workMap,
      summary: {
        totalSales,
        dailyAverage,
        workCount: workTotals.length,
        topWork: workTotals[0] || null,
        dailyTotals: Object.entries(dailyTotals)
          .map(([date, total]) => ({ date, total }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        workTotals,
      },
    });
  } catch (error) {
    console.error('일별 매출 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
