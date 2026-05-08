import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { falGptImageEdit } from '@/lib/fal';
import { v4 as uuidv4 } from 'uuid';

type Params = Promise<{ webtoonId: string; itemId: string }> | { webtoonId: string; itemId: string };

// 기존 아이템을 베이스로 수정본 생성 (색상/핏 변경 등)
// 결과는 새 reference_item으로 저장 (parent_id = 원본)
export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { webtoonId, itemId } = await Promise.resolve(params);

  const body = await request.json().catch(() => null) as {
    instruction: string;   // 예: "색상을 검정으로 변경, 핏을 타이트하게"
    newName?: string;
  } | null;

  if (!body?.instruction?.trim()) {
    return NextResponse.json({ error: '수정 지시가 필요합니다.' }, { status: 400 });
  }

  // 원본 아이템 조회
  const { data: item, error: fetchError } = await supabase
    .from('reference_items')
    .select('*')
    .eq('id', itemId)
    .eq('webtoon_id', webtoonId)
    .single();

  if (fetchError || !item) {
    return NextResponse.json({ error: '아이템을 찾을 수 없습니다.' }, { status: 404 });
  }

  const prompt = [
    'You are a professional costume designer.',
    '',
    `TASK: Edit Image 1 (clothing/accessory reference). ${body.instruction}`,
    '',
    'KEEP UNCHANGED:',
    '- Overall garment type and silhouette (unless explicitly asked to change)',
    '- Image composition and background',
    '- Drawing/illustration style',
  ].join('\n');

  const newName = body.newName || `${item.name} (수정본)`;

  let result;
  try {
    result = await falGptImageEdit({
      prompt,
      imageUrls: [item.file_path],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Supabase Storage에 저장
  const ext = result.mimeType.split('/')[1] || 'png';
  const storagePath = `reference-items/${webtoonId}/${uuidv4()}.${ext}`;
  const buffer = Buffer.from(result.imageData, 'base64');

  const { error: uploadError } = await supabase.storage
    .from('webtoon-files')
    .upload(storagePath, buffer, { contentType: result.mimeType, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: `스토리지 업로드 실패: ${uploadError.message}` }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from('webtoon-files').getPublicUrl(storagePath);

  // DB에 새 레코드 저장
  const { data: newItem, error: dbError } = await supabase
    .from('reference_items')
    .insert({
      webtoon_id: webtoonId,
      type: item.type,
      name: newName,
      file_path: urlData.publicUrl,
      storage_path: storagePath,
      file_size: buffer.length,
      parent_id: item.id,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: `DB 저장 실패: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json(newItem);
}
