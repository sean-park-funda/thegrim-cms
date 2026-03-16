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
      .select('work_id, rs_rate, mg_rs_rate, is_mg_applied, included_revenue_types, labor_cost_excluded, labor_cost_as_exclusion, revenue_rate, tax_type, work:rs_works(id, name, serial_start_date, serial_end_date)')
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

    // 4) MG 잔액
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

    // 4-1) MG 전체 이력
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

    // 5) 인건비 계산 — rs_labor_cost_items 기반 (공제유형별 분리)
    // key: `${workId}:${deductionType}`
    const laborCostByWorkType = new Map<string, number>();
    // 정산제외금 모드용: 분담 전 원래 금액 (공제인원 전액)
    const laborCostFullByWorkType = new Map<string, number>();

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

    // 인건비공제제외 작품 세트
    const laborCostExcludedWorkIds = new Set(
      workPartners.filter(wp => wp.labor_cost_excluded).map(wp => wp.work_id)
    );

    // rs_labor_cost_items에서 이 파트너가 대상자인 아이템 조회
    const { data: partnerItemLinks } = await supabase
      .from('rs_labor_cost_item_partners')
      .select('item_id')
      .eq('partner_id', id);

    if (partnerItemLinks && partnerItemLinks.length > 0) {
      const itemIds = partnerItemLinks.map(l => l.item_id);

      // 아이템 정보 + 아이템별 대상자 + 아이템별 작품
      const { data: items } = await supabase
        .from('rs_labor_cost_items')
        .select('id, amount, deduction_type')
        .eq('month', month)
        .in('id', itemIds);

      const { data: allPartnerLinks } = await supabase
        .from('rs_labor_cost_item_partners')
        .select('item_id, partner_id')
        .in('item_id', itemIds);

      const { data: allWorkLinks } = await supabase
        .from('rs_labor_cost_item_works')
        .select('item_id, work_id')
        .in('item_id', itemIds);

      // 대상자별 RS율 조회 (분담비율 계산용)
      const allLinkedPartnerIds = [...new Set((allPartnerLinks || []).map(l => l.partner_id))];
      const allLinkedWorkIds = [...new Set((allWorkLinks || []).map(l => l.work_id))];

      let wpData: { partner_id: string; work_id: string; rs_rate: number; mg_rs_rate: number | null; is_mg_applied: boolean }[] = [];
      if (allLinkedPartnerIds.length > 0 && allLinkedWorkIds.length > 0) {
        const { data } = await supabase
          .from('rs_work_partners')
          .select('partner_id, work_id, rs_rate, mg_rs_rate, is_mg_applied')
          .in('partner_id', allLinkedPartnerIds)
          .in('work_id', allLinkedWorkIds);
        wpData = data || [];
      }

      // Build maps
      const partnersByItem = new Map<string, string[]>();
      for (const link of (allPartnerLinks || [])) {
        const list = partnersByItem.get(link.item_id) || [];
        list.push(link.partner_id);
        partnersByItem.set(link.item_id, list);
      }
      const worksByItem = new Map<string, string[]>();
      for (const link of (allWorkLinks || [])) {
        const list = worksByItem.get(link.item_id) || [];
        list.push(link.work_id);
        worksByItem.set(link.item_id, list);
      }

      // 각 아이템 → 이 파트너의 부담액 → 작품별 안분
      for (const item of (items || [])) {
        const amount = Number(item.amount);
        if (amount <= 0) continue;

        const partnerIds = partnersByItem.get(item.id) || [];
        const itemWorkIds = worksByItem.get(item.id) || [];
        if (partnerIds.length === 0 || itemWorkIds.length === 0) continue;

        // 규칙 1: 이 파트너의 부담액
        let myBurden = amount;
        if (partnerIds.length > 1) {
          let myRs = 0;
          let totalRs = 0;
          for (const pid of partnerIds) {
            let rsSum = 0;
            for (const wid of itemWorkIds) {
              const wp = wpData.find(w => w.partner_id === pid && w.work_id === wid);
              if (wp) {
                rsSum += wp.is_mg_applied && wp.mg_rs_rate != null
                  ? Number(wp.mg_rs_rate) : Number(wp.rs_rate);
              }
            }
            if (pid === id) myRs = rsSum;
            totalRs += rsSum;
          }
          myBurden = totalRs > 0 ? Math.round(amount * (myRs / totalRs)) : Math.round(amount / partnerIds.length);
        }

        if (myBurden <= 0) continue;

        // 규칙 2: 작품별 안분 (이 파트너의 작품만, 제외 작품 필터링)
        const eligibleWorkIds = itemWorkIds.filter(wid =>
          workIds.includes(wid) && !laborCostExcludedWorkIds.has(wid)
        );

        if (eligibleWorkIds.length === 0) continue;

        const dtype = item.deduction_type as string;
        if (eligibleWorkIds.length === 1) {
          const key = `${eligibleWorkIds[0]}:${dtype}`;
          laborCostByWorkType.set(key, (laborCostByWorkType.get(key) || 0) + myBurden);
          laborCostFullByWorkType.set(key, (laborCostFullByWorkType.get(key) || 0) + amount);
        } else {
          let totalShare = 0;
          const shares: { wid: string; share: number }[] = [];
          for (const wid of eligibleWorkIds) {
            const share = revenueShareByWork.get(wid) || 0;
            shares.push({ wid, share });
            totalShare += share;
          }
          for (const ws of shares) {
            const allocatedBurden = totalShare > 0
              ? Math.round(myBurden * (ws.share / totalShare))
              : Math.round(myBurden / shares.length);
            const allocatedFull = totalShare > 0
              ? Math.round(amount * (ws.share / totalShare))
              : Math.round(amount / shares.length);
            if (allocatedBurden > 0) {
              const key = `${ws.wid}:${dtype}`;
              laborCostByWorkType.set(key, (laborCostByWorkType.get(key) || 0) + allocatedBurden);
              laborCostFullByWorkType.set(key, (laborCostFullByWorkType.get(key) || 0) + allocatedFull);
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

      const baseRevenueByCol: Record<string, number> = {};
      let totalBaseRevenue = 0;
      for (const col of REVENUE_COLUMNS) {
        const included = includedTypes.includes(col);
        const amount = (rev && included) ? Number(rev[col]) : 0;
        const br = Math.round(amount * revenueRate);
        baseRevenueByCol[col] = br;
        totalBaseRevenue += br;
      }

      // 정산제외금 모드: 공제인원 인건비 전액 (분담 전)을 제외금으로 사용
      const workFullLaborCost =
        (laborCostFullByWorkType.get(`${wp.work_id}:근로소득공제`) || 0) +
        (laborCostFullByWorkType.get(`${wp.work_id}:인건비 공제`) || 0);

      const isExclusionMode = wp.labor_cost_as_exclusion && workFullLaborCost > 0;

      const details = REVENUE_COLUMNS.map(col => {
        const included = includedTypes.includes(col);
        const amount = (rev && included) ? Number(rev[col]) : 0;
        const baseRevenue = baseRevenueByCol[col];

        return {
          revenue_type: col,
          revenue_type_label: REVENUE_TYPE_LABELS[col],
          gross_revenue: amount,
          base_revenue: baseRevenue,
          exclusion_amount: 0,
          settlement_target: baseRevenue,
          revenue_share: 0,
          earned_income_deduction: 0,
          labor_cost_deduction: 0,
          labor_cost: 0,
          net_share: 0,
          rs_rate: effectiveRate,
          excluded: !included,
        };
      });

      if (isExclusionMode) {
        // 정산제외금 모드: 공제인원 인건비 전액을 기준매출에서 먼저 차감 후 RS 적용
        // (RS 분담은 settlement_target × RS율에서 자연스럽게 반영됨)
        const eligibleForExcl = details.filter(d => d.base_revenue > 0);
        const totalBase = eligibleForExcl.reduce((s, d) => s + d.base_revenue, 0);
        if (totalBase > 0) {
          let distributed = 0;
          for (let i = 0; i < eligibleForExcl.length; i++) {
            const excl = i === eligibleForExcl.length - 1
              ? workFullLaborCost - distributed
              : Math.round(workFullLaborCost * (eligibleForExcl[i].base_revenue / totalBase));
            eligibleForExcl[i].exclusion_amount = excl;
            distributed += excl;
          }
        }
        for (const d of details) {
          d.settlement_target = Math.max(0, d.base_revenue - d.exclusion_amount);
          d.revenue_share = Math.round(Math.max(0, d.settlement_target) * effectiveRate);
          d.net_share = d.revenue_share; // 인건비는 이미 정산제외금으로 처리됨
        }
      } else {
        // 일반 모드: RS 적용 후 인건비 차감
        for (const d of details) {
          d.revenue_share = Math.round(Math.max(0, d.settlement_target) * effectiveRate);
        }

        // 공제유형별로 수익구분 비중에 따라 배분
        for (const dtype of ['근로소득공제', '인건비 공제'] as const) {
          const key = `${wp.work_id}:${dtype}`;
          const typeCost = laborCostByWorkType.get(key) || 0;
          if (typeCost <= 0) continue;

          const totalBasis = details.reduce((s, d) => s + Math.max(0, d.revenue_share), 0);
          if (totalBasis > 0) {
            const eligible = details.filter(d => d.revenue_share > 0);
            let distributed = 0;
            for (let i = 0; i < eligible.length; i++) {
              const cost = i === eligible.length - 1
                ? typeCost - distributed
                : Math.round(typeCost * (eligible[i].revenue_share / totalBasis));
              if (dtype === '근로소득공제') {
                eligible[i].earned_income_deduction += cost;
              } else {
                eligible[i].labor_cost_deduction += cost;
              }
              distributed += cost;
            }
          }
        }

        for (const d of details) {
          d.labor_cost = d.earned_income_deduction + d.labor_cost_deduction;
          d.net_share = Math.max(0, d.revenue_share - d.labor_cost);
        }
      }

      const work_total_revenue = details.reduce((s, d) => s + d.gross_revenue, 0);
      const work_total_base_revenue = details.reduce((s, d) => s + d.base_revenue, 0);
      const work_total_exclusion = details.reduce((s, d) => s + d.exclusion_amount, 0);
      const work_total_settlement_target = details.reduce((s, d) => s + d.settlement_target, 0);
      const work_total_share = details.reduce((s, d) => s + d.revenue_share, 0);
      const work_total_labor_cost = details.reduce((s, d) => s + d.labor_cost, 0);
      const work_total_earned_income_deduction = details.reduce((s, d) => s + d.earned_income_deduction, 0);
      const work_total_labor_cost_deduction = details.reduce((s, d) => s + d.labor_cost_deduction, 0);
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
        work_total_labor_cost,
        work_total_earned_income_deduction,
        work_total_labor_cost_deduction,
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
    const grand_total_labor_cost = works.reduce((s, w) => s + w.work_total_labor_cost, 0);
    const grand_total_earned_income_deduction = works.reduce((s, w) => s + w.work_total_earned_income_deduction, 0);
    const grand_total_labor_cost_deduction = works.reduce((s, w) => s + w.work_total_labor_cost_deduction, 0);
    const grand_total_net_share = works.reduce((s, w) => s + w.work_total_net_share, 0);

    const subtotal = grand_total_net_share;

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

    // MG 차감: 세금·예고료 차감 후 남은 금액까지만 차감 가능
    const afterTax = subtotal - tax_amount - insurance;
    const total_mg_raw = works.reduce((s, w) => s + Math.abs(w.mg_deduction), 0);
    const total_other_deduction = (settlements || []).reduce((s, st) => s + (Number(st.other_deduction) || 0), 0);
    const total_mg_deduction = Math.min(total_mg_raw, Math.max(0, afterTax - total_other_deduction));

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

    // 국내법인/네이버: 세금계산서 breakdown
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
      grand_total_labor_cost,
      grand_total_earned_income_deduction,
      grand_total_labor_cost_deduction,
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
