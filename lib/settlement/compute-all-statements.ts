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
  type MgPoolEntry,
  type MgDepInfoEntry,
  type LaborCostItem,
  type LaborCostPartnerLink,
  type LaborCostWorkLink,
  type LaborCostWpData,
  type RevenueAdjustmentItem,
  type SettlementAdjustmentItem,
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
  /** raw data needed for confirm API */
  _raw?: {
    allMgPools: any[];
    allPoolWorks: any[];
    allPoolBalCurrent: any[];
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
    { data: allMgPools },
    { data: allPartnerItemLinks },
    { data: confirmedSettlements },
  ] = await Promise.all([
    supabase.from('rs_revenue_adjustments').select('*').eq('month', month).in('work_id', workIds),
    supabase.from('rs_settlement_adjustments').select('*').eq('month', month).in('partner_id', partnerIds),
    supabase.from('rs_mg_pools').select('id, partner_id, name, mg_rs_rate').in('partner_id', partnerIds),
    supabase.from('rs_labor_cost_item_partners').select('item_id, partner_id').in('partner_id', partnerIds),
    supabase.from('rs_settlements').select('partner_id').eq('month', month).eq('status', 'confirmed'),
  ]);

  // MG 풀 관련 벌크 조회
  const allPoolIds = (allMgPools || []).map((p: any) => p.id) as string[];
  let allPoolWorks: any[] = [];
  let allPoolBalCurrent: any[] = [];
  let allPoolBalPrev: any[] = [];

  if (allPoolIds.length > 0) {
    const [{ data: pw }, { data: bCur }, { data: bPrev }] = await Promise.all([
      supabase.from('rs_mg_pool_works').select('mg_pool_id, work_id, mg_rs_rate').in('mg_pool_id', allPoolIds),
      supabase.from('rs_mg_pool_balances').select('mg_pool_id, previous_balance').eq('month', month).in('mg_pool_id', allPoolIds),
      supabase.from('rs_mg_pool_balances').select('mg_pool_id, current_balance, month').lt('month', month).in('mg_pool_id', allPoolIds).order('month', { ascending: false }),
    ]);
    allPoolWorks = pw || [];
    allPoolBalCurrent = bCur || [];
    allPoolBalPrev = bPrev || [];
  }

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

  // MG 의존 벌크 (mg_depends_on은 여전히 partner_id + work_id 기반 → pool_balances로 조회)
  const mgDeps = allWorkPartners.filter((wp: any) => wp.mg_depends_on);
  const depPartnerIds = [...new Set(mgDeps.map((wp: any) => (wp.mg_depends_on as { partner_id: string }).partner_id))] as string[];
  let depPartnerNames: { id: string; name: string }[] = [];
  let depPoolBalances: { pool_id: string; partner_id: string; current_balance: number }[] = [];
  if (depPartnerIds.length > 0) {
    // 의존 대상 파트너의 풀 정보 조회
    const [{ data: depPools }, { data: depP }] = await Promise.all([
      supabase.from('rs_mg_pools').select('id, partner_id').in('partner_id', depPartnerIds),
      supabase.from('rs_partners').select('id, name').in('id', depPartnerIds),
    ]);
    depPartnerNames = depP || [];

    if (depPools && depPools.length > 0) {
      const depPoolIds = depPools.map((p: any) => p.id);
      const { data: depBal } = await supabase
        .from('rs_mg_pool_balances')
        .select('mg_pool_id, current_balance, month')
        .in('mg_pool_id', depPoolIds)
        .order('month', { ascending: false });

      // 풀별 최신 잔액
      const seen = new Set<string>();
      for (const b of (depBal || [])) {
        if (!seen.has(b.mg_pool_id)) {
          const pool = depPools.find((p: any) => p.id === b.mg_pool_id);
          depPoolBalances.push({
            pool_id: b.mg_pool_id,
            partner_id: pool?.partner_id || '',
            current_balance: Number(b.current_balance),
          });
          seen.add(b.mg_pool_id);
        }
      }
    }
  }

  // 의존 대상 파트너의 풀별 잔액 합산 맵 (partner_id → total balance)
  const depPartnerTotalBalance = new Map<string, number>();
  for (const pb of depPoolBalances) {
    depPartnerTotalBalance.set(pb.partner_id, (depPartnerTotalBalance.get(pb.partner_id) || 0) + pb.current_balance);
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

    // MG 풀
    const mgPools: MgPoolEntry[] = [];
    const mgBalances: MgBalanceEntry[] = []; // 하위호환 (빈 배열)
    const partnerPoolList = (allMgPools || []).filter((p: any) => p.partner_id === partnerId);

    for (const pool of partnerPoolList) {
      const pWorks = allPoolWorks.filter((pw: any) => pw.mg_pool_id === pool.id);
      const pWorkIds = pWorks.map((pw: any) => pw.work_id);

      // 잔액
      const curBal = allPoolBalCurrent.find((b: any) => b.mg_pool_id === pool.id);
      let balance = 0;
      if (curBal) {
        balance = Number(curBal.previous_balance);
      } else {
        const prevBal = allPoolBalPrev.find((b: any) => b.mg_pool_id === pool.id);
        if (prevBal) balance = Number(prevBal.current_balance);
      }

      const mgRsRates: Record<string, number | null> = {};
      for (const pw of pWorks) {
        mgRsRates[pw.work_id] = pw.mg_rs_rate != null ? Number(pw.mg_rs_rate) : null;
      }

      mgPools.push({
        pool_id: pool.id,
        pool_name: pool.name,
        balance,
        work_ids: pWorkIds,
        mg_rs_rates: mgRsRates,
        pool_mg_rs_rate: pool.mg_rs_rate != null ? Number(pool.mg_rs_rate) : null,
      });
    }

    // MG 의존 (풀 단위 잔액으로 판단)
    const mgDepBlocked = new Map<string, MgDepInfoEntry>();
    for (const wp of workPartnerData) {
      if (!wp.mg_depends_on) continue;
      const dep = wp.mg_depends_on;
      const depName = depPartnerNames.find(p => p.id === dep.partner_id)?.name || '';
      const depBalance = depPartnerTotalBalance.get(dep.partner_id) || 0;
      mgDepBlocked.set(wp.work_id, { partner_name: depName, balance: depBalance });
    }

    const myItemIds = new Set(
      (allPartnerItemLinks || []).filter((l: any) => l.partner_id === partnerId).map((l: any) => l.item_id)
    );

    const input: PartnerComputeInput = {
      partner, month, workPartners: workPartnerData,
      revenues: revenueData.filter(r => partnerWorkIds.includes(r.work_id)),
      mgBalances, mgPools, mgDepBlocked,
      revenueAdjustments: (allRevAdj || []).filter((ra: any) => partnerWorkIds.includes(ra.work_id))
        .map((ra: any) => ({ id: ra.id, work_id: ra.work_id, label: ra.label, amount: Number(ra.amount) })),
      settlementAdjustments: (allSettlementAdj || []).filter((a: any) => a.partner_id === partnerId)
        .map((a: any) => ({ id: a.id, partner_id: a.partner_id, label: a.label, amount: Number(a.amount) })),
      productionCosts: [],
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
    _raw: { allMgPools: allMgPools || [], allPoolWorks, allPoolBalCurrent },
  };
}
