/**
 * 월 단위 전체 파트너 정산 일괄 계산
 *
 * settlement-list API, export, confirm API에서 공유.
 * Supabase 클라이언트를 받아 데이터를 벌크 조회하고,
 * 각 파트너에 대해 computeStatement를 호출하여 결과를 반환.
 */
import {
  computeStatement,
  type PartnerComputeInput,
  type PartnerData,
  type WorkPartnerData,
  type RevenueData,
  type MgEntryData,
  type MgDepInfoEntry,
  type LaborCostItem,
  type LaborCostPartnerLink,
  type LaborCostWorkLink,
  type LaborCostWpData,
  type MgDeductionAdjustmentItem,
  type StatementResult,
} from './compute-statement';

export interface PartnerStatementResult {
  partnerId: string;
  partner: PartnerData;
  result: StatementResult;
  isConfirmed: boolean;
  notes: string;
}

export interface BulkComputeResult {
  partners: PartnerStatementResult[];
}

/**
 * 전체 파트너 statement를 벌크 계산
 */
export async function computeAllStatements(
  supabase: { from: (table: string) => any },
  month: string,
): Promise<BulkComputeResult> {
  // 1) 매출 조회
  const { data: revenues } = await supabase
    .from('rs_revenues').select('*').eq('month', month);

  if (!revenues || revenues.length === 0) {
    return { partners: [] };
  }

  const workIds = revenues.map((r: any) => r.work_id);

  // 2) 작품-파트너 연결 + 파트너 정보
  const { data: allWorkPartners } = await supabase
    .from('rs_work_partners')
    .select('work_id, partner_id, rs_rate, is_mg_applied, included_revenue_types, labor_cost_excluded, labor_cost_as_mg, mg_hold, revenue_rate, tax_type, mg_depends_on, note, partner:rs_partners(*), work:rs_works(id, name, serial_start_date, serial_end_date, labor_cost_as_exclusion)')
    .in('work_id', workIds);

  if (!allWorkPartners || allWorkPartners.length === 0) {
    return { partners: [] };
  }

  const partnerIds = [...new Set(allWorkPartners.map((wp: any) => wp.partner_id))] as string[];

  // 3) 병렬 벌크 조회
  const [
    { data: allRevAdj },
    { data: allSettlementAdj },
    { data: allMgDeductionAdj },
    { data: allMgEntries },
    { data: allPartnerItemLinks },
    { data: confirmedSettlements },
    { data: allInsuranceExemptions },
  ] = await Promise.all([
    supabase.from('rs_revenue_adjustments').select('*').eq('month', month).in('work_id', workIds),
    supabase.from('rs_settlement_adjustments').select('*').eq('month', month).in('partner_id', partnerIds),
    supabase.from('rs_mg_deduction_adjustments').select('*').eq('month', month).in('partner_id', partnerIds),
    supabase.from('rs_mg_entries').select('id, partner_id, amount, withheld_tax, contracted_at, note').in('partner_id', partnerIds),
    supabase.from('rs_labor_cost_item_partners').select('item_id, partner_id').in('partner_id', partnerIds),
    supabase.from('rs_settlements').select('partner_id').eq('month', month).eq('status', 'confirmed'),
    supabase.from('rs_insurance_exemptions').select('partner_id, reason').eq('month', month).in('partner_id', partnerIds),
  ]);

  // MG entry 관련 벌크 조회
  const allEntryIds = (allMgEntries || []).map((e: any) => e.id) as string[];
  let allEntryWorks: any[] = [];
  let allDeductions: any[] = [];

  if (allEntryIds.length > 0) {
    const [{ data: ew }, { data: deds }] = await Promise.all([
      supabase.from('rs_mg_entry_works').select('mg_entry_id, work_id').in('mg_entry_id', allEntryIds),
      supabase.from('rs_mg_deductions').select('mg_entry_id, amount').in('mg_entry_id', allEntryIds),
    ]);
    allEntryWorks = ew || [];
    allDeductions = deds || [];
  }

  const confirmedPartnerIds = new Set((confirmedSettlements || []).map((s: any) => s.partner_id));
  const insuranceExemptPartnerIds = new Set((allInsuranceExemptions || []).map((e: any) => e.partner_id));

  // 인건비 벌크
  const allItemIds = [...new Set((allPartnerItemLinks || []).map((l: any) => l.item_id))] as string[];
  let allLaborItems: LaborCostItem[] = [];
  let allLaborPartnerLinks: LaborCostPartnerLink[] = [];
  let allLaborWorkLinks: LaborCostWorkLink[] = [];
  let allLaborWpData: LaborCostWpData[] = [];

  if (allItemIds.length > 0) {
    const [{ data: items }, { data: pLinks }, { data: wLinks }] = await Promise.all([
      supabase.from('rs_labor_cost_items').select('id, amount, deduction_type').eq('month', month).in('id', allItemIds),
      supabase.from('rs_labor_cost_item_partners').select('item_id, partner_id, burden_ratio').in('item_id', allItemIds),
      supabase.from('rs_labor_cost_item_works').select('item_id, work_id').in('item_id', allItemIds),
    ]);
    allLaborItems = (items || []).map((i: any) => ({ id: i.id, amount: Number(i.amount), deduction_type: i.deduction_type }));
    allLaborPartnerLinks = (pLinks || []).map((l: any) => ({ item_id: l.item_id, partner_id: l.partner_id, burden_ratio: l.burden_ratio != null ? Number(l.burden_ratio) : null }));
    allLaborWorkLinks = (wLinks || []).map((l: any) => ({ item_id: l.item_id, work_id: l.work_id }));

    const linkedPartnerIds = [...new Set(allLaborPartnerLinks.map(l => l.partner_id))];
    const linkedWorkIds = [...new Set(allLaborWorkLinks.map(l => l.work_id))];
    if (linkedPartnerIds.length > 0 && linkedWorkIds.length > 0) {
      const { data: wpRows } = await supabase
        .from('rs_work_partners').select('partner_id, work_id, rs_rate, is_mg_applied')
        .in('partner_id', linkedPartnerIds).in('work_id', linkedWorkIds);
      allLaborWpData = (wpRows || []).map((w: any) => ({
        partner_id: w.partner_id, work_id: w.work_id,
        rs_rate: Number(w.rs_rate),
        is_mg_applied: w.is_mg_applied,
      }));
    }
  }

  // MG 의존 벌크 (entry 잔액 기반)
  const mgDeps = allWorkPartners.filter((wp: any) => wp.mg_depends_on);
  const depPartnerIds = [...new Set(mgDeps.map((wp: any) => (wp.mg_depends_on as { partner_id: string }).partner_id))] as string[];
  let depPartnerNames: { id: string; name: string }[] = [];
  const depPartnerTotalBalance = new Map<string, number>();

  if (depPartnerIds.length > 0) {
    // 의존 대상 파트너의 MG entry 잔액 조회
    const [{ data: depEntries }, { data: depP }] = await Promise.all([
      supabase.from('rs_mg_entries').select('id, partner_id, amount').in('partner_id', depPartnerIds),
      supabase.from('rs_partners').select('id, name').in('id', depPartnerIds),
    ]);
    depPartnerNames = depP || [];

    if (depEntries && depEntries.length > 0) {
      const depEntryIds = depEntries.map((e: any) => e.id);
      const { data: depDeds } = await supabase
        .from('rs_mg_deductions').select('mg_entry_id, amount').in('mg_entry_id', depEntryIds);

      // 엔트리별 차감 합계
      const dedByEntry = new Map<string, number>();
      for (const d of (depDeds || [])) {
        dedByEntry.set(d.mg_entry_id, (dedByEntry.get(d.mg_entry_id) || 0) + Number(d.amount));
      }

      // 파트너별 잔액 합산
      for (const e of depEntries) {
        const totalDed = dedByEntry.get(e.id) || 0;
        const remaining = Number(e.amount) - totalDed;
        depPartnerTotalBalance.set(e.partner_id,
          (depPartnerTotalBalance.get(e.partner_id) || 0) + remaining);
      }
    }
  }

  // 파트너별 특이사항
  const partnerNotesMap = new Map<string, string[]>();
  for (const wp of allWorkPartners) {
    if (wp.note) {
      const notes = partnerNotesMap.get(wp.partner_id) || [];
      if (!notes.includes(wp.note as string)) notes.push(wp.note as string);
      partnerNotesMap.set(wp.partner_id, notes);
    }
  }

  // 파트너별 그룹핑
  const wpByPartner = new Map<string, typeof allWorkPartners>();
  for (const wp of allWorkPartners) {
    const list = wpByPartner.get(wp.partner_id) || [];
    list.push(wp);
    wpByPartner.set(wp.partner_id, list);
  }

  const revenueData: RevenueData[] = revenues.map((r: any) => ({
    work_id: r.work_id, domestic_paid: Number(r.domestic_paid), global_paid: Number(r.global_paid),
    domestic_ad: Number(r.domestic_ad), global_ad: Number(r.global_ad), secondary: Number(r.secondary),
    unconfirmed_types: r.unconfirmed_types || [],
  }));

  // 파트너별 계산
  const results: PartnerStatementResult[] = [];

  for (const partnerId of partnerIds) {
    const wps = wpByPartner.get(partnerId);
    if (!wps || wps.length === 0) continue;

    const partnerRaw = wps[0].partner as Record<string, unknown>;
    const partner: PartnerData = {
      id: partnerRaw.id as string, name: partnerRaw.name as string,
      company_name: (partnerRaw.company_name as string) || null,
      partner_type: partnerRaw.partner_type as string,
      vat_type: (partnerRaw.vat_type as string) || null,
      report_type: (partnerRaw.report_type as string) || null,
      is_foreign: (partnerRaw.is_foreign as boolean) || false,
      tax_id: (partnerRaw.tax_id as string) || null,
    };

    const partnerWorkIds = wps.map((wp: any) => wp.work_id);
    const workPartnerData: WorkPartnerData[] = wps.map((wp: any) => ({
      work_id: wp.work_id, rs_rate: Number(wp.rs_rate),
      is_mg_applied: wp.is_mg_applied,
      included_revenue_types: wp.included_revenue_types as string[] | null,
      labor_cost_excluded: wp.labor_cost_excluded,
      labor_cost_as_mg: wp.labor_cost_as_mg ?? false,
      mg_hold: wp.mg_hold ?? false,
      revenue_rate: wp.revenue_rate != null ? Number(wp.revenue_rate) : null,
      tax_type: wp.tax_type as string | null,
      mg_depends_on: wp.mg_depends_on as { partner_id: string; work_id: string } | null,
      work: wp.work as unknown as WorkPartnerData['work'],
    }));

    // MG entries for this partner
    const partnerEntries = (allMgEntries || []).filter((e: any) => e.partner_id === partnerId);
    const mgEntries: MgEntryData[] = partnerEntries.map((e: any) => {
      const entryWorkIds = allEntryWorks
        .filter((ew: any) => ew.mg_entry_id === e.id)
        .map((ew: any) => ew.work_id);
      const totalDeducted = allDeductions
        .filter((d: any) => d.mg_entry_id === e.id)
        .reduce((s: number, d: any) => s + Number(d.amount), 0);
      return {
        id: e.id,
        partner_id: e.partner_id,
        amount: Number(e.amount),
        withheld_tax: e.withheld_tax,
        contracted_at: e.contracted_at,
        note: e.note,
        work_ids: entryWorkIds,
        total_deducted: totalDeducted,
        remaining: Number(e.amount) - totalDeducted,
      };
    });

    // MG 의존
    const mgDepBlocked = new Map<string, MgDepInfoEntry>();
    for (const wp of workPartnerData) {
      if (!wp.mg_depends_on) continue;
      const dep = wp.mg_depends_on;
      const depName = depPartnerNames.find(p => p.id === dep.partner_id)?.name || '';
      const depBalance = depPartnerTotalBalance.get(dep.partner_id) || 0;
      mgDepBlocked.set(wp.work_id, { partner_name: depName, balance: depBalance, history: [] });
    }

    const myItemIds = new Set(
      (allPartnerItemLinks || []).filter((l: any) => l.partner_id === partnerId).map((l: any) => l.item_id)
    );

    const input: PartnerComputeInput = {
      partner, month, workPartners: workPartnerData,
      revenues: revenueData.filter(r => partnerWorkIds.includes(r.work_id)),
      mgEntries, mgDepBlocked,
      revenueAdjustments: (allRevAdj || []).filter((ra: any) => partnerWorkIds.includes(ra.work_id))
        .map((ra: any) => ({ id: ra.id, work_id: ra.work_id, label: ra.label, amount: Number(ra.amount) })),
      settlementAdjustments: (allSettlementAdj || []).filter((a: any) => a.partner_id === partnerId)
        .map((a: any) => ({ id: a.id, partner_id: a.partner_id, label: a.label, amount: Number(a.amount) })),
      mgDeductionAdjustments: (allMgDeductionAdj || []).filter((a: any) => a.partner_id === partnerId)
        .map((a: any) => ({ id: a.id, partner_id: a.partner_id, work_id: a.work_id, label: a.label, amount: Number(a.amount) })),
      laborCostItems: allLaborItems.filter(i => myItemIds.has(i.id)),
      laborCostPartnerLinks: allLaborPartnerLinks.filter(l => myItemIds.has(l.item_id)),
      laborCostWorkLinks: allLaborWorkLinks.filter(l => myItemIds.has(l.item_id)),
      laborCostWpData: allLaborWpData,
      insuranceExempt: insuranceExemptPartnerIds.has(partnerId),
    };

    const result = computeStatement(input);

    results.push({
      partnerId,
      partner,
      result,
      isConfirmed: confirmedPartnerIds.has(partnerId),
      notes: partnerNotesMap.get(partnerId)?.join('; ') || '',
    });
  }

  return { partners: results };
}
