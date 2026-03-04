import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { calculateTax, calculateInsurance } from '@/lib/settlement/calculator';

const REVENUE_TYPE_LABELS: Record<string, string> = {
  domestic_paid: '국내유료수익',
  global_paid: '글로벌유료수익',
  domestic_ad: '국내 광고',
  global_ad: '글로벌 광고',
  secondary: '2차 사업',
};

const REVENUE_COLUMNS = ['domestic_paid', 'global_paid', 'domestic_ad', 'global_ad', 'secondary'] as const;

// GET /api/accounting/settlement/partners/[id]/statement?month=YYYY-MM
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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
    if (!month) {
      return NextResponse.json({ error: '월은 필수입니다.' }, { status: 400 });
    }

    // 1) 파트너 정보
    const { data: partner, error: pErr } = await supabase
      .from('rs_partners')
      .select('*')
      .eq('id', id)
      .single();

    if (pErr || !partner) {
      return NextResponse.json({ error: '파트너를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 2) 파트너의 작품 연결 (RS비율 + MG요율)
    const { data: workPartners, error: wpErr } = await supabase
      .from('rs_work_partners')
      .select('work_id, rs_rate, mg_rs_rate, is_mg_applied, included_revenue_types, work:rs_works(id, name, serial_start_date, serial_end_date)')
      .eq('partner_id', id);

    if (wpErr) {
      return NextResponse.json({ error: '작품 연결 조회 실패' }, { status: 500 });
    }

    if (!workPartners || workPartners.length === 0) {
      return NextResponse.json({
        partner,
        month,
        works: [],
        grand_total_revenue: 0,
        grand_total_share: 0,
        tax_amount: 0,
        insurance: 0,
        final_payment: 0,
      });
    }

    // 3) 해당 월 수익
    const workIds = workPartners.map(wp => wp.work_id);
    const { data: revenues, error: rErr } = await supabase
      .from('rs_revenues')
      .select('*')
      .eq('month', month)
      .in('work_id', workIds);

    if (rErr) {
      return NextResponse.json({ error: '수익 조회 실패' }, { status: 500 });
    }

    // 4) MG 잔액 (해당 월)
    const { data: mgBalances } = await supabase
      .from('rs_mg_balances')
      .select('*')
      .eq('month', month)
      .eq('partner_id', id)
      .in('work_id', workIds);

    // 4-1) MG 전체 이력 (해당 파트너의 모든 월)
    const { data: mgHistory } = await supabase
      .from('rs_mg_balances')
      .select('*, work:rs_works(name)')
      .eq('partner_id', id)
      .in('work_id', workIds)
      .order('month', { ascending: true });

    // 4-2) 정산 데이터에서 other_deduction 조회
    const { data: settlements } = await supabase
      .from('rs_settlements')
      .select('work_id, other_deduction')
      .eq('month', month)
      .eq('partner_id', id)
      .in('work_id', workIds);

    // 5) 작품별 정산 상세 조합
    const works = workPartners.map(wp => {
      const work = wp.work as unknown as { id: string; name: string; serial_start_date: string | null; serial_end_date: string | null } | null;
      const rev = revenues?.find(r => r.work_id === wp.work_id);
      const mg = mgBalances?.find(m => m.work_id === wp.work_id);

      // MG 적용 시 mg_rs_rate 사용
      const effectiveRate = wp.is_mg_applied && wp.mg_rs_rate != null
        ? Number(wp.mg_rs_rate)
        : Number(wp.rs_rate);

      const includedTypes = (wp.included_revenue_types as string[] | null) || REVENUE_COLUMNS;
      const details = REVENUE_COLUMNS.map(col => {
        const included = includedTypes.includes(col);
        const amount = (rev && included) ? Number(rev[col]) : 0;
        return {
          revenue_type: col,
          revenue_type_label: REVENUE_TYPE_LABELS[col],
          gross_revenue: amount,
          revenue_share: Math.round(amount * effectiveRate),
          rs_rate: effectiveRate,
          excluded: !included,
        };
      });

      const work_total_revenue = details.reduce((s, d) => s + d.gross_revenue, 0);
      const work_total_share = details.reduce((s, d) => s + d.revenue_share, 0);

      return {
        work_name: work?.name || '',
        work_id: wp.work_id,
        rs_rate: Number(wp.rs_rate),
        mg_rs_rate: wp.mg_rs_rate != null ? Number(wp.mg_rs_rate) : null,
        effective_rate: effectiveRate,
        is_mg_applied: wp.is_mg_applied,
        details,
        work_total_revenue,
        work_total_share,
        mg_balance: mg ? Number(mg.previous_balance) : 0,
        mg_deduction: mg ? Number(mg.mg_deducted) : 0,
        mg_remaining: mg ? Number(mg.current_balance) : 0,
      };
    }).filter(w => w.work_total_revenue > 0 || w.mg_balance > 0);

    const grand_total_revenue = works.reduce((s, w) => s + w.work_total_revenue, 0);
    const grand_total_share = works.reduce((s, w) => s + w.work_total_share, 0);

    // 근로소득공제 (임직원)
    const salaryDeduction = Number(partner.salary_deduction) || 0;
    const subtotal = grand_total_share - salaryDeduction;

    // 세금 계산 (파트너 유형별 분리)
    const tax_breakdown = calculateTax(subtotal, partner.partner_type);
    const tax_amount = tax_breakdown.total;

    // 예고료 계산 — 연재 중인 작품이 하나라도 있으면 대상
    const hasActiveSerial = works.some(w => {
      const wk = workPartners.find(wp => wp.work_id === w.work_id);
      const wkData = wk?.work as unknown as { serial_end_date: string | null } | null;
      return !wkData?.serial_end_date || new Date(wkData.serial_end_date) >= new Date(month + '-01');
    });
    const insurance = calculateInsurance(subtotal, partner.partner_type, {
      serialEndDate: hasActiveSerial ? null : '1900-01-01',
      reportType: partner.report_type ?? null,
      month,
    });

    // MG 차감 합계
    const total_mg_deduction = works.reduce((s, w) => s + Math.abs(w.mg_deduction), 0);

    // 기타 공제 합계
    const total_other_deduction = (settlements || []).reduce((s, st) => s + (Number(st.other_deduction) || 0), 0);

    const final_payment = subtotal - tax_amount - insurance - total_mg_deduction - total_other_deduction;

    // MG 전체 이력을 작품별로 그룹핑
    const mgHistoryByWork = new Map<string, { month: string; previous_balance: number; mg_added: number; mg_deducted: number; current_balance: number; note: string }[]>();
    for (const mg of (mgHistory || [])) {
      const workName = (mg.work as { name: string } | null)?.name || mg.work_id;
      const list = mgHistoryByWork.get(workName) || [];
      list.push({
        month: mg.month,
        previous_balance: Number(mg.previous_balance),
        mg_added: Number(mg.mg_added),
        mg_deducted: Number(mg.mg_deducted),
        current_balance: Number(mg.current_balance),
        note: mg.note || '',
      });
      mgHistoryByWork.set(workName, list);
    }

    const mg_history = Array.from(mgHistoryByWork.entries()).map(([work_name, history]) => ({
      work_name,
      history,
    }));

    return NextResponse.json({
      partner,
      month,
      works,
      grand_total_revenue,
      grand_total_share,
      salary_deduction: salaryDeduction,
      subtotal,
      tax_breakdown,
      tax_amount,
      insurance,
      total_mg_deduction,
      total_other_deduction,
      final_payment,
      mg_history,
    });
  } catch (error) {
    console.error('정산서 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
