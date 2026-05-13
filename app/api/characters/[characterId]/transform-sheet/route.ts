import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { falGptImageEditQueue, falQueueStatus, falQueueResult } from '@/lib/fal';
import { saveCharacterSheetFromBase64 } from '@/lib/api/characterSheets';

type Params = Promise<{ characterId: string }> | { characterId: string };

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { characterId } = await Promise.resolve(params);
  const body = await request.json().catch(() => null) as { sheetId: string; instruction: string } | null;
  if (!body?.sheetId || !body?.instruction?.trim()) {
    return NextResponse.json({ error: 'sheetId와 instruction이 필요합니다.' }, { status: 400 });
  }

  const { data: sheet } = await supabase.from('character_sheets')
    .select('id, file_path').eq('id', body.sheetId).eq('character_id', characterId).single();
  if (!sheet) return NextResponse.json({ error: '시트를 찾을 수 없습니다.' }, { status: 404 });

  const imgRes = await fetch(sheet.file_path);
  if (!imgRes.ok) return NextResponse.json({ error: '이미지 다운로드 실패' }, { status: 500 });
  const mimeType = imgRes.headers.get('content-type') || 'image/png';
  const base64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64');

  const prompt = [
    'You are a professional manga/webtoon character designer.',
    'The provided image shows a manga/webtoon character.',
    `TASK: Apply the following transformation to this character: "${body.instruction.trim()}"`,
    'RULES: Apply ONLY the requested change(s). Keep everything else identical.',
    "Preserve the character's core identity: art style, line weight, shading, color palette, clothing (unless changing clothes is requested).",
    'Maintain the same pose and background. The result must clearly look like the same character with the specific modification applied.',
    'Manga/webtoon art style must be preserved throughout.',
  ].join('\n');

  try {
    const job = await falGptImageEditQueue({ prompt, imageUrls: [`data:${mimeType};base64,${base64}`] });
    return NextResponse.json(job);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const { characterId } = await Promise.resolve(params);
  const statusUrl = request.nextUrl.searchParams.get('statusUrl');
  const responseUrl = request.nextUrl.searchParams.get('responseUrl');
  const instruction = request.nextUrl.searchParams.get('instruction') ?? '';
  if (!statusUrl || !responseUrl) return NextResponse.json({ error: 'statusUrl, responseUrl 필요' }, { status: 400 });

  try {
    const status = await falQueueStatus(statusUrl);
    if (status === 'FAILED') return NextResponse.json({ done: false, status: 'FAILED', error: '작업 실패' });
    if (status !== 'COMPLETED') return NextResponse.json({ done: false, status });

    const result = await falQueueResult(responseUrl);
    const { data: character } = await supabase.from('characters').select('name').eq('id', characterId).single();
    const newSheet = await saveCharacterSheetFromBase64(
      result.imageData, result.mimeType, characterId,
      `${character?.name ?? 'character'}-transformed`, `변형: ${instruction}`
    );
    return NextResponse.json({ done: true, sheet: newSheet });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
