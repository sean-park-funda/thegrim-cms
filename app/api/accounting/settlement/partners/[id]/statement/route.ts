import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import {
  computeStatement,
  REVENUE_COLUMNS,
  type PartnerComputeInput,
  type PartnerData,
  type WorkPartnerData,
  type RevenueData,
  type MgBalanceEntry,
  type MgDepInfoEntry,
  type MgHistoryEntry,
  type LaborCostItem,
  type LaborCostPartnerLink,
  type LaborCostWorkLink,
  type LaborCostWpData,
} from '@/lib/settlement/compute-statement';

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

    // ─── 데이터 조회 ──────────────────────────────────────────

    // 1) 파트너 정보
    const { data: partner, error: pErr } = await supabase
      .from('rs_partners')
      .select('*')
      .eq('id', id)
      .single();

    if (pErr || !partner) {
      return NextResponse.json({ error: '파트너를 찾을 수 없습니다.' }, { status: 404 });
    }

    const partnerData: PartnerData = {
      id: partner.id,
      name: partner.name,
      company_name: partner.company_name,
      partner_type: partner.partner_type,
      vat_type: partner.vat_type,
      report_type: partner.report_type,
      is_foreign: partner.is_foreign,
      tax_id: partner.tax_id,
    };

    // 2) 작품 연결
    const { data: workPartners, error: wpErr } = await supabase
      .from('rs_work_partners')
      .select('work_id, rs_rate, mg_rs_rate, is_mg_applied, included_revenue_types, labor_cost_excluded, revenue_rate, tax_type, mg_depends_on, work:rs_works(id, name, serial_start_date, serial_end_date, labor_cost_as_exclusion)')
      .eq('partner_id', id);

    if (wpErr) {
      return NextResponse.json({ error: '작품 연결 조회 실패' }, { status: 500 });
    }

    if (!workPartners || workPartners.length === 0) {
      return NextResponse.json(computeStatement({ partner: partnerData, month, workPartners: [], revenues: [], mgBalances: [], mgDepBlocked: new Map(), revenueAdjustments: [], settlementAdjustments: [], productionCosts: [], laborCostItems: [], laborCostPartnerLinks: [], laborCostWorkLinks: [], laborCostWpData: [] }));
    }

    const wpData: WorkPartnerData[] = workPartners.map(wp => ({
      work_id: wp.work_id,
      rs_rate: Number(wp.rs_rate),
      mg_rs_rate: wp.mg_rs_rate != null ? Number(wp.mg_rs_rate) : null,
      is_mg_applied: wp.is_mg_applied,
      included_revenue_types: wp.included_revenue_types as string[] | null,
      labor_cost_excluded: wp.labor_cost_excluded,
      revenue_rate: wp.revenue_rate != null ? Number(wp.revenue_rate) : null,
      tax_type: wp.tax_type as string | null,
      mg_depends_on: wp.mg_depends_on as { partner_id: string; work_id: string } | null,
      work: wp.work as unknown as WorkPartnerData['work'],
    }));

    const workIds = wpData.map(wp => wp.work_id);

    // 3) 매출, 조정, 제작비용, 정산조정 — 병렬 조회
    const [
      { data: revenues },
      { data: revAdjustments },
      { data: productionCosts },
      { data: adjustmentItems },
    ] = await Promise.all([
      supabase.from('rs_revenues').select('*').eq('month', month).in('work_id', workIds),
      supabase.from('rs_revenue_adjustments').select('*').eq('month', month).in('work_id', workIds),
      supabase.from('rs_production_costs').select('*').eq('month', month).eq('partner_id', id).in('work_id', workIds),
      supabase.from('rs_settlement_adjustments').select('*').eq('partner_id', id).eq('month', month).order('created_at'),
    ]);

    const revenueData: RevenueData[] = (revenues || []).map(r => ({
      work_id: r.work_id,
      domestic_paid: Number(r.domestic_paid),
      global_paid: Number(r.global_paid),
      domestic_ad: Number(r.domestic_ad),
      global_ad: Number(r.global_ad),
      secondary: Number(r.secondary),
      unconfirmed_types: r.unconfirmed_types || [],
    }));

    // 4) MG 잔액
    const mgAppliedWorkIds = wpData.filter(wp => wp.is_mg_applied).map(wp => wp.work_id);
    const mgBalances: MgBalanceEntry[] = [];

    if (mgAppliedWorkIds.length > 0) {
      const { data: currentMonthMg } = await supabase
        .from('rs_mg_balances')
        .select('work_id, previous_balance')
        .eq('month', month)
        .eq('partner_id', id)
        .in('work_id', mgAppliedWorkIds);

      const foundWorkIds = new Set<string>();
      for (const mg of (currentMonthMg || [])) {
        mgBalances.push({ work_id: mg.work_id, previous_balance: Number(mg.previous_balance) });
        foundWorkIds.add(mg.work_id);
      }

      const missingWorkIds = mgAppliedWorkIds.filter(wid => !foundWorkIds.has(wid));
      if (missingWorkIds.length > 0) {
        const { data: prevMonthMg } = await supabase
          .from('rs_mg_balances')
          .select('work_id, current_balance')
          .lt('month', month)
          .eq('partner_id', id)
          .in('work_id', missingWorkIds)
          .order('month', { ascending: false });

        const seen = new Set<string>();
        for (const mg of (prevMonthMg || [])) {
          if (!seen.has(mg.work_id)) {
            mgBalances.push({ work_id: mg.work_id, previous_balance: Number(mg.current_balance) });
            seen.add(mg.work_id);
          }
        }
      }
    }

    // 5) MG 의존 차단 조회
    const mgDepBlocked = new Map<string, MgDepInfoEntry>();
    for (const wp of wpData) {
      if (!wp.mg_depends_on) continue;
      const dep = wp.mg_depends_on;
      const [{ data: depMg }, { data: depPartner }] = await Promise.all([
        supabase
          .from('rs_mg_balances')
          .select('current_balance')
          .eq('partner_id', dep.partner_id)
          .eq('work_id', dep.work_id)
          .order('month', { ascending: false })
          .limit(1)
          .single(),
        supabase
          .from('rs_partners')
          .select('name')
          .eq('id', dep.partner_id)
          .single(),
      ]);
      mgDepBlocked.set(wp.work_id, {
        partner_name: depPartner?.name || '',
        balance: depMg ? Number(depMg.current_balance) : 0,
      });
    }

    // 6) MG 이력
    const { data: mgHistory } = await supabase
      .from('rs_mg_balances')
      .select('*, work:rs_works(name)')
      .eq('partner_id', id)
      .in('work_id', workIds)
      .order('month', { ascending: true });

    const mgHistoryData: MgHistoryEntry[] = (mgHistory || []).map(mg => ({
      work_id: mg.work_id,
      work_name: (mg.work as { name: string } | null)?.name || mg.work_id,
      month: mg.month,
      previous_balance: Number(mg.previous_balance),
      mg_added: Number(mg.mg_added),
      mg_deducted: Number(mg.mg_deducted),
      current_balance: Number(mg.current_balance),
      note: mg.note || '',
    }));

    // 7) 인건비 데이터 조회
    let laborCostItems: LaborCostItem[] = [];
    let laborCostPartnerLinks: LaborCostPartnerLink[] = [];
    let laborCostWorkLinks: LaborCostWorkLink[] = [];
    let laborCostWpData: LaborCostWpData[] = [];

    const { data: partnerItemLinks } = await supabase
      .from('rs_labor_cost_item_partners')
      .select('item_id')
      .eq('partner_id', id);

    if (partnerItemLinks && partnerItemLinks.length > 0) {
      const itemIds = partnerItemLinks.map(l => l.item_id);

      const [
        { data: items },
        { data: allPartnerLinks },
        { data: allWorkLinks },
      ] = await Promise.all([
        supabase.from('rs_labor_cost_items').select('id, amount, deduction_type').eq('month', month).in('id', itemIds),
        supabase.from('rs_labor_cost_item_partners').select('item_id, partner_id').in('item_id', itemIds),
        supabase.from('rs_labor_cost_item_works').select('item_id, work_id').in('item_id', itemIds),
      ]);

      laborCostItems = (items || []).map(i => ({ id: i.id, amount: Number(i.amount), deduction_type: i.deduction_type }));
      laborCostPartnerLinks = (allPartnerLinks || []).map(l => ({ item_id: l.item_id, partner_id: l.partner_id }));
      laborCostWorkLinks = (allWorkLinks || []).map(l => ({ item_id: l.item_id, work_id: l.work_id }));

      // 인건비 분담 비율 계산을 위한 WP 데이터
      const allLinkedPartnerIds = [...new Set(laborCostPartnerLinks.map(l => l.partner_id))];
      const allLinkedWorkIds = [...new Set(laborCostWorkLinks.map(l => l.work_id))];

      if (allLinkedPartnerIds.length > 0 && allLinkedWorkIds.length > 0) {
        const { data: wpRows } = await supabase
          .from('rs_work_partners')
          .select('partner_id, work_id, rs_rate, mg_rs_rate, is_mg_applied')
          .in('partner_id', allLinkedPartnerIds)
          .in('work_id', allLinkedWorkIds);

        laborCostWpData = (wpRows || []).map(w => ({
          partner_id: w.partner_id,
          work_id: w.work_id,
          rs_rate: Number(w.rs_rate),
          mg_rs_rate: w.mg_rs_rate != null ? Number(w.mg_rs_rate) : null,
          is_mg_applied: w.is_mg_applied,
        }));
      }
    }

    // ─── 계산 ─────────────────────────────────────────────────

    const input: PartnerComputeInput = {
      partner: partnerData,
      month,
      workPartners: wpData,
      revenues: revenueData,
      mgBalances,
      mgDepBlocked,
      revenueAdjustments: (revAdjustments || []).map(ra => ({
        id: ra.id, work_id: ra.work_id, label: ra.label, amount: Number(ra.amount),
      })),
      settlementAdjustments: (adjustmentItems || []).map(a => ({
        id: a.id, partner_id: a.partner_id, label: a.label, amount: Number(a.amount),
      })),
      productionCosts: (productionCosts || []).map(pc => ({
        partner_id: pc.partner_id, work_id: pc.work_id, amount: Number(pc.amount),
      })),
      laborCostItems,
      laborCostPartnerLinks,
      laborCostWorkLinks,
      laborCostWpData,
      mgHistory: mgHistoryData,
    };

    const result = computeStatement(input);
    return NextResponse.json(result);
  } catch (error) {
    console.error('정산서 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
