import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/settlement/labor-cost-items?month=2026-01
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
    if (!month) {
      return NextResponse.json({ error: 'month 파라미터가 필요합니다.' }, { status: 400 });
    }

    // Fetch items with related partners and works
    const { data: items, error: itemsError } = await supabase
      .from('rs_labor_cost_items')
      .select('*')
      .eq('month', month)
      .order('created_at');

    if (itemsError) {
      console.error('인건비공제 아이템 조회 오류:', itemsError);
      return NextResponse.json({ error: '조회 실패' }, { status: 500 });
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const itemIds = items.map(i => i.id);

    // Fetch partner links
    const { data: partnerLinks } = await supabase
      .from('rs_labor_cost_item_partners')
      .select('item_id, partner_id, partner:rs_partners!partner_id(id, name)')
      .in('item_id', itemIds);

    // Fetch work links
    const { data: workLinks } = await supabase
      .from('rs_labor_cost_item_works')
      .select('item_id, work_id, work:rs_works!work_id(id, name)')
      .in('item_id', itemIds);

    // Fetch staff and partner names for person resolution
    const staffIds = items.filter(i => i.person_type === 'staff').map(i => i.person_id);
    const partnerPersonIds = items.filter(i => i.person_type === 'partner').map(i => i.person_id);

    let staffMap: Record<string, string> = {};
    let partnerMap: Record<string, string> = {};

    if (staffIds.length > 0) {
      const { data: staffData } = await supabase.from('rs_staff').select('id, name').in('id', staffIds);
      if (staffData) staffMap = Object.fromEntries(staffData.map(s => [s.id, s.name]));
    }
    if (partnerPersonIds.length > 0) {
      const { data: partnerData } = await supabase.from('rs_partners').select('id, name').in('id', partnerPersonIds);
      if (partnerData) partnerMap = Object.fromEntries(partnerData.map(p => [p.id, p.name]));
    }

    // Build partner/work maps
    const partnersByItem: Record<string, Array<{ id: string; name: string }>> = {};
    for (const link of partnerLinks || []) {
      if (!partnersByItem[link.item_id]) partnersByItem[link.item_id] = [];
      const p = link.partner as unknown as { id: string; name: string };
      if (p) partnersByItem[link.item_id].push(p);
    }

    const worksByItem: Record<string, Array<{ id: string; name: string }>> = {};
    for (const link of workLinks || []) {
      if (!worksByItem[link.item_id]) worksByItem[link.item_id] = [];
      const w = link.work as unknown as { id: string; name: string };
      if (w) worksByItem[link.item_id].push(w);
    }

    // Merge
    const result = items.map(item => ({
      ...item,
      person_name: item.person_type === 'staff'
        ? staffMap[item.person_id] || '(알 수 없음)'
        : partnerMap[item.person_id] || '(알 수 없음)',
      partners: partnersByItem[item.id] || [],
      works: worksByItem[item.id] || [],
    }));

    return NextResponse.json({ items: result });
  } catch (error) {
    console.error('인건비공제 아이템 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
