import { SupabaseClient } from '@supabase/supabase-js';

/**
 * 스태프 급여를 참여 작품 매출 비례로 배분하여 작가별·작품별 차감액을 계산한다.
 *
 * 로직:
 * 1. 활성 스태프 중 employer_type='author' 조회
 * 2. rs_staff_salaries에서 해당 월 급여 조회 (없으면 rs_staff.monthly_salary 폴백)
 * 3. 각 스태프의 활성 배정(rs_staff_assignments) 조회
 * 4. 매출 비례로 급여를 배분
 * 5. 소속 작가(employer_partner_id)의 해당 작품 정산에서 차감
 */
export async function computeStaffSalaryDeductions(
  supabase: SupabaseClient,
  month: string,
  revenueByWorkId: Map<string, number>,
): Promise<Map<string, number>> {
  const deductions = new Map<string, number>();

  // 1. 활성 스태프 (작가 소속)
  const { data: staffList } = await supabase
    .from('rs_staff')
    .select('id, monthly_salary, employer_partner_id')
    .eq('is_active', true)
    .eq('employer_type', 'author');

  if (!staffList || staffList.length === 0) return deductions;

  // 2. 해당 월 급여 조회 (rs_staff_salaries 우선, 없으면 rs_staff.monthly_salary 폴백)
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

  // 3. 활성 배정 조회
  const { data: assignments } = await supabase
    .from('rs_staff_assignments')
    .select('staff_id, work_id')
    .eq('is_active', true)
    .in('staff_id', staffIds);

  if (!assignments || assignments.length === 0) return deductions;

  // 4. 스태프별 배정 그룹핑
  const assignmentsByStaff = new Map<string, string[]>();
  for (const a of assignments) {
    const list = assignmentsByStaff.get(a.staff_id) || [];
    list.push(a.work_id);
    assignmentsByStaff.set(a.staff_id, list);
  }

  // 5. 각 스태프의 급여를 매출 비례 배분
  for (const staff of staffList) {
    const workIds = assignmentsByStaff.get(staff.id);
    if (!workIds || workIds.length === 0) continue;

    // 월별 급여 우선, 없으면 기본 급여
    const salary = salaryByStaff.get(staff.id) ?? Number(staff.monthly_salary);
    if (salary <= 0) continue;

    const workRevenues: { workId: string; revenue: number }[] = [];
    let totalRevenue = 0;
    for (const wid of workIds) {
      const rev = revenueByWorkId.get(wid) || 0;
      workRevenues.push({ workId: wid, revenue: rev });
      totalRevenue += rev;
    }

    for (const wr of workRevenues) {
      let allocated: number;
      if (totalRevenue > 0) {
        allocated = Math.round(salary * (wr.revenue / totalRevenue));
      } else {
        allocated = Math.round(salary / workRevenues.length);
      }

      if (allocated <= 0) continue;

      const key = `${staff.employer_partner_id}|${wr.workId}`;
      deductions.set(key, (deductions.get(key) || 0) + allocated);
    }
  }

  return deductions;
}
