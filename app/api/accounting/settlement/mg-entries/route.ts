import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/settlement/mg-entries?partnerId=xxx
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
    let deductions: Record<string, Array<{ id: string; month: string; amount: number; note: string | null }>> = {};

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

    // 5) Build response
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
