import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

// GET /api/free-creation/sessions/[sessionId]/recent-references - 최근 레퍼런스 조회
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // 최근 레퍼런스 목록 조회 (레퍼런스 파일 정보 포함)
    const { data: recentRefs, error } = await supabase
      .from('free_creation_recent_references')
      .select(`
        id,
        session_id,
        reference_file_id,
        used_at,
        reference_file:reference_files (
          id,
          file_name,
          file_path,
          thumbnail_path,
          file_type,
          mime_type,
          webtoon_id
        )
      `)
      .eq('session_id', sessionId)
      .order('used_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[자유창작 최근 레퍼런스] 조회 실패:', error);
      return NextResponse.json(
        { error: '최근 레퍼런스 조회에 실패했습니다.' },
        { status: 500 }
      );
    }

    // reference_file이 존재하는 항목만 필터링
    const validRefs = recentRefs?.filter(ref => ref.reference_file) || [];

    return NextResponse.json({ recentReferences: validRefs });
  } catch (error) {
    console.error('[자유창작 최근 레퍼런스] 예외 발생:', error);
    return NextResponse.json(
      { error: '최근 레퍼런스 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
