import { SupabaseClient } from '@supabase/supabase-js';

/**
 * rs_labor_cost_items 기반 인건비공제 계산
 *
 * 엑셀 규칙:
 * 1. 대상자가 2인 이상인 경우 → 각 RS% 적용하여 공동 부담
 * 2. 작품이 2개 이상인 경우 → 대상자의 수익분배금 비중으로 안분
 *
 * @returns Map<string, number> - key: "partnerId|workId" → 공제액
 */
export async function computeLaborCostDeductions(
  supabase: SupabaseClient,
  month: string,
  revenueByWorkId: Map<string, number>,
): Promise<Map<string, number>> {
  const deductions = new Map<string, number>();

  // 1. 해당월 인건비공제 아이템 조회
  const { data: items } = await supabase
    .from('rs_labor_cost_items')
    .select('id, amount')
    .eq('month', month);

  if (!items || items.length === 0) return deductions;

  const itemIds = items.map(i => i.id);

  // 2. 아이템별 대상자(파트너) 조회
  const { data: partnerLinks } = await supabase
    .from('rs_labor_cost_item_partners')
    .select('item_id, partner_id')
    .in('item_id', itemIds);

  // 3. 아이템별 공제작품 조회
  const { data: workLinks } = await supabase
    .from('rs_labor_cost_item_works')
    .select('item_id, work_id')
    .in('item_id', itemIds);

  // Build maps
  const partnersByItem = new Map<string, string[]>();
  for (const link of (partnerLinks || [])) {
    const list = partnersByItem.get(link.item_id) || [];
    list.push(link.partner_id);
    partnersByItem.set(link.item_id, list);
  }

  const worksByItem = new Map<string, string[]>();
  for (const link of (workLinks || [])) {
    const list = worksByItem.get(link.item_id) || [];
    list.push(link.work_id);
    worksByItem.set(link.item_id, list);
  }

  // 4. 관련 파트너-작품의 RS율 조회 (분담비율 + 안분 계산용)
  const allPartnerIds = [...new Set((partnerLinks || []).map(l => l.partner_id))];
  const allWorkIds = [...new Set((workLinks || []).map(l => l.work_id))];

  let wpData: { partner_id: string; work_id: string; rs_rate: number; mg_rs_rate: number | null; is_mg_applied: boolean }[] = [];
  if (allPartnerIds.length > 0 && allWorkIds.length > 0) {
    const { data } = await supabase
      .from('rs_work_partners')
      .select('partner_id, work_id, rs_rate, mg_rs_rate, is_mg_applied')
      .in('partner_id', allPartnerIds)
      .in('work_id', allWorkIds);
    wpData = data || [];
  }

  // 5. 각 아이템에 대해 공제액 배분
  for (const item of items) {
    const amount = Number(item.amount);
    if (amount <= 0) continue;

    const partnerIds = partnersByItem.get(item.id) || [];
    const workIds = worksByItem.get(item.id) || [];
    if (partnerIds.length === 0 || workIds.length === 0) continue;

    // --- 규칙 1: 대상자별 부담액 계산 (RS% 비례) ---
    const partnerBurdens = new Map<string, number>();

    if (partnerIds.length === 1) {
      // 단독 대상자 → 전액 부담
      partnerBurdens.set(partnerIds[0], amount);
    } else {
      // 공동 대상자 → 각 RS% 비례로 분담
      // 각 대상자의 RS율 합산 (해당 아이템의 작품들에 대해)
      const partnerRsSum = new Map<string, number>();
      let totalRs = 0;

      for (const pid of partnerIds) {
        let rsSum = 0;
        for (const wid of workIds) {
          const wp = wpData.find(w => w.partner_id === pid && w.work_id === wid);
          if (wp) {
            rsSum += wp.is_mg_applied && wp.mg_rs_rate != null
              ? Number(wp.mg_rs_rate)
              : Number(wp.rs_rate);
          }
        }
        partnerRsSum.set(pid, rsSum);
        totalRs += rsSum;
      }

      if (totalRs > 0) {
        for (const pid of partnerIds) {
          const ratio = (partnerRsSum.get(pid) || 0) / totalRs;
          partnerBurdens.set(pid, Math.round(amount * ratio));
        }
      } else {
        // RS율 정보 없으면 균등 분할
        const each = Math.round(amount / partnerIds.length);
        for (const pid of partnerIds) {
          partnerBurdens.set(pid, each);
        }
      }
    }

    // --- 규칙 2: 작품별 안분 (수익분배금 비중) ---
    for (const [partnerId, burden] of partnerBurdens) {
      if (burden <= 0) continue;

      if (workIds.length === 1) {
        // 단일 작품 → 전액
        const key = `${partnerId}|${workIds[0]}`;
        deductions.set(key, (deductions.get(key) || 0) + burden);
      } else {
        // 복수 작품 → 해당 파트너의 수익분배금 비중으로 안분
        const workShares: { workId: string; share: number }[] = [];
        let totalShare = 0;

        for (const wid of workIds) {
          const grossRevenue = revenueByWorkId.get(wid) || 0;
          const wp = wpData.find(w => w.partner_id === partnerId && w.work_id === wid);
          let share = 0;
          if (wp) {
            const rate = wp.is_mg_applied && wp.mg_rs_rate != null
              ? Number(wp.mg_rs_rate)
              : Number(wp.rs_rate);
            share = Math.round(grossRevenue * rate);
          }
          workShares.push({ workId: wid, share });
          totalShare += share;
        }

        for (const ws of workShares) {
          let allocated: number;
          if (totalShare > 0) {
            allocated = Math.round(burden * (ws.share / totalShare));
          } else {
            allocated = Math.round(burden / workShares.length);
          }
          if (allocated <= 0) continue;

          const key = `${partnerId}|${ws.workId}`;
          deductions.set(key, (deductions.get(key) || 0) + allocated);
        }
      }
    }
  }

  return deductions;
}

/**
 * @deprecated 새 computeLaborCostDeductions() 사용 권장
 */
export async function computeStaffSalaryDeductions(
  supabase: SupabaseClient,
  month: string,
  revenueByWorkId: Map<string, number>,
): Promise<Map<string, number>> {
  return computeLaborCostDeductions(supabase, month, revenueByWorkId);
}
