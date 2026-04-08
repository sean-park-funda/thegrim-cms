import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { computeAllStatements } from '@/lib/settlement/compute-all-statements';

// POST /api/accounting/settlement/confirm — 월 단위 일괄 확정
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
    const { month } = body;
    if (!month) {
      return NextResponse.json({ error: '월은 필수입니다.' }, { status: 400 });
    }

    const { partners } = await computeAllStatements(supabase, month);

    if (partners.length === 0) {
      return NextResponse.json({ error: '해당 월의 정산 데이터가 없습니다.' }, { status: 404 });
    }

    // rs_settlements UPSERT + MG deduction 저장
    const upsertRows: Record<string, unknown>[] = [];

    // MG deduction: entry별 차감액 계산을 위해 모든 MG entry 조회
    const allPartnerIds = partners.map(p => p.partnerId);
    const { data: allEntries } = await supabase
      .from('rs_mg_entries').select('id, partner_id, amount').in('partner_id', allPartnerIds);
    const entryIds = (allEntries || []).map((e: any) => e.id);

    let allEntryWorks: any[] = [];
    let existingDeductions: any[] = [];
    if (entryIds.length > 0) {
      const [{ data: ew }, { data: deds }] = await Promise.all([
        supabase.from('rs_mg_entry_works').select('mg_entry_id, work_id').in('mg_entry_id', entryIds),
        supabase.from('rs_mg_deductions').select('mg_entry_id, month, amount').in('mg_entry_id', entryIds),
      ]);
      allEntryWorks = ew || [];
      existingDeductions = deds || [];
    }

    const mgDeductionInserts: Record<string, unknown>[] = [];

    for (const { partnerId, result } of partners) {
      for (const w of result.works) {
        upsertRows.push({
          month,
          partner_id: partnerId,
          work_id: w.work_id,
          gross_revenue: w.work_total_revenue,
          rs_rate: w.effective_rate,
          revenue_share: w.work_total_net_share,
          production_cost: 0,
          tax_amount: result.tax_amount,
          insurance: result.insurance,
          mg_deduction: w.mg_deduction,
          final_payment: result.final_payment,
          status: 'confirmed',
          snapshot: JSON.stringify(result),
        });
      }

      // MG deduction을 rs_mg_deductions에 저장 (entry별 배분, 오래된 것부터)
      if (result.total_mg_deduction > 0) {
        const partnerEntries = (allEntries || [])
          .filter((e: any) => e.partner_id === partnerId)
          .sort((a: any, b: any) => (a.contracted_at || '').localeCompare(b.contracted_at || ''));

        // 이미 이 월의 deduction이 있으면 스킵
        const hasMonthDed = existingDeductions.some((d: any) =>
          partnerEntries.some((e: any) => e.id === d.mg_entry_id) && d.month === month
        );
        if (!hasMonthDed) {
          // 작품별 차감액을 entry에 매핑
          const workToEntries = new Map<string, any[]>();
          for (const entry of partnerEntries) {
            const ew = allEntryWorks.filter((w: any) => w.mg_entry_id === entry.id);
            for (const w of ew) {
              if (!workToEntries.has(w.work_id)) workToEntries.set(w.work_id, []);
              workToEntries.get(w.work_id)!.push(entry);
            }
          }

          for (const w of result.works) {
            if (w.mg_deduction <= 0) continue;
            const entries = workToEntries.get(w.work_id) || [];
            let remaining = w.mg_deduction;

            for (const entry of entries) {
              if (remaining <= 0) break;
              const totalDed = existingDeductions
                .filter((d: any) => d.mg_entry_id === entry.id)
                .reduce((s: number, d: any) => s + Number(d.amount), 0);
              const entryRemaining = Number(entry.amount) - totalDed;
              if (entryRemaining <= 0) continue;

              const deduct = Math.min(entryRemaining, remaining);
              mgDeductionInserts.push({
                mg_entry_id: entry.id,
                month,
                amount: deduct,
                note: `${month} 정산 확정`,
              });
              remaining -= deduct;
            }
          }
        }
      }
    }

    // 일괄 DB 저장
    if (upsertRows.length > 0) {
      const { error: uErr } = await supabase
        .from('rs_settlements')
        .upsert(upsertRows, { onConflict: 'month,partner_id,work_id' });

      if (uErr) {
        console.error('정산 확정 UPSERT 오류:', uErr);
        return NextResponse.json({ error: '정산 확정 저장 실패: ' + uErr.message }, { status: 500 });
      }
    }

    if (mgDeductionInserts.length > 0) {
      const { error: mgErr } = await supabase
        .from('rs_mg_deductions')
        .insert(mgDeductionInserts);

      if (mgErr) {
        console.error('MG 차감 저장 오류:', mgErr);
        return NextResponse.json({ error: 'MG 차감 저장 실패: ' + mgErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      message: `${month} 정산 확정 완료`,
      confirmed_partners: partners.length,
      settlement_rows: upsertRows.length,
      mg_deductions_created: mgDeductionInserts.length,
    });
  } catch (error) {
    console.error('정산 확정 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
