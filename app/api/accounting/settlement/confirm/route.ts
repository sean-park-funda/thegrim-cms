import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { computeAllStatements } from '@/lib/settlement/compute-all-statements';

// POST /api/accounting/settlement/confirm — 월 단위 일괄 확정
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
    const { month } = body;
    if (!month) {
      return NextResponse.json({ error: '월은 필수입니다.' }, { status: 400 });
    }

    const { partners, _raw } = await computeAllStatements(supabase, month);

    if (partners.length === 0) {
      return NextResponse.json({ error: '해당 월의 정산 데이터가 없습니다.' }, { status: 404 });
    }

    // 작품별 rs_settlements UPSERT + MG 풀 잔액 갱신
    const upsertRows: Record<string, unknown>[] = [];
    const mgPoolUpsertRows: Record<string, unknown>[] = [];
    const processedPools = new Set<string>();
    const allMgPools = _raw?.allMgPools || [];
    const allPoolWorks = _raw?.allPoolWorks || [];
    const allPoolBalCurrent = _raw?.allPoolBalCurrent || [];

    for (const { partnerId, result } of partners) {
      for (const w of result.works) {
        upsertRows.push({
          month,
          partner_id: partnerId,
          work_id: w.work_id,
          gross_revenue: w.work_total_revenue,
          rs_rate: w.effective_rate,
          revenue_share: w.work_total_net_share,
          production_cost: w.production_cost,
          tax_amount: result.tax_amount,
          insurance: result.insurance,
          mg_deduction: w.mg_deduction,
          final_payment: result.final_payment,
          status: 'confirmed',
          snapshot: JSON.stringify(result),
        });
      }

      // MG 풀별 잔액 갱신
      const partnerPools = allMgPools.filter((p: any) => p.partner_id === partnerId);
      for (const pool of partnerPools) {
        if (processedPools.has(pool.id)) continue;
        processedPools.add(pool.id);

        const poolWorkIds = allPoolWorks.filter((pw: any) => pw.mg_pool_id === pool.id).map((pw: any) => pw.work_id);
        const totalDeduction = result.works
          .filter(w => poolWorkIds.includes(w.work_id))
          .reduce((s, w) => s + w.mg_deduction, 0);

        if (totalDeduction <= 0) continue;

        // 이번달 풀 잔액
        const curBal = allPoolBalCurrent.find((b: any) => b.mg_pool_id === pool.id);
        const prevBalance = curBal ? Number(curBal.previous_balance) : 0;

        mgPoolUpsertRows.push({
          mg_pool_id: pool.id,
          month,
          previous_balance: prevBalance,
          mg_added: 0,
          mg_deducted: totalDeduction,
          current_balance: prevBalance - totalDeduction,
        });
      }
    }

    // 일괄 DB 저장
    if (upsertRows.length > 0) {
      const { error: uErr } = await supabase
        .from('rs_settlements')
        .upsert(upsertRows, { onConflict: 'month,partner_id,work_id' });

      if (uErr) {
        console.error('정산 확정 UPSERT 오류:', uErr);
        return NextResponse.json({ error: '정산 확정 저장 실패: ' + uErr.message }, { status: 500 });
      }
    }

    if (mgPoolUpsertRows.length > 0) {
      const { error: mgErr } = await supabase
        .from('rs_mg_pool_balances')
        .upsert(mgPoolUpsertRows, { onConflict: 'mg_pool_id,month' });

      if (mgErr) {
        console.error('MG 풀 잔액 갱신 오류:', mgErr);
        return NextResponse.json({ error: 'MG 풀 잔액 갱신 실패: ' + mgErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      message: `${month} 정산 확정 완료`,
      confirmed_partners: partners.length,
      settlement_rows: upsertRows.length,
      mg_pool_updated: mgPoolUpsertRows.length,
    });
  } catch (error) {
    console.error('정산 확정 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
