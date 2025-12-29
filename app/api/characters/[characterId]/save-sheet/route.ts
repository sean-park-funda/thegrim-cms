import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { saveCharacterSheetFromBase64 } from '@/lib/api/characterSheets';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ characterId?: string }> | { characterId?: string } }
) {
  const resolvedParams = await Promise.resolve(params);
  const characterId = resolvedParams.characterId;
  const body = await request.json().catch(() => null) as {
    imageData: string;
    mimeType: string;
    fileName?: string;
    description?: string;
  } | null;

  if (!characterId) {
    console.error('[save-sheet][POST] characterId 누락', { params: resolvedParams });
    return NextResponse.json({ error: 'characterId가 필요합니다.' }, { status: 400 });
  }

  if (!body?.imageData || !body?.mimeType) {
    return NextResponse.json({ error: 'imageData와 mimeType이 필요합니다.' }, { status: 400 });
  }

  // 캐릭터 존재 확인
  const { data: character, error: characterError } = await supabase
    .from('characters')
    .select('id, name')
    .eq('id', characterId)
    .single();

  if (characterError || !character) {
    console.error('[save-sheet][POST] 캐릭터 조회 실패:', characterError);
    return NextResponse.json({ error: '캐릭터를 찾을 수 없습니다.' }, { status: 404 });
  }

  try {
    const sheet = await saveCharacterSheetFromBase64(
      body.imageData,
      body.mimeType,
      characterId,
      body.fileName || `${character.name}-generated`,
      body.description || 'AI로 생성된 캐릭터 이미지'
    );

    console.log('[save-sheet][POST] 캐릭터시트 저장 완료', { characterId, sheetId: sheet.id });

    return NextResponse.json({
      success: true,
      sheet: {
        id: sheet.id,
        file_path: sheet.file_path,
        thumbnail_path: sheet.thumbnail_path,
      },
    });
  } catch (error) {
    console.error('[save-sheet][POST] 캐릭터시트 저장 실패:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '캐릭터시트 저장에 실패했습니다.' },
      { status: 500 }
    );
  }
}









