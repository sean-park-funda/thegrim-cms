import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { RevenueType } from '@/lib/types/settlement';

const REVENUE_TYPE_COLUMNS: Record<RevenueType, string> = {
  domestic_paid: 'domestic_paid',
  global_paid: 'global_paid',
  domestic_ad: 'domestic_ad',
  global_ad: 'global_ad',
  secondary: 'secondary',
};

// GET /api/accounting/settlement/revenue-lines?work_id=...&month=...&revenue_type=...
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
    const work_id = searchParams.get('work_id');
    const month = searchParams.get('month');
    const revenue_type = searchParams.get('revenue_type');

    if (!work_id || !month) {
      return NextResponse.json({ error: 'work_id와 month는 필수입니다.' }, { status: 400 });
    }

    let query = supabase
      .from('rs_revenue_lines')
      .select('*')
      .eq('work_id', work_id)
      .eq('month', month)
      .order('service_platform')
      .order('country');

    if (revenue_type) {
      query = query.eq('revenue_type', revenue_type);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: '상세 행 조회 실패: ' + error.message }, { status: 500 });
    }

    return NextResponse.json({ lines: data || [] });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// PATCH /api/accounting/settlement/revenue-lines
// body: { id, adjustment_amount }
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
    const { id, adjustment_supply, adjustment_vat } = body;

    if (!id || (adjustment_supply === undefined && adjustment_vat === undefined)) {
      return NextResponse.json({ error: 'id와 adjustment_supply 또는 adjustment_vat가 필수입니다.' }, { status: 400 });
    }

    // 1) 해당 라인 조회
    const { data: line, error: lineError } = await supabase
      .from('rs_revenue_lines')
      .select('*')
      .eq('id', id)
      .single();

    if (lineError || !line) {
      return NextResponse.json({ error: '라인을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 2) 라인 업데이트 (공급가·부가세 각각 독립 조정)
    const updateData: Record<string, number> = {};
    if (adjustment_supply !== undefined) updateData.adjustment_supply = Number(adjustment_supply);
    if (adjustment_vat !== undefined) updateData.adjustment_vat = Number(adjustment_vat);

    const { error: updateError } = await supabase
      .from('rs_revenue_lines')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: '라인 업데이트 실패: ' + updateError.message }, { status: 500 });
    }

    // 4) rs_revenues 합산 갱신
    const { data: allLines } = await supabase
      .from('rs_revenue_lines')
      .select('supply_amount, adjustment_supply')
      .eq('revenue_id', line.revenue_id)
      .eq('revenue_type', line.revenue_type);

    if (allLines) {
      const totalSupply = allLines.reduce(
        (sum: number, l: { supply_amount: number; adjustment_supply: number }) =>
          sum + Number(l.supply_amount) + Number(l.adjustment_supply),
        0
      );

      const column = REVENUE_TYPE_COLUMNS[line.revenue_type as RevenueType];
      if (column) {
        await supabase
          .from('rs_revenues')
          .update({ [column]: totalSupply })
          .eq('id', line.revenue_id);
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
