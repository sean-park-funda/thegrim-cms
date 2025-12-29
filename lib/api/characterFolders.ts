import { supabase, CharacterFolder, CharacterFolderWithCount } from '@/lib/supabase';

/**
 * 웹툰의 캐릭터 폴더 목록 조회 (캐릭터 수 포함)
 */
export async function getCharacterFoldersByWebtoon(webtoonId: string): Promise<CharacterFolderWithCount[]> {
  // 폴더 목록 조회
  const { data: folders, error: foldersError } = await supabase
    .from('character_folders')
    .select('*')
    .eq('webtoon_id', webtoonId)
    .order('order_index', { ascending: true });

  if (foldersError) {
    console.error('캐릭터 폴더 목록 조회 실패:', foldersError);
    throw foldersError;
  }

  // 각 폴더의 캐릭터 수 계산
  const foldersWithCount: CharacterFolderWithCount[] = [];
  
  for (const folder of folders || []) {
    const { count, error: countError } = await supabase
      .from('characters')
      .select('*', { count: 'exact', head: true })
      .eq('folder_id', folder.id);

    if (countError) {
      console.error('캐릭터 수 조회 실패:', countError);
    }

    foldersWithCount.push({
      ...folder,
      character_count: count || 0,
    });
  }

  return foldersWithCount;
}

/**
 * 캐릭터 폴더 생성
 */
export async function createCharacterFolder(data: {
  webtoon_id: string;
  name: string;
}): Promise<CharacterFolder> {
  // 현재 최대 order_index 조회
  const { data: maxOrder } = await supabase
    .from('character_folders')
    .select('order_index')
    .eq('webtoon_id', data.webtoon_id)
    .order('order_index', { ascending: false })
    .limit(1)
    .single();

  const newOrderIndex = (maxOrder?.order_index ?? -1) + 1;

  const { data: folder, error } = await supabase
    .from('character_folders')
    .insert([{
      webtoon_id: data.webtoon_id,
      name: data.name,
      order_index: newOrderIndex,
    }])
    .select()
    .single();

  if (error) {
    console.error('캐릭터 폴더 생성 실패:', error);
    throw error;
  }

  return folder;
}

/**
 * 캐릭터 폴더 수정
 */
export async function updateCharacterFolder(
  folderId: string,
  data: {
    name?: string;
    order_index?: number;
  }
): Promise<CharacterFolder> {
  const { data: folder, error } = await supabase
    .from('character_folders')
    .update({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.order_index !== undefined && { order_index: data.order_index }),
    })
    .eq('id', folderId)
    .select()
    .single();

  if (error) {
    console.error('캐릭터 폴더 수정 실패:', error);
    throw error;
  }

  return folder;
}

/**
 * 캐릭터 폴더 삭제 (폴더 내 캐릭터는 미분류로 이동)
 */
export async function deleteCharacterFolder(folderId: string): Promise<void> {
  // 폴더 내 캐릭터들을 미분류로 이동 (folder_id = null)
  const { error: updateError } = await supabase
    .from('characters')
    .update({ folder_id: null })
    .eq('folder_id', folderId);

  if (updateError) {
    console.error('캐릭터 폴더 해제 실패:', updateError);
    throw updateError;
  }

  // 폴더 삭제
  const { error } = await supabase
    .from('character_folders')
    .delete()
    .eq('id', folderId);

  if (error) {
    console.error('캐릭터 폴더 삭제 실패:', error);
    throw error;
  }
}

/**
 * 캐릭터를 폴더로 이동
 */
export async function moveCharacterToFolder(
  characterId: string,
  folderId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('characters')
    .update({ folder_id: folderId })
    .eq('id', characterId);

  if (error) {
    console.error('캐릭터 폴더 이동 실패:', error);
    throw error;
  }
}

/**
 * 여러 캐릭터를 폴더로 이동
 */
export async function moveCharactersToFolder(
  characterIds: string[],
  folderId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('characters')
    .update({ folder_id: folderId })
    .in('id', characterIds);

  if (error) {
    console.error('캐릭터들 폴더 이동 실패:', error);
    throw error;
  }
}

