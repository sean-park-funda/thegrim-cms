import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canManageAccountingCategories } from '@/lib/utils/permissions';

// GET /api/accounting/categories - 카테고리 목록 조회
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

    // 카테고리 조회
    const { data: categories, error } = await supabase
      .from('accounting_categories')
      .select('*')
      .order('type', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('카테고리 조회 오류:', error);
      return NextResponse.json({ error: '카테고리 조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ categories });
  } catch (error) {
    console.error('카테고리 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// POST /api/accounting/categories - 카테고리 생성
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
    if (!canManageAccountingCategories(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    // 요청 본문 파싱
    const body = await request.json();
    const { name, type, description, color } = body;

    // 유효성 검사
    if (!name || !type) {
      return NextResponse.json({ error: '이름과 타입은 필수입니다.' }, { status: 400 });
    }

    if (!['income', 'expense'].includes(type)) {
      return NextResponse.json({ error: '타입은 income 또는 expense여야 합니다.' }, { status: 400 });
    }

    // 카테고리 생성
    const { data: category, error } = await supabase
      .from('accounting_categories')
      .insert({
        name,
        type,
        description,
        color: color || '#3B82F6',
      })
      .select()
      .single();

    if (error) {
      console.error('카테고리 생성 오류:', error);
      if (error.code === '23505') {
        // UNIQUE 제약 조건 위반
        return NextResponse.json({ error: '이미 존재하는 카테고리 이름입니다.' }, { status: 409 });
      }
      return NextResponse.json({ error: '카테고리 생성 실패' }, { status: 500 });
    }

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    console.error('카테고리 생성 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
