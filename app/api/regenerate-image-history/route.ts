import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface GetRegenerateImageHistoryRequest {
  sourceFileId?: string; // 원본 파일 ID (선택적)
  userId?: string; // 사용자 ID (선택적)
  limit?: number; // 최대 개수 (기본값: 50)
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('[이미지 재생성 히스토리] 히스토리 조회 시작');

  try {
    const { searchParams } = new URL(request.url);
    const sourceFileId = searchParams.get('sourceFileId') || undefined;
    const userId = searchParams.get('userId') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    
    console.log('[이미지 재생성 히스토리] 임시 파일 목록 조회 시작:', {
      sourceFileId,
      userId,
      limit,
    });

    // DB에서 is_temp = true인 파일만 조회
    let query = supabase
      .from('files')
      .select('*')
      .eq('is_temp', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    // 필터링 옵션
    if (sourceFileId) {
      query = query.eq('source_file_id', sourceFileId);
    }

    if (userId) {
      query = query.eq('created_by', userId);
    }

    const { data: files, error: dbError } = await query;

    if (dbError) {
      console.error('[이미지 재생성 히스토리] DB 조회 실패:', dbError);
      return NextResponse.json(
        { error: '임시 파일 목록을 조회할 수 없습니다.' },
        { status: 500 }
      );
    }

    if (!files || files.length === 0) {
      console.log('[이미지 재생성 히스토리] 임시 파일 없음');
      return NextResponse.json({
        history: [],
      });
    }

    // 응답 형식 변환
    const historyItems = files.map(file => ({
      fileId: file.id,
      filePath: file.storage_path,
      fileUrl: file.file_path,
      createdAt: file.created_at,
      mimeType: file.mime_type || 'image/png',
      prompt: file.prompt || '',
      sourceFileId: file.source_file_id,
    }));

    const totalTime = Date.now() - startTime;
    console.log('[이미지 재생성 히스토리] 히스토리 조회 완료:', {
      totalItems: historyItems.length,
      totalTime: `${totalTime}ms`,
    });

    return NextResponse.json({
      history: historyItems,
    });
  } catch (error: unknown) {
    const totalTime = Date.now() - startTime;
    console.error('[이미지 재생성 히스토리] 예외 발생:', {
      error,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      totalTime: `${totalTime}ms`,
    });
    const errorMessage = error instanceof Error ? error.message : '히스토리 조회 중 오류가 발생했습니다.';
    return NextResponse.json(
      {
        error: errorMessage,
        details: {
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        },
      },
      { status: 500 }
    );
  }
}

