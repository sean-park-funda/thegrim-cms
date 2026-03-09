import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/settlement/partner-salaries?partnerId=xxx&month=YYYY-MM
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
    const partnerId = searchParams.get('partnerId');
    const month = searchParams.get('month');

    let query = supabase
      .from('rs_partner_salaries')
      .select('*')
      .order('month', { ascending: false });

    if (partnerId) query = query.eq('partner_id', partnerId);
    if (month) query = query.eq('month', month);

    const { data, error } = await query;
    if (error) {
      console.error('파트너 급여 조회 오류:', error);
      return NextResponse.json({ error: '급여 조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ salaries: data });
  } catch (error) {
    console.error('파트너 급여 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// POST /api/accounting/settlement/partner-salaries - upsert
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
    const { partner_id, month, amount, note } = body;

    if (!partner_id || !month) {
      return NextResponse.json({ error: '파트너 ID와 월은 필수입니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('rs_partner_salaries')
      .upsert({
        partner_id,
        month,
        amount: Number(amount) || 0,
        note: note || null,
      }, { onConflict: 'partner_id,month' })
      .select()
      .single();

    if (error) {
      console.error('파트너 급여 저장 오류:', error);
      return NextResponse.json({ error: '급여 저장 실패' }, { status: 500 });
    }

    return NextResponse.json({ salary: data });
  } catch (error) {
    console.error('파트너 급여 저장 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// DELETE /api/accounting/settlement/partner-salaries?id=xxx
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

    const { error } = await supabase.from('rs_partner_salaries').delete().eq('id', id);
    if (error) {
      console.error('파트너 급여 삭제 오류:', error);
      return NextResponse.json({ error: '급여 삭제 실패' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('파트너 급여 삭제 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
