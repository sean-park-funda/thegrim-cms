/**
 * 정산서 순수 계산 함수
 *
 * statement/route.ts에서 DB 조회를 분리하여 순수 계산 로직만 추출.
 * - 단건 (statement API): fetchPartnerData → computeStatement
 * - 벌크 (settlement-list API): prefetchAllData → computeStatement × N
 */
import { calculateTax, calculateInsurance } from './calculator';

// ─── 상수 ────────────────────────────────────────────────────

export const REVENUE_TYPE_LABELS: Record<string, string> = {
  domestic_paid: '국내유료수익',
  global_paid: '글로벌유료수익',
  domestic_ad: '국내 광고',
  global_ad: '글로벌 광고',
  secondary: '2차 사업',
};

export const REVENUE_COLUMNS = ['domestic_paid', 'global_paid', 'domestic_ad', 'global_ad', 'secondary'] as const;
export type RevenueColumn = typeof REVENUE_COLUMNS[number];

// ─── 입력 데이터 타입 ────────────────────────────────────────

export interface PartnerData {
  id: string;
  name: string;
  company_name: string | null;
  partner_type: string;
  vat_type?: string | null;
  report_type?: string | null;
  is_foreign?: boolean;
  tax_id?: string | null;
}

export interface WorkPartnerData {
  work_id: string;
  rs_rate: number;
  mg_rs_rate: number | null;
  is_mg_applied: boolean;
  included_revenue_types: string[] | null;
  labor_cost_excluded: boolean;
  revenue_rate: number | null;
  tax_type: string | null;
  mg_depends_on: { partner_id: string; work_id: string } | null;
  work: {
    id: string;
    name: string;
    serial_start_date: string | null;
    serial_end_date: string | null;
    labor_cost_as_exclusion: boolean;
  } | null;
}

export interface RevenueData {
  work_id: string;
  domestic_paid: number;
  global_paid: number;
  domestic_ad: number;
  global_ad: number;
  secondary: number;
  unconfirmed_types: string[];
  [key: string]: unknown;
}

export interface RevenueAdjustmentItem {
  id: string;
  work_id: string;
  label: string;
  amount: number;
}

export interface SettlementAdjustmentItem {
  id: string;
  partner_id: string;
  label: string;
  amount: number;
}

export interface LaborCostItem {
  id: string;
  amount: number;
  deduction_type: string;
}

export interface LaborCostPartnerLink {
  item_id: string;
  partner_id: string;
}

export interface LaborCostWorkLink {
  item_id: string;
  work_id: string;
}

export interface LaborCostWpData {
  partner_id: string;
  work_id: string;
  rs_rate: number;
  mg_rs_rate: number | null;
  is_mg_applied: boolean;
}

export interface MgDepInfoEntry {
  partner_name: string;
  balance: number;
}

export interface MgBalanceEntry {
  work_id: string;
  previous_balance: number;
}

export interface MgPoolEntry {
  pool_id: string;
  pool_name: string;
  balance: number;           // 이번달 이월 잔액
  work_ids: string[];        // 이 풀에 속한 작품 ID들
  mg_rs_rates: Record<string, number | null>;  // work_id → MG RS율 (null이면 풀 기본값)
  pool_mg_rs_rate: number | null;  // 풀 기본 MG RS율
}

export interface MgHistoryEntry {
  work_id: string;
  work_name: string;
  month: string;
  previous_balance: number;
  mg_added: number;
  mg_deducted: number;
  current_balance: number;
  note: string;
}

export interface ProductionCostEntry {
  partner_id: string;
  work_id: string;
  amount: number;
}

/** 한 파트너에 대한 계산에 필요한 모든 데이터 */
export interface PartnerComputeInput {
  partner: PartnerData;
  month: string;
  workPartners: WorkPartnerData[];
  revenues: RevenueData[];
  mgBalances: MgBalanceEntry[];  // 하위호환: 기존 작품별 MG 잔액
  mgPools: MgPoolEntry[];       // MG 풀 단위 잔액 (새 방식)
  mgDepBlocked: Map<string, MgDepInfoEntry>;  // work_id → {partner_name, balance}
  revenueAdjustments: RevenueAdjustmentItem[];
  settlementAdjustments: SettlementAdjustmentItem[];
  productionCosts: ProductionCostEntry[];
  laborCostItems: LaborCostItem[];
  laborCostPartnerLinks: LaborCostPartnerLink[];
  laborCostWorkLinks: LaborCostWorkLink[];
  laborCostWpData: LaborCostWpData[];
  mgHistory?: MgHistoryEntry[];
}

// ─── 출력 타입 ──────────────────────────────────────────────

export interface WorkDetail {
  revenue_type: string;
  revenue_type_label: string;
  gross_revenue: number;
  base_revenue: number;
  exclusion_amount: number;
  settlement_target: number;
  revenue_share: number;
  team_labor_cost: number;
  self_labor_cost: number;
  labor_cost: number;
  net_share: number;
  rs_rate: number;
  excluded: boolean;
}

export interface WorkStatement {
  work_name: string;
  work_id: string;
  rs_rate: number;
  mg_rs_rate: number | null;
  effective_rate: number;
  revenue_rate: number;
  is_mg_applied: boolean;
  mg_dependency_blocked: boolean;
  mg_depends_on: { partner_id: string; work_id: string } | null;
  mg_dep_info: MgDepInfoEntry | null;
  revenue_adjustments: { id: string; label: string; amount: number }[];
  revenue_adjustment_total: number;
  revenue_adjustment_rs: number;
  details: WorkDetail[];
  work_total_revenue: number;
  work_total_base_revenue: number;
  work_total_exclusion: number;
  work_total_settlement_target: number;
  work_total_share: number;
  work_total_labor_cost: number;
  work_total_team_labor_cost: number;
  work_total_self_labor_cost: number;
  work_total_net_share: number;
  mg_pool_id: string | null;
  mg_pool_name: string | null;
  mg_balance: number;
  mg_deduction: number;
  mg_remaining: number;
  production_cost: number;
}

export interface StatementResult {
  partner: PartnerData;
  month: string;
  works: WorkStatement[];
  grand_total_revenue: number;
  grand_total_base_revenue: number;
  grand_total_exclusion: number;
  grand_total_settlement_target: number;
  grand_total_share: number;
  grand_total_labor_cost: number;
  grand_total_team_labor_cost: number;
  grand_total_self_labor_cost: number;
  grand_total_net_share: number;
  subtotal: number;
  tax_type: string;
  tax_breakdown: { income_tax: number; local_tax: number; vat: number; total: number };
  tax_amount: number;
  insurance: number;
  total_mg_deduction: number;
  adjustments: { id: string; label: string; amount: number }[];
  total_adjustment: number;
  total_production_cost: number;
  final_payment: number;
  mg_history: { work_name: string; history: Omit<MgHistoryEntry, 'work_id' | 'work_name'>[] }[];
  tax_invoice: { item: string; supply: number; vat: number; total: number }[] | null;
  tax_invoice_total: number;
}

// ─── 순수 계산 함수 ─────────────────────────────────────────

export function computeStatement(input: PartnerComputeInput): StatementResult {
  const { partner, month, workPartners, revenues } = input;

  if (workPartners.length === 0) {
    return emptyResult(partner, month, input.mgPools || []);
  }

  const workIds = workPartners.map(wp => wp.work_id);
  const isCorp = partner.partner_type === 'domestic_corp' || partner.partner_type === 'naver';
  const corpVatType = isCorp ? (partner.vat_type || '') : '';

  // MG 풀 → 작품 매핑
  const mgPoolByWork = new Map<string, MgPoolEntry>();
  for (const pool of (input.mgPools || [])) {
    for (const wid of pool.work_ids) {
      mgPoolByWork.set(wid, pool);
    }
  }

  // 하위호환: mgPools가 비어있으면 mgBalances에서 1:1 풀 생성
  if ((!input.mgPools || input.mgPools.length === 0) && input.mgBalances.length > 0) {
    for (const mb of input.mgBalances) {
      const wp = workPartners.find(w => w.work_id === mb.work_id);
      const fakePool: MgPoolEntry = {
        pool_id: mb.work_id,
        pool_name: '',
        balance: mb.previous_balance,
        work_ids: [mb.work_id],
        mg_rs_rates: { [mb.work_id]: wp?.mg_rs_rate ?? null },
        pool_mg_rs_rate: wp?.mg_rs_rate ?? null,
      };
      mgPoolByWork.set(mb.work_id, fakePool);
    }
  }

  // MG 의존 차단 작품
  const mgDepBlockedWorks = new Set<string>();
  for (const [workId, info] of input.mgDepBlocked) {
    if (info.balance > 0) mgDepBlockedWorks.add(workId);
  }

  // 매출 조정 맵
  const revAdjByWork = new Map<string, number>();
  const revAdjItemsByWork = new Map<string, { id: string; label: string; amount: number }[]>();
  for (const ra of input.revenueAdjustments) {
    revAdjByWork.set(ra.work_id, (revAdjByWork.get(ra.work_id) || 0) + ra.amount);
    const list = revAdjItemsByWork.get(ra.work_id) || [];
    list.push({ id: ra.id, label: ra.label, amount: ra.amount });
    revAdjItemsByWork.set(ra.work_id, list);
  }

  // 제작비용 맵
  const productionCostByWork = new Map<string, number>();
  for (const pc of input.productionCosts) {
    if (pc.partner_id === partner.id) {
      productionCostByWork.set(pc.work_id, pc.amount);
    }
  }

  // ─── 인건비 계산 ──────────────────────────────
  // 작품별 revenueShare 사전 계산 (인건비 안분 기준)
  const revenueShareByWork = new Map<string, number>();
  for (const wp of workPartners) {
    const rev = revenues.find(r => r.work_id === wp.work_id);
    const effectiveRate = wp.is_mg_applied && wp.mg_rs_rate != null
      ? Number(wp.mg_rs_rate) : Number(wp.rs_rate);
    const revenueRate = Number(wp.revenue_rate) || 1;
    const includedTypes = wp.included_revenue_types || [...REVENUE_COLUMNS];
    const unc: string[] = rev?.unconfirmed_types || [];
    const isBlocked = mgDepBlockedWorks.has(wp.work_id);
    let totalShare = 0;
    for (const col of REVENUE_COLUMNS) {
      if (!includedTypes.includes(col) || unc.includes(col)) continue;
      const amount = rev ? Number(rev[col]) : 0;
      const baseRevenue = Math.round(amount * revenueRate);
      totalShare += isBlocked ? 0 : Math.round(baseRevenue * effectiveRate);
    }
    const revAdj = revAdjByWork.get(wp.work_id) || 0;
    if (revAdj !== 0 && !isBlocked) {
      totalShare += Math.round(revAdj * effectiveRate);
    }
    revenueShareByWork.set(wp.work_id, totalShare);
  }

  const laborCostExcludedWorkIds = new Set(
    workPartners.filter(wp => wp.labor_cost_excluded).map(wp => wp.work_id)
  );

  const laborCostByWorkType = new Map<string, number>();
  const laborCostFullByWorkType = new Map<string, number>();

  computeLaborCosts(
    partner.id, workIds, laborCostExcludedWorkIds, revenueShareByWork,
    input.laborCostItems, input.laborCostPartnerLinks, input.laborCostWorkLinks, input.laborCostWpData,
    laborCostByWorkType, laborCostFullByWorkType
  );

  // ─── 작품별 정산 상세 ──────────────────────────
  const works = workPartners.map(wp => {
    const work = wp.work;
    const rev = revenues.find(r => r.work_id === wp.work_id);

    const effectiveRate = wp.is_mg_applied && wp.mg_rs_rate != null
      ? Number(wp.mg_rs_rate) : Number(wp.rs_rate);
    const revenueRate = Number(wp.revenue_rate) || 1;
    const includedTypes = wp.included_revenue_types || [...REVENUE_COLUMNS];
    const unconfirmed: string[] = rev?.unconfirmed_types || [];
    const blocked = mgDepBlockedWorks.has(wp.work_id);

    const baseRevenueByCol: Record<string, number> = {};
    for (const col of REVENUE_COLUMNS) {
      const included = includedTypes.includes(col) && !unconfirmed.includes(col);
      const amount = (rev && included) ? Number(rev[col]) : 0;
      baseRevenueByCol[col] = Math.round(amount * revenueRate);
    }

    const workFullLaborCost = laborCostFullByWorkType.get(`${wp.work_id}:인건비 공제`) || 0;
    const isExclusionMode = work?.labor_cost_as_exclusion && workFullLaborCost > 0;

    const details: WorkDetail[] = REVENUE_COLUMNS.map(col => {
      const included = includedTypes.includes(col) && !unconfirmed.includes(col);
      const amount = (rev && included) ? Number(rev[col]) : 0;
      return {
        revenue_type: col,
        revenue_type_label: REVENUE_TYPE_LABELS[col],
        gross_revenue: amount,
        base_revenue: baseRevenueByCol[col],
        exclusion_amount: 0,
        settlement_target: baseRevenueByCol[col],
        revenue_share: 0,
        team_labor_cost: 0,
        self_labor_cost: 0,
        labor_cost: 0,
        net_share: 0,
        rs_rate: effectiveRate,
        excluded: !included,
      };
    });

    if (isExclusionMode) {
      applyExclusionMode(details, workFullLaborCost, effectiveRate);
      // 근로소득공제 별도 차감
      const earnedCost = laborCostByWorkType.get(`${wp.work_id}:근로소득공제`) || 0;
      if (earnedCost > 0) distributeByRevenueShare(details, earnedCost, 'self_labor_cost');
      for (const d of details) {
        d.labor_cost = d.self_labor_cost;
        d.net_share = Math.max(0, d.revenue_share - d.labor_cost);
      }
    } else {
      for (const d of details) {
        d.revenue_share = Math.round(Math.max(0, d.settlement_target) * effectiveRate);
      }
      for (const dtype of ['인건비 공제', '근로소득공제'] as const) {
        const typeCost = laborCostByWorkType.get(`${wp.work_id}:${dtype}`) || 0;
        if (typeCost > 0) {
          distributeByRevenueShare(details, typeCost, dtype === '근로소득공제' ? 'self_labor_cost' : 'team_labor_cost');
        }
      }
      for (const d of details) {
        d.labor_cost = d.self_labor_cost + d.team_labor_cost;
        d.net_share = Math.max(0, d.revenue_share - d.labor_cost);
      }
    }

    if (blocked) {
      for (const d of details) {
        d.revenue_share = 0;
        d.team_labor_cost = 0;
        d.self_labor_cost = 0;
        d.labor_cost = 0;
        d.net_share = 0;
      }
    }

    const workRevAdj = revAdjByWork.get(wp.work_id) || 0;
    const revAdjRS = blocked ? 0 : Math.round(workRevAdj * effectiveRate);
    const work_total_net_share = details.reduce((s, d) => s + d.net_share, 0) + revAdjRS;

    // MG 차감은 풀 단위로 아래에서 처리 — 여기서는 0으로 초기화
    const pool = mgPoolByWork.get(wp.work_id) || null;

    const prodCost = productionCostByWork.get(wp.work_id) || 0;

    return {
      work_name: work?.name || '',
      work_id: wp.work_id,
      rs_rate: Number(wp.rs_rate),
      mg_rs_rate: wp.mg_rs_rate != null ? Number(wp.mg_rs_rate) : null,
      effective_rate: effectiveRate,
      revenue_rate: revenueRate,
      is_mg_applied: wp.is_mg_applied,
      mg_dependency_blocked: blocked,
      mg_depends_on: wp.mg_depends_on || null,
      mg_dep_info: input.mgDepBlocked.get(wp.work_id) || null,
      revenue_adjustments: revAdjItemsByWork.get(wp.work_id) || [],
      revenue_adjustment_total: workRevAdj,
      revenue_adjustment_rs: revAdjRS,
      details,
      work_total_revenue: details.reduce((s, d) => s + d.gross_revenue, 0) + workRevAdj,
      work_total_base_revenue: details.reduce((s, d) => s + d.base_revenue, 0) + workRevAdj,
      work_total_exclusion: details.reduce((s, d) => s + d.exclusion_amount, 0),
      work_total_settlement_target: details.reduce((s, d) => s + d.settlement_target, 0),
      work_total_share: details.reduce((s, d) => s + d.revenue_share, 0) + revAdjRS,
      work_total_labor_cost: details.reduce((s, d) => s + d.labor_cost, 0),
      work_total_team_labor_cost: details.reduce((s, d) => s + d.team_labor_cost, 0),
      work_total_self_labor_cost: details.reduce((s, d) => s + d.self_labor_cost, 0),
      work_total_net_share,
      mg_pool_id: pool?.pool_id || null,
      mg_pool_name: pool?.pool_name || null,
      mg_balance: 0,        // 풀 단위로 아래에서 설정
      mg_deduction: 0,      // 풀 단위로 아래에서 설정
      mg_remaining: 0,      // 풀 단위로 아래에서 설정
      production_cost: prodCost,
    };
  }).filter(w => w.work_total_revenue > 0 || w.is_mg_applied);

  // ─── MG 풀 단위 차감 ──────────────────────────────
  const processedPools = new Set<string>();
  for (const pool of (input.mgPools || [])) {
    if (processedPools.has(pool.pool_id)) continue;
    processedPools.add(pool.pool_id);

    const poolBalance = pool.balance;
    if (poolBalance <= 0) {
      // 잔액이 0이어도 mg_balance는 표시
      const firstWork = works.find(w => pool.work_ids.includes(w.work_id));
      if (firstWork) {
        firstWork.mg_balance = poolBalance;
        firstWork.mg_remaining = poolBalance;
      }
      continue;
    }

    // 풀에 속한 작품들의 net_share 합산
    const poolWorks = works.filter(w => pool.work_ids.includes(w.work_id));
    if (poolWorks.length === 0) {
      // 매출이 없는 작품만 있는 풀 — 잔액만 표시
      continue;
    }

    // 풀 단위 MG cap 계산
    let poolCap = 0;
    if (isCorp) {
      // 사업자: 풀 내 전체 작품의 세금계산서 합계(VAT 포함)를 cap으로
      for (const w of poolWorks) {
        if (w.work_total_net_share > 0) {
          poolCap += computeCorpMgCap(w.details, w.work_total_net_share, corpVatType);
        }
      }
    } else {
      // 개인: 풀 내 전체 작품의 net_share 합산
      poolCap = poolWorks.reduce((s, w) => s + Math.max(0, w.work_total_net_share), 0);
    }

    const poolDeduction = Math.min(poolBalance, Math.max(0, poolCap));

    // 풀 차감을 작품별로 비율 배분 (net_share 비율)
    const totalNetShare = poolWorks.reduce((s, w) => s + Math.max(0, w.work_total_net_share), 0);
    let distributed = 0;
    for (let i = 0; i < poolWorks.length; i++) {
      const w = poolWorks[i];
      const workShare = Math.max(0, w.work_total_net_share);
      let workDeduction: number;
      if (i === poolWorks.length - 1) {
        workDeduction = poolDeduction - distributed;
      } else {
        workDeduction = totalNetShare > 0
          ? Math.round(poolDeduction * (workShare / totalNetShare))
          : Math.round(poolDeduction / poolWorks.length);
      }
      w.mg_deduction = Math.max(0, workDeduction);
      distributed += w.mg_deduction;
    }

    // 첫 번째 작품에 풀 잔액 표시 (정산서 표시용)
    if (poolWorks.length > 0) {
      poolWorks[0].mg_balance = poolBalance;
      poolWorks[0].mg_remaining = poolBalance - poolDeduction;
    }
  }

  // 풀이 없는 작품 필터링 (매출도 없고 MG도 없으면 제외)
  const filteredWorks = works.filter(w => w.work_total_revenue > 0 || w.mg_balance > 0 || w.mg_deduction > 0);
  const works_final = filteredWorks;

  // ─── 파트너 합산 ──────────────────────────────
  const grand_total_revenue = works_final.reduce((s, w) => s + w.work_total_revenue, 0);
  const grand_total_base_revenue = works_final.reduce((s, w) => s + w.work_total_base_revenue, 0);
  const grand_total_exclusion = works_final.reduce((s, w) => s + w.work_total_exclusion, 0);
  const grand_total_settlement_target = works_final.reduce((s, w) => s + w.work_total_settlement_target, 0);
  const grand_total_share = works_final.reduce((s, w) => s + w.work_total_share, 0);
  const grand_total_labor_cost = works_final.reduce((s, w) => s + w.work_total_labor_cost, 0);
  const grand_total_team_labor_cost = works_final.reduce((s, w) => s + w.work_total_team_labor_cost, 0);
  const grand_total_self_labor_cost = works_final.reduce((s, w) => s + w.work_total_self_labor_cost, 0);
  const grand_total_net_share = works_final.reduce((s, w) => s + w.work_total_net_share, 0);
  const total_production_cost = works_final.reduce((s, w) => s + w.production_cost, 0);

  const subtotal = grand_total_net_share - total_production_cost;

  // 조정 항목
  const adjustments = input.settlementAdjustments.map(a => ({ id: a.id, label: a.label, amount: a.amount }));
  const total_adjustment = adjustments.reduce((s, a) => s + a.amount, 0);
  const total_mg_raw = works_final.reduce((s, w) => s + Math.abs(w.mg_deduction), 0);

  // MG 이력
  const mgHistoryByWork = new Map<string, Omit<MgHistoryEntry, 'work_id' | 'work_name'>[]>();
  for (const mg of (input.mgHistory || [])) {
    const list = mgHistoryByWork.get(mg.work_name) || [];
    list.push({
      month: mg.month,
      previous_balance: mg.previous_balance,
      mg_added: mg.mg_added,
      mg_deducted: mg.mg_deducted,
      current_balance: mg.current_balance,
      note: mg.note,
    });
    mgHistoryByWork.set(mg.work_name, list);
  }
  const mg_history = Array.from(mgHistoryByWork.entries()).map(([work_name, history]) => ({ work_name, history }));

  // 세금계산서 (사업자)
  let tax_invoice: { item: string; supply: number; vat: number; total: number }[] | null = null;
  let tax_invoice_total = 0;
  if (isCorp) {
    const result = computeTaxInvoice(works_final, corpVatType, total_adjustment);
    tax_invoice = result.lines;
    tax_invoice_total = result.total;
  }

  // MG 차감 (법인/개인 모두 net_share 기준)
  const total_mg_deduction = total_mg_raw;

  // 개인: 세금/보험은 MG 차감 후 남은 금액에 대해 계산
  // (MG는 선지급금 회수이므로, 실제 지급되는 금액에 대해서만 원천징수)
  const taxable_base = isCorp ? subtotal : Math.max(0, subtotal - total_mg_deduction + total_adjustment);
  const taxType = workPartners[0]?.tax_type || 'standard';
  const tax_breakdown = calculateTax(taxable_base, partner.partner_type, taxType);
  const tax_amount = tax_breakdown.total;

  const hasActiveSerial = works_final.some(w => {
    const wk = workPartners.find(wp => wp.work_id === w.work_id);
    const wkData = wk?.work;
    return !wkData?.serial_end_date || new Date(wkData.serial_end_date) >= new Date(month + '-01');
  });
  const insurance = calculateInsurance(taxable_base, partner.partner_type, {
    serialEndDate: hasActiveSerial ? null : '1900-01-01',
    reportType: partner.report_type ?? null,
    month,
    isForeign: partner.is_foreign ?? false,
  });

  const final_payment = isCorp
    ? tax_invoice_total - total_mg_deduction
    : taxable_base - tax_amount - insurance;

  return {
    partner,
    month,
    works: works_final,
    grand_total_revenue,
    grand_total_base_revenue,
    grand_total_exclusion,
    grand_total_settlement_target,
    grand_total_share,
    grand_total_labor_cost,
    grand_total_team_labor_cost,
    grand_total_self_labor_cost,
    grand_total_net_share,
    subtotal,
    tax_type: taxType,
    tax_breakdown,
    tax_amount,
    insurance,
    total_mg_deduction,
    adjustments,
    total_adjustment,
    total_production_cost,
    final_payment,
    mg_history,
    tax_invoice,
    tax_invoice_total,
  };
}

// ─── 헬퍼 함수 ──────────────────────────────────────────────

function emptyResult(partner: PartnerData, month: string, _mgPools?: MgPoolEntry[]): StatementResult {
  return {
    partner, month, works: [],
    grand_total_revenue: 0, grand_total_base_revenue: 0, grand_total_exclusion: 0,
    grand_total_settlement_target: 0, grand_total_share: 0, grand_total_labor_cost: 0,
    grand_total_team_labor_cost: 0, grand_total_self_labor_cost: 0, grand_total_net_share: 0,
    subtotal: 0, tax_type: 'standard',
    tax_breakdown: { income_tax: 0, local_tax: 0, vat: 0, total: 0 },
    tax_amount: 0, insurance: 0, total_mg_deduction: 0,
    adjustments: [], total_adjustment: 0, total_production_cost: 0, final_payment: 0,
    mg_history: [], tax_invoice: null, tax_invoice_total: 0,
  };
}

function applyExclusionMode(details: WorkDetail[], workFullLaborCost: number, effectiveRate: number) {
  const eligible = details.filter(d => d.base_revenue > 0);
  const totalBase = eligible.reduce((s, d) => s + d.base_revenue, 0);
  if (totalBase > 0) {
    let distributed = 0;
    for (let i = 0; i < eligible.length; i++) {
      const excl = i === eligible.length - 1
        ? workFullLaborCost - distributed
        : Math.round(workFullLaborCost * (eligible[i].base_revenue / totalBase));
      eligible[i].exclusion_amount = excl;
      distributed += excl;
    }
  }
  for (const d of details) {
    d.settlement_target = d.base_revenue - d.exclusion_amount;
    d.revenue_share = Math.round(Math.max(0, d.settlement_target) * effectiveRate);
  }
}

function distributeByRevenueShare(details: WorkDetail[], cost: number, field: 'team_labor_cost' | 'self_labor_cost') {
  const totalBasis = details.reduce((s, d) => s + Math.max(0, d.revenue_share), 0);
  if (totalBasis <= 0) return;
  const eligible = details.filter(d => d.revenue_share > 0);
  let distributed = 0;
  for (let i = 0; i < eligible.length; i++) {
    const c = i === eligible.length - 1
      ? cost - distributed
      : Math.round(cost * (eligible[i].revenue_share / totalBasis));
    eligible[i][field] += c;
    distributed += c;
  }
}

function computeCorpMgCap(details: WorkDetail[], workTotalNetShare: number, vatType: string): number {
  const domesticPaidNet = details.find(d => d.revenue_type === 'domestic_paid')?.net_share || 0;
  const otherNet = workTotalNetShare - domesticPaidNet;
  let total = 0;
  if (domesticPaidNet > 0) {
    if (vatType === 'vat_separate') {
      total += domesticPaidNet + Math.round(domesticPaidNet * 0.1);
    } else {
      total += domesticPaidNet; // standard(내세) or tax_exempt(면세)
    }
  }
  if (otherNet > 0) {
    total += otherNet + Math.round(otherNet * 0.1);
  }
  return total;
}

function computeTaxInvoice(
  works: WorkStatement[],
  vatType: string,
  totalAdjustment: number
): { lines: { item: string; supply: number; vat: number; total: number }[]; total: number } {
  let domesticPaidNet = 0;
  let otherNet = 0;
  for (const w of works) {
    for (const d of w.details) {
      if (d.revenue_type === 'domestic_paid') domesticPaidNet += d.net_share;
      else otherNet += d.net_share;
    }
    otherNet += w.revenue_adjustment_rs || 0;
  }
  otherNet += totalAdjustment;

  const lines: { item: string; supply: number; vat: number; total: number }[] = [];
  if (domesticPaidNet > 0) {
    if (vatType === 'tax_exempt') {
      lines.push({ item: '국내유료수익', supply: domesticPaidNet, vat: 0, total: domesticPaidNet });
    } else if (vatType === 'vat_separate') {
      const vat = Math.round(domesticPaidNet * 0.1);
      lines.push({ item: '국내유료수익', supply: domesticPaidNet, vat, total: domesticPaidNet + vat });
    } else {
      lines.push({
        item: '국내유료수익',
        supply: Math.round(domesticPaidNet * 10 / 11),
        vat: Math.round(domesticPaidNet * 1 / 11),
        total: domesticPaidNet,
      });
    }
  }
  if (otherNet > 0) {
    const vat = Math.round(otherNet * 0.1);
    lines.push({ item: '글로벌유료수익 외', supply: otherNet, vat, total: otherNet + vat });
  }
  return { lines, total: lines.reduce((s, l) => s + l.total, 0) };
}

function computeLaborCosts(
  partnerId: string,
  workIds: string[],
  excludedWorkIds: Set<string>,
  revenueShareByWork: Map<string, number>,
  items: LaborCostItem[],
  partnerLinks: LaborCostPartnerLink[],
  workLinks: LaborCostWorkLink[],
  wpData: LaborCostWpData[],
  outByWorkType: Map<string, number>,
  outFullByWorkType: Map<string, number>,
) {
  // 이 파트너가 대상인 item만 필터
  const myItemIds = new Set(partnerLinks.filter(l => l.partner_id === partnerId).map(l => l.item_id));
  const myItems = items.filter(i => myItemIds.has(i.id));

  const partnersByItem = new Map<string, string[]>();
  for (const link of partnerLinks) {
    if (!myItemIds.has(link.item_id)) continue;
    const list = partnersByItem.get(link.item_id) || [];
    list.push(link.partner_id);
    partnersByItem.set(link.item_id, list);
  }
  const worksByItem = new Map<string, string[]>();
  for (const link of workLinks) {
    if (!myItemIds.has(link.item_id)) continue;
    const list = worksByItem.get(link.item_id) || [];
    list.push(link.work_id);
    worksByItem.set(link.item_id, list);
  }

  for (const item of myItems) {
    const amount = Number(item.amount);
    if (amount <= 0) continue;

    const pIds = partnersByItem.get(item.id) || [];
    const wIds = worksByItem.get(item.id) || [];
    if (pIds.length === 0 || wIds.length === 0) continue;

    let myBurden = amount;
    if (pIds.length > 1) {
      let myRs = 0, totalRs = 0;
      for (const pid of pIds) {
        let rsSum = 0;
        for (const wid of wIds) {
          const wp = wpData.find(w => w.partner_id === pid && w.work_id === wid);
          if (wp) rsSum += wp.is_mg_applied && wp.mg_rs_rate != null ? Number(wp.mg_rs_rate) : Number(wp.rs_rate);
        }
        if (pid === partnerId) myRs = rsSum;
        totalRs += rsSum;
      }
      myBurden = totalRs > 0 ? Math.round(amount * (myRs / totalRs)) : Math.round(amount / pIds.length);
    }
    if (myBurden <= 0) continue;

    const eligible = wIds.filter(wid => workIds.includes(wid) && !excludedWorkIds.has(wid));
    if (eligible.length === 0) continue;

    const dtype = item.deduction_type;
    if (eligible.length === 1) {
      const key = `${eligible[0]}:${dtype}`;
      outByWorkType.set(key, (outByWorkType.get(key) || 0) + myBurden);
      outFullByWorkType.set(key, (outFullByWorkType.get(key) || 0) + amount);
    } else {
      let totalShare = 0;
      const shares = eligible.map(wid => {
        const share = revenueShareByWork.get(wid) || 0;
        totalShare += share;
        return { wid, share };
      });
      for (const ws of shares) {
        const alloc = totalShare > 0 ? Math.round(myBurden * (ws.share / totalShare)) : Math.round(myBurden / shares.length);
        const allocFull = totalShare > 0 ? Math.round(amount * (ws.share / totalShare)) : Math.round(amount / shares.length);
        if (alloc > 0) {
          const key = `${ws.wid}:${dtype}`;
          outByWorkType.set(key, (outByWorkType.get(key) || 0) + alloc);
          outFullByWorkType.set(key, (outFullByWorkType.get(key) || 0) + allocFull);
        }
      }
    }
  }
}
