import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/settlement/staff
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
    const activeOnly = searchParams.get('activeOnly') !== 'false';
    const employerType = searchParams.get('employerType');
    const partnerId = searchParams.get('partnerId');

    let query = supabase
      .from('rs_staff')
      .select('*, employer_partner:rs_partners(id, name)')
      .order('name');

    if (activeOnly) query = query.eq('is_active', true);
    if (employerType) query = query.eq('employer_type', employerType);
    if (partnerId) query = query.eq('employer_partner_id', partnerId);

    const { data, error } = await query;
    if (error) {
      console.error('스태프 조회 오류:', error);
      return NextResponse.json({ error: '스태프 조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ staff: data });
  } catch (error) {
    console.error('스태프 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// POST /api/accounting/settlement/staff
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
    const { name, employer_type, employer_partner_id, monthly_salary, phone, email, bank_name, bank_account, note } = body;

    if (!name) {
      return NextResponse.json({ error: '이름은 필수입니다.' }, { status: 400 });
    }

    if (employer_type === 'author' && !employer_partner_id) {
      return NextResponse.json({ error: '작가 소속일 때 소속 작가는 필수입니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('rs_staff')
      .insert({
        name,
        employer_type: employer_type || 'author',
        employer_partner_id: employer_type === 'company' ? null : employer_partner_id,
        monthly_salary: monthly_salary || 0,
        phone, email, bank_name, bank_account, note,
      })
      .select('*, employer_partner:rs_partners(id, name)')
      .single();

    if (error) {
      console.error('스태프 생성 오류:', error);
      return NextResponse.json({ error: '스태프 생성 실패' }, { status: 500 });
    }

    return NextResponse.json({ staff: data }, { status: 201 });
  } catch (error) {
    console.error('스태프 생성 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
