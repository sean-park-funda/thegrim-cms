import { supabase, Episode, EpisodeWithCuts } from '../supabase';

// 회차 목록 조회
export async function getEpisodes(webtoonId: string): Promise<Episode[]> {
  const { data, error } = await supabase
    .from('episodes')
    .select('*')
    .eq('webtoon_id', webtoonId)
    .order('episode_number', { ascending: true });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  // 각 회차의 파일 개수 조회 (회차 -> 컷 -> 파일)
  const episodeIds = data.map(episode => episode.id);
  const filesCountPromises = episodeIds.map(async (episodeId) => {
    // 해당 회차의 모든 컷 ID 조회
    const { data: cuts, error: cutsError } = await supabase
      .from('cuts')
      .select('id')
      .eq('episode_id', episodeId);

    if (cutsError) {
      console.error(`컷 조회 실패 (episode_id: ${episodeId}):`, cutsError);
      return { episodeId, count: 0 };
    }

    if (!cuts || cuts.length === 0) {
      return { episodeId, count: 0 };
    }

    const cutIds = cuts.map(cut => cut.id);

    // 해당 컷들에 속한 파일 개수 조회
    const { count, error: countError } = await supabase
      .from('files')
      .select('*', { count: 'exact', head: true })
      .in('cut_id', cutIds);

    if (countError) {
      console.error(`파일 개수 조회 실패 (episode_id: ${episodeId}):`, countError);
      return { episodeId, count: 0 };
    }
    return { episodeId, count: count || 0 };
  });

  const filesCounts = await Promise.all(filesCountPromises);
  const filesCountMap = new Map(filesCounts.map(item => [item.episodeId, item.count]));

  // 각 회차에 파일 개수 추가
  return data.map(episode => ({
    ...episode,
    files_count: filesCountMap.get(episode.id) || 0
  }));
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


