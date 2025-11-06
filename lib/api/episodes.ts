import { supabase, Episode, EpisodeWithCuts } from '../supabase';

// 회차 목록 조회
export async function getEpisodes(webtoonId: string): Promise<Episode[]> {
  const { data, error } = await supabase
    .from('episodes')
    .select('*')
    .eq('webtoon_id', webtoonId)
    .order('episode_number', { ascending: true });

  if (error) throw error;
  return data || [];
}

// 회차 상세 조회 (컷 포함)
export async function getEpisodeWithCuts(id: string): Promise<EpisodeWithCuts | null> {
  const { data, error } = await supabase
    .from('episodes')
    .select(`
      *,
      cuts (
        *
      )
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

// 회차 생성
export async function createEpisode(episode: Omit<Episode, 'id' | 'created_at' | 'updated_at'>): Promise<Episode> {
  const { data, error } = await supabase
    .from('episodes')
    .insert(episode)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 회차 업데이트
export async function updateEpisode(id: string, updates: Partial<Episode>): Promise<Episode> {
  const { data, error } = await supabase
    .from('episodes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 회차 삭제
export async function deleteEpisode(id: string): Promise<void> {
  const { error } = await supabase
    .from('episodes')
    .delete()
    .eq('id', id);

  if (error) throw error;
}


