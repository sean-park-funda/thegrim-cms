import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { computeAllStatements } from '@/lib/settlement/compute-all-statements';

// GET /api/accounting/settlement/mg-entries?partnerId=xxx&month=YYYY-MM
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
    const partnerId = searchParams.get('partnerId');
    const month = searchParams.get('month');

    // partnerId 없으면 MG 엔트리가 있는 파트너 목록 반환
    if (!partnerId) {
      const { data: entries } = await supabase
        .from('rs_mg_entries')
        .select('partner_id, rs_partners(id, name, company_name, partner_type)')
        .order('partner_id');

      const partnerMap = new Map<string, any>();
      for (const e of (entries || [])) {
        const p = (e as any).rs_partners;
        if (p && !partnerMap.has(p.id)) {
          partnerMap.set(p.id, p);
        }
      }
      const partners = [...partnerMap.values()].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', 'ko')
      );
      return NextResponse.json({ partners });
    }

    // 1) Partner info
    const { data: partner } = await supabase
      .from('rs_partners')
      .select('id, name, company_name, partner_type')
      .eq('id', partnerId)
      .single();

    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    // 2) MG entries for this partner
    const { data: entries } = await supabase
      .from('rs_mg_entries')
      .select('id, amount, withheld_tax, contracted_at, note, created_at')
      .eq('partner_id', partnerId)
      .order('contracted_at', { ascending: true });

    // 3) Entry-work links with work names
    const entryIds = (entries || []).map(e => e.id);
    let entryWorks: Record<string, Array<{ work_id: string; work_name: string }>> = {};

    if (entryIds.length > 0) {
      const { data: ew } = await supabase
        .from('rs_mg_entry_works')
        .select('mg_entry_id, work_id, rs_works(name)')
        .in('mg_entry_id', entryIds);

      for (const row of (ew || [])) {
        const eid = row.mg_entry_id;
        if (!entryWorks[eid]) entryWorks[eid] = [];
        entryWorks[eid].push({
          work_id: row.work_id,
          work_name: (row as any).rs_works?.name || '',
        });
      }
    }

    // 4) Deductions for all entries
    let deductions: Record<string, Array<{ id: string; month: string; amount: number; note: string | null; pending?: boolean }>> = {};

    if (entryIds.length > 0) {
      const { data: deds } = await supabase
        .from('rs_mg_deductions')
        .select('id, mg_entry_id, month, amount, note')
        .in('mg_entry_id', entryIds)
        .order('month', { ascending: true });

      for (const d of (deds || [])) {
        const eid = d.mg_entry_id;
        if (!deductions[eid]) deductions[eid] = [];
        deductions[eid].push({
          id: d.id,
          month: d.month,
          amount: d.amount,
          note: d.note,
        });
      }
    }

    // 5) Real-time pending deduction for current unconfirmed month
    if (month && entryIds.length > 0) {
      // Check if this partner's settlement is confirmed for this month
      const { data: confirmed } = await supabase
        .from('rs_settlements')
        .select('id')
        .eq('partner_id', partnerId)
        .eq('month', month)
        .eq('status', 'confirmed')
        .limit(1);

      const isConfirmed = confirmed && confirmed.length > 0;

      // Check if deductions already exist for this month
      const hasDeductionForMonth = Object.values(deductions).some(deds =>
        deds.some(d => d.month === month)
      );

      if (!isConfirmed && !hasDeductionForMonth) {
        // Compute real-time deduction via computeAllStatements
        const bulkResult = await computeAllStatements(supabase, month);
        const partnerResult = bulkResult.partners.find(p => p.partnerId === partnerId);

        if (partnerResult && partnerResult.result.total_mg_deduction > 0) {
          // Build work_id → deduction amount from statement result
          const workDeductions = new Map<string, number>();
          for (const w of partnerResult.result.works) {
            if (w.mg_deduction > 0) {
              workDeductions.set(w.work_id, w.mg_deduction);
            }
          }

          // Group entries by work, then distribute each work's deduction
          // across its entries (oldest first) to avoid duplicates
          const workToEntries = new Map<string, Array<{ id: string; amount: number; contracted_at: string }>>();
          for (const entry of (entries || [])) {
            const ew = entryWorks[entry.id] || [];
            for (const w of ew) {
              if (!workToEntries.has(w.work_id)) workToEntries.set(w.work_id, []);
              workToEntries.get(w.work_id)!.push(entry);
            }
          }

          // 엔트리별 pending 합산용
          const entryPendingTotals = new Map<string, number>();

          for (const [workId, workEntries] of workToEntries) {
            let workDeduction = workDeductions.get(workId) || 0;
            if (workDeduction <= 0) continue;

            // Sort entries oldest first
            const sorted = [...workEntries].sort((a, b) =>
              a.contracted_at.localeCompare(b.contracted_at)
            );

            for (const entry of sorted) {
              if (workDeduction <= 0) break;
              const confirmedDeds = (deductions[entry.id] || []);
              const alreadyDeducted = confirmedDeds.reduce((s, d) => s + d.amount, 0);
              const prevPending = entryPendingTotals.get(entry.id) || 0;
              const entryRemaining = entry.amount - alreadyDeducted - prevPending;
              if (entryRemaining <= 0) continue;

              const deduct = Math.min(entryRemaining, workDeduction);
              entryPendingTotals.set(entry.id, prevPending + deduct);
              workDeduction -= deduct;
            }
          }

          // pending 합계를 1행으로 (FIFO는 내부 세금 계산용, 원장에서는 합계만 표시)
          const pendingTotal = [...entryPendingTotals.values()].reduce((s, v) => s + v, 0);
          if (pendingTotal > 0) {
            // 첫 번째 엔트리에 합산 pending 1행 추가
            const firstEntryId = entryIds[0];
            if (!deductions[firstEntryId]) deductions[firstEntryId] = [];
            deductions[firstEntryId].push({
              id: `pending-total`,
              month,
              amount: pendingTotal,
              note: '실시간 계산 (미확정)',
              pending: true,
            });
          }
        }
      }
    }

    // 6) Build response
    const result = (entries || []).map(e => {
      const deds = deductions[e.id] || [];
      const totalDeducted = deds.reduce((s, d) => s + d.amount, 0);
      return {
        ...e,
        works: entryWorks[e.id] || [],
        deductions: deds,
        total_deducted: totalDeducted,
        remaining: e.amount - totalDeducted,
      };
    });

    const totalMg = result.reduce((s, e) => s + e.amount, 0);
    const totalDeducted = result.reduce((s, e) => s + e.total_deducted, 0);

    return NextResponse.json({
      partner,
      entries: result,
      summary: {
        total_mg: totalMg,
        total_deducted: totalDeducted,
        remaining: totalMg - totalDeducted,
        entry_count: result.length,
      },
    });
  } catch (error: any) {
    console.error('MG entries API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
