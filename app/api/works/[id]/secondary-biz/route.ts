import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting, canManageAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/works/[id]/secondary-biz
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedClient(request);
    if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    const { supabase } = auth;

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', auth.userId).single();
    if (!profile || !canViewAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { id: workId } = await params;
    const { data, error } = await supabase
      .from('rs_work_secondary_biz')
      .select('*')
      .eq('work_id', workId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('2차 사업 조회 오류:', error);
      return NextResponse.json({ error: '조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ items: data });
  } catch (error) {
    console.error('2차 사업 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// POST /api/works/[id]/secondary-biz
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedClient(request);
    if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    const { supabase } = auth;

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', auth.userId).single();
    if (!profile || !canManageAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { id: workId } = await params;
    const body = await request.json();

    const { data, error } = await supabase
      .from('rs_work_secondary_biz')
      .insert({ ...body, work_id: workId })
      .select()
      .single();

    if (error) {
      console.error('2차 사업 추가 오류:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: data });
  } catch (error) {
    console.error('2차 사업 추가 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// PUT /api/works/[id]/secondary-biz
export async function PUT(request: NextRequest) {
  try {
    const auth = await getAuthenticatedClient(request);
    if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    const { supabase } = auth;

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', auth.userId).single();
    if (!profile || !canManageAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { id, ...updates } = await request.json();
    const { data, error } = await supabase
      .from('rs_work_secondary_biz')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('2차 사업 수정 오류:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: data });
  } catch (error) {
    console.error('2차 사업 수정 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// DELETE /api/works/[id]/secondary-biz
export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthenticatedClient(request);
    if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    const { supabase } = auth;

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', auth.userId).single();
    if (!profile || !canManageAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { id } = await request.json();
    const { error } = await supabase.from('rs_work_secondary_biz').delete().eq('id', id);

    if (error) {
      console.error('2차 사업 삭제 오류:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('2차 사업 삭제 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
