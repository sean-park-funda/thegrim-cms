import { NextRequest, NextResponse } from 'next/server';
import {
  processImageBatch,
  extractErrorDetails,
  type RegenerateImageBatchRequest,
} from '@/lib/image-generation/batch';

/**
 * 이미지 배치 재생성 API
 *
 * POST /api/regenerate-image-batch
 *
 * 요청 본문:
 * - fileId: string (필수) - 원본 이미지 파일 ID
 * - requests: Array<{ stylePrompt, index, apiProvider, styleId?, styleKey?, styleName? }> (필수)
 * - characterSheets?: Array<{ sheetId: string }> - 캐릭터시트 정보
 * - referenceFileId?: string - 레퍼런스 파일 ID (하위 호환성)
 * - referenceFileIds?: string[] - 레퍼런스 파일 ID 배열
 * - createdBy?: string - 생성자 ID
 *
 * 응답:
 * - images: Array<ProcessedImage> - 처리된 이미지 배열
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[이미지 재생성 배치] 배치 재생성 요청 시작');

  try {
    const body: RegenerateImageBatchRequest = await request.json();

    // 입력 검증
    if (!body.fileId) {
      return NextResponse.json(
        { error: 'fileId가 필요합니다.' },
        { status: 400 }
      );
    }

    if (!body.requests || body.requests.length === 0) {
      return NextResponse.json(
        { error: '생성 요청이 필요합니다.' },
        { status: 400 }
      );
    }

    // 배치 처리 실행
    const result = await processImageBatch(body);

    const totalTime = Date.now() - startTime;
    console.log('[이미지 재생성 배치] 배치 재생성 완료:', {
      totalTime: `${totalTime}ms`,
      totalRequests: body.requests.length,
      successCount: result.images.filter(r => !r.error).length,
      failCount: result.images.filter(r => !!r.error).length,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const totalTime = Date.now() - startTime;
    const errorDetails = extractErrorDetails(error);

    console.error('[이미지 재생성 배치] 예외 발생:', {
      error: errorDetails,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      totalTime: `${totalTime}ms`,
    });

    const errorMessage = error instanceof Error
      ? error.message
      : '이미지 재생성 중 오류가 발생했습니다.';

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
