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
    instruction: string;
  } | null;

  if (!body?.sheetId || !body?.instruction?.trim()) {
    return NextResponse.json({ error: 'sheetId와 instruction이 필요합니다.' }, { status: 400 });
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
    'The provided image shows a manga/webtoon character.',
    `TASK: Apply the following transformation to this character: "${body.instruction.trim()}"`,
    'RULES: Apply ONLY the requested change(s). Keep everything else identical.',
    'Preserve the character\'s core identity: art style, line weight, shading, color palette, clothing (unless changing clothes is requested).',
    'Maintain the same pose and background. The result must clearly look like the same character with the specific modification applied.',
    'Manga/webtoon art style must be preserved throughout.',
  ].join('\n');

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
  const instruction = request.nextUrl.searchParams.get('instruction') ?? '';

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
    `${character?.name ?? 'character'}-transformed`,
    `변형: ${instruction}`
  );

  return NextResponse.json({ done: true, sheet: newSheet });
}
