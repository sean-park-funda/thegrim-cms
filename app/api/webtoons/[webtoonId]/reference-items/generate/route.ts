import { NextRequest, NextResponse } from 'next/server';
import { falGptImageEdit } from '@/lib/fal';

type Params = Promise<{ webtoonId: string }> | { webtoonId: string };

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { webtoonId } = await Promise.resolve(params);

  const body = await request.json().catch(() => null) as {
    referenceImageBase64: string;
    mimeType: string;
    characterSheetUrl?: string;     // 캐릭터 그림체 레퍼런스
    additionalInstruction?: string;
  } | null;

  if (!body?.referenceImageBase64) {
    return NextResponse.json({ error: '레퍼런스 이미지가 필요합니다.' }, { status: 400 });
  }

  // 캐릭터시트 다운로드 (스타일 레퍼런스)
  let sheetUrl: string | null = body.characterSheetUrl ?? null;

  // 프롬프트
  const hasSheet = !!sheetUrl;
  const promptLines = [
    'You are a professional webtoon/manga character designer.',
    '',
    hasSheet
      ? 'Image 1 is a reference photo of a clothing item or prop. Image 2 is a character sheet showing the target art style.'
      : 'Image 1 is a reference photo of a clothing item or prop.',
    '',
    'TASK: Convert the item from the reference photo into a clean webtoon/manga style illustration.',
    hasSheet
      ? '- MATCH the line art style, coloring, and aesthetic shown in Image 2 (character sheet)'
      : '- Use clean manga/webtoon style: bold outlines, flat cell-shading',
    '- Isolate the item on a plain white background',
    '- Preserve key design features: shape, color scheme, distinctive details',
    '- Remove photographic realism — output must be a 2D manga illustration',
  ];

  if (body.additionalInstruction?.trim()) {
    promptLines.push('');
    promptLines.push(`ADDITIONAL: ${body.additionalInstruction.trim()}`);
  }

  const prompt = promptLines.join('\n');

  // 이미지 URL 배열 (레퍼런스 사진 data URL + 캐릭터시트 URL)
  const imageUrls: string[] = [
    `data:${body.mimeType};base64,${body.referenceImageBase64}`,
  ];
  if (sheetUrl) imageUrls.push(sheetUrl);

  console.log(`[reference-items/generate] webtoonId=${webtoonId}, mimeType=${body.mimeType}, hasSheet=${hasSheet}, base64Len=${body.referenceImageBase64.length}`);

  try {
    const result = await falGptImageEdit({ prompt, imageUrls });
    console.log(`[reference-items/generate] 성공, mimeType=${result.mimeType}`);
    return NextResponse.json({ imageData: result.imageData, mimeType: result.mimeType });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[reference-items/generate] 실패:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
