import { NextRequest, NextResponse } from 'next/server';

const FAL_KEY = process.env.FAL_KEY;
const FAL_BASE = 'https://queue.fal.run/fal-ai/openai/gpt-image-2';

export async function GET(request: NextRequest) {
  if (!FAL_KEY) {
    return NextResponse.json({ error: 'FAL_KEY가 설정되지 않았습니다.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const requestId = searchParams.get('requestId');

  if (!requestId) {
    return NextResponse.json({ error: 'requestId가 필요합니다.' }, { status: 400 });
  }

  // 상태 조회
  let statusRes: Response;
  try {
    statusRes = await fetch(`${FAL_BASE}/requests/${requestId}/status`, {
      headers: { 'Authorization': `Key ${FAL_KEY}` },
    });
  } catch (err) {
    console.error('[compose-status] 네트워크 오류:', err);
    return NextResponse.json({ error: 'fal.ai 서버에 연결할 수 없습니다.' }, { status: 503 });
  }

  if (!statusRes.ok) {
    const errorText = await statusRes.text();
    console.error('[compose-status] 상태 조회 실패:', statusRes.status, errorText);
    return NextResponse.json({ error: `상태 조회 실패 (${statusRes.status})` }, { status: 500 });
  }

  const statusData = await statusRes.json();
  const status: string = statusData.status;

  console.log('[compose-status] 상태:', status, '큐 위치:', statusData.queue_position);

  if (status === 'COMPLETED') {
    // 결과 가져오기
    let resultRes: Response;
    try {
      resultRes = await fetch(`${FAL_BASE}/requests/${requestId}`, {
        headers: { 'Authorization': `Key ${FAL_KEY}` },
      });
    } catch (err) {
      console.error('[compose-status] 결과 fetch 오류:', err);
      return NextResponse.json({ error: '결과를 가져올 수 없습니다.' }, { status: 503 });
    }

    if (!resultRes.ok) {
      const errorText = await resultRes.text();
      console.error('[compose-status] 결과 조회 실패:', resultRes.status, errorText);
      return NextResponse.json({ error: '결과 조회 실패' }, { status: 500 });
    }

    const resultData = await resultRes.json();
    const imageUrl: string | undefined = resultData.images?.[0]?.url;

    if (!imageUrl) {
      console.error('[compose-status] 결과에 이미지 URL 없음:', resultData);
      return NextResponse.json({ status: 'FAILED', error: '이미지 URL을 가져올 수 없습니다.' });
    }

    // fal.ai 이미지를 base64로 변환 (임시 URL이므로 즉시 다운로드)
    let imageRes: Response;
    try {
      imageRes = await fetch(imageUrl);
    } catch (err) {
      console.error('[compose-status] 이미지 다운로드 오류:', err);
      return NextResponse.json({ error: '이미지를 다운로드할 수 없습니다.' }, { status: 503 });
    }

    const imageBuffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString('base64');
    const mimeType = imageRes.headers.get('content-type') || 'image/png';

    console.log('[compose-status] 완료, 이미지 크기:', imageBuffer.byteLength, 'bytes');

    return NextResponse.json({
      status: 'COMPLETED',
      imageData: base64,
      mimeType,
    });
  }

  if (status === 'FAILED') {
    const errorMsg = statusData.error?.message || statusData.detail || '생성 실패';
    console.error('[compose-status] 생성 실패:', errorMsg);
    return NextResponse.json({ status: 'FAILED', error: errorMsg });
  }

  // IN_QUEUE or IN_PROGRESS
  return NextResponse.json({
    status,
    queuePosition: statusData.queue_position ?? null,
  });
}
