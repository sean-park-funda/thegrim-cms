import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { falGptImageEditQueue, falQueueStatus, falQueueResult } from '@/lib/fal';
import { saveCharacterSheetFromBase64 } from '@/lib/api/characterSheets';

type Params = Promise<{ characterId: string }> | { characterId: string };

// POST: 큐에 작업 제출 → requestId 즉시 반환
export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { characterId } = await Promise.resolve(params);

  const body = await request.json().catch(() => null) as {
    sheetId: string;
    instruction?: string;
  } | null;

  if (!body?.sheetId) {
    return NextResponse.json({ error: 'sheetId가 필요합니다.' }, { status: 400 });
  }

  const { data: sheet, error: sheetError } = await supabase
    .from('character_sheets')
    .select('id, file_path')
    .eq('id', body.sheetId)
    .eq('character_id', characterId)
    .single();

  if (sheetError || !sheet) {
    return NextResponse.json({ error: '시트를 찾을 수 없습니다.' }, { status: 404 });
  }

  const imgRes = await fetch(sheet.file_path);
  if (!imgRes.ok) return NextResponse.json({ error: '이미지 다운로드 실패' }, { status: 500 });
  const mimeType = imgRes.headers.get('content-type') || 'image/png';
  const base64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64');

  const prompt = [
    'You are a professional manga/webtoon character designer.',
    'The provided image shows a manga/webtoon character wearing a detailed or complex outfit.',
    'TASK: Create a SIMPLIFIED BASE VERSION of this character.',
    'KEEP EXACTLY THE SAME: Face (eyes, nose, mouth, expression), Hair (color, style, all details), Body (proportions, pose, skin tone), Art style.',
    'SIMPLIFY / REMOVE: Replace all clothing with a simple plain outfit (e.g. plain white t-shirt and simple pants). Remove all accessories, jewelry, belts, hats, weapons, props. Remove complex patterns and decorations.',
    'RESULT: The character should look like a "base model" ready for new outfits — clean, uncluttered, identity preserved only through face and hair.',
    'White or very light neutral background.',
  ].concat(body.instruction?.trim() ? [`ADDITIONAL NOTE: ${body.instruction.trim()}`] : []).join('\n');

  let requestId: string;
  try {
    requestId = await falGptImageEditQueue({
      prompt,
      imageUrls: [`data:${mimeType};base64,${base64}`],
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  return NextResponse.json({ requestId });
}

// GET: 상태 폴링 + COMPLETED 시 저장 후 시트 반환
export async function GET(request: NextRequest, { params }: { params: Params }) {
  const { characterId } = await Promise.resolve(params);
  const requestId = request.nextUrl.searchParams.get('requestId');

  if (!requestId) return NextResponse.json({ error: 'requestId 필요' }, { status: 400 });

  const status = await falQueueStatus(requestId).catch(err =>
    NextResponse.json({ error: String(err) }, { status: 500 })
  );
  if (status instanceof NextResponse) return status;

  if (status === 'FAILED') {
    return NextResponse.json({ done: false, status: 'FAILED', error: '작업 실패' });
  }

  if (status !== 'COMPLETED') {
    return NextResponse.json({ done: false, status });
  }

  // COMPLETED — 결과 저장
  const result = await falQueueResult(requestId).catch(err =>
    NextResponse.json({ error: String(err) }, { status: 500 })
  );
  if (result instanceof NextResponse) return result;

  const { data: character } = await supabase
    .from('characters')
    .select('name')
    .eq('id', characterId)
    .single();

  const newSheet = await saveCharacterSheetFromBase64(
    result.imageData,
    result.mimeType,
    characterId,
    `${character?.name ?? 'character'}-simplified`,
    '기본형 — 얼굴/신체만 유지, 의상 단순화'
  );

  return NextResponse.json({ done: true, sheet: newSheet });
}
