import { supabase, Character, CharacterWithSheets } from '@/lib/supabase';

/**
 * 웹툰의 캐릭터 목록 조회
 */
export async function getCharactersByWebtoon(webtoonId: string): Promise<CharacterWithSheets[]> {
  const { data, error } = await supabase
    .from('characters')
    .select(`
      *,
      character_sheets (*)
    `)
    .eq('webtoon_id', webtoonId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('캐릭터 목록 조회 실패:', error);
    throw error;
  }

  return data || [];
}

/**
 * 캐릭터 상세 조회 (시트 포함)
 */
export async function getCharacterWithSheets(characterId: string): Promise<CharacterWithSheets | null> {
  const { data, error } = await supabase
    .from('characters')
    .select(`
      *,
      character_sheets (*)
    `)
    .eq('id', characterId)
    .single();

  if (error) {
    console.error('캐릭터 상세 조회 실패:', error);
    throw error;
  }

  return data;
}

/**
 * 캐릭터 생성
 */
export async function createCharacter(data: {
  webtoon_id: string;
  name: string;
  description?: string;
}): Promise<Character> {
  const { data: character, error } = await supabase
    .from('characters')
    .insert([{
      webtoon_id: data.webtoon_id,
      name: data.name,
      description: data.description || null,
    }])
    .select()
    .single();

  if (error) {
    console.error('캐릭터 생성 실패:', error);
    throw error;
  }

  return character;
}

/**
 * 캐릭터 수정
 */
export async function updateCharacter(
  characterId: string,
  data: {
    name?: string;
    description?: string;
  }
): Promise<Character> {
  const { data: character, error } = await supabase
    .from('characters')
    .update({
      ...(data.name && { name: data.name }),
      ...(data.description !== undefined && { description: data.description || null }),
    })
    .eq('id', characterId)
    .select()
    .single();

  if (error) {
    console.error('캐릭터 수정 실패:', error);
    throw error;
  }

  return character;
}

/**
 * 캐릭터 삭제
 */
export async function deleteCharacter(characterId: string): Promise<void> {
  // 캐릭터 시트 파일들 먼저 삭제 (Storage)
  const { data: sheets } = await supabase
    .from('character_sheets')
    .select('storage_path, thumbnail_path')
    .eq('character_id', characterId);

  if (sheets && sheets.length > 0) {
    const pathsToDelete: string[] = [];
    for (const sheet of sheets) {
      if (sheet.storage_path) pathsToDelete.push(sheet.storage_path);
      if (sheet.thumbnail_path) pathsToDelete.push(sheet.thumbnail_path);
    }

    if (pathsToDelete.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('webtoon-files')
        .remove(pathsToDelete);

      if (storageError) {
        console.warn('캐릭터 시트 파일 삭제 실패:', storageError);
      }
    }
  }

  // 캐릭터 삭제 (CASCADE로 시트도 함께 삭제됨)
  const { error } = await supabase
    .from('characters')
    .delete()
    .eq('id', characterId);

  if (error) {
    console.error('캐릭터 삭제 실패:', error);
    throw error;
  }
}

