import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: /api/episode-scripts?episodeId=...
// POST: /api/episode-scripts { episodeId, title?, content }
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const episodeId = searchParams.get('episodeId');

  if (!episodeId) {
    return NextResponse.json({ error: 'episodeId가 필요합니다.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('episode_scripts')
    .select('*, storyboards:episode_script_storyboards(*, images:episode_script_storyboard_images(*))')
    .eq('episode_id', episodeId)
    .order('order_index', { ascending: true });

  if (error) {
    console.error('[episode-scripts][GET] 조회 실패:', error);
    return NextResponse.json({ error: '스크립트 조회에 실패했습니다.' }, { status: 500 });
  }

  // character_analysis의 characterSheets 정보를 최신화
  if (data && data.length > 0) {
    // 1차: characterId 기반으로 모든 캐릭터 시트 한번에 조회
    const characterIds = new Set<string>();
    data.forEach((script: any) => {
      if (script.character_analysis?.characters) {
        script.character_analysis.characters.forEach((char: { characterId: string | null }) => {
          if (char.characterId) {
            characterIds.add(char.characterId);
          }
        });
      }
    });

    const characterIdsArray = Array.from(characterIds);
    const characterSheetsMap = new Map<string, any[]>();

    if (characterIdsArray.length > 0) {
      const { data: charactersData } = await supabase
        .from('characters')
        .select('id, character_sheets(id, file_path, thumbnail_path)')
        .in('id', characterIdsArray);

      if (charactersData) {
        charactersData.forEach((char: any) => {
          characterSheetsMap.set(char.id, char.character_sheets || []);
        });
      }
    }

    // 1차: characterId로 연결되는 캐릭터 시트 최신화
    data.forEach((script: any) => {
      if (script.character_analysis?.characters) {
        script.character_analysis.characters = script.character_analysis.characters.map((char: any) => {
          if (char.characterId && characterSheetsMap.has(char.characterId)) {
            return {
              ...char,
              characterSheets: characterSheetsMap.get(char.characterId),
              existsInDb: true,
            };
          }
          return char;
        });
      }
    });

    // 2차: 페이지 로드시 이름 기반 재매칭 (characterId가 비어 있는 캐릭터만)
    // - analyze-characters에서 저장한 character_analysis.webtoonId + name을 사용
    for (const script of data as any[]) {
      const analysis = script.character_analysis;
      if (!analysis?.characters || !analysis.webtoonId) continue;

      const webtoonId = analysis.webtoonId as string;

      for (const char of analysis.characters as any[]) {
        if (char.characterId || !char.name) continue;

        try {
          const { data: existingCharacter, error: charError } = await supabase
            .from('characters')
            .select('id, character_sheets(id, file_path, thumbnail_path)')
            .eq('webtoon_id', webtoonId)
            .ilike('name', (char.name as string).trim())
            .maybeSingle();

          if (charError) {
            console.error('[episode-scripts][GET] 이름 기반 캐릭터 재매칭 실패:', {
              scriptId: script.id,
              name: char.name,
              webtoonId,
              error: charError,
            });
            continue;
          }

          if (existingCharacter) {
            const sheets = Array.isArray(existingCharacter.character_sheets)
              ? existingCharacter.character_sheets
              : existingCharacter.character_sheets
              ? [existingCharacter.character_sheets]
              : [];

            char.characterId = existingCharacter.id;
            char.existsInDb = true;
            char.characterSheets = sheets;
          }
        } catch (e) {
          console.error('[episode-scripts][GET] 이름 기반 캐릭터 재매칭 중 예외 발생:', {
            scriptId: script.id,
            name: char.name,
            webtoonId,
            error: e,
          });
        }
      }
    }
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    episodeId?: string;
    title?: string;
    content?: string;
    createdBy?: string;
  } | null;

  const episodeId = body?.episodeId?.trim();
  const content = body?.content?.trim();
  const title = (body?.title ?? '').trim();
  const createdBy = body?.createdBy;

  if (!episodeId || !content) {
    return NextResponse.json({ error: 'episodeId와 content가 필요합니다.' }, { status: 400 });
  }

  // order_index 계산: 해당 에피소드에서 마지막 값 + 1
  const { data: lastOrder } = await supabase
    .from('episode_scripts')
    .select('order_index')
    .eq('episode_id', episodeId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (lastOrder?.order_index ?? -1) + 1;

  const { data, error } = await supabase
    .from('episode_scripts')
    .insert({
      episode_id: episodeId,
      title,
      content,
      order_index: nextOrder,
      created_by: createdBy ?? null,
    })
    .select('*, storyboards:episode_script_storyboards(*, images:episode_script_storyboard_images(*))')
    .single();

  if (error) {
    console.error('[episode-scripts][POST] 생성 실패:', error);
    return NextResponse.json({ error: '스크립트 생성에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

