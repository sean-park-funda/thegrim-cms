import { SupabaseClient } from '@supabase/supabase-js';

/**
 * 급여를 작품별 수익배분액(revenue_share) 비례로 배분하여 partner|work 키로 차감액을 누적
 */
function distributeSalaryToWorks(
  deductions: Map<string, number>,
  partnerId: string,
  salary: number,
  workIds: string[],
  shareByWork: Map<string, number>,
) {
  if (salary <= 0 || workIds.length === 0) return;

  const workShares: { workId: string; share: number }[] = [];
  let totalShare = 0;
  for (const wid of workIds) {
    const share = shareByWork.get(wid) || 0;
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
    if (allocated <= 0) continue;

    const key = `${partnerId}|${ws.workId}`;
    deductions.set(key, (deductions.get(key) || 0) + allocated);
  }
}

/**
 * 스태프 급여 + 파트너 본인 급여를 참여 작품 수익배분액 비례로 배분하여
 * 작가별·작품별 차감액을 계산한다.
 */
export async function computeStaffSalaryDeductions(
  supabase: SupabaseClient,
  month: string,
  revenueByWorkId: Map<string, number>,
): Promise<Map<string, number>> {
  const deductions = new Map<string, number>();

  // 관련 파트너의 작품별 RS율 조회 → 수익배분액 계산용
  const buildShareMap = (
    partnerWorkPairs: { partner_id: string; work_id: string; rs_rate: number; mg_rs_rate: number | null; is_mg_applied: boolean }[],
    partnerId: string,
    targetWorkIds: string[],
  ): Map<string, number> => {
    const shareMap = new Map<string, number>();
    for (const wid of targetWorkIds) {
      const wp = partnerWorkPairs.find(p => p.partner_id === partnerId && p.work_id === wid);
      const grossRevenue = revenueByWorkId.get(wid) || 0;
      if (wp) {
        const rate = wp.is_mg_applied && wp.mg_rs_rate != null ? Number(wp.mg_rs_rate) : Number(wp.rs_rate);
        shareMap.set(wid, Math.round(grossRevenue * rate));
      } else {
        shareMap.set(wid, grossRevenue);
      }
    }
    return shareMap;
  };

  // 1. 스태프 급여 배분
  const { data: staffList } = await supabase
    .from('rs_staff')
    .select('id, monthly_salary, employer_partner_id')
    .eq('is_active', true)
    .eq('employer_type', 'author');

  if (staffList && staffList.length > 0) {
    const staffIds = staffList.map(s => s.id);
    const employerPartnerIds = [...new Set(staffList.map(s => s.employer_partner_id).filter(Boolean))];

    const { data: monthlySalaries } = await supabase
      .from('rs_staff_salaries')
      .select('staff_id, amount')
      .eq('month', month)
      .in('staff_id', staffIds);

    const salaryByStaff = new Map<string, number>();
    for (const ms of (monthlySalaries || [])) {
      salaryByStaff.set(ms.staff_id, Number(ms.amount));
    }

    const { data: assignments } = await supabase
      .from('rs_staff_assignments')
      .select('staff_id, work_id')
      .eq('is_active', true)
      .in('staff_id', staffIds);

    const assignmentsByStaff = new Map<string, string[]>();
    for (const a of (assignments || [])) {
      const list = assignmentsByStaff.get(a.staff_id) || [];
      list.push(a.work_id);
      assignmentsByStaff.set(a.staff_id, list);
    }

    // 파트너별 RS율 조회
    const { data: wpData } = await supabase
      .from('rs_work_partners')
      .select('partner_id, work_id, rs_rate, mg_rs_rate, is_mg_applied')
      .in('partner_id', employerPartnerIds);
    const workPartnerPairs = wpData || [];

    for (const staff of staffList) {
      const workIds = assignmentsByStaff.get(staff.id);
      if (!workIds || workIds.length === 0) continue;
      const salary = salaryByStaff.get(staff.id) ?? Number(staff.monthly_salary);
      const shareMap = buildShareMap(workPartnerPairs, staff.employer_partner_id, workIds);
      distributeSalaryToWorks(deductions, staff.employer_partner_id, salary, workIds, shareMap);
    }
  }

  // 2. 파트너 본인 급여 배분 (has_salary=true인 파트너)
  const { data: salariedPartners } = await supabase
    .from('rs_partners')
    .select('id')
    .eq('has_salary', true);

  if (salariedPartners && salariedPartners.length > 0) {
    const partnerIds = salariedPartners.map(p => p.id);

    const { data: partnerSalaries } = await supabase
      .from('rs_partner_salaries')
      .select('partner_id, amount')
      .eq('month', month)
      .in('partner_id', partnerIds);

    if (partnerSalaries && partnerSalaries.length > 0) {
      const { data: wpData } = await supabase
        .from('rs_work_partners')
        .select('partner_id, work_id, rs_rate, mg_rs_rate, is_mg_applied')
        .in('partner_id', partnerIds);

      const worksByPartner = new Map<string, string[]>();
      for (const wp of (wpData || [])) {
        const list = worksByPartner.get(wp.partner_id) || [];
        list.push(wp.work_id);
        worksByPartner.set(wp.partner_id, list);
      }

      for (const ps of partnerSalaries) {
        const workIds = worksByPartner.get(ps.partner_id) || [];
        const shareMap = buildShareMap(wpData || [], ps.partner_id, workIds);
        distributeSalaryToWorks(deductions, ps.partner_id, Number(ps.amount), workIds, shareMap);
      }
    }
  }

  return deductions;
}
