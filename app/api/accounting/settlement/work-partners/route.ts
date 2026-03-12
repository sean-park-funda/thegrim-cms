import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/settlement/work-partners
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
    const workId = searchParams.get('workId');
    const partnerId = searchParams.get('partnerId');

    let query = supabase
      .from('rs_work_partners')
      .select('*, work:rs_works(*), partner:rs_partners(*)')
      .order('created_at');

    if (workId) query = query.eq('work_id', workId);
    if (partnerId) query = query.eq('partner_id', partnerId);

    const { data, error } = await query;
    if (error) {
      console.error('작품-파트너 조회 오류:', error);
      return NextResponse.json({ error: '조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ work_partners: data });
  } catch (error) {
    console.error('작품-파트너 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// POST /api/accounting/settlement/work-partners
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
    const { work_id, partner_id, rs_rate, role, is_mg_applied, note, included_revenue_types, revenue_rate, settlement_cycle } = body;

    if (!work_id || !partner_id || rs_rate === undefined) {
      return NextResponse.json({ error: '작품, 파트너, RS 비율은 필수입니다.' }, { status: 400 });
    }

    const insertData: Record<string, unknown> = { work_id, partner_id, rs_rate, role: role || 'author', is_mg_applied: is_mg_applied || false, note };
    if (included_revenue_types !== undefined) insertData.included_revenue_types = included_revenue_types;
    if (revenue_rate !== undefined) insertData.revenue_rate = revenue_rate;
    if (settlement_cycle !== undefined) insertData.settlement_cycle = settlement_cycle;

    const { data, error } = await supabase
      .from('rs_work_partners')
      .insert(insertData)
      .select('*, work:rs_works(*), partner:rs_partners(*)')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '이미 존재하는 작품-파트너-역할 조합입니다.' }, { status: 409 });
      }
      console.error('작품-파트너 생성 오류:', error);
      return NextResponse.json({ error: '생성 실패' }, { status: 500 });
    }

    return NextResponse.json({ work_partner: data }, { status: 201 });
  } catch (error) {
    console.error('작품-파트너 생성 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// PUT /api/accounting/settlement/work-partners
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
    const { id, rs_rate, role, is_mg_applied, note,
      pen_name, vat_type, mg_rs_rate, contract_category,
      contract_doc_name, contract_signed_date, contract_period, contract_end_date,
      included_revenue_types, revenue_rate, settlement_cycle } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID는 필수입니다.' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { rs_rate, role, is_mg_applied, note };
    if (pen_name !== undefined) updateData.pen_name = pen_name;
    if (vat_type !== undefined) updateData.vat_type = vat_type;
    if (mg_rs_rate !== undefined) updateData.mg_rs_rate = mg_rs_rate;
    if (contract_category !== undefined) updateData.contract_category = contract_category;
    if (contract_doc_name !== undefined) updateData.contract_doc_name = contract_doc_name;
    if (contract_signed_date !== undefined) updateData.contract_signed_date = contract_signed_date;
    if (contract_period !== undefined) updateData.contract_period = contract_period;
    if (contract_end_date !== undefined) updateData.contract_end_date = contract_end_date;
    if (included_revenue_types !== undefined) updateData.included_revenue_types = included_revenue_types;
    if (revenue_rate !== undefined) updateData.revenue_rate = revenue_rate;
    if (settlement_cycle !== undefined) updateData.settlement_cycle = settlement_cycle;

    const { data, error } = await supabase
      .from('rs_work_partners')
      .update(updateData)
      .eq('id', id)
      .select('*, work:rs_works(*), partner:rs_partners(*)')
      .single();

    if (error) {
      console.error('작품-파트너 수정 오류:', error);
      return NextResponse.json({ error: '수정 실패' }, { status: 500 });
    }

    return NextResponse.json({ work_partner: data });
  } catch (error) {
    console.error('작품-파트너 수정 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// DELETE /api/accounting/settlement/work-partners
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

    const { error } = await supabase.from('rs_work_partners').delete().eq('id', id);
    if (error) {
      console.error('작품-파트너 삭제 오류:', error);
      return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('작품-파트너 삭제 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
