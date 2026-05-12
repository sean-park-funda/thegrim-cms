import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { falGptImageEdit } from '@/lib/fal';
import { v4 as uuidv4 } from 'uuid';

type Params = Promise<{ webtoonId: string }> | { webtoonId: string };

// 캐릭터 이미지에서 특정 의상 요소를 분리 추출 → 단독 요소 이미지로 저장
export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { webtoonId } = await Promise.resolve(params);

  const body = await request.json().catch(() => null) as {
    characterImageBase64: string;
    mimeType: string;
    extractTarget: string;     // 예: '상의', '하의', '부츠', '악세서리', '전체 의상'
    instruction?: string;
    name: string;
    type: 'outfit' | 'prop';
    tags?: string[];
  } | null;

  if (!body?.characterImageBase64 || !body?.extractTarget?.trim() || !body?.name?.trim() || !body?.type) {
    return NextResponse.json({ error: 'characterImageBase64, extractTarget, name, type이 필요합니다.' }, { status: 400 });
  }

  const prompt = [
    'You are a professional costume designer and manga illustrator.',
    '',
    'Image 1 shows a manga/webtoon character wearing a complex outfit.',
    '',
    `TASK: Extract and isolate ONLY the "${body.extractTarget}" from this character image.`,
    '',
    'OUTPUT REQUIREMENTS:',
    `- Show ONLY the ${body.extractTarget} as a standalone clothing/accessory illustration`,
    '- REMOVE: character body, face, hair, skin, and all other clothing items not being extracted',
    '- Plain white background — no character silhouette or shadow',
    '- Preserve ALL design details of the extracted item: texture, buttons, stitching, patterns',
    '- Maintain the same manga/webtoon line art style as the source image',
    '- If the item is layered or complex, simplify and clarify its structure',
    '- Single item, centered, full view showing the garment clearly',
  ].concat(
    body.instruction?.trim() ? ['', `ADDITIONAL: ${body.instruction.trim()}`] : []
  ).join('\n');

  let result;
  try {
    result = await falGptImageEdit({
      prompt,
      imageUrls: [`data:${body.mimeType};base64,${body.characterImageBase64}`],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const ext = result.mimeType.split('/')[1] || 'png';
  const newId = uuidv4();
  const storagePath = `reference-items/${webtoonId}/${newId}.${ext}`;
  const buffer = Buffer.from(result.imageData, 'base64');

  const { error: uploadError } = await supabase.storage
    .from('webtoon-files')
    .upload(storagePath, buffer, { contentType: result.mimeType, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: `스토리지 업로드 실패: ${uploadError.message}` }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from('webtoon-files').getPublicUrl(storagePath);

  const { data: newItem, error: dbError } = await supabase
    .from('reference_items')
    .insert({
      id: newId,
      webtoon_id: webtoonId,
      type: body.type,
      name: body.name,
      description: `캐릭터 이미지에서 추출: ${body.extractTarget}`,
      tags: body.tags || [],
      file_path: urlData.publicUrl,
      storage_path: storagePath,
      file_size: buffer.length,
    })
    .select()
    .single();

  if (dbError) {
    await supabase.storage.from('webtoon-files').remove([storagePath]);
    return NextResponse.json({ error: `DB 저장 실패: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json(newItem, { status: 201 });
}
