import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/settlement/settlements - 정산 조회
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
    const partnerId = searchParams.get('partnerId');
    const workId = searchParams.get('workId');
    const status = searchParams.get('status');

    let query = supabase
      .from('rs_settlements')
      .select('*, partner:rs_partners(*), work:rs_works(id, name)')
      .order('month', { ascending: false });

    if (month) query = query.eq('month', month);
    if (partnerId) query = query.eq('partner_id', partnerId);
    if (workId) query = query.eq('work_id', workId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) {
      console.error('정산 조회 오류:', error);
      return NextResponse.json({ error: '정산 조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ settlements: data });
  } catch (error) {
    console.error('정산 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// PUT /api/accounting/settlement/settlements - 정산 수정 (상태, 금액 등)
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
    const { id, status, production_cost, note } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID는 필수입니다.' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (production_cost !== undefined) updateData.production_cost = production_cost;
    if (note !== undefined) updateData.note = note;

    const { data, error } = await supabase
      .from('rs_settlements')
      .update(updateData)
      .eq('id', id)
      .select('*, partner:rs_partners(*), work:rs_works(id, name)')
      .single();

    if (error) {
      console.error('정산 수정 오류:', error);
      return NextResponse.json({ error: '정산 수정 실패' }, { status: 500 });
    }

    // 정산 확정 시 MG 잔액 자동 갱신
    if (status === 'confirmed' && data && Number(data.mg_deduction) > 0) {
      // 이전 월 잔액 조회
      const { data: prevMg } = await supabase
        .from('rs_mg_balances')
        .select('current_balance')
        .eq('partner_id', data.partner_id)
        .eq('work_id', data.work_id)
        .lt('month', data.month)
        .order('month', { ascending: false })
        .limit(1)
        .single();

      const previousBalance = prevMg ? Number(prevMg.current_balance) : 0;
      const mgDeducted = Number(data.mg_deduction);

      // 현재 월 MG 잔액이 이미 있으면 mg_added 보존
      const { data: currentMg } = await supabase
        .from('rs_mg_balances')
        .select('mg_added')
        .eq('partner_id', data.partner_id)
        .eq('work_id', data.work_id)
        .eq('month', data.month)
        .single();

      const mgAdded = currentMg ? Number(currentMg.mg_added) : 0;

      await supabase
        .from('rs_mg_balances')
        .upsert({
          month: data.month,
          partner_id: data.partner_id,
          work_id: data.work_id,
          previous_balance: previousBalance,
          mg_added: mgAdded,
          mg_deducted: mgDeducted,
          current_balance: previousBalance + mgAdded - mgDeducted,
        }, { onConflict: 'month,partner_id,work_id' });
    }

    return NextResponse.json({ settlement: data });
  } catch (error) {
    console.error('정산 수정 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
