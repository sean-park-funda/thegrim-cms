import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/settlement/insurance-exemptions?partner_id=xxx&month=YYYY-MM
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

    let query = supabase.from('rs_insurance_exemptions').select('*').order('created_at');
    if (partnerId) query = query.eq('partner_id', partnerId);
    if (month) query = query.eq('month', month);

    const { data, error } = await query;
    if (error) {
      console.error('예고료 면제 조회 오류:', error);
      return NextResponse.json({ error: '조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ exemptions: data });
  } catch (error) {
    console.error('예고료 면제 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// POST /api/accounting/settlement/insurance-exemptions
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedClient(request);
    if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    const { supabase } = auth;

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', auth.userId).single();
    if (!profile || !canManageAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { partner_id, month, reason } = await request.json();
    if (!partner_id || !month) {
      return NextResponse.json({ error: 'partner_id, month는 필수입니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('rs_insurance_exemptions')
      .insert({ partner_id, month, reason: reason || null })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '이미 해당 월에 면제가 등록되어 있습니다.' }, { status: 409 });
      }
      console.error('예고료 면제 등록 오류:', error);
      return NextResponse.json({ error: '등록 실패' }, { status: 500 });
    }

    return NextResponse.json({ exemption: data }, { status: 201 });
  } catch (error) {
    console.error('예고료 면제 등록 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// DELETE /api/accounting/settlement/insurance-exemptions
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

    const { error } = await supabase.from('rs_insurance_exemptions').delete().eq('id', id);
    if (error) {
      console.error('예고료 면제 삭제 오류:', error);
      return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('예고료 면제 삭제 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
