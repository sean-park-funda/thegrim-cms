import { supabase } from '@/lib/supabase';
import type {
  CharacterRelationship,
  RelationshipType,
  RelationshipSnapshot,
  CharacterNode,
} from '@/lib/types/relationship';

/**
 * 웹툰의 관계 목록 조회 (캐릭터 정보 포함)
 */
export async function getRelationshipsByWebtoon(webtoonId: string): Promise<CharacterRelationship[]> {
  const { data, error } = await supabase
    .from('character_relationships')
    .select(`
      *,
      character_a:characters!character_a_id (*),
      character_b:characters!character_b_id (*)
    `)
    .eq('webtoon_id', webtoonId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('관계 목록 조회 실패:', error);
    throw error;
  }

  return data || [];
}

/**
 * 관계 유형 목록 조회
 */
export async function getRelationshipTypes(): Promise<RelationshipType[]> {
  const { data, error } = await supabase
    .from('relationship_types')
    .select('*')
    .order('order_index', { ascending: true });

  if (error) {
    console.error('관계 유형 조회 실패:', error);
    throw error;
  }

  return data || [];
}

/**
 * 관계 생성
 */
export async function createRelationship(data: {
  webtoon_id: string;
  character_a_id: string;
  character_b_id: string;
  relationship_type: string;
  label?: string;
  direction: 'mutual' | 'a_to_b' | 'b_to_a';
  intensity: number;
  tension: number;
  color: string;
  notes?: string;
}): Promise<CharacterRelationship> {
  const { data: relationship, error } = await supabase
    .from('character_relationships')
    .insert([{
      webtoon_id: data.webtoon_id,
      character_a_id: data.character_a_id,
      character_b_id: data.character_b_id,
      relationship_type: data.relationship_type,
      label: data.label || null,
      direction: data.direction,
      intensity: data.intensity,
      tension: data.tension,
      color: data.color,
      notes: data.notes || null,
    }])
    .select(`
      *,
      character_a:characters!character_a_id (*),
      character_b:characters!character_b_id (*)
    `)
    .single();

  if (error) {
    console.error('관계 생성 실패:', error);
    throw error;
  }

  return relationship;
}

/**
 * 관계 수정
 */
export async function updateRelationship(
  id: string,
  data: Partial<{
    relationship_type: string;
    label: string;
    direction: 'mutual' | 'a_to_b' | 'b_to_a';
    intensity: number;
    tension: number;
    color: string;
    notes: string;
  }>
): Promise<CharacterRelationship> {
  const { data: relationship, error } = await supabase
    .from('character_relationships')
    .update(data)
    .eq('id', id)
    .select(`
      *,
      character_a:characters!character_a_id (*),
      character_b:characters!character_b_id (*)
    `)
    .single();

  if (error) {
    console.error('관계 수정 실패:', error);
    throw error;
  }

  return relationship;
}

/**
 * 관계 삭제
 */
export async function deleteRelationship(id: string): Promise<void> {
  const { error } = await supabase
    .from('character_relationships')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('관계 삭제 실패:', error);
    throw error;
  }
}

/**
 * 에피소드별 스냅샷 조회 (해당 에피소드가 없으면 가장 가까운 이전 에피소드의 스냅샷으로 폴백)
 */
export async function getSnapshotsByEpisode(
  webtoonId: string,
  episodeId: string
): Promise<RelationshipSnapshot[]> {
  // 먼저 해당 에피소드의 스냅샷 조회
  const { data, error } = await supabase
    .from('relationship_snapshots')
    .select('*')
    .eq('episode_id', episodeId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('스냅샷 조회 실패:', error);
    throw error;
  }

  if (data && data.length > 0) {
    return data;
  }

  // 스냅샷이 없으면 가장 가까운 이전 에피소드의 스냅샷으로 폴백
  const { data: episodes, error: epError } = await supabase
    .from('episodes')
    .select('id, episode_number')
    .eq('webtoon_id', webtoonId)
    .order('episode_number', { ascending: false });

  if (epError) {
    console.error('에피소드 조회 실패:', epError);
    throw epError;
  }

  if (!episodes || episodes.length === 0) {
    return [];
  }

  // 현재 에피소드의 번호 찾기
  const currentEpisode = episodes.find((ep) => ep.id === episodeId);
  if (!currentEpisode) return [];

  // 이전 에피소드들에서 스냅샷 찾기
  const previousEpisodes = episodes
    .filter((ep) => ep.episode_number < currentEpisode.episode_number)
    .sort((a, b) => b.episode_number - a.episode_number);

  for (const ep of previousEpisodes) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('relationship_snapshots')
      .select('*')
      .eq('episode_id', ep.id)
      .order('created_at', { ascending: true });

    if (fallbackError) {
      console.error('폴백 스냅샷 조회 실패:', fallbackError);
      continue;
    }

    if (fallbackData && fallbackData.length > 0) {
      return fallbackData;
    }
  }

  return [];
}

/**
 * 스냅샷 생성
 */
export async function createSnapshot(data: {
  relationship_id: string;
  episode_id: string;
  relationship_type: string;
  label?: string;
  direction: string;
  intensity: number;
  tension: number;
  change_reason?: string;
}): Promise<RelationshipSnapshot> {
  const { data: snapshot, error } = await supabase
    .from('relationship_snapshots')
    .insert([{
      relationship_id: data.relationship_id,
      episode_id: data.episode_id,
      relationship_type: data.relationship_type,
      label: data.label || null,
      direction: data.direction,
      intensity: data.intensity,
      tension: data.tension,
      change_reason: data.change_reason || null,
    }])
    .select()
    .single();

  if (error) {
    console.error('스냅샷 생성 실패:', error);
    throw error;
  }

  return snapshot;
}

/**
 * 캐릭터 위치 업데이트 (관계 맵용)
 */
export async function updateCharacterPosition(
  id: string,
  position: { x: number; y: number; z: number }
): Promise<void> {
  const { error } = await supabase
    .from('characters')
    .update({ position })
    .eq('id', id);

  if (error) {
    console.error('캐릭터 위치 업데이트 실패:', error);
    throw error;
  }
}

/**
 * 캐릭터 프로필 업데이트 (관계 맵용 추가 필드)
 */
export async function updateCharacterProfile(
  id: string,
  data: Partial<Pick<CharacterNode, 'faction' | 'role_type' | 'personality_tags' | 'color' | 'profile_image_url'>>
): Promise<CharacterNode> {
  const { data: character, error } = await supabase
    .from('characters')
    .update(data)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('캐릭터 프로필 업데이트 실패:', error);
    throw error;
  }

  return character;
}
