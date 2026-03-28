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
  type MgBalanceEntry,
  type MgDepInfoEntry,
  type LaborCostItem,
  type LaborCostPartnerLink,
  type LaborCostWorkLink,
  type LaborCostWpData,
  type RevenueAdjustmentItem,
  type SettlementAdjustmentItem,
  type ProductionCostEntry,
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
  /** raw data needed for confirm API to build upsert rows */
  _raw?: {
    allMgBalancesCurrent: { partner_id: string; work_id: string; previous_balance: number }[];
  };
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
    .select('work_id, partner_id, rs_rate, mg_rs_rate, is_mg_applied, included_revenue_types, labor_cost_excluded, revenue_rate, tax_type, mg_depends_on, note, partner:rs_partners(*), work:rs_works(id, name, serial_start_date, serial_end_date, labor_cost_as_exclusion)')
    .in('work_id', workIds);

  if (!allWorkPartners || allWorkPartners.length === 0) {
    return { partners: [] };
  }

  const partnerIds = [...new Set(allWorkPartners.map((wp: any) => wp.partner_id))] as string[];

  // 3) 병렬 벌크 조회
  const [
    { data: allRevAdj },
    { data: allSettlementAdj },
    { data: allProductionCosts },
    { data: allMgBalancesCurrent },
    { data: allMgBalancesPrev },
    { data: allPartnerItemLinks },
    { data: confirmedSettlements },
  ] = await Promise.all([
    supabase.from('rs_revenue_adjustments').select('*').eq('month', month).in('work_id', workIds),
    supabase.from('rs_settlement_adjustments').select('*').eq('month', month).in('partner_id', partnerIds),
    supabase.from('rs_production_costs').select('*').eq('month', month).in('partner_id', partnerIds),
    supabase.from('rs_mg_balances').select('work_id, partner_id, previous_balance').eq('month', month).in('partner_id', partnerIds),
    supabase.from('rs_mg_balances').select('work_id, partner_id, month, current_balance').lt('month', month).in('partner_id', partnerIds).order('month', { ascending: false }),
    supabase.from('rs_labor_cost_item_partners').select('item_id, partner_id').in('partner_id', partnerIds),
    supabase.from('rs_settlements').select('partner_id').eq('month', month).eq('status', 'confirmed'),
  ]);

  const confirmedPartnerIds = new Set((confirmedSettlements || []).map((s: any) => s.partner_id));

  // 인건비 벌크
  const allItemIds = [...new Set((allPartnerItemLinks || []).map((l: any) => l.item_id))] as string[];
  let allLaborItems: LaborCostItem[] = [];
  let allLaborPartnerLinks: LaborCostPartnerLink[] = [];
  let allLaborWorkLinks: LaborCostWorkLink[] = [];
  let allLaborWpData: LaborCostWpData[] = [];

  if (allItemIds.length > 0) {
    const [{ data: items }, { data: pLinks }, { data: wLinks }] = await Promise.all([
      supabase.from('rs_labor_cost_items').select('id, amount, deduction_type').eq('month', month).in('id', allItemIds),
      supabase.from('rs_labor_cost_item_partners').select('item_id, partner_id').in('item_id', allItemIds),
      supabase.from('rs_labor_cost_item_works').select('item_id, work_id').in('item_id', allItemIds),
    ]);
    allLaborItems = (items || []).map((i: any) => ({ id: i.id, amount: Number(i.amount), deduction_type: i.deduction_type }));
    allLaborPartnerLinks = (pLinks || []).map((l: any) => ({ item_id: l.item_id, partner_id: l.partner_id }));
    allLaborWorkLinks = (wLinks || []).map((l: any) => ({ item_id: l.item_id, work_id: l.work_id }));

    const linkedPartnerIds = [...new Set(allLaborPartnerLinks.map(l => l.partner_id))];
    const linkedWorkIds = [...new Set(allLaborWorkLinks.map(l => l.work_id))];
    if (linkedPartnerIds.length > 0 && linkedWorkIds.length > 0) {
      const { data: wpRows } = await supabase
        .from('rs_work_partners').select('partner_id, work_id, rs_rate, mg_rs_rate, is_mg_applied')
        .in('partner_id', linkedPartnerIds).in('work_id', linkedWorkIds);
      allLaborWpData = (wpRows || []).map((w: any) => ({
        partner_id: w.partner_id, work_id: w.work_id,
        rs_rate: Number(w.rs_rate), mg_rs_rate: w.mg_rs_rate != null ? Number(w.mg_rs_rate) : null,
        is_mg_applied: w.is_mg_applied,
      }));
    }
  }

  // MG 의존 벌크
  const mgDeps = allWorkPartners.filter((wp: any) => wp.mg_depends_on);
  const depPartnerIds = [...new Set(mgDeps.map((wp: any) => (wp.mg_depends_on as { partner_id: string }).partner_id))] as string[];
  const depWorkIds = [...new Set(mgDeps.map((wp: any) => (wp.mg_depends_on as { work_id: string }).work_id))] as string[];
  let depMgBalances: { partner_id: string; work_id: string; current_balance: number }[] = [];
  let depPartnerNames: { id: string; name: string }[] = [];
  if (depPartnerIds.length > 0) {
    const [{ data: depMg }, { data: depP }] = await Promise.all([
      supabase.from('rs_mg_balances').select('partner_id, work_id, current_balance, month').in('partner_id', depPartnerIds).in('work_id', depWorkIds).order('month', { ascending: false }),
      supabase.from('rs_partners').select('id, name').in('id', depPartnerIds),
    ]);
    depMgBalances = depMg || [];
    depPartnerNames = depP || [];
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
      mg_rs_rate: wp.mg_rs_rate != null ? Number(wp.mg_rs_rate) : null,
      is_mg_applied: wp.is_mg_applied,
      included_revenue_types: wp.included_revenue_types as string[] | null,
      labor_cost_excluded: wp.labor_cost_excluded,
      revenue_rate: wp.revenue_rate != null ? Number(wp.revenue_rate) : null,
      tax_type: wp.tax_type as string | null,
      mg_depends_on: wp.mg_depends_on as { partner_id: string; work_id: string } | null,
      work: wp.work as unknown as WorkPartnerData['work'],
    }));

    // MG 잔액
    const mgBalances: MgBalanceEntry[] = [];
    const mgApplied = workPartnerData.filter(wp => wp.is_mg_applied).map(wp => wp.work_id);
    if (mgApplied.length > 0) {
      const found = new Set<string>();
      for (const mb of (allMgBalancesCurrent || [])) {
        if ((mb as any).partner_id === partnerId && mgApplied.includes((mb as any).work_id)) {
          mgBalances.push({ work_id: (mb as any).work_id, previous_balance: Number((mb as any).previous_balance) });
          found.add((mb as any).work_id);
        }
      }
      const missing = mgApplied.filter(wid => !found.has(wid));
      if (missing.length > 0) {
        const seen = new Set<string>();
        for (const mb of (allMgBalancesPrev || [])) {
          if ((mb as any).partner_id === partnerId && missing.includes((mb as any).work_id) && !seen.has((mb as any).work_id)) {
            mgBalances.push({ work_id: (mb as any).work_id, previous_balance: Number((mb as any).current_balance) });
            seen.add((mb as any).work_id);
          }
        }
      }
    }

    // MG 의존
    const mgDepBlocked = new Map<string, MgDepInfoEntry>();
    for (const wp of workPartnerData) {
      if (!wp.mg_depends_on) continue;
      const dep = wp.mg_depends_on;
      const depName = depPartnerNames.find(p => p.id === dep.partner_id)?.name || '';
      const depMg = depMgBalances.find(m => m.partner_id === dep.partner_id && m.work_id === dep.work_id);
      mgDepBlocked.set(wp.work_id, { partner_name: depName, balance: depMg ? Number(depMg.current_balance) : 0 });
    }

    const myItemIds = new Set(
      (allPartnerItemLinks || []).filter((l: any) => l.partner_id === partnerId).map((l: any) => l.item_id)
    );

    const input: PartnerComputeInput = {
      partner, month, workPartners: workPartnerData,
      revenues: revenueData.filter(r => partnerWorkIds.includes(r.work_id)),
      mgBalances, mgDepBlocked,
      revenueAdjustments: (allRevAdj || []).filter((ra: any) => partnerWorkIds.includes(ra.work_id))
        .map((ra: any) => ({ id: ra.id, work_id: ra.work_id, label: ra.label, amount: Number(ra.amount) })),
      settlementAdjustments: (allSettlementAdj || []).filter((a: any) => a.partner_id === partnerId)
        .map((a: any) => ({ id: a.id, partner_id: a.partner_id, label: a.label, amount: Number(a.amount) })),
      productionCosts: (allProductionCosts || []).filter((pc: any) => pc.partner_id === partnerId)
        .map((pc: any) => ({ partner_id: pc.partner_id, work_id: pc.work_id, amount: Number(pc.amount) })),
      laborCostItems: allLaborItems.filter(i => myItemIds.has(i.id)),
      laborCostPartnerLinks: allLaborPartnerLinks.filter(l => myItemIds.has(l.item_id)),
      laborCostWorkLinks: allLaborWorkLinks.filter(l => myItemIds.has(l.item_id)),
      laborCostWpData: allLaborWpData,
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

  return {
    partners: results,
    _raw: { allMgBalancesCurrent: allMgBalancesCurrent || [] },
  };
}
