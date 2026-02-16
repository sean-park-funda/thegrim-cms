import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/settlement/works - 작품 목록 조회
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
    const activeOnly = searchParams.get('active') !== 'false';

    let query = supabase.from('rs_works').select('*').order('name');
    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) {
      console.error('작품 조회 오류:', error);
      return NextResponse.json({ error: '작품 조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ works: data });
  } catch (error) {
    console.error('작품 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// POST /api/accounting/settlement/works - 작품 생성
export async function POST(request: NextRequest) {
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
    const { name, naver_name, contract_type, settlement_level, note } = body;

    if (!name) {
      return NextResponse.json({ error: '작품명은 필수입니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('rs_works')
      .insert({ name, naver_name: naver_name || null, contract_type, settlement_level, note })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '이미 존재하는 작품명입니다.' }, { status: 409 });
      }
      console.error('작품 생성 오류:', error);
      return NextResponse.json({ error: '작품 생성 실패' }, { status: 500 });
    }

    return NextResponse.json({ work: data }, { status: 201 });
  } catch (error) {
    console.error('작품 생성 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
