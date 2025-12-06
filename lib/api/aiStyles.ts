import { supabase, AiRegenerationStyle, AiRegenerationStyleInput, ApiProvider } from '../supabase';

/**
 * 모든 활성화된 스타일 조회 (그룹별, 순서대로 정렬)
 */
export async function getStyles(): Promise<AiRegenerationStyle[]> {
  const { data, error } = await supabase
    .from('ai_regeneration_styles')
    .select('*')
    .eq('is_active', true)
    .order('group_name', { ascending: true, nullsFirst: false })
    .order('order_index', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * 모든 스타일 조회 (비활성화 포함, 관리자용)
 */
export async function getAllStyles(): Promise<AiRegenerationStyle[]> {
  const { data, error } = await supabase
    .from('ai_regeneration_styles')
    .select('*')
    .order('group_name', { ascending: true, nullsFirst: false })
    .order('order_index', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * 특정 스타일 조회 (ID로)
 */
export async function getStyleById(id: string): Promise<AiRegenerationStyle | null> {
  const { data, error } = await supabase
    .from('ai_regeneration_styles')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

/**
 * 특정 스타일 조회 (style_key로)
 */
export async function getStyleByKey(styleKey: string): Promise<AiRegenerationStyle | null> {
  const { data, error } = await supabase
    .from('ai_regeneration_styles')
    .select('*')
    .eq('style_key', styleKey)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

/**
 * 스타일 생성
 */
export async function createStyle(input: AiRegenerationStyleInput): Promise<AiRegenerationStyle> {
  // 기존 스타일 개수 조회 (order_index 설정용)
  const { count } = await supabase
    .from('ai_regeneration_styles')
    .select('*', { count: 'exact', head: true });

  const { data, error } = await supabase
    .from('ai_regeneration_styles')
    .insert({
      ...input,
      order_index: input.order_index ?? (count || 0) + 1,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * 스타일 수정
 */
export async function updateStyle(
  id: string,
  input: Partial<AiRegenerationStyleInput>
): Promise<AiRegenerationStyle> {
  const { data, error } = await supabase
    .from('ai_regeneration_styles')
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * 스타일 삭제 (소프트 삭제 - is_active = false)
 */
export async function deleteStyle(id: string): Promise<void> {
  const { error } = await supabase
    .from('ai_regeneration_styles')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
}

/**
 * 스타일 영구 삭제 (하드 삭제)
 */
export async function hardDeleteStyle(id: string): Promise<void> {
  const { error } = await supabase
    .from('ai_regeneration_styles')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/**
 * 스타일 복원 (is_active = true)
 */
export async function restoreStyle(id: string): Promise<AiRegenerationStyle> {
  const { data, error } = await supabase
    .from('ai_regeneration_styles')
    .update({
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * 스타일 순서 변경
 */
export async function reorderStyles(styleIds: string[]): Promise<void> {
  const updates = styleIds.map((id, index) => ({
    id,
    order_index: index + 1,
    updated_at: new Date().toISOString(),
  }));

  for (const update of updates) {
    const { error } = await supabase
      .from('ai_regeneration_styles')
      .update({
        order_index: update.order_index,
        updated_at: update.updated_at,
      })
      .eq('id', update.id);

    if (error) throw error;
  }
}

/**
 * 모든 그룹 이름 목록 조회
 */
export async function getStyleGroups(): Promise<string[]> {
  const { data, error } = await supabase
    .from('ai_regeneration_styles')
    .select('group_name')
    .eq('is_active', true)
    .not('group_name', 'is', null);

  if (error) throw error;

  // 중복 제거 후 반환
  const groups = new Set(data?.map(d => d.group_name).filter(Boolean) as string[]);
  return Array.from(groups).sort();
}

/**
 * 그룹별 스타일 조회
 */
export async function getStylesByGroup(groupName: string | null): Promise<AiRegenerationStyle[]> {
  let query = supabase
    .from('ai_regeneration_styles')
    .select('*')
    .eq('is_active', true)
    .order('order_index', { ascending: true });

  if (groupName === null) {
    query = query.is('group_name', null);
  } else {
    query = query.eq('group_name', groupName);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

/**
 * 스타일을 그룹별로 묶어서 반환
 */
export async function getStylesGrouped(): Promise<Record<string, AiRegenerationStyle[]>> {
  const styles = await getStyles();
  const grouped: Record<string, AiRegenerationStyle[]> = {};

  for (const style of styles) {
    const groupKey = style.group_name || '기타';
    if (!grouped[groupKey]) {
      grouped[groupKey] = [];
    }
    grouped[groupKey].push(style);
  }

  return grouped;
}

