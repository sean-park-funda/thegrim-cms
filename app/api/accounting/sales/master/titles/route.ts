import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/settlement/auth';
import { canViewSales, canManageTitleMaster } from '@/lib/utils/permissions';

// GET /api/accounting/sales/master/titles — 전체 작품 목록 조회
export async function GET(request: NextRequest) {
  try {
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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const isCustom = searchParams.get('is_custom');

    let query = auth.supabase
      .from('title_master')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (isCustom !== null && isCustom !== undefined) {
      query = query.eq('is_custom', isCustom === 'true');
    }

    const { data, error } = await query;
    if (error) {
      console.error('작품 목록 조회 오류:', error);
      return NextResponse.json({ error: '작품 목록 조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ titles: data || [] });
  } catch (error) {
    console.error('작품 목록 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

// POST /api/accounting/sales/master/titles — 커스텀 작품 등록
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedClient(request);
    if (!auth) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await auth.supabase
      .from('user_profiles')
      .select('role')
      .eq('id', auth.userId)
      .single();

    if (!profile || !canManageTitleMaster(profile.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await request.json();
    const {
      slug, title, titleUrl, teamLabel, status, creators, platform,
      serialType, dayOfWeek, startDate, endDate, nonExclusiveDate,
      episodeCount, ageRating, mainGenre, subGenre, keywords,
      element, logline, thumbnailUrl, globalInfo, secondaryBiz, notes,
      workId,
    } = body;

    if (!slug || !title || !startDate) {
      return NextResponse.json(
        { error: 'slug, title, startDate는 필수입니다.' },
        { status: 400 },
      );
    }

    const row = {
      slug,
      title,
      title_url: titleUrl || null,
      team_label: teamLabel || null,
      status: status || '준비중',
      creators: creators || [],
      platform: platform || '',
      serial_type: serialType || '기타',
      day_of_week: dayOfWeek || null,
      start_date: startDate,
      end_date: endDate || null,
      non_exclusive_date: nonExclusiveDate || null,
      episode_count: episodeCount ?? 0,
      age_rating: ageRating || '',
      main_genre: mainGenre || '',
      sub_genre: subGenre || null,
      keywords: keywords || [],
      element: element || '',
      logline: logline || '',
      thumbnail_url: thumbnailUrl || null,
      global_info: globalInfo || {},
      secondary_biz: secondaryBiz || [],
      notes: notes || '',
      work_id: workId || null,
      is_custom: true,
    };

    const { data, error } = await auth.supabase
      .from('title_master')
      .insert(row)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `slug '${slug}'가 이미 존재합니다.` },
          { status: 409 },
        );
      }
      console.error('작품 등록 오류:', error);
      return NextResponse.json({ error: '작품 등록 실패' }, { status: 500 });
    }

    return NextResponse.json({ title: data }, { status: 201 });
  } catch (error) {
    console.error('작품 등록 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
