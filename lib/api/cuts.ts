import { supabase, Cut, CutWithFiles } from '../supabase';

// 컷 목록 조회
export async function getCuts(episodeId: string): Promise<Cut[]> {
  const { data, error } = await supabase
    .from('cuts')
    .select('*')
    .eq('episode_id', episodeId)
    .order('cut_number', { ascending: true });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  // 각 컷의 파일 개수 조회 (임시 파일 제외)
  const cutIds = data.map(cut => cut.id);
  const filesCountPromises = cutIds.map(async (cutId) => {
    const { count, error: countError } = await supabase
      .from('files')
      .select('*', { count: 'exact', head: true })
      .eq('cut_id', cutId)
      .eq('is_temp', false);

    if (countError) {
      console.error(`파일 개수 조회 실패 (cut_id: ${cutId}):`, countError);
      return { cutId, count: 0 };
    }
    return { cutId, count: count || 0 };
  });

  const filesCounts = await Promise.all(filesCountPromises);
  const filesCountMap = new Map(filesCounts.map(item => [item.cutId, item.count]));

  // 각 컷에 파일 개수 추가
  return data.map(cut => ({
    ...cut,
    files_count: filesCountMap.get(cut.id) || 0
  }));
}

// 컷 상세 조회 (파일 포함)
export async function getCutWithFiles(id: string): Promise<CutWithFiles | null> {
  const { data, error } = await supabase
    .from('cuts')
    .select(`
      *,
      files (
        *,
        process:processes (*)
      )
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

// 컷 생성
export async function createCut(cut: Omit<Cut, 'id' | 'created_at' | 'updated_at'>): Promise<Cut> {
  const { data, error } = await supabase
    .from('cuts')
    .insert(cut)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 컷 업데이트
export async function updateCut(id: string, updates: Partial<Cut>): Promise<Cut> {
  const { data, error } = await supabase
    .from('cuts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 컷 삭제
export async function deleteCut(id: string): Promise<void> {
  const { error } = await supabase
    .from('cuts')
    .delete()
    .eq('id', id);

  if (error) throw error;
}


