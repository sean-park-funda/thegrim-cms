import { supabase, Webtoon, WebtoonWithEpisodes } from '../supabase';
import { createEpisode } from './episodes';

// 웹툰 목록 조회
export async function getWebtoons(): Promise<Webtoon[]> {
  const { data, error } = await supabase
    .from('webtoons')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// 웹툰 상세 조회 (회차 포함)
export async function getWebtoonWithEpisodes(id: string): Promise<WebtoonWithEpisodes | null> {
  const { data, error } = await supabase
    .from('webtoons')
    .select(`
      *,
      episodes (
        *
      )
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

// 웹툰 생성
export async function createWebtoon(webtoon: Omit<Webtoon, 'id' | 'created_at' | 'updated_at' | 'status'> & { status?: string }): Promise<Webtoon> {
  const { data, error } = await supabase
    .from('webtoons')
    .insert({
      ...webtoon,
      status: webtoon.status || 'active' // 기본값 설정
    })
    .select()
    .single();

  if (error) throw error;

  // 웹툰 생성 후 자동으로 "기타" 회차 생성
  try {
    await createEpisode({
      webtoon_id: data.id,
      episode_number: 0,
      title: '기타',
      description: '어떤 회차에도 속하지 않는 컷과 파일을 관리하는 회차입니다.',
      status: 'active'
    });
  } catch (episodeError) {
    // "기타" 회차 생성 실패해도 웹툰 생성은 성공으로 처리
    console.error('기타 회차 생성 실패:', episodeError);
  }

  return data;
}

// 웹툰 업데이트
export async function updateWebtoon(id: string, updates: Partial<Webtoon>): Promise<Webtoon> {
  const { data, error } = await supabase
    .from('webtoons')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 웹툰 삭제
export async function deleteWebtoon(id: string): Promise<void> {
  const { error } = await supabase
    .from('webtoons')
    .delete()
    .eq('id', id);

  if (error) throw error;
}


