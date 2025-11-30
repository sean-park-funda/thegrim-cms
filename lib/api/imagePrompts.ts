import { supabase, AiRegenerationPrompt } from '../supabase';

/**
 * 스타일별 프롬프트 조회 (기본 + 개인 + 공유)
 * @param styleId 스타일 ID
 * @param userId 사용자 ID (선택사항, 개인 프롬프트 조회용)
 * @returns 프롬프트 목록 (기본 프롬프트가 먼저, 그 다음 개인/공유 프롬프트)
 */
export async function getPromptsByStyle(styleId: string, userId?: string): Promise<AiRegenerationPrompt[]> {
  // 기본 프롬프트 조회
  const { data: defaultPrompts, error: defaultError } = await supabase
    .from('ai_regeneration_prompts')
    .select('*')
    .eq('style_id', styleId)
    .eq('is_default', true)
    .order('created_at', { ascending: true });

  if (defaultError) throw defaultError;

  // 개인 프롬프트 조회 (사용자 ID가 있는 경우)
  let userPrompts: AiRegenerationPrompt[] = [];
  if (userId) {
    const { data: userData, error: userError } = await supabase
      .from('ai_regeneration_prompts')
      .select('*')
      .eq('style_id', styleId)
      .eq('created_by', userId)
      .eq('is_default', false)
      .order('created_at', { ascending: false });

    if (userError) throw userError;
    userPrompts = userData || [];
  }

  // 공유 프롬프트 조회 (기본 프롬프트 제외)
  const { data: sharedPrompts, error: sharedError } = await supabase
    .from('ai_regeneration_prompts')
    .select('*')
    .eq('style_id', styleId)
    .eq('is_shared', true)
    .eq('is_default', false)
    .order('created_at', { ascending: false });

  if (sharedError) throw sharedError;

  // 공유 프롬프트에서 사용자가 만든 것 제외 (중복 방지)
  const sharedPromptsFiltered = (sharedPrompts || []).filter(
    p => !userId || p.created_by !== userId
  );

  // 기본 프롬프트 + 개인 프롬프트 + 공유 프롬프트 순서로 반환
  return [
    ...(defaultPrompts || []),
    ...userPrompts,
    ...sharedPromptsFiltered,
  ];
}

/**
 * 스타일의 기본 프롬프트 조회
 * @param styleId 스타일 ID
 * @returns 기본 프롬프트 (없으면 null)
 */
export async function getDefaultPrompt(styleId: string): Promise<AiRegenerationPrompt | null> {
  const { data, error } = await supabase
    .from('ai_regeneration_prompts')
    .select('*')
    .eq('style_id', styleId)
    .eq('is_default', true)
    .limit(1)
    .single();

  if (error) {
    // 기본 프롬프트가 없으면 null 반환
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data;
}

/**
 * 프롬프트 저장
 * @param styleId 스타일 ID
 * @param promptText 프롬프트 내용
 * @param promptName 프롬프트 이름
 * @param isShared 공유 여부
 * @param userId 사용자 ID
 * @param isDefault 기본 프롬프트로 설정할지 여부 (기본값: false)
 * @returns 저장된 프롬프트
 */
export async function savePrompt(
  styleId: string,
  promptText: string,
  promptName: string,
  isShared: boolean,
  userId: string,
  isDefault: boolean = false
): Promise<AiRegenerationPrompt> {
  // 기본 프롬프트로 설정하는 경우, 기존 기본 프롬프트를 해제
  if (isDefault) {
    const { error: updateError } = await supabase
      .from('ai_regeneration_prompts')
      .update({ is_default: false })
      .eq('style_id', styleId)
      .eq('is_default', true);

    if (updateError) throw updateError;
  }

  const { data, error } = await supabase
    .from('ai_regeneration_prompts')
    .insert({
      style_id: styleId,
      prompt_text: promptText,
      prompt_name: promptName,
      created_by: userId,
      is_shared: isShared,
      is_default: isDefault,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * 프롬프트 삭제 (자신이 만든 것만)
 * @param promptId 프롬프트 ID
 * @param userId 사용자 ID
 */
export async function deletePrompt(promptId: string, userId: string): Promise<void> {
  // 먼저 프롬프트가 존재하고 사용자가 만든 것인지 확인
  const { data: prompt, error: fetchError } = await supabase
    .from('ai_regeneration_prompts')
    .select('created_by, is_default')
    .eq('id', promptId)
    .single();

  if (fetchError) throw fetchError;
  if (!prompt) throw new Error('프롬프트를 찾을 수 없습니다.');

  // 기본 프롬프트는 삭제 불가
  if (prompt.is_default) {
    throw new Error('기본 프롬프트는 삭제할 수 없습니다.');
  }

  // 자신이 만든 프롬프트만 삭제 가능
  if (prompt.created_by !== userId) {
    throw new Error('자신이 만든 프롬프트만 삭제할 수 있습니다.');
  }

  const { error } = await supabase
    .from('ai_regeneration_prompts')
    .delete()
    .eq('id', promptId)
    .eq('created_by', userId);

  if (error) throw error;
}

/**
 * 프롬프트 수정 (자신이 만든 것만)
 * @param promptId 프롬프트 ID
 * @param promptText 프롬프트 내용
 * @param promptName 프롬프트 이름
 * @param isShared 공유 여부
 * @param userId 사용자 ID
 * @returns 수정된 프롬프트
 */
export async function updatePrompt(
  promptId: string,
  promptText: string,
  promptName: string,
  isShared: boolean,
  userId: string
): Promise<AiRegenerationPrompt> {
  // 먼저 프롬프트가 존재하고 사용자가 만든 것인지 확인
  const { data: prompt, error: fetchError } = await supabase
    .from('ai_regeneration_prompts')
    .select('created_by, is_default')
    .eq('id', promptId)
    .single();

  if (fetchError) throw fetchError;
  if (!prompt) throw new Error('프롬프트를 찾을 수 없습니다.');

  // 기본 프롬프트는 수정 불가
  if (prompt.is_default) {
    throw new Error('기본 프롬프트는 수정할 수 없습니다.');
  }

  // 자신이 만든 프롬프트만 수정 가능
  if (prompt.created_by !== userId) {
    throw new Error('자신이 만든 프롬프트만 수정할 수 있습니다.');
  }

  const { data, error } = await supabase
    .from('ai_regeneration_prompts')
    .update({
      prompt_text: promptText,
      prompt_name: promptName,
      is_shared: isShared,
    })
    .eq('id', promptId)
    .eq('created_by', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

