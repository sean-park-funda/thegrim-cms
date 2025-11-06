import { supabase, Webtoon, WebtoonWithEpisodes } from '../supabase';

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
export async function createWebtoon(webtoon: Omit<Webtoon, 'id' | 'created_at' | 'updated_at'>): Promise<Webtoon> {
  const { data, error } = await supabase
    .from('webtoons')
    .insert(webtoon)
    .select()
    .single();

  if (error) throw error;
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


