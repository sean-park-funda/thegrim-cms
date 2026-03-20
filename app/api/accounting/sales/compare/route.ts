import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/sales/compare?workIds=id1,id2,id3&from=2026-01-01&to=2026-03-20
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
    const workIdsParam = searchParams.get('workIds');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!workIdsParam) {
      return NextResponse.json({ error: 'workIds 필수' }, { status: 400 });
    }

    const workIds = workIdsParam.split(',').slice(0, 5);

    // 작품 이름 조회
    const { data: works } = await supabase
      .from('rs_works')
      .select('id, name')
      .in('id', workIds);

    const workNameMap: Record<string, string> = {};
    for (const w of works || []) {
      workNameMap[w.id] = w.name;
    }

    // 일별 매출 조회
    let query = supabase
      .from('rs_daily_sales')
      .select('work_id, sale_date, amount')
      .in('work_id', workIds)
      .order('sale_date', { ascending: true });

    if (from) query = query.gte('sale_date', from);
    if (to) query = query.lte('sale_date', to);

    const { data: sales } = await query;

    // 작품별 일별 데이터 구성
    const byWork: Record<string, { date: string; amount: number }[]> = {};
    const workTotals: Record<string, number> = {};

    for (const id of workIds) {
      byWork[id] = [];
      workTotals[id] = 0;
    }

    for (const s of sales || []) {
      const id = s.work_id;
      if (!byWork[id]) continue;
      const amount = Number(s.amount);
      byWork[id].push({ date: s.sale_date, amount });
      workTotals[id] += amount;
    }

    return NextResponse.json({
      works: workIds.map(id => ({
        id,
        name: workNameMap[id] || id,
        dailySales: byWork[id] || [],
        total: workTotals[id] || 0,
      })),
    });
  } catch (error) {
    console.error('작품 비교 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
