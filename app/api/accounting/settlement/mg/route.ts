import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { computeLaborCostDeductions } from '@/lib/settlement/staff-salary';

const REVENUE_COLUMNS = ['domestic_paid', 'global_paid', 'domestic_ad', 'global_ad', 'secondary'];

// GET /api/accounting/settlement/mg - MG 잔액 조회
export async function GET(request: NextRequest) {
  try {
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
    const partnerId = searchParams.get('partnerId');
    const workId = searchParams.get('workId');

    let query = supabase
      .from('rs_mg_balances')
      .select('*, partner:rs_partners(*), work:rs_works(id, name)')
      .order('month', { ascending: false });

    if (month) query = query.eq('month', month);
    if (partnerId) query = query.eq('partner_id', partnerId);
    if (workId) query = query.eq('work_id', workId);

    const { data, error } = await query;
    if (error) {
      console.error('MG 잔액 조회 오류:', error);
      return NextResponse.json({ error: 'MG 잔액 조회 실패' }, { status: 500 });
    }

    // 미확정 건에 대해 mg_deducted를 실시간 계산 (확정 전에도 차감 예상액 표시)
    if (month && data && data.length > 0) {
      // 1. 확정 상태 확인
      const mgPartnerIds = [...new Set(data.map((mg: any) => mg.partner_id))];
      const mgWorkIds = [...new Set(data.map((mg: any) => mg.work_id))];

      const { data: settlements } = await supabase
        .from('rs_settlements')
        .select('partner_id, work_id, status')
        .eq('month', month)
        .in('partner_id', mgPartnerIds)
        .in('work_id', mgWorkIds);

      const confirmedSet = new Set(
        (settlements || []).filter((s: any) => s.status === 'confirmed')
          .map((s: any) => `${s.partner_id}:${s.work_id}`)
      );

      const needsCalc = data.filter((mg: any) => !confirmedSet.has(`${mg.partner_id}:${mg.work_id}`));

      if (needsCalc.length > 0) {
        // 2. 매출 데이터 조회
        const { data: allRevenues } = await supabase
          .from('rs_revenues')
          .select('*')
          .eq('month', month);

        const revenueByWorkId = new Map<string, number>();
        for (const rev of (allRevenues || [])) {
          revenueByWorkId.set(rev.work_id, Number(rev.total) || 0);
        }

        // 3. 인건비 공제 계산
        const laborDeductions = await computeLaborCostDeductions(supabase, month, revenueByWorkId);

        // 4. 작품-파트너 계약 설정
        const ncPartnerIds = [...new Set(needsCalc.map((mg: any) => mg.partner_id))];
        const ncWorkIds = [...new Set(needsCalc.map((mg: any) => mg.work_id))];

        const { data: wpSettings } = await supabase
          .from('rs_work_partners')
          .select('partner_id, work_id, rs_rate, mg_rs_rate, is_mg_applied, included_revenue_types, revenue_rate, mg_depends_on')
          .in('partner_id', ncPartnerIds)
          .in('work_id', ncWorkIds);

        // 5. 매출 조정
        const { data: revAdj } = await supabase
          .from('rs_revenue_adjustments')
          .select('work_id, amount')
          .eq('month', month)
          .in('work_id', ncWorkIds);

        const revAdjByWork = new Map<string, number>();
        for (const ra of (revAdj || [])) {
          revAdjByWork.set(ra.work_id, (revAdjByWork.get(ra.work_id) || 0) + Number(ra.amount));
        }

        // 6. MG 의존관계 일괄 확인
        const depTargets = new Map<string, { partner_id: string; work_id: string }>();
        for (const mg of needsCalc) {
          const wp = (wpSettings || []).find((w: any) => w.partner_id === mg.partner_id && w.work_id === mg.work_id);
          if (wp?.mg_depends_on) {
            const dep = wp.mg_depends_on as { partner_id: string; work_id: string };
            depTargets.set(`${dep.partner_id}:${dep.work_id}`, dep);
          }
        }

        const depBalances = new Map<string, number>();
        for (const [key, dep] of depTargets) {
          const { data: depMg } = await supabase
            .from('rs_mg_balances')
            .select('current_balance')
            .eq('partner_id', dep.partner_id)
            .eq('work_id', dep.work_id)
            .order('month', { ascending: false })
            .limit(1)
            .single();
          depBalances.set(key, depMg ? Number(depMg.current_balance) : 0);
        }

        // 7. 미확정 건별 mg_deducted 실시간 계산
        for (const mg of needsCalc) {
          const wp = (wpSettings || []).find((w: any) => w.partner_id === mg.partner_id && w.work_id === mg.work_id);
          if (!wp) continue;

          // MG 의존관계 차단 확인
          if (wp.mg_depends_on) {
            const dep = wp.mg_depends_on as { partner_id: string; work_id: string };
            const balance = depBalances.get(`${dep.partner_id}:${dep.work_id}`) || 0;
            if (balance > 0) {
              mg.mg_deducted = 0;
              mg.current_balance = Number(mg.previous_balance) + Number(mg.mg_added);
              continue;
            }
          }

          const rev = (allRevenues || []).find((r: any) => r.work_id === mg.work_id);
          const effectiveRate = wp.is_mg_applied && wp.mg_rs_rate != null
            ? Number(wp.mg_rs_rate) : Number(wp.rs_rate);
          const revenueRate = Number(wp.revenue_rate) || 1;
          const includedTypes: string[] = wp.included_revenue_types || REVENUE_COLUMNS;
          const unconfirmed: string[] = rev?.unconfirmed_types || [];

          // 수익분배금 계산 (매출유형별 revenue_rate 적용 후 RS율 적용)
          let revenueShare = 0;
          let domesticPaidShare = 0;
          for (const col of REVENUE_COLUMNS) {
            if (!includedTypes.includes(col) || unconfirmed.includes(col)) continue;
            const amount = rev ? Number(rev[col]) || 0 : 0;
            const colShare = Math.round(Math.round(amount * revenueRate) * effectiveRate);
            revenueShare += colShare;
            if (col === 'domestic_paid') domesticPaidShare = colShare;
          }

          // 매출 조정 반영
          const revAdjAmount = revAdjByWork.get(mg.work_id) || 0;
          const revAdjRS = Math.round(revAdjAmount * effectiveRate);
          revenueShare += revAdjRS;

          // 인건비 공제
          const laborCost = laborDeductions.get(`${mg.partner_id}|${mg.work_id}`) || 0;

          // 순수익분배금
          const netShare = Math.max(0, revenueShare - laborCost);

          // MG 차감 cap 결정: 사업자는 세금계산서 합계(VAT 포함), 개인은 순수익분배금
          const partnerType = mg.partner?.partner_type;
          const isCorp = partnerType === 'domestic_corp' || partnerType === 'naver';
          let mgCap = netShare;

          if (isCorp && netShare > 0) {
            // 인건비를 국내유료/기타에 비례 배분하여 net 산출
            const otherShare = revenueShare - revAdjRS - domesticPaidShare;
            const totalShareForRatio = domesticPaidShare + otherShare;
            let domesticPaidNet = domesticPaidShare;
            let otherNet = otherShare + revAdjRS;
            if (totalShareForRatio > 0 && laborCost > 0) {
              const domesticLabor = Math.round(laborCost * (domesticPaidShare / totalShareForRatio));
              domesticPaidNet = Math.max(0, domesticPaidShare - domesticLabor);
              otherNet = Math.max(0, otherShare - (laborCost - domesticLabor)) + revAdjRS;
            }

            // VAT 계산 (statement API와 동일 로직)
            const vatType = mg.partner?.vat_type as string;
            let taxInvoiceTotal = 0;
            if (domesticPaidNet > 0) {
              if (vatType === 'tax_exempt') {
                taxInvoiceTotal += domesticPaidNet; // 면세
              } else if (vatType === 'vat_separate') {
                taxInvoiceTotal += domesticPaidNet + Math.round(domesticPaidNet * 0.1); // 외세
              } else {
                taxInvoiceTotal += domesticPaidNet; // 내세 (VAT 포함가)
              }
            }
            if (otherNet > 0) {
              taxInvoiceTotal += otherNet + Math.round(otherNet * 0.1);
            }
            mgCap = taxInvoiceTotal;
          }

          const prevBalance = Number(mg.previous_balance);
          const mgDeducted = prevBalance > 0 ? Math.min(prevBalance, Math.max(0, mgCap)) : 0;

          mg.mg_deducted = mgDeducted;
          mg.current_balance = Number(mg.previous_balance) + Number(mg.mg_added) - mgDeducted;
        }
      }
    }

    return NextResponse.json({ mg_balances: data });
  } catch (error) {
    console.error('MG 잔액 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// PATCH /api/accounting/settlement/mg - MG 잔액 메모 수정
export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthenticatedClient(request);
    if (!auth) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const { supabase } = auth;

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', auth.userId).single();
    if (!profile || !canManageAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { id, note } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID는 필수입니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('rs_mg_balances')
      .update({ note: note ?? null })
      .eq('id', id)
      .select('*, partner:rs_partners(*), work:rs_works(id, name)')
      .single();

    if (error) {
      console.error('MG 메모 수정 오류:', error);
      return NextResponse.json({ error: 'MG 메모 수정 실패' }, { status: 500 });
    }

    return NextResponse.json({ mg_balance: data });
  } catch (error) {
    console.error('MG 메모 수정 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// POST /api/accounting/settlement/mg - MG 잔액 추가/수정
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedClient(request);
    if (!auth) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const { supabase } = auth;

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', auth.userId).single();
    if (!profile || !canManageAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { month, partner_id, work_id, mg_added, note } = body;

    if (!month || !partner_id || !work_id) {
      return NextResponse.json({ error: '월, 파트너, 작품은 필수입니다.' }, { status: 400 });
    }

    // 이전 잔액 조회
    const { data: prevBalance } = await supabase
      .from('rs_mg_balances')
      .select('current_balance')
      .eq('partner_id', partner_id)
      .eq('work_id', work_id)
      .order('month', { ascending: false })
      .limit(1)
      .single();

    const previousBalance = prevBalance ? Number(prevBalance.current_balance) : 0;
    const addedAmount = Number(mg_added) || 0;
    const currentBalance = previousBalance + addedAmount;

    const { data, error } = await supabase
      .from('rs_mg_balances')
      .upsert({
        month,
        partner_id,
        work_id,
        previous_balance: previousBalance,
        mg_added: addedAmount,
        mg_deducted: 0,
        current_balance: currentBalance,
        note,
      }, { onConflict: 'month,partner_id,work_id' })
      .select('*, partner:rs_partners(*), work:rs_works(id, name)')
      .single();

    if (error) {
      console.error('MG 잔액 생성 오류:', error);
      return NextResponse.json({ error: 'MG 잔액 생성 실패' }, { status: 500 });
    }

    return NextResponse.json({ mg_balance: data }, { status: 201 });
  } catch (error) {
    console.error('MG 잔액 생성 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
