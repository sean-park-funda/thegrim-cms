import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { falGptImageEdit } from '@/lib/fal';
import { saveCharacterSheetFromBase64 } from '@/lib/api/characterSheets';

type Params = Promise<{ characterId: string }> | { characterId: string };

// 프롬프트 지시에 따라 캐릭터 외형을 변형한 새 시트 생성
export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { characterId } = await Promise.resolve(params);

  const body = await request.json().catch(() => null) as {
    sheetId: string;
    instruction: string;
  } | null;

  if (!body?.sheetId || !body?.instruction?.trim()) {
    return NextResponse.json({ error: 'sheetId와 instruction이 필요합니다.' }, { status: 400 });
  }

  const { data: sheet, error: sheetError } = await supabase
    .from('character_sheets')
    .select('id, file_path, file_name')
    .eq('id', body.sheetId)
    .eq('character_id', characterId)
    .single();

  if (sheetError || !sheet) {
    return NextResponse.json({ error: '시트를 찾을 수 없습니다.' }, { status: 404 });
  }

  const { data: character } = await supabase
    .from('characters')
    .select('name')
    .eq('id', characterId)
    .single();

  const imgRes = await fetch(sheet.file_path);
  if (!imgRes.ok) {
    return NextResponse.json({ error: '시트 이미지 다운로드 실패' }, { status: 500 });
  }
  const imgBuf = await imgRes.arrayBuffer();
  const mimeType = imgRes.headers.get('content-type') || 'image/png';
  const base64 = Buffer.from(imgBuf).toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const prompt = [
    'You are a professional manga/webtoon character designer.',
    '',
    'The provided image shows a manga/webtoon character.',
    '',
    `TASK: Apply the following transformation to this character: "${body.instruction.trim()}"`,
    '',
    'RULES:',
    '- Apply ONLY the requested change(s). Keep everything else identical.',
    '- Preserve the character\'s core identity: art style, line weight, shading, color palette, clothing (unless changing clothes is requested)',
    '- Maintain the same pose and background',
    '- The result must clearly look like the same character with the specific modification applied',
    '- Manga/webtoon art style must be preserved throughout',
  ].join('\n');

  let result;
  try {
    result = await falGptImageEdit({ prompt, imageUrls: [dataUrl] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const charName = character?.name ?? 'character';
  const newSheet = await saveCharacterSheetFromBase64(
    result.imageData,
    result.mimeType,
    characterId,
    `${charName}-transformed`,
    `변형: ${body.instruction.trim()}`
  ).catch(err => {
    throw new Error(`시트 저장 실패: ${err.message}`);
  });

  return NextResponse.json(newSheet, { status: 201 });
}
