import { supabase } from '../supabase';

export interface ImageRegenerationSetting {
  id: string;
  style_id: string;
  use_reference: boolean;
  created_at: string;
  updated_at: string;
}

// 이미지 재생성 설정 조회
export async function getImageRegenerationSettings(): Promise<ImageRegenerationSetting[]> {
  const { data, error } = await supabase
    .from('image_regeneration_settings')
    .select('*')
    .order('style_id', { ascending: true });

  if (error) throw error;
  return data || [];
}

// 이미지 재생성 설정 업데이트
export async function updateImageRegenerationSetting(
  styleId: string,
  useReference: boolean
): Promise<ImageRegenerationSetting> {
  const { data, error } = await supabase
    .from('image_regeneration_settings')
    .upsert(
      {
        style_id: styleId,
        use_reference: useReference,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'style_id',
      }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 특정 스타일의 레퍼런스 사용 여부 조회
export async function getStyleUseReference(styleId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('image_regeneration_settings')
    .select('use_reference')
    .eq('style_id', styleId)
    .single();

  if (error) {
    // 설정이 없으면 기본값 false 반환
    if (error.code === 'PGRST116') {
      return false;
    }
    throw error;
  }
  return data?.use_reference ?? false;
}





