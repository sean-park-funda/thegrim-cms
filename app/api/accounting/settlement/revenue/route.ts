import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting, canManageAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/settlement/revenue - 수익 조회
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

// PATCH /api/accounting/settlement/revenue - 수익 레코드 업데이트 (is_confirmed 토글 등)
export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthenticatedClient(request);
    if (!auth) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const { supabase } = auth;

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', auth.userId).single();
    if (!profile || !canManageAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { id, is_confirmed } = body;

    if (!id || typeof is_confirmed !== 'boolean') {
      return NextResponse.json({ error: 'id와 is_confirmed(boolean)이 필요합니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('rs_revenues')
      .update({ is_confirmed })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('수익 업데이트 오류:', error);
      return NextResponse.json({ error: '수익 업데이트 실패' }, { status: 500 });
    }

    return NextResponse.json({ revenue: data });
  } catch (error) {
    console.error('수익 업데이트 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
