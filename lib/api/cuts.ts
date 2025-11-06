import { supabase, Cut, CutWithFiles } from '../supabase';

// 컷 목록 조회
export async function getCuts(episodeId: string): Promise<Cut[]> {
  const { data, error } = await supabase
    .from('cuts')
    .select('*')
    .eq('episode_id', episodeId)
    .order('cut_number', { ascending: true });

  if (error) throw error;
  return data || [];
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


