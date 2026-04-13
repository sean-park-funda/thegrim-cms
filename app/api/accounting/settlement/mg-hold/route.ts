import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/settlement/mg-hold?partner_id=...&work_id=...
// 홀딩 이력 조회
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedClient(request);
    if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    const { supabase } = auth;

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', auth.userId).single();
    if (!profile || !canManageAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const partnerId = searchParams.get('partner_id');
    const workId = searchParams.get('work_id');

    if (!partnerId) {
      return NextResponse.json({ error: 'partner_id는 필수입니다.' }, { status: 400 });
    }

    let query = supabase
      .from('rs_mg_hold_logs')
      .select('id, partner_id, work_id, action, reason, created_at')
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (workId) {
      query = query.eq('work_id', workId);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ logs: data || [] });
  } catch (error) {
    console.error('MG 홀딩 이력 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// POST /api/accounting/settlement/mg-hold
// { partner_id, work_id, action: 'hold' | 'release', reason? }
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedClient(request);
    if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    const { supabase } = auth;

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', auth.userId).single();
    if (!profile || !canManageAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { partner_id, work_id, action, reason } = body;

    if (!partner_id || !work_id || !action) {
      return NextResponse.json({ error: 'partner_id, work_id, action은 필수입니다.' }, { status: 400 });
    }
    if (action !== 'hold' && action !== 'release') {
      return NextResponse.json({ error: "action은 'hold' 또는 'release'여야 합니다." }, { status: 400 });
    }

    const mgHold = action === 'hold';

    // rs_work_partners 업데이트
    const { error: wpErr } = await supabase
      .from('rs_work_partners')
      .update({ mg_hold: mgHold })
      .eq('partner_id', partner_id)
      .eq('work_id', work_id);

    if (wpErr) {
      return NextResponse.json({ error: wpErr.message }, { status: 500 });
    }

    // 이력 기록
    const { error: logErr } = await supabase
      .from('rs_mg_hold_logs')
      .insert({ partner_id, work_id, action, reason: reason || null });

    if (logErr) {
      console.error('MG 홀딩 이력 저장 오류:', logErr);
    }

    return NextResponse.json({ success: true, mg_hold: mgHold });
  } catch (error) {
    console.error('MG 홀딩 토글 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
