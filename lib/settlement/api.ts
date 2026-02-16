import { supabase } from '@/lib/supabase';

/**
 * Settlement API용 인증 포함 fetch 래퍼
 * Vercel에서 쿠키 인증이 실패하는 경우를 대비해 Bearer 토큰도 전송
 */
export async function settlementFetch(url: string, options?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...options?.headers,
      ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
    },
  });
}
