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

// PUT /api/accounting/settlement/settlements - 제작비용/메모 수정
// 확정은 POST /confirm API를 사용
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
    const { partner_id, work_id, month, production_cost, note } = body;

    if (!partner_id || !work_id || !month) {
      return NextResponse.json({ error: 'partner_id, work_id, month은 필수입니다.' }, { status: 400 });
    }

    // 제작비용 → rs_production_costs에 저장
    if (production_cost !== undefined) {
      const { error: pcErr } = await supabase
        .from('rs_production_costs')
        .upsert({
          partner_id,
          work_id,
          month,
          amount: production_cost,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'partner_id,work_id,month' });

      if (pcErr) {
        console.error('제작비용 수정 오류:', pcErr);
        return NextResponse.json({ error: '제작비용 수정 실패' }, { status: 500 });
      }
    }

    // 메모 → rs_settlements에 저장 (확정 레코드가 있는 경우만)
    if (note !== undefined) {
      await supabase
        .from('rs_settlements')
        .update({ note })
        .eq('partner_id', partner_id)
        .eq('work_id', work_id)
        .eq('month', month);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('정산 수정 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
