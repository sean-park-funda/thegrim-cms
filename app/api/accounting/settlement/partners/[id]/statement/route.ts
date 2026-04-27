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
  type MgEntryData,
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
      .select('work_id, rs_rate, is_mg_applied, included_revenue_types, labor_cost_excluded, labor_cost_as_mg, mg_hold, revenue_rate, tax_type, mg_depends_on, work:rs_works(id, name, serial_start_date, serial_end_date, labor_cost_as_exclusion)')
      .eq('partner_id', id);

    if (wpErr) {
      return NextResponse.json({ error: '작품 연결 조회 실패' }, { status: 500 });
    }

    if (!workPartners || workPartners.length === 0) {
      return NextResponse.json(computeStatement({ partner: partnerData, month, workPartners: [], revenues: [], mgEntries: [], mgDepBlocked: new Map(), revenueAdjustments: [], settlementAdjustments: [], mgDeductionAdjustments: [], laborCostItems: [], laborCostPartnerLinks: [], laborCostWorkLinks: [], laborCostWpData: [] }));
    }

    const wpData: WorkPartnerData[] = workPartners.map(wp => ({
      work_id: wp.work_id,
      rs_rate: Number(wp.rs_rate),
      is_mg_applied: wp.is_mg_applied,
      included_revenue_types: wp.included_revenue_types as string[] | null,
      labor_cost_excluded: wp.labor_cost_excluded,
      labor_cost_as_mg: (wp as any).labor_cost_as_mg ?? false,
      mg_hold: (wp as any).mg_hold ?? false,
      revenue_rate: wp.revenue_rate != null ? Number(wp.revenue_rate) : null,
      tax_type: wp.tax_type as string | null,
      mg_depends_on: wp.mg_depends_on as { partner_id: string; work_id: string } | null,
      work: wp.work as unknown as WorkPartnerData['work'],
    }));

    const workIds = wpData.map(wp => wp.work_id);

    // 3) 매출, 조정, 정산조정 — 병렬 조회
    const [
      { data: revenues },
      { data: revAdjustments },
      { data: adjustmentItems },
      { data: mgDeductionAdjItems },
      { data: insuranceExemptions },
    ] = await Promise.all([
      supabase.from('rs_revenues').select('*').eq('month', month).in('work_id', workIds),
      supabase.from('rs_revenue_adjustments').select('*').eq('month', month).in('work_id', workIds),
      supabase.from('rs_settlement_adjustments').select('*').eq('partner_id', id).eq('month', month).order('created_at'),
      supabase.from('rs_mg_deduction_adjustments').select('*').eq('partner_id', id).eq('month', month).order('created_at'),
      supabase.from('rs_insurance_exemptions').select('id').eq('partner_id', id).eq('month', month).limit(1),
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

    // 4) MG entries
    const { data: rawMgEntries } = await supabase
      .from('rs_mg_entries')
      .select('id, partner_id, amount, withheld_tax, contracted_at, note')
      .eq('partner_id', id);

    let mgEntries: MgEntryData[] = [];
    if (rawMgEntries && rawMgEntries.length > 0) {
      const entryIds = rawMgEntries.map((e: any) => e.id);
      const [{ data: entryWorks }, { data: entryDeds }] = await Promise.all([
        supabase.from('rs_mg_entry_works').select('mg_entry_id, work_id').in('mg_entry_id', entryIds),
        supabase.from('rs_mg_deductions').select('mg_entry_id, amount').in('mg_entry_id', entryIds),
      ]);

      mgEntries = rawMgEntries.map((e: any) => {
        const eWorkIds = (entryWorks || []).filter((ew: any) => ew.mg_entry_id === e.id).map((ew: any) => ew.work_id);
        const totalDeducted = (entryDeds || []).filter((d: any) => d.mg_entry_id === e.id).reduce((s: number, d: any) => s + Number(d.amount), 0);
        return {
          id: e.id, partner_id: e.partner_id, amount: Number(e.amount),
          withheld_tax: e.withheld_tax, contracted_at: e.contracted_at, note: e.note,
          work_ids: eWorkIds, total_deducted: totalDeducted, remaining: Number(e.amount) - totalDeducted,
        };
      });
    }

    // 5) MG 의존 차단 조회 (entry 기반 잔액)
    const mgDepBlocked = new Map<string, MgDepInfoEntry>();
    for (const wp of wpData) {
      if (!wp.mg_depends_on) continue;
      const dep = wp.mg_depends_on;
      const { data: depPartner } = await supabase
        .from('rs_partners').select('name').eq('id', dep.partner_id).single();

      // 의존 파트너의 MG entry 잔액 합계
      const { data: depEntries } = await supabase
        .from('rs_mg_entries').select('id, amount').eq('partner_id', dep.partner_id);
      let depBalance = 0;
      if (depEntries && depEntries.length > 0) {
        const depEntryIds = depEntries.map((e: any) => e.id);
        const { data: depDeds } = await supabase
          .from('rs_mg_deductions').select('mg_entry_id, amount').in('mg_entry_id', depEntryIds);
        const dedByEntry = new Map<string, number>();
        for (const d of (depDeds || [])) {
          dedByEntry.set(d.mg_entry_id, (dedByEntry.get(d.mg_entry_id) || 0) + Number(d.amount));
        }
        depBalance = depEntries.reduce((s: number, e: any) => s + Number(e.amount) - (dedByEntry.get(e.id) || 0), 0);
      }

      mgDepBlocked.set(wp.work_id, {
        partner_name: depPartner?.name || '',
        balance: depBalance,
        history: [],
      });
    }

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
        supabase.from('rs_labor_cost_item_partners').select('item_id, partner_id, burden_ratio').in('item_id', itemIds),
        supabase.from('rs_labor_cost_item_works').select('item_id, work_id').in('item_id', itemIds),
      ]);

      laborCostItems = (items || []).map(i => ({ id: i.id, amount: Number(i.amount), deduction_type: i.deduction_type }));
      laborCostPartnerLinks = (allPartnerLinks || []).map((l: any) => ({ item_id: l.item_id, partner_id: l.partner_id, burden_ratio: l.burden_ratio != null ? Number(l.burden_ratio) : null }));
      laborCostWorkLinks = (allWorkLinks || []).map(l => ({ item_id: l.item_id, work_id: l.work_id }));

      // 인건비 분담 비율 계산을 위한 WP 데이터
      const allLinkedPartnerIds = [...new Set(laborCostPartnerLinks.map(l => l.partner_id))];
      const allLinkedWorkIds = [...new Set(laborCostWorkLinks.map(l => l.work_id))];

      if (allLinkedPartnerIds.length > 0 && allLinkedWorkIds.length > 0) {
        const { data: wpRows } = await supabase
          .from('rs_work_partners')
          .select('partner_id, work_id, rs_rate, is_mg_applied')
          .in('partner_id', allLinkedPartnerIds)
          .in('work_id', allLinkedWorkIds);

        laborCostWpData = (wpRows || []).map(w => ({
          partner_id: w.partner_id,
          work_id: w.work_id,
          rs_rate: Number(w.rs_rate),
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
      mgEntries,
      mgDepBlocked,
      revenueAdjustments: (revAdjustments || []).map(ra => ({
        id: ra.id, work_id: ra.work_id, label: ra.label, amount: Number(ra.amount),
      })),
      settlementAdjustments: (adjustmentItems || []).map(a => ({
        id: a.id, partner_id: a.partner_id, label: a.label, amount: Number(a.amount),
      })),
      mgDeductionAdjustments: (mgDeductionAdjItems || []).map(a => ({
        id: a.id, partner_id: a.partner_id, work_id: a.work_id, label: a.label, amount: Number(a.amount),
      })),
      laborCostItems,
      laborCostPartnerLinks,
      laborCostWorkLinks,
      laborCostWpData,
      insuranceExempt: (insuranceExemptions || []).length > 0,
    };

    const result = computeStatement(input);
    return NextResponse.json(result);
  } catch (error) {
    console.error('정산서 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
