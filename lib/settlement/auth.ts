import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Settlement API 공통 인증 헬퍼
 * 1) 쿠키 기반 인증 시도
 * 2) 실패 시 Authorization Bearer 토큰 폴백
 * Vercel 배포 환경에서 쿠키 인증이 실패하는 경우를 처리
 */
export async function getAuthenticatedClient(request: NextRequest): Promise<{
  supabase: SupabaseClient;
  userId: string;
} | null> {
  // 1) 쿠키 기반 인증
  let supabase: SupabaseClient = await createClient();
  let { data: { user }, error: userError } = await supabase.auth.getUser();

  // 2) 쿠키 실패 → Bearer 토큰 폴백
  if (userError || !user) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      supabase = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      );
      const result = await supabase.auth.getUser(token);
      user = result.data.user;
      userError = result.error;
    }
  }

  if (userError || !user) return null;

  return { supabase, userId: user.id };
}
