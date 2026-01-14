import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// GET /api/free-creation/sessions - 세션 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const webtoonId = searchParams.get('webtoonId');
    const userId = searchParams.get('userId'); // 선택적 - 없으면 전체 조회
    const includeStats = searchParams.get('includeStats') === 'true';

    if (!webtoonId) {
      return NextResponse.json(
        { error: 'webtoonId가 필요합니다.' },
        { status: 400 }
      );
    }

    // 세션 조회 (userId가 있으면 필터링, 없으면 전체)
    let query = supabase
      .from('free_creation_sessions')
      .select('*')
      .eq('webtoon_id', webtoonId);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: sessions, error } = await query
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[자유창작 세션] 조회 실패:', error);
      return NextResponse.json(
        { error: '세션 목록 조회에 실패했습니다.' },
        { status: 500 }
      );
    }

    if (!includeStats || !sessions || sessions.length === 0) {
      return NextResponse.json({ sessions: sessions || [] });
    }

    // 통계 정보 포함
    const sessionsWithStats = await Promise.all(
      (sessions || []).map(async (session) => {
        // 작성자 정보 조회
        const { data: owner } = await supabase
          .from('user_profiles')
          .select('id, name')
          .eq('id', session.user_id)
          .single();

        // 메시지 개수 조회
        const { count: messageCount } = await supabase
          .from('free_creation_messages')
          .select('*', { count: 'exact', head: true })
          .eq('session_id', session.id);

        // 최근 생성된 이미지 썸네일 조회 (최대 3개)
        const { data: recentMessages } = await supabase
          .from('free_creation_messages')
          .select(`
            generated_file_id,
            generated_file:files!generated_file_id (
              id,
              thumbnail_path,
              file_path
            )
          `)
          .eq('session_id', session.id)
          .not('generated_file_id', 'is', null)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(3);

        const thumbnails = (recentMessages || [])
          .map((msg: any) => {
            const file = msg.generated_file;
            if (!file) return null;
            return file.thumbnail_path || file.file_path;
          })
          .filter(Boolean) as string[];

        return {
          ...session,
          owner_name: owner?.name || '알 수 없음',
          message_count: messageCount || 0,
          latest_thumbnails: thumbnails,
        };
      })
    );

    return NextResponse.json({ sessions: sessionsWithStats });
  } catch (error) {
    console.error('[자유창작 세션] 예외 발생:', error);
    return NextResponse.json(
      { error: '세션 목록 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST /api/free-creation/sessions - 세션 생성
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { webtoonId, userId, title } = body;

    if (!webtoonId || !userId) {
      return NextResponse.json(
        { error: 'webtoonId와 userId가 필요합니다.' },
        { status: 400 }
      );
    }

    const { data: session, error } = await supabase
      .from('free_creation_sessions')
      .insert({
        webtoon_id: webtoonId,
        user_id: userId,
        title: title || '새 세션',
      })
      .select()
      .single();

    if (error) {
      console.error('[자유창작 세션] 생성 실패:', error);
      return NextResponse.json(
        { error: '세션 생성에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error('[자유창작 세션] 예외 발생:', error);
    return NextResponse.json(
      { error: '세션 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
