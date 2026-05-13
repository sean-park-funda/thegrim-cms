import { NextRequest, NextResponse } from 'next/server';
import { falGptImageEditQueue } from '@/lib/fal';

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

  try {
    const requestId = await falGptImageEditQueue({
      prompt,
      imageUrls: [imageUrl],
      size: { width: 1920, height: 1080 },
    });
    return NextResponse.json({ requestId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
