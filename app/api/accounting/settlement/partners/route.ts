import { NextRequest, NextResponse } from 'next/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';

// GET /api/accounting/settlement/partners
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

    const { data, error } = await supabase.from('rs_partners').select('*').order('name');
    if (error) {
      console.error('파트너 조회 오류:', error);
      return NextResponse.json({ error: '파트너 조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ partners: data });
  } catch (error) {
    console.error('파트너 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// POST /api/accounting/settlement/partners
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
    const { name, company_name, partner_type, tax_id, tax_rate, bank_name, bank_account, email, note } = body;

    if (!name) {
      return NextResponse.json({ error: '파트너명은 필수입니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('rs_partners')
      .insert({ name, company_name, partner_type, tax_id, tax_rate, bank_name, bank_account, email, note })
      .select()
      .single();

    if (error) {
      console.error('파트너 생성 오류:', error);
      return NextResponse.json({ error: '파트너 생성 실패' }, { status: 500 });
    }

    return NextResponse.json({ partner: data }, { status: 201 });
  } catch (error) {
    console.error('파트너 생성 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
