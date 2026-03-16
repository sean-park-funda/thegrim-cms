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
      .select('work_id, rs_rate, mg_rs_rate, is_mg_applied, included_revenue_types, labor_cost_excluded, revenue_rate, tax_type, work:rs_works(id, name, serial_start_date, serial_end_date)')
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

    // 4) MG 잔액 — 해당 월 레코드 또는 직전 월의 current_balance를 previous_balance로 사용
    const mgAppliedWorkIds = workPartners.filter(wp => wp.is_mg_applied).map(wp => wp.work_id);
    const mgPrevBalanceByWork = new Map<string, number>();

    if (mgAppliedWorkIds.length > 0) {
      const { data: currentMonthMg } = await supabase
        .from('rs_mg_balances')
        .select('work_id, previous_balance')
        .eq('month', month)
        .eq('partner_id', id)
        .in('work_id', mgAppliedWorkIds);

      const foundWorkIds = new Set<string>();
      for (const mg of (currentMonthMg || [])) {
        mgPrevBalanceByWork.set(mg.work_id, Number(mg.previous_balance));
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
            mgPrevBalanceByWork.set(mg.work_id, Number(mg.current_balance));
            seen.add(mg.work_id);
          }
        }
      }
    }

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

    // 5) 인건비 계산 — 분담 비율 기반으로 스태프/파트너 급여를 작품별로 배분
    const teamLaborCostByWork = new Map<string, number>();
    const selfLaborCostByWork = new Map<string, number>();
    const sharedLaborCostByWork = new Map<string, number>();

    // 작품별 수익배분액(revenue_share) 사전 계산 — 인건비 안분 기준
    const revenueShareByWork = new Map<string, number>();
    for (const wp of workPartners) {
      const rev = revenues?.find(r => r.work_id === wp.work_id);
      const effectiveRate = wp.is_mg_applied && wp.mg_rs_rate != null
        ? Number(wp.mg_rs_rate) : Number(wp.rs_rate);
      const revenueRate = Number(wp.revenue_rate) || 1;
      const includedTypes = (wp.included_revenue_types as string[] | null) || REVENUE_COLUMNS;
      let totalShare = 0;
      for (const col of REVENUE_COLUMNS) {
        if (!includedTypes.includes(col)) continue;
        const amount = rev ? Number(rev[col]) : 0;
        const baseRevenue = Math.round(amount * revenueRate);
        totalShare += Math.round(baseRevenue * effectiveRate);
      }
      revenueShareByWork.set(wp.work_id, totalShare);
    }

    // 인건비공제제외 작품 ID 세트
    const laborCostExcludedWorkIds = new Set(
      workPartners.filter(wp => wp.labor_cost_excluded).map(wp => wp.work_id)
    );

    // 급여를 작품별 수익배분액 비례로 배분하는 헬퍼
    const distributeToWorks = (salary: number, targetWorkIds: string[], targetMap: Map<string, number> = teamLaborCostByWork) => {
      const eligibleWorkIds = targetWorkIds.filter(wid => !laborCostExcludedWorkIds.has(wid));
      if (salary <= 0 || eligibleWorkIds.length === 0) return;
      const workShares: { workId: string; share: number }[] = [];
      let totalShare = 0;
      for (const wid of eligibleWorkIds) {
        const share = revenueShareByWork.get(wid) || 0;
        workShares.push({ workId: wid, share });
        totalShare += share;
      }
      for (const ws of workShares) {
        let allocated: number;
        if (totalShare > 0) {
          allocated = Math.round(salary * (ws.share / totalShare));
        } else {
          allocated = Math.round(salary / workShares.length);
        }
        if (allocated > 0) {
          targetMap.set(ws.workId, (targetMap.get(ws.workId) || 0) + allocated);
        }
      }
    };

    // 5-0) 인건비 분담 데이터 로드
    const { data: bearerShares } = await supabase
      .from('rs_labor_cost_shares')
      .select('*')
      .eq('bearer_partner_id', id);

    // 5-1) 소속 스태프 급여 (employer_partner_id = 이 파트너)
    const { data: staffList } = await supabase
      .from('rs_staff')
      .select('id, monthly_salary')
      .eq('is_active', true)
      .eq('employer_partner_id', id);

    if (staffList && staffList.length > 0) {
      const staffIds = staffList.map(s => s.id);

      const { data: monthlySalaries } = await supabase
        .from('rs_staff_salaries')
        .select('staff_id, amount')
        .eq('month', month)
        .in('staff_id', staffIds);

      const salaryByStaff = new Map<string, number>();
      for (const ms of (monthlySalaries || [])) {
        salaryByStaff.set(ms.staff_id, Number(ms.amount));
      }

      const { data: staffAssignments } = await supabase
        .from('rs_staff_assignments')
        .select('staff_id, work_id')
        .eq('is_active', true)
        .in('staff_id', staffIds);

      const assignmentsByStaff = new Map<string, string[]>();
      for (const a of (staffAssignments || [])) {
        const list = assignmentsByStaff.get(a.staff_id) || [];
        list.push(a.work_id);
        assignmentsByStaff.set(a.staff_id, list);
      }

      // 소속 스태프에 대한 분담 설정 조회 (타인에게 할당된 비율 파악)
      const { data: ownedStaffShares } = await supabase
        .from('rs_labor_cost_shares')
        .select('source_id, share_ratio')
        .eq('source_type', 'staff')
        .in('source_id', staffIds);

      const totalShareByStaff = new Map<string, number>();
      for (const s of (ownedStaffShares || [])) {
        totalShareByStaff.set(s.source_id, (totalShareByStaff.get(s.source_id) || 0) + Number(s.share_ratio));
      }

      for (const staff of staffList) {
        const salary = salaryByStaff.get(staff.id) ?? Number(staff.monthly_salary);
        const assignedWorks = assignmentsByStaff.get(staff.id) || [];
        const othersShareTotal = totalShareByStaff.get(staff.id) || 0;
        const myRatio = Math.max(0, 1 - othersShareTotal);
        if (myRatio > 0) {
          distributeToWorks(Math.round(salary * myRatio), assignedWorks);
        }
      }
    }

    // 5-2) 파트너 본인 급여 (has_salary=true)
    if (partner.has_salary) {
      const { data: partnerSalary } = await supabase
        .from('rs_partner_salaries')
        .select('amount')
        .eq('partner_id', id)
        .eq('month', month)
        .single();

      const partnerSalaryAmount = partnerSalary ? Number(partnerSalary.amount) : 0;
      if (partnerSalaryAmount > 0) {
        const { data: ownSalaryShares } = await supabase
          .from('rs_labor_cost_shares')
          .select('share_ratio')
          .eq('source_type', 'partner')
          .eq('source_id', id);

        const othersShareTotal = (ownSalaryShares || []).reduce((s, r) => s + Number(r.share_ratio), 0);
        const myRatio = Math.max(0, 1 - othersShareTotal);
        if (myRatio > 0) {
          distributeToWorks(Math.round(partnerSalaryAmount * myRatio), workIds, selfLaborCostByWork);
        }
      }
    }

    // 5-3) 타인의 인건비 중 이 파트너가 분담하는 부분 (bearer_partner_id = 이 파트너)
    if (bearerShares && bearerShares.length > 0) {
      const staffSourceIds = bearerShares.filter(s => s.source_type === 'staff').map(s => s.source_id);
      const partnerSourceIds = bearerShares.filter(s => s.source_type === 'partner').map(s => s.source_id);
      const allSourceIds = [...staffSourceIds, ...partnerSourceIds];

      // 각 소스별 bearer 수를 조회하여 공동분담(2명+) vs 단독부담(1명 100%) 구분
      const isSharedSource = new Set<string>();
      if (allSourceIds.length > 0) {
        const { data: allSharesForSources } = await supabase
          .from('rs_labor_cost_shares')
          .select('source_type, source_id, bearer_partner_id, share_ratio')
          .in('source_id', allSourceIds);

        const bearerCountBySource = new Map<string, { count: number; totalRatio: number }>();
        for (const s of (allSharesForSources || [])) {
          const key = `${s.source_type}:${s.source_id}`;
          const entry = bearerCountBySource.get(key) || { count: 0, totalRatio: 0 };
          entry.count++;
          entry.totalRatio += Number(s.share_ratio);
          bearerCountBySource.set(key, entry);
        }

        for (const [key, { count, totalRatio }] of bearerCountBySource) {
          const sourceId = key.split(':')[1];
          if (count >= 2 || totalRatio < 1) {
            isSharedSource.add(sourceId);
          }
        }
      }

      // 스태프 급여 분담 — 스태프가 실제 배정된 작품 중 이 파트너의 작품에만 배분
      if (staffSourceIds.length > 0) {
        const { data: sharedStaff } = await supabase
          .from('rs_staff')
          .select('id, monthly_salary')
          .eq('is_active', true)
          .in('id', staffSourceIds);

        const { data: sharedStaffSalaries } = await supabase
          .from('rs_staff_salaries')
          .select('staff_id, amount')
          .eq('month', month)
          .in('staff_id', staffSourceIds);

        const { data: sharedStaffAssignments } = await supabase
          .from('rs_staff_assignments')
          .select('staff_id, work_id')
          .eq('is_active', true)
          .in('staff_id', staffSourceIds);

        const sharedSalaryMap = new Map<string, number>();
        for (const ms of (sharedStaffSalaries || [])) {
          sharedSalaryMap.set(ms.staff_id, Number(ms.amount));
        }

        const sharedAssignmentsByStaff = new Map<string, string[]>();
        for (const a of (sharedStaffAssignments || [])) {
          const list = sharedAssignmentsByStaff.get(a.staff_id) || [];
          list.push(a.work_id);
          sharedAssignmentsByStaff.set(a.staff_id, list);
        }

        const workIdSet = new Set(workIds);
        for (const share of bearerShares.filter(s => s.source_type === 'staff')) {
          const staffInfo = (sharedStaff || []).find(s => s.id === share.source_id);
          if (!staffInfo) continue;
          const salary = sharedSalaryMap.get(share.source_id) ?? Number(staffInfo.monthly_salary);
          const assignedWorks = (sharedAssignmentsByStaff.get(share.source_id) || []).filter(wid => workIdSet.has(wid));
          if (salary > 0 && assignedWorks.length > 0) {
            if (isSharedSource.has(share.source_id)) {
              distributeToWorks(salary, assignedWorks, sharedLaborCostByWork);
            } else {
              distributeToWorks(salary, assignedWorks, teamLaborCostByWork);
            }
          }
        }
      }

      // 파트너 급여 분담 — 소스 파트너와 이 파트너가 공통으로 계약한 작품에만 배분
      if (partnerSourceIds.length > 0) {
        const { data: sharedPartnerSalaries } = await supabase
          .from('rs_partner_salaries')
          .select('partner_id, amount')
          .eq('month', month)
          .in('partner_id', partnerSourceIds);

        const { data: sourcePartnerWorks } = await supabase
          .from('rs_work_partners')
          .select('partner_id, work_id')
          .in('partner_id', partnerSourceIds);

        const worksBySourcePartner = new Map<string, string[]>();
        for (const spw of (sourcePartnerWorks || [])) {
          const list = worksBySourcePartner.get(spw.partner_id) || [];
          list.push(spw.work_id);
          worksBySourcePartner.set(spw.partner_id, list);
        }

        const workIdSet = new Set(workIds);
        for (const share of bearerShares.filter(s => s.source_type === 'partner')) {
          const salaryRecord = (sharedPartnerSalaries || []).find(ps => ps.partner_id === share.source_id);
          if (!salaryRecord) continue;
          const salary = Number(salaryRecord.amount);
          const commonWorks = (worksBySourcePartner.get(share.source_id) || []).filter(wid => workIdSet.has(wid));
          if (salary > 0 && commonWorks.length > 0) {
            if (isSharedSource.has(share.source_id)) {
              distributeToWorks(salary, commonWorks, sharedLaborCostByWork);
            } else {
              distributeToWorks(salary, commonWorks, teamLaborCostByWork);
            }
          }
        }
      }
    }

    // 6) 작품별 정산 상세 조합
    const works = workPartners.map(wp => {
      const work = wp.work as unknown as { id: string; name: string; serial_start_date: string | null; serial_end_date: string | null } | null;
      const rev = revenues?.find(r => r.work_id === wp.work_id);

      const effectiveRate = wp.is_mg_applied && wp.mg_rs_rate != null
        ? Number(wp.mg_rs_rate)
        : Number(wp.rs_rate);
      const revenueRate = Number(wp.revenue_rate) || 1;

      const includedTypes = (wp.included_revenue_types as string[] | null) || REVENUE_COLUMNS;
      const workSharedLaborCost = sharedLaborCostByWork.get(wp.work_id) || 0;

      // 공동 인건비를 수익구분별 기준매출 비례로 배분하기 위해 먼저 기준매출 계산
      const baseRevenueByCol: Record<string, number> = {};
      let totalBaseRevenue = 0;
      for (const col of REVENUE_COLUMNS) {
        const included = includedTypes.includes(col);
        const amount = (rev && included) ? Number(rev[col]) : 0;
        const br = Math.round(amount * revenueRate);
        baseRevenueByCol[col] = br;
        totalBaseRevenue += br;
      }

      const details = REVENUE_COLUMNS.map(col => {
        const included = includedTypes.includes(col);
        const amount = (rev && included) ? Number(rev[col]) : 0;
        const baseRevenue = baseRevenueByCol[col];

        let exclusionAmount = 0;
        if (workSharedLaborCost > 0 && totalBaseRevenue > 0 && baseRevenue > 0) {
          exclusionAmount = Math.round(workSharedLaborCost * (baseRevenue / totalBaseRevenue));
        }

        const settlementTarget = baseRevenue - exclusionAmount;
        return {
          revenue_type: col,
          revenue_type_label: REVENUE_TYPE_LABELS[col],
          gross_revenue: amount,
          base_revenue: baseRevenue,
          exclusion_amount: exclusionAmount,
          settlement_target: settlementTarget,
          revenue_share: Math.round(Math.max(0, settlementTarget) * effectiveRate),
          team_labor_cost: 0,
          self_labor_cost: 0,
          net_share: 0,
          rs_rate: effectiveRate,
          excluded: !included,
        };
      });

      // 인건비를 수익구분별 비중에 따라 배분
      const distributeLaborToDetails = (totalCost: number, field: 'team_labor_cost' | 'self_labor_cost', basisFn: (d: typeof details[0]) => number) => {
        if (totalCost <= 0) return;
        const totalBasis = details.reduce((s, d) => s + Math.max(0, basisFn(d)), 0);
        if (totalBasis > 0) {
          const eligible = details.filter(d => basisFn(d) > 0);
          let distributed = 0;
          for (let i = 0; i < eligible.length; i++) {
            if (i === eligible.length - 1) {
              eligible[i][field] = totalCost - distributed;
            } else {
              const cost = Math.round(totalCost * (basisFn(eligible[i]) / totalBasis));
              eligible[i][field] = cost;
              distributed += cost;
            }
          }
        }
      };

      distributeLaborToDetails(teamLaborCostByWork.get(wp.work_id) || 0, 'team_labor_cost', d => d.revenue_share);
      distributeLaborToDetails(selfLaborCostByWork.get(wp.work_id) || 0, 'self_labor_cost', d => d.revenue_share - d.team_labor_cost);

      for (const d of details) {
        d.net_share = Math.max(0, d.revenue_share - d.team_labor_cost - d.self_labor_cost);
      }

      const work_total_revenue = details.reduce((s, d) => s + d.gross_revenue, 0);
      const work_total_base_revenue = details.reduce((s, d) => s + d.base_revenue, 0);
      const work_total_exclusion = details.reduce((s, d) => s + d.exclusion_amount, 0);
      const work_total_settlement_target = details.reduce((s, d) => s + d.settlement_target, 0);
      const work_total_share = details.reduce((s, d) => s + d.revenue_share, 0);
      const work_total_team_labor_cost = details.reduce((s, d) => s + d.team_labor_cost, 0);
      const work_total_self_labor_cost = details.reduce((s, d) => s + d.self_labor_cost, 0);
      const work_total_net_share = details.reduce((s, d) => s + d.net_share, 0);

      return {
        work_name: work?.name || '',
        work_id: wp.work_id,
        rs_rate: Number(wp.rs_rate),
        mg_rs_rate: wp.mg_rs_rate != null ? Number(wp.mg_rs_rate) : null,
        effective_rate: effectiveRate,
        revenue_rate: revenueRate,
        is_mg_applied: wp.is_mg_applied,
        details,
        work_total_revenue,
        work_total_base_revenue,
        work_total_exclusion,
        work_total_settlement_target,
        work_total_share,
        work_total_team_labor_cost,
        work_total_self_labor_cost,
        work_total_net_share,
        ...(() => {
          const prevBalance = mgPrevBalanceByWork.get(wp.work_id) || 0;
          const mgDeduction = wp.is_mg_applied && prevBalance > 0
            ? Math.min(prevBalance, Math.max(0, work_total_net_share))
            : 0;
          return {
            mg_balance: prevBalance,
            mg_deduction: mgDeduction,
            mg_remaining: prevBalance - mgDeduction,
          };
        })(),
      };
    }).filter(w => w.work_total_revenue > 0 || w.mg_balance > 0);

    const grand_total_revenue = works.reduce((s, w) => s + w.work_total_revenue, 0);
    const grand_total_base_revenue = works.reduce((s, w) => s + w.work_total_base_revenue, 0);
    const grand_total_exclusion = works.reduce((s, w) => s + w.work_total_exclusion, 0);
    const grand_total_settlement_target = works.reduce((s, w) => s + w.work_total_settlement_target, 0);
    const grand_total_share = works.reduce((s, w) => s + w.work_total_share, 0);
    const grand_total_team_labor_cost = works.reduce((s, w) => s + w.work_total_team_labor_cost, 0);
    const grand_total_self_labor_cost = works.reduce((s, w) => s + w.work_total_self_labor_cost, 0);
    const grand_total_net_share = works.reduce((s, w) => s + w.work_total_net_share, 0);

    const subtotal = grand_total_net_share;

    // 세금 계산 (파트너 유형 + 계약 세금유형 기반)
    const taxType = workPartners[0]?.tax_type as string || 'standard';
    const tax_breakdown = calculateTax(subtotal, partner.partner_type, taxType);
    const tax_amount = tax_breakdown.total;

    const hasActiveSerial = works.some(w => {
      const wk = workPartners.find(wp => wp.work_id === w.work_id);
      const wkData = wk?.work as unknown as { serial_end_date: string | null } | null;
      return !wkData?.serial_end_date || new Date(wkData.serial_end_date) >= new Date(month + '-01');
    });
    const insurance = calculateInsurance(subtotal, partner.partner_type, {
      serialEndDate: hasActiveSerial ? null : '1900-01-01',
      reportType: partner.report_type ?? null,
      month,
      isForeign: partner.is_foreign ?? false,
    });

    // MG 차감 합계
    const total_mg_deduction = works.reduce((s, w) => s + Math.abs(w.mg_deduction), 0);

    // 기타 공제 합계
    const total_other_deduction = (settlements || []).reduce((s, st) => s + (Number(st.other_deduction) || 0), 0);

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

    // 국내법인/네이버: 세금계산서 breakdown (국내유료 / 글로벌유료수익 외)
    let tax_invoice: { item: string; supply: number; vat: number; total: number }[] | null = null;
    let tax_invoice_total = 0;
    const isCorp = partner.partner_type === 'domestic_corp' || partner.partner_type === 'naver';
    if (isCorp) {
      const isVatSeparate = partner.vat_type === 'vat_separate';
      let domesticPaidNet = 0;
      let otherNet = 0;
      for (const w of works) {
        for (const d of w.details) {
          if (d.revenue_type === 'domestic_paid') {
            domesticPaidNet += d.net_share;
          } else {
            otherNet += d.net_share;
          }
        }
      }

      tax_invoice = [];
      if (domesticPaidNet > 0) {
        if (isVatSeparate) {
          const vat = Math.round(domesticPaidNet * 0.1);
          tax_invoice.push({
            item: '국내유료수익',
            supply: domesticPaidNet,
            vat,
            total: domesticPaidNet + vat,
          });
        } else {
          tax_invoice.push({
            item: '국내유료수익',
            supply: Math.round(domesticPaidNet * 10 / 11),
            vat: Math.round(domesticPaidNet * 1 / 11),
            total: domesticPaidNet,
          });
        }
      }
      if (otherNet > 0) {
        const vat = Math.round(otherNet * 0.1);
        tax_invoice.push({
          item: '글로벌유료수익 외',
          supply: otherNet,
          vat,
          total: otherNet + vat,
        });
      }
      tax_invoice_total = tax_invoice.reduce((s, t) => s + t.total, 0);
    }

    const final_payment = isCorp
      ? tax_invoice_total - total_mg_deduction - total_other_deduction
      : subtotal - tax_amount - insurance - total_mg_deduction - total_other_deduction;

    return NextResponse.json({
      partner,
      month,
      works,
      grand_total_revenue,
      grand_total_base_revenue,
      grand_total_exclusion,
      grand_total_settlement_target,
      grand_total_share,
      grand_total_team_labor_cost,
      grand_total_self_labor_cost,
      grand_total_net_share,
      subtotal,
      tax_type: taxType,
      tax_breakdown,
      tax_amount,
      insurance,
      total_mg_deduction,
      total_other_deduction,
      final_payment,
      mg_history,
      tax_invoice,
      tax_invoice_total,
    });
  } catch (error) {
    console.error('정산서 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
