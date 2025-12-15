import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: /api/episode-scripts?episodeId=...
// POST: /api/episode-scripts { episodeId, title?, content }
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const episodeId = searchParams.get('episodeId');

  if (!episodeId) {
    return NextResponse.json({ error: 'episodeId가 필요합니다.' }, { status: 400 });
  }

  // 인증은 RLS(Row Level Security) 정책에 의해 처리됨
  console.log('[episode-scripts][GET] 요청 시작:', { episodeId, timestamp: new Date().toISOString() });
  const queryStartTime = Date.now();

  const { data, error } = await supabase
    .from('episode_scripts')
    .select('*, storyboards:episode_script_storyboards(*, images:episode_script_storyboard_images(*))')
    .eq('episode_id', episodeId)
    .order('order_index', { ascending: true });

  const queryTime = Date.now() - queryStartTime;
  console.log('[episode-scripts][GET] 쿼리 완료:', {
    episodeId,
    queryTime: `${queryTime}ms`,
    scriptsCount: data?.length || 0,
    storyboardsCount: data?.reduce((sum: number, s: any) => sum + (s.storyboards?.length || 0), 0) || 0,
    imagesCount: data?.reduce((sum: number, s: any) => 
      sum + (s.storyboards?.reduce((sbSum: number, sb: any) => sbSum + (sb.images?.length || 0), 0) || 0), 0) || 0,
  });

  if (error) {
    console.error('[episode-scripts][GET] 조회 실패:', error);
    return NextResponse.json({ error: '스크립트 조회에 실패했습니다.' }, { status: 500 });
  }

  // character_analysis의 characterSheets 정보를 최신화
  if (data && data.length > 0) {
    const characterSheetsStartTime = Date.now();
    
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
      const charQueryStartTime = Date.now();
      const { data: charactersData } = await supabase
        .from('characters')
        .select('id, character_sheets(id, file_path, thumbnail_path)')
        .in('id', characterIdsArray);

      const charQueryTime = Date.now() - charQueryStartTime;
      console.log('[episode-scripts][GET] 캐릭터 시트 조회 완료:', {
        characterIdsCount: characterIdsArray.length,
        queryTime: `${charQueryTime}ms`,
      });

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
    const nameMatchingStartTime = Date.now();
    const charactersToMatch: Array<{ scriptId: string; webtoonId: string; name: string; char: any }> = [];
    
    // 먼저 매칭이 필요한 캐릭터들을 수집
    for (const script of data as any[]) {
      const analysis = script.character_analysis;
      if (!analysis?.characters || !analysis.webtoonId) continue;

      const webtoonId = analysis.webtoonId as string;

      for (const char of analysis.characters as any[]) {
        if (char.characterId || !char.name) continue;
        charactersToMatch.push({ scriptId: script.id, webtoonId, name: char.name.trim(), char });
      }
    }

    // 웹toonId별로 그룹화하여 배치 조회
    const webtoonGroups = new Map<string, Array<{ name: string; char: any }>>();
    charactersToMatch.forEach(({ webtoonId, name, char }) => {
      if (!webtoonGroups.has(webtoonId)) {
        webtoonGroups.set(webtoonId, []);
      }
      webtoonGroups.get(webtoonId)!.push({ name, char });
    });

    // 각 웹툰별로 배치 조회
    for (const [webtoonId, chars] of webtoonGroups.entries()) {
      const names = chars.map(c => c.name);
      if (names.length === 0) continue;

      try {
        const batchQueryStartTime = Date.now();
        const { data: existingCharacters, error: charError } = await supabase
          .from('characters')
          .select('id, name, character_sheets(id, file_path, thumbnail_path)')
          .eq('webtoon_id', webtoonId)
          .in('name', names);

        const batchQueryTime = Date.now() - batchQueryStartTime;
        console.log('[episode-scripts][GET] 이름 기반 배치 조회 완료:', {
          webtoonId,
          namesCount: names.length,
          foundCount: existingCharacters?.length || 0,
          queryTime: `${batchQueryTime}ms`,
        });

        if (charError) {
          console.error('[episode-scripts][GET] 이름 기반 배치 조회 실패:', {
            webtoonId,
            names,
            error: charError,
          });
          continue;
        }

        // 매칭 결과를 적용
        if (existingCharacters) {
          const nameToCharMap = new Map(existingCharacters.map(c => [c.name.toLowerCase(), c]));
          chars.forEach(({ name, char }) => {
            const matched = nameToCharMap.get(name.toLowerCase());
            if (matched) {
              const sheets = Array.isArray(matched.character_sheets)
                ? matched.character_sheets
                : matched.character_sheets
                ? [matched.character_sheets]
                : [];

              char.characterId = matched.id;
              char.existsInDb = true;
              char.characterSheets = sheets;
            }
          });
        }
      } catch (e) {
        console.error('[episode-scripts][GET] 이름 기반 배치 조회 중 예외 발생:', {
          webtoonId,
          names,
          error: e,
        });
      }
    }

    const nameMatchingTime = Date.now() - nameMatchingStartTime;
    const characterSheetsTime = Date.now() - characterSheetsStartTime;
    console.log('[episode-scripts][GET] 캐릭터 시트 최신화 완료:', {
      nameMatchingTime: `${nameMatchingTime}ms`,
      totalCharacterSheetsTime: `${characterSheetsTime}ms`,
      charactersToMatchCount: charactersToMatch.length,
    });
  }

  const totalTime = Date.now() - startTime;
  console.log('[episode-scripts][GET] 전체 요청 완료:', {
    episodeId,
    totalTime: `${totalTime}ms`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  // 인증은 RLS(Row Level Security) 정책에 의해 처리됨
  
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

