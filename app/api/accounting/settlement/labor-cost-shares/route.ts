import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/settlement/labor-cost-shares
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
    const sourceType = searchParams.get('sourceType');
    const sourceId = searchParams.get('sourceId');
    const bearerPartnerId = searchParams.get('bearerPartnerId');

    let query = supabase
      .from('rs_labor_cost_shares')
      .select('*, bearer_partner:rs_partners!bearer_partner_id(id, name)')
      .order('created_at');

    if (sourceType) query = query.eq('source_type', sourceType);
    if (sourceId) query = query.eq('source_id', sourceId);
    if (bearerPartnerId) query = query.eq('bearer_partner_id', bearerPartnerId);

    const { data, error } = await query;
    if (error) {
      console.error('인건비 분담 조회 오류:', error);
      return NextResponse.json({ error: '조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ shares: data });
  } catch (error) {
    console.error('인건비 분담 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// POST /api/accounting/settlement/labor-cost-shares
export async function POST(request: NextRequest) {
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
    const { source_type, source_id, bearer_partner_id, share_ratio, note } = body;

    if (!source_type || !source_id || !bearer_partner_id || share_ratio === undefined) {
      return NextResponse.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('rs_labor_cost_shares')
      .insert({ source_type, source_id, bearer_partner_id, share_ratio, note })
      .select('*, bearer_partner:rs_partners!bearer_partner_id(id, name)')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '이미 해당 파트너에 대한 분담 설정이 있습니다.' }, { status: 409 });
      }
      console.error('인건비 분담 생성 오류:', error);
      return NextResponse.json({ error: '생성 실패' }, { status: 500 });
    }

    return NextResponse.json({ share: data }, { status: 201 });
  } catch (error) {
    console.error('인건비 분담 생성 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// PUT /api/accounting/settlement/labor-cost-shares
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
    const { id, share_ratio, note } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID는 필수입니다.' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (share_ratio !== undefined) updateData.share_ratio = share_ratio;
    if (note !== undefined) updateData.note = note;

    const { data, error } = await supabase
      .from('rs_labor_cost_shares')
      .update(updateData)
      .eq('id', id)
      .select('*, bearer_partner:rs_partners!bearer_partner_id(id, name)')
      .single();

    if (error) {
      console.error('인건비 분담 수정 오류:', error);
      return NextResponse.json({ error: '수정 실패' }, { status: 500 });
    }

    return NextResponse.json({ share: data });
  } catch (error) {
    console.error('인건비 분담 수정 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// DELETE /api/accounting/settlement/labor-cost-shares
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID는 필수입니다.' }, { status: 400 });
    }

    const { error } = await supabase.from('rs_labor_cost_shares').delete().eq('id', id);
    if (error) {
      console.error('인건비 분담 삭제 오류:', error);
      return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('인건비 분담 삭제 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
