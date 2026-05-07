import { NextRequest, NextResponse } from 'next/server';

const FAL_KEY = process.env.FAL_KEY;
const FAL_QUEUE_URL = 'https://queue.fal.run/fal-ai/openai/gpt-image-2/edit';

interface RefineRequest {
  previousImageBase64: string;
  previousImageMimeType: string;
  refinementInstruction: string;
}

function buildRefinePrompt(instruction: string): string {
  return [
    'You are a professional manga character sheet artist.',
    '',
    `TASK: Edit Image 1 — ${instruction}`,
    '',
    'DO NOT CHANGE ANYTHING ELSE:',
    '- Keep all other elements exactly the same',
    '- Maintain character sheet layout (FRONT | 3/4 | SIDE | BACK + equipment panel)',
    '- Apply the change consistently across all 4 views',
    '- Black and white manga ink style',
  ].join('\n');
}

export async function POST(request: NextRequest) {
  if (!FAL_KEY) {
    return NextResponse.json({ error: 'FAL_KEY가 설정되지 않았습니다.' }, { status: 500 });
  }

  let body: RefineRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 본문을 파싱할 수 없습니다.' }, { status: 400 });
  }

  const { previousImageBase64, previousImageMimeType, refinementInstruction } = body;

  if (!previousImageBase64) {
    return NextResponse.json({ error: '이전 결과 이미지가 필요합니다.' }, { status: 400 });
  }
  if (!refinementInstruction?.trim()) {
    return NextResponse.json({ error: '수정 지시가 필요합니다.' }, { status: 400 });
  }

  const prompt = buildRefinePrompt(refinementInstruction);
  const imageUrl = `data:${previousImageMimeType || 'image/png'};base64,${previousImageBase64}`;

  console.log('[compose-refine] fal.ai 큐 제출 시작, 지시:', refinementInstruction);

  let response: Response;
  try {
    response = await fetch(FAL_QUEUE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        image_urls: [imageUrl],
        image_size: { width: 1920, height: 1080 },
        quality: 'high',
        n: 1,
      }),
    });
  } catch (err) {
    console.error('[compose-refine] fal.ai 네트워크 오류:', err);
    return NextResponse.json({ error: 'fal.ai 서버에 연결할 수 없습니다.' }, { status: 503 });
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[compose-refine] fal.ai 오류:', response.status, errorText);

    // 콘텐츠 필터 차단 감지
    if (response.status === 400 && errorText.includes('content')) {
      return NextResponse.json(
        { error: '콘텐츠 필터에 의해 차단되었습니다. 수정 지시를 변경해보세요.' },
        { status: 422 }
      );
    }

    return NextResponse.json(
      { error: `fal.ai 요청 실패 (${response.status}): ${errorText}` },
      { status: 500 }
    );
  }

  const data = await response.json();
  console.log('[compose-refine] 큐 제출 완료, request_id:', data.request_id);

  return NextResponse.json({ requestId: data.request_id });
}
