import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/settlement/staff/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getAuthenticatedClient(request);
    if (!auth) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const { supabase } = auth;

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', auth.userId).single();
    if (!profile || !canViewAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('rs_staff')
      .select('*, employer_partner:rs_partners(id, name)')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: '스태프를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 배정 정보도 함께 조회
    const { data: assignments } = await supabase
      .from('rs_staff_assignments')
      .select('*, work:rs_works(id, name)')
      .eq('staff_id', id)
      .order('created_at');

    return NextResponse.json({ staff: data, assignments: assignments || [] });
  } catch (error) {
    console.error('스태프 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// PUT /api/accounting/settlement/staff/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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
    const { name, employer_type, employer_partner_id, phone, email, bank_name, bank_account, is_active, note, monthly_salary } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (employer_type !== undefined) updateData.employer_type = employer_type;
    if (employer_partner_id !== undefined) updateData.employer_partner_id = employer_partner_id;
    if (phone !== undefined) updateData.phone = phone;
    if (email !== undefined) updateData.email = email;
    if (bank_name !== undefined) updateData.bank_name = bank_name;
    if (bank_account !== undefined) updateData.bank_account = bank_account;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (note !== undefined) updateData.note = note;
    if (monthly_salary !== undefined) updateData.monthly_salary = monthly_salary;

    const { data, error } = await supabase
      .from('rs_staff')
      .update(updateData)
      .eq('id', id)
      .select('*, employer_partner:rs_partners(id, name)')
      .single();

    if (error) {
      console.error('스태프 수정 오류:', error);
      return NextResponse.json({ error: '스태프 수정 실패' }, { status: 500 });
    }

    return NextResponse.json({ staff: data });
  } catch (error) {
    console.error('스태프 수정 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// DELETE /api/accounting/settlement/staff/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getAuthenticatedClient(request);
    if (!auth) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const { supabase } = auth;

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', auth.userId).single();
    if (!profile || !canManageAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { error } = await supabase.from('rs_staff').delete().eq('id', id);
    if (error) {
      console.error('스태프 삭제 오류:', error);
      return NextResponse.json({ error: '스태프 삭제 실패' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('스태프 삭제 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
