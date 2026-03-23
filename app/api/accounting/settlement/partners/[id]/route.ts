import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/settlement/partners/[id]
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
      .from('rs_partners')
      .select('*, work_partners:rs_work_partners(*, work:rs_works(*))')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: '파트너를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ partner: data });
  } catch (error) {
    console.error('파트너 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// PUT /api/accounting/settlement/partners/[id]
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
    const { name, company_name, partner_type, tax_id, tax_rate, salary_deduction, has_salary, report_type, bank_name, bank_account, email, is_foreign, vat_type, note } = body;

    const updateData: Record<string, unknown> = { name, company_name, partner_type, tax_id, tax_rate, salary_deduction, report_type, bank_name, bank_account, email, note };
    if (has_salary !== undefined) updateData.has_salary = has_salary;
    if (is_foreign !== undefined) updateData.is_foreign = is_foreign;
    if (vat_type !== undefined) updateData.vat_type = vat_type;

    const { data, error } = await supabase
      .from('rs_partners')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('파트너 수정 오류:', error);
      return NextResponse.json({ error: '파트너 수정 실패' }, { status: 500 });
    }

    return NextResponse.json({ partner: data });
  } catch (error) {
    console.error('파트너 수정 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// DELETE /api/accounting/settlement/partners/[id]
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

    const { error } = await supabase.from('rs_partners').delete().eq('id', id);
    if (error) {
      console.error('파트너 삭제 오류:', error);
      return NextResponse.json({ error: '파트너 삭제 실패' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('파트너 삭제 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
