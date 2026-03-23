import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting, canManageAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { calculateSettlement } from '@/lib/settlement/calculator';
import { computeLaborCostDeductions } from '@/lib/settlement/staff-salary';
import { RevenueType } from '@/lib/types/settlement';

const DEFAULT_REVENUE_TYPES: RevenueType[] = ['domestic_paid', 'global_paid', 'domestic_ad', 'global_ad', 'secondary'];

// GET /api/accounting/settlement/revenue - 수익 조회
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
    const workId = searchParams.get('workId');

    let query = supabase
      .from('rs_revenues')
      .select('*, work:rs_works(id, name)')
      .order('month', { ascending: false });

    if (month) query = query.eq('month', month);
    if (workId) query = query.eq('work_id', workId);

    const { data, error } = await query;
    if (error) {
      console.error('수익 조회 오류:', error);
      return NextResponse.json({ error: '수익 조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ revenues: data });
  } catch (error) {
    console.error('수익 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// PATCH /api/accounting/settlement/revenue - 미확정 매출 유형 토글
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
    const { id, unconfirmed_types } = body;

    if (!id || !Array.isArray(unconfirmed_types)) {
      return NextResponse.json({ error: 'id와 unconfirmed_types(배열)가 필요합니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('rs_revenues')
      .update({ unconfirmed_types })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('수익 업데이트 오류:', error);
      return NextResponse.json({ error: '수익 업데이트 실패' }, { status: 500 });
    }

    // 해당 작품/월의 정산 자동 재계산
    const rev = data;
    const { data: workPartners } = await supabase
      .from('rs_work_partners')
      .select('*, partner:rs_partners(*), work:rs_works(serial_start_date, serial_end_date)')
      .eq('work_id', rev.work_id);

    if (workPartners && workPartners.length > 0) {
      const revenueByWorkId = new Map<string, number>();
      revenueByWorkId.set(rev.work_id, Number(rev.total) || 0);
      const staffDeductions = await computeLaborCostDeductions(supabase, rev.month, revenueByWorkId);

      const { data: existingSettlements } = await supabase
        .from('rs_settlements')
        .select('work_id, partner_id, production_cost, adjustment, other_deduction')
        .eq('month', rev.month)
        .eq('work_id', rev.work_id);

      const existingMap = new Map<string, { production_cost: number; adjustment: number; other_deduction: number }>();
      for (const es of (existingSettlements || [])) {
        existingMap.set(`${es.work_id}:${es.partner_id}`, {
          production_cost: Number(es.production_cost) || 0,
          adjustment: Number(es.adjustment) || 0,
          other_deduction: Number(es.other_deduction) || 0,
        });
      }

      const unc: string[] = rev.unconfirmed_types || [];

      for (const wp of workPartners) {
        let mgBalance = 0;
        if (wp.is_mg_applied) {
          const { data: mgData } = await supabase
            .from('rs_mg_balances')
            .select('current_balance')
            .eq('partner_id', wp.partner_id)
            .eq('work_id', wp.work_id)
            .lt('month', rev.month)
            .order('month', { ascending: false })
            .limit(1)
            .single();
          if (mgData) mgBalance = Number(mgData.current_balance);
        }

        const existing = existingMap.get(`${wp.work_id}:${wp.partner_id}`);
        const productionCost = existing?.production_cost ?? 0;
        const adjustment = existing?.adjustment ?? 0;
        const otherDeduction = existing?.other_deduction ?? 0;

        // MG 의존 체크
        let mgDependencyBlocked = false;
        if (wp.mg_depends_on) {
          const dep = wp.mg_depends_on as { partner_id: string; work_id: string };
          const { data: depMg } = await supabase
            .from('rs_mg_balances')
            .select('current_balance')
            .eq('partner_id', dep.partner_id)
            .eq('work_id', dep.work_id)
            .order('month', { ascending: false })
            .limit(1)
            .single();
          if (depMg && Number(depMg.current_balance) > 0) mgDependencyBlocked = true;
        }

        const types: RevenueType[] = wp.included_revenue_types || DEFAULT_REVENUE_TYPES;
        const grossRevenue = mgDependencyBlocked ? 0 : types
          .filter((col: string) => !unc.includes(col))
          .reduce((sum: number, col: string) => sum + (Number((rev as Record<string, unknown>)[col]) || 0), 0);

        const effectiveRsRate = wp.is_mg_applied && wp.mg_rs_rate != null
          ? Number(wp.mg_rs_rate) : Number(wp.rs_rate);

        const workData = wp.work as { serial_start_date: string | null; serial_end_date: string | null } | null;

        const calc = calculateSettlement({
          gross_revenue: grossRevenue,
          rs_rate: Number(wp.rs_rate),
          mg_rs_rate: wp.mg_rs_rate != null ? Number(wp.mg_rs_rate) : null,
          production_cost: productionCost,
          adjustment,
          salary_deduction: staffDeductions.get(`${wp.partner_id}|${wp.work_id}`) || 0,
          other_deduction: otherDeduction,
          tax_rate: Number(wp.partner.tax_rate),
          partner_type: wp.partner.partner_type,
          is_mg_applied: wp.is_mg_applied,
          mg_balance: mgBalance,
          serial_end_date: workData?.serial_end_date ?? null,
          report_type: wp.partner.report_type ?? null,
          month: rev.month,
        });

        await supabase.from('rs_settlements').upsert({
          month: rev.month,
          partner_id: wp.partner_id,
          work_id: wp.work_id,
          gross_revenue: grossRevenue,
          rs_rate: effectiveRsRate,
          revenue_share: calc.revenue_share,
          production_cost: productionCost,
          adjustment,
          tax_rate: Number(wp.partner.tax_rate),
          tax_amount: calc.tax_amount,
          insurance: calc.insurance,
          mg_deduction: calc.mg_deduction,
          other_deduction: otherDeduction,
          final_payment: calc.final_payment,
          status: 'draft',
        }, { onConflict: 'month,partner_id,work_id' });
      }
    }

    return NextResponse.json({ revenue: data });
  } catch (error) {
    console.error('수익 업데이트 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
