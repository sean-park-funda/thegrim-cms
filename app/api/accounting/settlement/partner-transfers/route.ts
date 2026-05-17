import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedClient(request);
    if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    const { supabase } = auth;

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', auth.userId).single();
    if (!profile || !canViewAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const partnerId = searchParams.get('partner_id');
    const month = searchParams.get('month');

    let query = supabase
      .from('rs_partner_transfers')
      .select('*, from_partner:rs_partners!rs_partner_transfers_from_partner_id_fkey(id, name), to_partner:rs_partners!rs_partner_transfers_to_partner_id_fkey(id, name), work:rs_works(id, name)')
      .order('created_at');

    if (partnerId) query = query.or(`from_partner_id.eq.${partnerId},to_partner_id.eq.${partnerId}`);
    if (month) query = query.eq('month', month);

    const { data, error } = await query;
    if (error) {
      console.error('작가 간 거래 조회 오류:', error);
      return NextResponse.json({ error: '조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ transfers: data });
  } catch (error) {
    console.error('작가 간 거래 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedClient(request);
    if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    const { supabase } = auth;

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', auth.userId).single();
    if (!profile || !canManageAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { from_partner_id, to_partner_id, work_id, month, label, amount } = await request.json();
    if (!from_partner_id || !to_partner_id || !month || !label || !amount) {
      return NextResponse.json({ error: 'from_partner_id, to_partner_id, month, label, amount는 필수입니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('rs_partner_transfers')
      .insert({ from_partner_id, to_partner_id, work_id: work_id || null, month, label, amount: Number(amount) })
      .select()
      .single();

    if (error) {
      console.error('작가 간 거래 생성 오류:', error);
      return NextResponse.json({ error: '생성 실패' }, { status: 500 });
    }

    return NextResponse.json({ transfer: data }, { status: 201 });
  } catch (error) {
    console.error('작가 간 거래 생성 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthenticatedClient(request);
    if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    const { supabase } = auth;

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', auth.userId).single();
    if (!profile || !canManageAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }

    const { error } = await supabase.from('rs_partner_transfers').delete().eq('id', id);
    if (error) {
      console.error('작가 간 거래 삭제 오류:', error);
      return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('작가 간 거래 삭제 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
