import { NextRequest, NextResponse } from 'next/server';

const FAL_KEY = process.env.FAL_KEY;
const FAL_QUEUE_URL = 'https://queue.fal.run/fal-ai/openai/gpt-image-2/edit';

export interface ReferenceImage {
  base64: string;
  mimeType: string;
  instruction?: string;
}

interface ComposeRequest {
  baseSheetUrl: string;       // Supabase public URL for base sheet
  outfitImages: ReferenceImage[];
  propImages: ReferenceImage[];
  globalInstruction?: string;
}

function buildComposePrompt(
  outfitImages: ReferenceImage[],
  propImages: ReferenceImage[],
  globalInstruction?: string
): string {
  const parts: string[] = [];

  parts.push('You are a professional manga character sheet artist.');
  parts.push('');
  parts.push('TASK: Edit Image 1 (base character sheet). Apply outfit and accessories from reference images.');
  parts.push('');
  parts.push('IMAGE MAPPING:');
  parts.push('- Image 1: Base character sheet — KEEP the layout (FRONT | 3/4 | SIDE | BACK + equipment panel), pose, face, hair, and ink style');

  let imageIndex = 2;
  for (const outfit of outfitImages) {
    parts.push(`- Image ${imageIndex}: Outfit — ${outfit.instruction || 'outfit reference'}`);
    imageIndex++;
  }
  for (const prop of propImages) {
    parts.push(`- Image ${imageIndex}: Accessory — ${prop.instruction || 'accessory reference'}`);
    imageIndex++;
  }

  parts.push('');
  parts.push('CHANGES TO APPLY:');
  for (const outfit of outfitImages) {
    if (outfit.instruction) parts.push(`- Outfit: ${outfit.instruction}`);
  }
  for (const prop of propImages) {
    if (prop.instruction) parts.push(`- Accessory: ${prop.instruction}`);
  }
  if (globalInstruction) {
    parts.push(`- Additional: ${globalInstruction}`);
  }

  parts.push('');
  parts.push('KEEP UNCHANGED:');
  parts.push('- Character sheet layout: FRONT | 3/4 | SIDE | BACK views + equipment detail panel');
  parts.push('- Character face, expression, body proportions');
  parts.push('- Black and white manga ink style');
  parts.push('- Apply changes consistently across all 4 views');
  parts.push('- Update equipment panel to reflect new items');

  return parts.join('\n');
}

export async function POST(request: NextRequest) {
  if (!FAL_KEY) {
    return NextResponse.json({ error: 'FAL_KEY가 설정되지 않았습니다.' }, { status: 500 });
  }

  let body: ComposeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 본문을 파싱할 수 없습니다.' }, { status: 400 });
  }

  const { baseSheetUrl, outfitImages = [], propImages = [] } = body;

  if (!baseSheetUrl) {
    return NextResponse.json({ error: '베이스 캐릭터시트가 필요합니다.' }, { status: 400 });
  }
  if (outfitImages.length + propImages.length === 0) {
    return NextResponse.json({ error: '의상 또는 소품 레퍼런스가 필요합니다.' }, { status: 400 });
  }
  if (outfitImages.length + propImages.length > 5) {
    return NextResponse.json({ error: '레퍼런스 이미지는 최대 5개까지 가능합니다.' }, { status: 400 });
  }

  // 베이스 시트는 public URL로, 레퍼런스는 data URL로
  const imageUrls: string[] = [
    baseSheetUrl,
    ...outfitImages.map(img => `data:${img.mimeType};base64,${img.base64}`),
    ...propImages.map(img => `data:${img.mimeType};base64,${img.base64}`),
  ];

  const prompt = buildComposePrompt(outfitImages, propImages, body.globalInstruction);

  console.log('[compose-character-sheet] fal.ai 큐 제출 시작, 이미지 수:', imageUrls.length);

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
        image_urls: imageUrls,
        image_size: { width: 1920, height: 1080 },
        quality: 'high',
        n: 1,
      }),
    });
  } catch (err) {
    console.error('[compose-character-sheet] fal.ai 네트워크 오류:', err);
    return NextResponse.json({ error: 'fal.ai 서버에 연결할 수 없습니다.' }, { status: 503 });
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[compose-character-sheet] fal.ai 오류:', response.status, errorText);
    return NextResponse.json(
      { error: `fal.ai 요청 실패 (${response.status}): ${errorText}` },
      { status: 500 }
    );
  }

  const data = await response.json();
  console.log('[compose-character-sheet] 큐 제출 완료, request_id:', data.request_id);

  return NextResponse.json({ requestId: data.request_id });
}
