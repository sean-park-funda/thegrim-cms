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

  // 각 회차의 파일 개수와 첫 번째 파일 썸네일 조회 (회차 -> 컷 -> 파일)
  const episodeIds = data.map(episode => episode.id);
  const filesInfoPromises = episodeIds.map(async (episodeId) => {
    // 해당 회차의 모든 컷 ID 조회
    const { data: cuts, error: cutsError } = await supabase
      .from('cuts')
      .select('id')
      .eq('episode_id', episodeId)
      .order('cut_number', { ascending: true });

    if (cutsError) {
      console.error(`컷 조회 실패 (episode_id: ${episodeId}):`, cutsError);
      return { episodeId, count: 0, thumbnail_url: null };
    }

    if (!cuts || cuts.length === 0) {
      return { episodeId, count: 0, thumbnail_url: null };
    }

    const cutIds = cuts.map(cut => cut.id);

    // 해당 컷들에 속한 파일 개수 조회 (임시 파일 제외)
    const { count, error: countError } = await supabase
      .from('files')
      .select('*', { count: 'exact', head: true })
      .in('cut_id', cutIds)
      .eq('is_temp', false);

    if (countError) {
      console.error(`파일 개수 조회 실패 (episode_id: ${episodeId}):`, countError);
    }

    // 첫 번째 이미지 파일 조회 (임시 파일 제외)
    const { data: firstFile, error: fileError } = await supabase
      .from('files')
      .select('thumbnail_path, file_path, file_type')
      .in('cut_id', cutIds)
      .eq('is_temp', false)
      .eq('file_type', 'image')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    let thumbnailUrl = null;
    if (!fileError && firstFile) {
      // 썸네일이 있으면 썸네일 URL 사용
      if (firstFile.thumbnail_path) {
        const { data: { publicUrl } } = supabase.storage
          .from('webtoon-files')
          .getPublicUrl(firstFile.thumbnail_path);
        thumbnailUrl = publicUrl;
      } else if (firstFile.file_path) {
        // 썸네일이 없으면 원본 파일 경로 사용
        // file_path가 절대 URL인지 확인
        if (firstFile.file_path.startsWith('http')) {
          thumbnailUrl = firstFile.file_path;
        } else if (firstFile.file_path.startsWith('/')) {
          thumbnailUrl = firstFile.file_path;
        } else {
          // Supabase Storage 경로인 경우 공개 URL 생성
          try {
            const { data: { publicUrl } } = supabase.storage
              .from('webtoon-files')
              .getPublicUrl(firstFile.file_path);
            thumbnailUrl = publicUrl;
          } catch (error) {
            console.error(`파일 URL 생성 실패 (episode_id: ${episodeId}):`, error);
          }
        }
      }
    }

    return { episodeId, count: count || 0, thumbnail_url: thumbnailUrl };
  });

  const filesInfos = await Promise.all(filesInfoPromises);
  const filesInfoMap = new Map(filesInfos.map(item => [item.episodeId, item]));

  // 각 회차에 파일 개수와 썸네일 추가
  return data.map(episode => ({
    ...episode,
    files_count: filesInfoMap.get(episode.id)?.count || 0,
    thumbnail_url: filesInfoMap.get(episode.id)?.thumbnail_url || null
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


