import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { canViewSales, canManageAccounting } from '@/lib/utils/permissions';

type Params = { params: Promise<{ slug: string }> };

// GET /api/accounting/sales/master/titles/[slug] — 작품 상세 조회
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { slug } = await params;
    const auth = await getAuthenticatedClient(request);
    if (!auth) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await auth.supabase
      .from('user_profiles')
      .select('role')
      .eq('id', auth.userId)
      .single();

    if (!profile || !canViewSales(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { data, error } = await auth.supabase
      .from('title_master')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: '작품을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ title: data });
  } catch (error) {
    console.error('작품 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// PUT /api/accounting/sales/master/titles/[slug] — 작품 수정
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { slug } = await params;
    const auth = await getAuthenticatedClient(request);
    if (!auth) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await auth.supabase
      .from('user_profiles')
      .select('role')
      .eq('id', auth.userId)
      .single();

    if (!profile || !canManageAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await request.json();

    const updateFields: Record<string, unknown> = {};
    const fieldMap: Record<string, string> = {
      title: 'title',
      titleUrl: 'title_url',
      teamLabel: 'team_label',
      status: 'status',
      creators: 'creators',
      platform: 'platform',
      serialType: 'serial_type',
      dayOfWeek: 'day_of_week',
      startDate: 'start_date',
      endDate: 'end_date',
      nonExclusiveDate: 'non_exclusive_date',
      episodeCount: 'episode_count',
      ageRating: 'age_rating',
      mainGenre: 'main_genre',
      subGenre: 'sub_genre',
      keywords: 'keywords',
      element: 'element',
      logline: 'logline',
      thumbnailUrl: 'thumbnail_url',
      globalInfo: 'global_info',
      secondaryBiz: 'secondary_biz',
      notes: 'notes',
      workId: 'work_id',
    };

    for (const [camel, snake] of Object.entries(fieldMap)) {
      if (camel in body) {
        updateFields[snake] = body[camel];
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ error: '수정할 필드가 없습니다.' }, { status: 400 });
    }

    const { data, error } = await auth.supabase
      .from('title_master')
      .update(updateFields)
      .eq('slug', slug)
      .select()
      .single();

    if (error) {
      console.error('작품 수정 오류:', error);
      return NextResponse.json({ error: '작품 수정 실패' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: '작품을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ title: data });
  } catch (error) {
    console.error('작품 수정 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// DELETE /api/accounting/sales/master/titles/[slug] — 작품 삭제
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { slug } = await params;
    const auth = await getAuthenticatedClient(request);
    if (!auth) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await auth.supabase
      .from('user_profiles')
      .select('role')
      .eq('id', auth.userId)
      .single();

    if (!profile || !canManageAccounting(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { data, error } = await auth.supabase
      .from('title_master')
      .delete()
      .eq('slug', slug)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: '작품을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, slug });
  } catch (error) {
    console.error('작품 삭제 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
