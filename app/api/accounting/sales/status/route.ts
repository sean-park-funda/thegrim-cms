import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

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

    // 수집 로그 (최근 20건)
    const { data: logs } = await supabase
      .from('rs_daily_sales_fetch_log')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20);

    // 작품별 데이터 현황 (최신 날짜, 건수)
    const { data: salesData } = await supabase
      .from('rs_daily_sales')
      .select('work_name, sale_date, amount')
      .order('sale_date', { ascending: false });

    const accountMap: Record<string, { latest_date: string; total_rows: number; latest_amount: number }> = {};
    for (const row of salesData || []) {
      if (!accountMap[row.work_name]) {
        accountMap[row.work_name] = {
          latest_date: row.sale_date,
          total_rows: 0,
          latest_amount: Number(row.amount),
        };
      }
      accountMap[row.work_name].total_rows += 1;
    }

    const accounts = Object.entries(accountMap)
      .map(([work_name, stats]) => ({ work_name, ...stats }))
      .sort((a, b) => b.latest_amount - a.latest_amount);

    return NextResponse.json({ logs: logs || [], accounts });
  } catch (error) {
    console.error('Status API error:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
