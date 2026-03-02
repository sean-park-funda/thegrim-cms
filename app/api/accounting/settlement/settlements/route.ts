import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/settlement/settlements - 정산 조회
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
    const status = searchParams.get('status');

    let query = supabase
      .from('rs_settlements')
      .select('*, partner:rs_partners(*), work:rs_works(id, name)')
      .order('month', { ascending: false });

    if (month) query = query.eq('month', month);
    if (partnerId) query = query.eq('partner_id', partnerId);
    if (workId) query = query.eq('work_id', workId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) {
      console.error('정산 조회 오류:', error);
      return NextResponse.json({ error: '정산 조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ settlements: data });
  } catch (error) {
    console.error('정산 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// PUT /api/accounting/settlement/settlements - 정산 수정 (상태, 금액 등)
export async function PUT(request: NextRequest) {
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
    const { id, status, production_cost, adjustment, other_deduction, note } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID는 필수입니다.' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (production_cost !== undefined) updateData.production_cost = production_cost;
    if (adjustment !== undefined) updateData.adjustment = adjustment;
    if (other_deduction !== undefined) updateData.other_deduction = other_deduction;
    if (note !== undefined) updateData.note = note;

    const { data, error } = await supabase
      .from('rs_settlements')
      .update(updateData)
      .eq('id', id)
      .select('*, partner:rs_partners(*), work:rs_works(id, name)')
      .single();

    if (error) {
      console.error('정산 수정 오류:', error);
      return NextResponse.json({ error: '정산 수정 실패' }, { status: 500 });
    }

    return NextResponse.json({ settlement: data });
  } catch (error) {
    console.error('정산 수정 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
