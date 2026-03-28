import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/settlement/mg - MG 풀 잔액 조회
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
    const poolId = searchParams.get('poolId');

    let query = supabase
      .from('rs_mg_pool_balances')
      .select('*, pool:rs_mg_pools(*, partner:rs_partners(*), works:rs_mg_pool_works(work_id, mg_rs_rate, work:rs_works(id, name)))')
      .order('month', { ascending: false });

    if (month) query = query.eq('month', month);
    if (poolId) query = query.eq('mg_pool_id', poolId);

    // partnerId 필터: 풀의 partner_id로
    const { data, error } = await query;
    if (error) {
      console.error('MG 풀 잔액 조회 오류:', error);
      return NextResponse.json({ error: 'MG 풀 잔액 조회 실패' }, { status: 500 });
    }

    // partnerId 필터 (PostgREST에서 nested FK 필터 제한으로 JS에서 필터)
    let filtered = data || [];
    if (partnerId) {
      filtered = filtered.filter((d: any) => d.pool?.partner_id === partnerId);
    }

    // 하위호환: 기존 프론트엔드가 mg_balances 형태를 기대할 수 있으므로 변환
    const mg_balances = filtered.map((d: any) => {
      const poolWorks = d.pool?.works || [];
      const workNames = poolWorks.map((pw: any) => pw.work?.name || '').filter(Boolean);
      return {
        id: d.id,
        mg_pool_id: d.mg_pool_id,
        month: d.month,
        previous_balance: d.previous_balance,
        mg_added: d.mg_added,
        mg_deducted: d.mg_deducted,
        current_balance: d.current_balance,
        note: d.note,
        pool_name: d.pool?.name || '',
        partner: d.pool?.partner || null,
        work: { id: d.mg_pool_id, name: d.pool?.name || workNames.join(', ') },
        pool_works: poolWorks,
      };
    });

    return NextResponse.json({ mg_balances });
  } catch (error) {
    console.error('MG 풀 잔액 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// PATCH /api/accounting/settlement/mg - MG 풀 잔액 메모 수정
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
    const { id, note } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID는 필수입니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('rs_mg_pool_balances')
      .update({ note: note ?? null })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('MG 메모 수정 오류:', error);
      return NextResponse.json({ error: 'MG 메모 수정 실패' }, { status: 500 });
    }

    return NextResponse.json({ mg_balance: data });
  } catch (error) {
    console.error('MG 메모 수정 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// POST /api/accounting/settlement/mg - MG 풀 잔액 추가/수정
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
    const { month, mg_pool_id, partner_id, work_id, mg_added, note } = body;

    // 새 방식: mg_pool_id 직접 지정
    // 하위호환: partner_id + work_id → mg_pool_id 찾기
    let poolId = mg_pool_id;
    if (!poolId && partner_id && work_id) {
      const { data: wp } = await supabase
        .from('rs_work_partners')
        .select('mg_pool_id')
        .eq('partner_id', partner_id)
        .eq('work_id', work_id)
        .single();
      poolId = wp?.mg_pool_id;
    }

    if (!month || !poolId) {
      return NextResponse.json({ error: '월과 MG 풀은 필수입니다.' }, { status: 400 });
    }

    // 이전 잔액 조회
    const { data: prevBalance } = await supabase
      .from('rs_mg_pool_balances')
      .select('current_balance')
      .eq('mg_pool_id', poolId)
      .order('month', { ascending: false })
      .limit(1)
      .single();

    const previousBalance = prevBalance ? Number(prevBalance.current_balance) : 0;
    const addedAmount = Number(mg_added) || 0;
    const currentBalance = previousBalance + addedAmount;

    const { data, error } = await supabase
      .from('rs_mg_pool_balances')
      .upsert({
        mg_pool_id: poolId,
        month,
        previous_balance: previousBalance,
        mg_added: addedAmount,
        mg_deducted: 0,
        current_balance: currentBalance,
        note,
      }, { onConflict: 'mg_pool_id,month' })
      .select('*, pool:rs_mg_pools(*, partner:rs_partners(*), works:rs_mg_pool_works(work_id, work:rs_works(id, name)))')
      .single();

    if (error) {
      console.error('MG 풀 잔액 생성 오류:', error);
      return NextResponse.json({ error: 'MG 풀 잔액 생성 실패' }, { status: 500 });
    }

    return NextResponse.json({ mg_balance: data }, { status: 201 });
  } catch (error) {
    console.error('MG 풀 잔액 생성 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
