import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { falGptImageEdit } from '@/lib/fal';
import { saveCharacterSheetFromBase64 } from '@/lib/api/characterSheets';

type Params = Promise<{ characterId: string }> | { characterId: string };

// 캐릭터 시트에서 옷/장신구를 단순화한 기본형 시트 생성
export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { characterId } = await Promise.resolve(params);

  const body = await request.json().catch(() => null) as {
    sheetId: string;
    instruction?: string;
  } | null;

  if (!body?.sheetId) {
    return NextResponse.json({ error: 'sheetId가 필요합니다.' }, { status: 400 });
  }

  // 시트 조회
  const { data: sheet, error: sheetError } = await supabase
    .from('character_sheets')
    .select('id, file_path, file_name')
    .eq('id', body.sheetId)
    .eq('character_id', characterId)
    .single();

  if (sheetError || !sheet) {
    return NextResponse.json({ error: '시트를 찾을 수 없습니다.' }, { status: 404 });
  }

  // 캐릭터 이름 조회
  const { data: character } = await supabase
    .from('characters')
    .select('name')
    .eq('id', characterId)
    .single();

  // 시트 이미지 다운로드 → base64
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
    'The provided image shows a manga/webtoon character wearing a detailed or complex outfit.',
    '',
    'TASK: Create a SIMPLIFIED BASE VERSION of this character.',
    '',
    'KEEP EXACTLY THE SAME:',
    '- Face: eyes, nose, mouth, facial features, expression, face shape',
    '- Hair: color, style, length, all hair details',
    '- Body: proportions, pose, skin tone',
    '- Art style: line weight, shading style, overall manga/webtoon aesthetic',
    '',
    'SIMPLIFY / REMOVE:',
    '- Replace all clothing with a simple, plain outfit (e.g. plain white t-shirt and simple pants, or a plain onepiece)',
    '- Remove all accessories: jewelry, belts, scarves, hats, gloves, bags',
    '- Remove all weapons, props, and held objects',
    '- Remove complex patterns, logos, decorations from clothing',
    '- Simplify layered or bulky outfits into a single clean garment',
    '',
    'RESULT: The character should look like a "base model" ready for new outfits to be applied — clean, uncluttered, with identity preserved only through face and hair.',
    '',
    'White or very light neutral background.',
  ].concat(
    body.instruction?.trim() ? ['', `ADDITIONAL NOTE: ${body.instruction.trim()}`] : []
  ).join('\n');

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
    `${charName}-simplified`,
    '기본형 — 얼굴/신체만 유지, 의상 단순화'
  ).catch(err => {
    throw new Error(`시트 저장 실패: ${err.message}`);
  });

  return NextResponse.json(newSheet, { status: 201 });
}
