import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/settlement/staff-assignments
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
    const staffId = searchParams.get('staffId');
    const workId = searchParams.get('workId');

    let query = supabase
      .from('rs_staff_assignments')
      .select('*, staff:rs_staff(id, name, employer_type), work:rs_works(id, name)')
      .order('created_at');

    if (staffId) query = query.eq('staff_id', staffId);
    if (workId) query = query.eq('work_id', workId);

    const { data, error } = await query;
    if (error) {
      console.error('배정 조회 오류:', error);
      return NextResponse.json({ error: '배정 조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ assignments: data });
  } catch (error) {
    console.error('배정 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// POST /api/accounting/settlement/staff-assignments
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
    const { staff_id, work_id, monthly_cost, start_month, end_month, note } = body;

    if (!staff_id || !work_id) {
      return NextResponse.json({ error: '스태프와 작품은 필수입니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('rs_staff_assignments')
      .insert({ staff_id, work_id, monthly_cost: monthly_cost || 0, start_month, end_month, note })
      .select('*, staff:rs_staff(id, name, employer_type), work:rs_works(id, name)')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '이미 해당 작품에 배정되어 있습니다.' }, { status: 409 });
      }
      console.error('배정 생성 오류:', error);
      return NextResponse.json({ error: '배정 생성 실패' }, { status: 500 });
    }

    return NextResponse.json({ assignment: data }, { status: 201 });
  } catch (error) {
    console.error('배정 생성 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// PUT /api/accounting/settlement/staff-assignments
export async function PUT(request: NextRequest) {
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
    const { id, monthly_cost, start_month, end_month, is_active, note } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID는 필수입니다.' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (monthly_cost !== undefined) updateData.monthly_cost = monthly_cost;
    if (start_month !== undefined) updateData.start_month = start_month;
    if (end_month !== undefined) updateData.end_month = end_month;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (note !== undefined) updateData.note = note;

    const { data, error } = await supabase
      .from('rs_staff_assignments')
      .update(updateData)
      .eq('id', id)
      .select('*, staff:rs_staff(id, name, employer_type), work:rs_works(id, name)')
      .single();

    if (error) {
      console.error('배정 수정 오류:', error);
      return NextResponse.json({ error: '배정 수정 실패' }, { status: 500 });
    }

    return NextResponse.json({ assignment: data });
  } catch (error) {
    console.error('배정 수정 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// DELETE /api/accounting/settlement/staff-assignments
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID는 필수입니다.' }, { status: 400 });
    }

    const { error } = await supabase.from('rs_staff_assignments').delete().eq('id', id);
    if (error) {
      console.error('배정 삭제 오류:', error);
      return NextResponse.json({ error: '배정 삭제 실패' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('배정 삭제 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
