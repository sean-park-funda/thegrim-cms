import { NextRequest, NextResponse } from 'next/server';
import type { ReferenceImage } from '@/lib/types/compose';
import { falGptImageEditQueue } from '@/lib/fal';

export type { ReferenceImage };

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

  try {
    const job = await falGptImageEditQueue({
      prompt,
      imageUrls,
      size: { width: 1920, height: 1080 },
    });
    return NextResponse.json(job);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
