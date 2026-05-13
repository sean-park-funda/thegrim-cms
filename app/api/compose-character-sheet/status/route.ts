import { NextRequest, NextResponse } from 'next/server';
import { falQueueStatus, falQueueResult } from '@/lib/fal';

export async function GET(request: NextRequest) {
  const requestId = request.nextUrl.searchParams.get('requestId');
  if (!requestId) {
    return NextResponse.json({ error: 'requestId가 필요합니다.' }, { status: 400 });
  }

  try {
    const status = await falQueueStatus(requestId);

    if (status === 'FAILED') {
      return NextResponse.json({ status: 'FAILED', error: '생성 실패' });
    }

    if (status !== 'COMPLETED') {
      return NextResponse.json({ status });
    }

    // COMPLETED — 이미지 다운로드 후 반환
    const result = await falQueueResult(requestId);
    return NextResponse.json({ status: 'COMPLETED', imageData: result.imageData, mimeType: result.mimeType });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
