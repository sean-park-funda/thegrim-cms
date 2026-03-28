import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { computeAllStatements } from '@/lib/settlement/compute-all-statements';

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
    const workId = searchParams.get('workId');

    // workId가 있으면 해당 작품이 속한 풀 ID를 먼저 찾기
    let workPoolIds: string[] | null = null;
    if (workId) {
      const { data: poolWorks } = await supabase
        .from('rs_mg_pool_works')
        .select('mg_pool_id')
        .eq('work_id', workId);
      workPoolIds = (poolWorks || []).map((pw: any) => pw.mg_pool_id);
    }

    let query = supabase
      .from('rs_mg_pool_balances')
      .select('*, pool:rs_mg_pools(*, partner:rs_partners(*), works:rs_mg_pool_works(work_id, mg_rs_rate, work:rs_works(id, name)))')
      .order('month', { ascending: false });

    if (month) query = query.eq('month', month);
    if (poolId) query = query.eq('mg_pool_id', poolId);
    if (workPoolIds && workPoolIds.length > 0) query = query.in('mg_pool_id', workPoolIds);

    const { data, error } = await query;
    if (error) {
      console.error('MG 풀 잔액 조회 오류:', error);
      return NextResponse.json({ error: 'MG 풀 잔액 조회 실패' }, { status: 500 });
    }

    let filtered = data || [];
    if (partnerId) {
      filtered = filtered.filter((d: any) => d.pool?.partner_id === partnerId);
    }
    // workPoolIds가 빈 배열이면 결과 없음
    if (workPoolIds && workPoolIds.length === 0) {
      filtered = [];
    }

    // 미확정 건의 mg_deducted를 실시간 계산으로 오버라이드
    // 확정된 파트너의 풀은 DB 저장값 그대로 사용
    let poolDeductionOverrides = new Map<string, number>(); // mg_pool_id → deduction
    if (month && filtered.length > 0) {
      // 확정 상태 확인
      const { data: confirmedSettlements } = await supabase
        .from('rs_settlements')
        .select('partner_id')
        .eq('month', month)
        .eq('status', 'confirmed');
      const confirmedPartnerIds = new Set((confirmedSettlements || []).map((s: any) => s.partner_id));

      // 미확정 풀이 있는지 확인
      const unconfirmedPools = filtered.filter((d: any) =>
        !confirmedPartnerIds.has(d.pool?.partner_id)
      );

      if (unconfirmedPools.length > 0) {
        // computeAllStatements로 실시간 차감액 계산
        const bulkResult = await computeAllStatements(supabase, month);

        // 풀별 차감액 합산
        for (const { result } of bulkResult.partners) {
          for (const w of result.works) {
            if (w.mg_pool_id && w.mg_deduction > 0) {
              poolDeductionOverrides.set(
                w.mg_pool_id,
                (poolDeductionOverrides.get(w.mg_pool_id) || 0) + w.mg_deduction
              );
            }
          }
        }
      }
    }

    const mg_balances = filtered.map((d: any) => {
      const poolWorks = d.pool?.works || [];
      const workNames = poolWorks.map((pw: any) => pw.work?.name || '').filter(Boolean);

      let mgDeducted = Number(d.mg_deducted);
      let currentBalance = Number(d.current_balance);

      // 미확정 건은 실시간 계산값으로 오버라이드
      if (poolDeductionOverrides.has(d.mg_pool_id)) {
        mgDeducted = poolDeductionOverrides.get(d.mg_pool_id)!;
        currentBalance = Number(d.previous_balance) + Number(d.mg_added) - mgDeducted;
      }

      return {
        id: d.id,
        mg_pool_id: d.mg_pool_id,
        partner_id: d.pool?.partner_id || '',
        month: d.month,
        previous_balance: Number(d.previous_balance),
        mg_added: Number(d.mg_added),
        mg_deducted: mgDeducted,
        current_balance: currentBalance,
        note: d.note,
        pool_name: d.pool?.name || '',
        partner: d.pool?.partner || null,
        work: { id: d.mg_pool_id, name: d.pool?.name || workNames.join(', ') },
        work_id: d.mg_pool_id, // 하위호환
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
