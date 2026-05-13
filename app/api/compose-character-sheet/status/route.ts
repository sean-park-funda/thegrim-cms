import { NextRequest, NextResponse } from 'next/server';
import { falQueueStatus, falQueueResult } from '@/lib/fal';

export async function GET(request: NextRequest) {
  const statusUrl = request.nextUrl.searchParams.get('statusUrl');
  const responseUrl = request.nextUrl.searchParams.get('responseUrl');

  if (!statusUrl || !responseUrl) {
    return NextResponse.json({ error: 'statusUrl, responseUrl이 필요합니다.' }, { status: 400 });
  }

  try {
    const status = await falQueueStatus(statusUrl);

    if (status === 'FAILED') {
      return NextResponse.json({ status: 'FAILED', error: '생성 실패' });
    }
    if (status !== 'COMPLETED') {
      return NextResponse.json({ status });
    }

    const result = await falQueueResult(responseUrl);
    return NextResponse.json({ status: 'COMPLETED', imageData: result.imageData, mimeType: result.mimeType });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
