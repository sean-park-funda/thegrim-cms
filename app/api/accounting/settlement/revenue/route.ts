import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canViewAccounting } from '@/lib/utils/permissions';

// GET /api/accounting/settlement/revenue - 수익 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
    if (!profile || !canViewAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const workId = searchParams.get('workId');

    let query = supabase
      .from('rs_revenues')
      .select('*, work:rs_works(id, name)')
      .order('month', { ascending: false });

    if (month) query = query.eq('month', month);
    if (workId) query = query.eq('work_id', workId);

    const { data, error } = await query;
    if (error) {
      console.error('수익 조회 오류:', error);
      return NextResponse.json({ error: '수익 조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ revenues: data });
  } catch (error) {
    console.error('수익 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
