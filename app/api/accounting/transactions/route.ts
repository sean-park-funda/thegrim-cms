import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canManageAccounting, canViewAccounting } from '@/lib/utils/permissions';

// GET /api/accounting/transactions - 거래 내역 목록 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 사용자 인증 확인
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // 사용자 프로필 조회
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: '사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 권한 확인
    if (!canViewAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    // 쿼리 파라미터 파싱
    const { searchParams } = new URL(request.url);
    const webtoonId = searchParams.get('webtoonId');
    const type = searchParams.get('type');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // 거래 내역 조회 (카테고리, 웹툰, 생성자 정보 포함)
    let query = supabase
      .from('accounting_transactions')
      .select(`
        *,
        category:accounting_categories(*),
        webtoon:webtoons(id, title),
        creator:created_by(id, name, email)
      `)
      .order('transaction_date', { ascending: false });

    // 필터 적용
    if (webtoonId) {
      query = query.eq('webtoon_id', webtoonId);
    }
    if (type) {
      query = query.eq('type', type);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (startDate) {
      query = query.gte('transaction_date', startDate);
    }
    if (endDate) {
      query = query.lte('transaction_date', endDate);
    }

    const { data: transactions, error } = await query;

    if (error) {
      console.error('거래 내역 조회 오류:', error);
      return NextResponse.json({ error: '거래 내역 조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ transactions });
  } catch (error) {
    console.error('거래 내역 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// POST /api/accounting/transactions - 거래 내역 생성
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 사용자 인증 확인
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // 사용자 프로필 조회
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: '사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 권한 확인
    if (!canManageAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    // 요청 본문 파싱
    const body = await request.json();
    const {
      webtoon_id,
      category_id,
      type,
      amount,
      transaction_date,
      description,
      note,
      receipt_file_path,
      receipt_storage_path,
    } = body;

    // 유효성 검사
    if (!category_id || !type || !amount || !transaction_date) {
      return NextResponse.json(
        { error: '카테고리, 타입, 금액, 날짜는 필수입니다.' },
        { status: 400 }
      );
    }

    if (!['income', 'expense'].includes(type)) {
      return NextResponse.json({ error: '타입은 income 또는 expense여야 합니다.' }, { status: 400 });
    }

    if (amount < 0) {
      return NextResponse.json({ error: '금액은 0 이상이어야 합니다.' }, { status: 400 });
    }

    // 거래 내역 생성
    const { data: transaction, error } = await supabase
      .from('accounting_transactions')
      .insert({
        webtoon_id: webtoon_id || null,
        category_id,
        type,
        amount,
        transaction_date,
        description,
        note,
        receipt_file_path,
        receipt_storage_path,
        created_by: user.id,
        status: 'pending',
      })
      .select(`
        *,
        category:accounting_categories(*),
        webtoon:webtoons(id, title)
      `)
      .single();

    if (error) {
      console.error('거래 내역 생성 오류:', error);
      return NextResponse.json({ error: '거래 내역 생성 실패' }, { status: 500 });
    }

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    console.error('거래 내역 생성 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
