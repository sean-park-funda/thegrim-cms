import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { falGptImageEdit } from '@/lib/fal';
import { v4 as uuidv4 } from 'uuid';

type Params = Promise<{ webtoonId: string }> | { webtoonId: string };

// 여러 기존 아이템을 레퍼런스로 새 요소 생성
export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { webtoonId } = await Promise.resolve(params);

  const body = await request.json().catch(() => null) as {
    referenceItemIds: string[];
    instruction: string;
    name: string;
    type: 'outfit' | 'prop';
    tags?: string[];
  } | null;

  if (!body?.referenceItemIds?.length || !body?.instruction?.trim() || !body?.name?.trim() || !body?.type) {
    return NextResponse.json({ error: 'referenceItemIds, instruction, name, type이 필요합니다.' }, { status: 400 });
  }
  if (body.referenceItemIds.length > 4) {
    return NextResponse.json({ error: '레퍼런스는 최대 4개까지 가능합니다.' }, { status: 400 });
  }

  const { data: refItems, error: fetchError } = await supabase
    .from('reference_items')
    .select('id, name, file_path, type')
    .in('id', body.referenceItemIds)
    .eq('webtoon_id', webtoonId);

  if (fetchError || !refItems?.length) {
    return NextResponse.json({ error: '레퍼런스 아이템을 찾을 수 없습니다.' }, { status: 404 });
  }

  const imageLines = refItems.map((item, i) => `- Image ${i + 1}: ${item.name}`).join('\n');
  const prompt = [
    'You are a professional costume designer and webtoon artist.',
    '',
    `TASK: Create a new clothing/accessory element illustration using the following reference images:`,
    imageLines,
    '',
    `CREATION INSTRUCTION: ${body.instruction}`,
    '',
    'OUTPUT REQUIREMENTS:',
    '- Single element on white/transparent background',
    '- Same black and white manga illustration style as the references',
    '- Clean line art matching the reference art style',
    '- No character body, only the clothing/accessory item itself',
  ].join('\n');

  let result;
  try {
    result = await falGptImageEdit({
      prompt,
      imageUrls: refItems.map(item => item.file_path),
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
      description: `레퍼런스: ${refItems.map(i => i.name).join(', ')}`,
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
