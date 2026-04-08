import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { computeAllStatements } from '@/lib/settlement/compute-all-statements';

// GET /api/accounting/settlement/mg - MG 잔액 조회 (entry 기반)
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

    // MG entries + deductions + works 조회
    let entryQuery = supabase
      .from('rs_mg_entries')
      .select('id, partner_id, amount, withheld_tax, contracted_at, note, rs_partners(id, name, company_name, partner_type)')
      .order('partner_id');

    if (partnerId) entryQuery = entryQuery.eq('partner_id', partnerId);

    const { data: entries, error: entryErr } = await entryQuery;
    if (entryErr) {
      return NextResponse.json({ error: 'MG 엔트리 조회 실패' }, { status: 500 });
    }

    const entryIds = (entries || []).map((e: any) => e.id);
    let allEntryWorks: any[] = [];
    let allDeductions: any[] = [];

    if (entryIds.length > 0) {
      const [{ data: ew }, { data: deds }] = await Promise.all([
        supabase.from('rs_mg_entry_works').select('mg_entry_id, work_id, rs_works(id, name)').in('mg_entry_id', entryIds),
        supabase.from('rs_mg_deductions').select('mg_entry_id, month, amount, note').in('mg_entry_id', entryIds),
      ]);
      allEntryWorks = ew || [];
      allDeductions = deds || [];
    }

    // 미확정 월의 실시간 차감 계산
    let pendingDeductions = new Map<string, number>(); // partner_id → deduction
    if (month) {
      const { data: confirmed } = await supabase
        .from('rs_settlements').select('partner_id').eq('month', month).eq('status', 'confirmed');
      const confirmedIds = new Set((confirmed || []).map((s: any) => s.partner_id));

      const unconfirmedPartners = [...new Set((entries || []).map((e: any) => e.partner_id))]
        .filter(pid => !confirmedIds.has(pid));

      if (unconfirmedPartners.length > 0) {
        const bulkResult = await computeAllStatements(supabase, month);
        for (const { partnerId: pid, result } of bulkResult.partners) {
          if (result.total_mg_deduction > 0 && !confirmedIds.has(pid)) {
            pendingDeductions.set(pid, result.total_mg_deduction);
          }
        }
      }
    }

    // 파트너별로 집계
    const partnerMap = new Map<string, any>();
    for (const entry of (entries || [])) {
      const p = entry.rs_partners as any;
      if (!p) continue;

      const eWorks = allEntryWorks.filter((ew: any) => ew.mg_entry_id === entry.id);
      const eDeds = allDeductions.filter((d: any) => d.mg_entry_id === entry.id);
      const totalDeducted = eDeds.reduce((s: number, d: any) => s + Number(d.amount), 0);
      const workNames = eWorks.map((w: any) => w.rs_works?.name || '').filter(Boolean);

      if (!partnerMap.has(p.id)) {
        partnerMap.set(p.id, {
          partner_id: p.id,
          partner: p,
          total_mg: 0,
          total_deducted: 0,
          pending_deduction: pendingDeductions.get(p.id) || 0,
          remaining: 0,
          works: new Set<string>(),
          entry_count: 0,
        });
      }

      const pm = partnerMap.get(p.id)!;
      pm.total_mg += Number(entry.amount);
      pm.total_deducted += totalDeducted;
      for (const w of workNames) pm.works.add(w);
      pm.entry_count++;
    }

    const mg_balances = [...partnerMap.values()].map(pm => ({
      partner_id: pm.partner_id,
      partner: pm.partner,
      total_mg: pm.total_mg,
      total_deducted: pm.total_deducted,
      pending_deduction: pm.pending_deduction,
      remaining: pm.total_mg - pm.total_deducted - pm.pending_deduction,
      works: [...pm.works].join(', '),
      entry_count: pm.entry_count,
    }));

    return NextResponse.json({ mg_balances });
  } catch (error) {
    console.error('MG 잔액 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// PATCH /api/accounting/settlement/mg - MG 엔트리 메모 수정
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
      .from('rs_mg_entries')
      .update({ note: note ?? null })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: 'MG 메모 수정 실패' }, { status: 500 });
    }

    return NextResponse.json({ mg_entry: data });
  } catch (error) {
    console.error('MG 메모 수정 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
