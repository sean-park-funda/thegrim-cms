import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canManageAccounting } from '@/lib/utils/permissions';
import { calculateSettlement } from '@/lib/settlement/calculator';

// POST /api/accounting/settlement/calculate - 정산 계산 실행
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
    const { month } = body;
    if (!month) {
      return NextResponse.json({ error: '월은 필수입니다.' }, { status: 400 });
    }

    // 해당 월의 수익 데이터 조회
    const { data: revenues } = await supabase
      .from('rs_revenues')
      .select('*')
      .eq('month', month);

    if (!revenues || revenues.length === 0) {
      return NextResponse.json({ error: '해당 월의 수익 데이터가 없습니다.' }, { status: 404 });
    }

    // 작품-파트너 연결 조회
    const { data: workPartners } = await supabase
      .from('rs_work_partners')
      .select('*, partner:rs_partners(*)');

    if (!workPartners || workPartners.length === 0) {
      return NextResponse.json({ error: '작품-파트너 연결이 없습니다.' }, { status: 404 });
    }

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
      mg_deduction: number;
      final_payment: number;
    }[] = [];

    for (const rev of revenues) {
      const partners = workPartners.filter(wp => wp.work_id === rev.work_id);

      for (const wp of partners) {
        // MG 잔액 조회
        let mgBalance = 0;
        if (wp.is_mg_applied) {
          const { data: mgData } = await supabase
            .from('rs_mg_balances')
            .select('current_balance')
            .eq('partner_id', wp.partner_id)
            .eq('work_id', wp.work_id)
            .order('month', { ascending: false })
            .limit(1)
            .single();

          if (mgData) {
            mgBalance = Number(mgData.current_balance);
          }
        }

        const calc = calculateSettlement({
          gross_revenue: Number(rev.total),
          rs_rate: Number(wp.rs_rate),
          production_cost: 0,
          adjustment: 0,
          tax_rate: Number(wp.partner.tax_rate),
          is_mg_applied: wp.is_mg_applied,
          mg_balance: mgBalance,
        });

        const settlement = {
          month,
          partner_id: wp.partner_id,
          work_id: wp.work_id,
          gross_revenue: Number(rev.total),
          rs_rate: Number(wp.rs_rate),
          revenue_share: calc.revenue_share,
          production_cost: 0,
          adjustment: 0,
          tax_rate: Number(wp.partner.tax_rate),
          tax_amount: calc.tax_amount,
          mg_deduction: calc.mg_deduction,
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

        // MG 잔액 갱신
        if (wp.is_mg_applied && calc.mg_deduction > 0) {
          const newBalance = mgBalance - calc.mg_deduction;
          await supabase
            .from('rs_mg_balances')
            .upsert({
              month,
              partner_id: wp.partner_id,
              work_id: wp.work_id,
              previous_balance: mgBalance,
              mg_added: 0,
              mg_deducted: calc.mg_deduction,
              current_balance: newBalance,
            }, { onConflict: 'month,partner_id,work_id' });
        }

        results.push({
          work_id: wp.work_id,
          partner_id: wp.partner_id,
          gross_revenue: Number(rev.total),
          rs_rate: Number(wp.rs_rate),
          revenue_share: calc.revenue_share,
          production_cost: 0,
          adjustment: 0,
          tax_rate: Number(wp.partner.tax_rate),
          tax_amount: calc.tax_amount,
          mg_deduction: calc.mg_deduction,
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
