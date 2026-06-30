import { NextRequest, NextResponse } from 'next/server';
import { canViewAccounting } from '@/lib/utils/permissions';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// GET /api/accounting/settlement/modusign
// query: status, search, page, limit
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedClient(request);
    if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    const { supabase } = auth;

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', auth.userId)
      .single();
    if (!profile || !canViewAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    // modusign_contracts는 service_role만 접근 가능 → 별도 서비스 클라이언트 사용
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { searchParams } = new URL(request.url);
    const status   = searchParams.get('status') || '';
    const category = searchParams.get('category') || '';
    const search   = searchParams.get('search') || '';
    const page     = parseInt(searchParams.get('page') || '1');
    const limit    = parseInt(searchParams.get('limit') || '50');
    const offset   = (page - 1) * limit;

    let query = serviceClient
      .from('modusign_contracts')
      .select('document_id, title, status, category, categories, classification, counterparty, total_amount, prepayment, prepayment_due, interim_payment, interim_due, balance_payment, balance_due, settlement_ratio, settlement_method, settlement_date, summary, special_terms, contract_start, contract_end, sent_at, completed_at, participants, labels', { count: 'exact' })
      .order('completed_at', { ascending: false, nullsFirst: false })
      .order('sent_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (category) query = query.contains('categories', [category]);
    if (search) query = query.ilike('title', `%${search}%`);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ contracts: data, total: count ?? 0, page, limit });
  } catch (e) {
    console.error('modusign API 오류:', e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
