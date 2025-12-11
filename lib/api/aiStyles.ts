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
 * 네트워크 상태 확인 및 로깅
 */
function logNetworkStatus(): void {
  if (typeof navigator !== 'undefined') {
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (connection) {
      console.log('[getAllStyles] 네트워크 상태:', {
        effectiveType: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt,
        saveData: connection.saveData,
      });
    } else {
      console.log('[getAllStyles] 네트워크 상태 정보를 사용할 수 없습니다.');
    }
    
    // 온라인 상태 확인
    console.log('[getAllStyles] 온라인 상태:', navigator.onLine);
  }
}

/**
 * Supabase 연결 테스트
 */
async function testSupabaseConnection(): Promise<boolean> {
  try {
    const startTime = Date.now();
    // 간단한 쿼리로 연결 테스트
    const { error } = await supabase
      .from('ai_regeneration_styles')
      .select('id')
      .limit(1);
    const duration = Date.now() - startTime;
    
    console.log(`[getAllStyles] 연결 테스트 완료 (${duration}ms):`, error ? '실패' : '성공');
    if (error) {
      console.error('[getAllStyles] 연결 테스트 에러:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
    }
    
    return !error;
  } catch (err: any) {
    console.error('[getAllStyles] 연결 테스트 예외:', {
      message: err?.message,
      name: err?.name,
      stack: err?.stack,
    });
    return false;
  }
}

/**
 * 모든 스타일 조회 (비활성화 포함, 관리자용)
 * 재시도 로직 포함
 */
export async function getAllStyles(maxRetries: number = 3): Promise<AiRegenerationStyle[]> {
  const startTime = Date.now();
  console.log('[getAllStyles] 함수 호출됨, maxRetries:', maxRetries);
  
  // 초기 네트워크 상태 로깅
  logNetworkStatus();
  
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const attemptStartTime = Date.now();
    try {
      console.log(`[getAllStyles] 시도 ${attempt}/${maxRetries} 시작`);
      
      // Supabase 클라이언트 상태 확인
      if (!supabase) {
        throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
      }
      
      // 재시도 시 연결 테스트
      if (attempt > 1) {
        console.log('[getAllStyles] 재시도 전 연결 테스트 수행...');
        const isConnected = await testSupabaseConnection();
        if (!isConnected) {
          console.warn('[getAllStyles] 연결 테스트 실패, 계속 시도합니다.');
        }
      }
      
      // 쿼리 실행
      const queryStartTime = Date.now();
      const queryPromise = supabase
        .from('ai_regeneration_styles')
        .select('*')
        .order('group_name', { ascending: true, nullsFirst: false })
        .order('order_index', { ascending: true });
      
      // 타임아웃 설정 (5초)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          const timeoutDuration = Date.now() - queryStartTime;
          reject(new Error(`쿼리 타임아웃 (5초, 실제 대기: ${timeoutDuration}ms)`));
        }, 5000);
      });
      
      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
      const queryDuration = Date.now() - queryStartTime;

      if (error) {
        console.error(`[getAllStyles] 시도 ${attempt}/${maxRetries} 실패 (${queryDuration}ms):`, {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          status: error.status,
        });
        lastError = error;
        
        // 마지막 시도가 아니면 재시도
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * attempt, 3000); // 최대 3초
          console.log(`[getAllStyles] ${delay}ms 후 재시도...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw error;
      }
      
      const totalDuration = Date.now() - startTime;
      console.log(`[getAllStyles] 시도 ${attempt}/${maxRetries} 성공 (쿼리: ${queryDuration}ms, 총: ${totalDuration}ms), 데이터 개수:`, data?.length || 0);
      return data || [];
      
    } catch (err: any) {
      const attemptDuration = Date.now() - attemptStartTime;
      console.error(`[getAllStyles] 시도 ${attempt}/${maxRetries} 예외 발생 (${attemptDuration}ms):`, {
        message: err?.message,
        name: err?.name,
        code: err?.code,
        cause: err?.cause,
        stack: err?.stack?.split('\n').slice(0, 5).join('\n'), // 스택 트레이스 일부만
      });
      
      // 네트워크 상태 재확인
      if (attempt < maxRetries) {
        logNetworkStatus();
      }
      
      lastError = err;
      
      // 타임아웃이나 네트워크 에러인 경우 재시도
      const isNetworkError = (
        err?.message?.includes('타임아웃') ||
        err?.message?.includes('timeout') ||
        err?.message?.includes('network') ||
        err?.message?.includes('NetworkError') ||
        err?.message?.includes('Failed to fetch') ||
        err?.message?.includes('fetch') ||
        err?.code === 'ECONNABORTED' ||
        err?.code === 'ETIMEDOUT' ||
        err?.name === 'NetworkError' ||
        err?.name === 'TypeError'
      );
      
      if (attempt < maxRetries && isNetworkError) {
        const delay = Math.min(1000 * attempt, 2000); // 최대 2초
        console.log(`[getAllStyles] 네트워크/타임아웃 에러 감지, ${delay}ms 후 재시도...`);
        console.log('[getAllStyles] 에러 타입:', {
          isTimeout: err?.message?.includes('타임아웃'),
          isNetworkError: err?.message?.includes('network') || err?.message?.includes('fetch'),
          errorCode: err?.code,
          errorName: err?.name,
        });
        
        // 재시도 전 짧은 대기 (연결 재설정 시간)
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // 마지막 시도이거나 재시도할 수 없는 에러인 경우
      if (attempt === maxRetries) {
        const totalDuration = Date.now() - startTime;
        console.error(`[getAllStyles] 모든 재시도 실패 (총 ${totalDuration}ms)`);
        throw lastError || err;
      }
    }
  }
  
  // 이 코드는 실행되지 않아야 하지만 타입 안전성을 위해 추가
  throw lastError || new Error('알 수 없는 오류가 발생했습니다.');
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

