import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canManageBudgets, canViewAccounting } from '@/lib/utils/permissions';

// GET /api/accounting/budgets - 예산 목록 조회
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

    // 예산 조회
    let query = supabase
      .from('webtoon_budgets')
      .select(`
        *,
        webtoon:webtoons(id, title, thumbnail_url)
      `)
      .order('start_date', { ascending: false });

    if (webtoonId) {
      query = query.eq('webtoon_id', webtoonId);
    }

    const { data: budgets, error } = await query;

    if (error) {
      console.error('예산 조회 오류:', error);
      return NextResponse.json({ error: '예산 조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ budgets });
  } catch (error) {
    console.error('예산 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// POST /api/accounting/budgets - 예산 생성
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
    if (!canManageBudgets(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    // 요청 본문 파싱
    const body = await request.json();
    const { webtoon_id, total_budget, start_date, end_date, description } = body;

    // 유효성 검사
    if (!webtoon_id || !total_budget || !start_date) {
      return NextResponse.json(
        { error: '웹툰, 예산, 시작일은 필수입니다.' },
        { status: 400 }
      );
    }

    if (total_budget < 0) {
      return NextResponse.json({ error: '예산은 0 이상이어야 합니다.' }, { status: 400 });
    }

    // 예산 생성
    const { data: budget, error } = await supabase
      .from('webtoon_budgets')
      .insert({
        webtoon_id,
        total_budget,
        start_date,
        end_date: end_date || null,
        description,
        created_by: user.id,
      })
      .select(`
        *,
        webtoon:webtoons(id, title, thumbnail_url)
      `)
      .single();

    if (error) {
      console.error('예산 생성 오류:', error);
      if (error.code === '23505') {
        // UNIQUE 제약 조건 위반
        return NextResponse.json(
          { error: '해당 웹툰의 동일한 시작일에 이미 예산이 존재합니다.' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: '예산 생성 실패' }, { status: 500 });
    }

    return NextResponse.json({ budget }, { status: 201 });
  } catch (error) {
    console.error('예산 생성 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
