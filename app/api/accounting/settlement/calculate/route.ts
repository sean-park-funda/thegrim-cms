import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { calculateSettlement } from '@/lib/settlement/calculator';
import { computeLaborCostDeductions } from '@/lib/settlement/staff-salary';
import { RevenueType } from '@/lib/types/settlement';

const DEFAULT_REVENUE_TYPES: RevenueType[] = ['domestic_paid', 'global_paid', 'domestic_ad', 'global_ad', 'secondary'];

// POST /api/accounting/settlement/calculate - 정산 계산 실행
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

    // 해당 월의 수익 데이터 조회 (미확정 매출 제외)
    const { data: revenues } = await supabase
      .from('rs_revenues')
      .select('*')
      .eq('month', month)
      .eq('is_confirmed', true);

    if (!revenues || revenues.length === 0) {
      return NextResponse.json({ error: '해당 월의 확정된 수익 데이터가 없습니다.' }, { status: 404 });
    }

    // 작품-파트너 연결 조회
    const { data: workPartners } = await supabase
      .from('rs_work_partners')
      .select('*, partner:rs_partners(*), work:rs_works(serial_start_date, serial_end_date)');

    if (!workPartners || workPartners.length === 0) {
      return NextResponse.json({ error: '작품-파트너 연결이 없습니다.' }, { status: 404 });
    }

    // 기존 정산 데이터 조회 (production_cost, adjustment, other_deduction 유지용)
    const { data: existingSettlements } = await supabase
      .from('rs_settlements')
      .select('work_id, partner_id, production_cost, adjustment, other_deduction')
      .eq('month', month);

    const existingMap = new Map<string, { production_cost: number; adjustment: number; other_deduction: number }>();
    for (const es of (existingSettlements || [])) {
      existingMap.set(`${es.work_id}:${es.partner_id}`, {
        production_cost: Number(es.production_cost) || 0,
        adjustment: Number(es.adjustment) || 0,
        other_deduction: Number(es.other_deduction) || 0,
      });
    }

    // 작품별 매출 맵 구성 (스태프 급여 배분용)
    const revenueByWorkId = new Map<string, number>();
    for (const rev of revenues) {
      revenueByWorkId.set(rev.work_id, Number(rev.total) || 0);
    }

    // 인건비공제 계산 (rs_labor_cost_items 기반)
    const staffDeductions = await computeLaborCostDeductions(supabase, month, revenueByWorkId);

    const results: {
      work_id: string;
      partner_id: string;
      gross_revenue: number;
      rs_rate: number;
      revenue_share: number;
      production_cost: number;
      adjustment: number;
      tax_rate: number;
      tax_amount: number;
      insurance: number;
      mg_deduction: number;
      other_deduction: number;
      final_payment: number;
    }[] = [];

    for (const rev of revenues) {
      const partners = workPartners.filter(wp => wp.work_id === rev.work_id);

      for (const wp of partners) {
        // MG 잔액 조회 (현재 월 제외 — 이전 월까지만 참조)
        let mgBalance = 0;
        if (wp.is_mg_applied) {
          const { data: mgData } = await supabase
            .from('rs_mg_balances')
            .select('current_balance')
            .eq('partner_id', wp.partner_id)
            .eq('work_id', wp.work_id)
            .lt('month', month)
            .order('month', { ascending: false })
            .limit(1)
            .single();

          if (mgData) {
            mgBalance = Number(mgData.current_balance);
          }
        }

        // 기존 수동 입력값 보존
        const existing = existingMap.get(`${wp.work_id}:${wp.partner_id}`);
        const productionCost = existing?.production_cost ?? 0;
        const adjustment = existing?.adjustment ?? 0;
        const otherDeduction = existing?.other_deduction ?? 0;

        const effectiveRsRate = wp.is_mg_applied && wp.mg_rs_rate != null
          ? Number(wp.mg_rs_rate)
          : Number(wp.rs_rate);

        // 특약: 포함된 수익유형만 합산 (미설정 시 전체)
        const types: RevenueType[] = wp.included_revenue_types || DEFAULT_REVENUE_TYPES;
        const grossRevenue = types.reduce((sum: number, col: string) => sum + (Number(rev[col]) || 0), 0);

        const workData = wp.work as { serial_start_date: string | null; serial_end_date: string | null } | null;

        const calc = calculateSettlement({
          gross_revenue: grossRevenue,
          rs_rate: Number(wp.rs_rate),
          mg_rs_rate: wp.mg_rs_rate != null ? Number(wp.mg_rs_rate) : null,
          production_cost: productionCost,
          adjustment: adjustment,
          salary_deduction: staffDeductions.get(`${wp.partner_id}|${wp.work_id}`) || 0,
          other_deduction: otherDeduction,
          tax_rate: Number(wp.partner.tax_rate),
          partner_type: wp.partner.partner_type,
          is_mg_applied: wp.is_mg_applied,
          mg_balance: mgBalance,
          serial_end_date: workData?.serial_end_date ?? null,
          report_type: wp.partner.report_type ?? null,
          month,
        });

        const settlement = {
          month,
          partner_id: wp.partner_id,
          work_id: wp.work_id,
          gross_revenue: grossRevenue,
          rs_rate: effectiveRsRate,
          revenue_share: calc.revenue_share,
          production_cost: productionCost,
          adjustment: adjustment,
          tax_rate: Number(wp.partner.tax_rate),
          tax_amount: calc.tax_amount,
          insurance: calc.insurance,
          mg_deduction: calc.mg_deduction,
          other_deduction: otherDeduction,
          final_payment: calc.final_payment,
          status: 'draft' as const,
        };

        // UPSERT 정산
        const { error: upsertError } = await supabase
          .from('rs_settlements')
          .upsert(settlement, { onConflict: 'month,partner_id,work_id' });

        if (upsertError) {
          console.error('정산 UPSERT 오류:', upsertError);
        }

        // MG 잔액은 정산 확정(confirmed) 시 갱신됨 (settlements PUT)

        results.push({
          work_id: wp.work_id,
          partner_id: wp.partner_id,
          gross_revenue: grossRevenue,
          rs_rate: effectiveRsRate,
          revenue_share: calc.revenue_share,
          production_cost: productionCost,
          adjustment: adjustment,
          tax_rate: Number(wp.partner.tax_rate),
          tax_amount: calc.tax_amount,
          insurance: calc.insurance,
          mg_deduction: calc.mg_deduction,
          other_deduction: otherDeduction,
          final_payment: calc.final_payment,
        });
      }
    }

    return NextResponse.json({ settlements: results, count: results.length });
  } catch (error) {
    console.error('정산 계산 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
