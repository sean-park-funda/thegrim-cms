import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';

// GET /api/accounting/settlement/mg - MG 잔액 조회
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
    const partnerId = searchParams.get('partnerId');
    const workId = searchParams.get('workId');

    let query = supabase
      .from('rs_mg_balances')
      .select('*, partner:rs_partners(*), work:rs_works(id, name)')
      .order('month', { ascending: false });

    if (month) query = query.eq('month', month);
    if (partnerId) query = query.eq('partner_id', partnerId);
    if (workId) query = query.eq('work_id', workId);

    const { data, error } = await query;
    if (error) {
      console.error('MG 잔액 조회 오류:', error);
      return NextResponse.json({ error: 'MG 잔액 조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ mg_balances: data });
  } catch (error) {
    console.error('MG 잔액 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// POST /api/accounting/settlement/mg - MG 잔액 추가/수정
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
    if (!profile || !canManageAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { month, partner_id, work_id, mg_added, note } = body;

    if (!month || !partner_id || !work_id) {
      return NextResponse.json({ error: '월, 파트너, 작품은 필수입니다.' }, { status: 400 });
    }

    // 이전 잔액 조회
    const { data: prevBalance } = await supabase
      .from('rs_mg_balances')
      .select('current_balance')
      .eq('partner_id', partner_id)
      .eq('work_id', work_id)
      .order('month', { ascending: false })
      .limit(1)
      .single();

    const previousBalance = prevBalance ? Number(prevBalance.current_balance) : 0;
    const addedAmount = Number(mg_added) || 0;
    const currentBalance = previousBalance + addedAmount;

    const { data, error } = await supabase
      .from('rs_mg_balances')
      .upsert({
        month,
        partner_id,
        work_id,
        previous_balance: previousBalance,
        mg_added: addedAmount,
        mg_deducted: 0,
        current_balance: currentBalance,
        note,
      }, { onConflict: 'month,partner_id,work_id' })
      .select('*, partner:rs_partners(*), work:rs_works(id, name)')
      .single();

    if (error) {
      console.error('MG 잔액 생성 오류:', error);
      return NextResponse.json({ error: 'MG 잔액 생성 실패' }, { status: 500 });
    }

    return NextResponse.json({ mg_balance: data }, { status: 201 });
  } catch (error) {
    console.error('MG 잔액 생성 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
