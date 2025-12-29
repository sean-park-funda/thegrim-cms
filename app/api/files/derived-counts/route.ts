import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 서버 사이드에서 사용할 Supabase 클라이언트 (Service Role Key 사용)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileIds, currentUserId } = body as { fileIds: string[]; currentUserId?: string };

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ counts: {} });
    }

    // 파생 이미지 개수를 일괄 조회
    // source_file_id가 fileIds 중 하나인 파일들을 그룹화하여 개수 조회
    let query = supabase
      .from('files')
      .select('source_file_id')
      .in('source_file_id', fileIds);

    // 공개/비공개 필터링
    if (currentUserId) {
      query = query.or(`is_public.eq.true,created_by.eq.${currentUserId}`);
    } else {
      query = query.eq('is_public', true);
    }

    const { data: derivedFiles, error } = await query;

    if (error) {
      console.error('[파생 이미지 개수 일괄 조회] 실패:', error);
      return NextResponse.json({ counts: {} });
    }

    // 각 source_file_id 별 개수 집계
    const counts: Record<string, number> = {};
    if (derivedFiles) {
      for (const file of derivedFiles) {
        if (file.source_file_id) {
          counts[file.source_file_id] = (counts[file.source_file_id] || 0) + 1;
        }
      }
    }

    return NextResponse.json({ counts });
  } catch (error: unknown) {
    console.error('[파생 이미지 개수 일괄 조회] 예외:', error);
    return NextResponse.json({ counts: {} });
  }
}

