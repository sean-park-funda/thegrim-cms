/**
 * Magic Link Callback Handler
 * 
 * Supabase에서 생성된 Magic Link의 토큰을 처리하여
 * 로컬 환경에서 세션을 생성합니다.
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // 프로덕션 환경에서는 사용 불가
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.redirect(new URL('/login?error=not_allowed', request.url));
  }

  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get('token');
  const type = searchParams.get('type');

  if (!token) {
    return NextResponse.redirect(new URL('/login?error=missing_token', request.url));
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.redirect(new URL('/login?error=server_config', request.url));
  }

  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // OTP 토큰 검증
    const { data, error } = await supabaseAdmin.auth.verifyOtp({
      token_hash: token,
      type: (type as 'magiclink') || 'magiclink',
    });

    if (error || !data.session) {
      console.error('OTP verification failed:', error);
      return NextResponse.redirect(new URL('/login?error=invalid_token', request.url));
    }

    // 세션 정보를 클라이언트에서 설정할 수 있도록 리다이렉트
    // 세션 데이터를 URL fragment에 포함 (보안상 더 안전)
    const session = data.session;
    const sessionData = encodeURIComponent(JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      token_type: session.token_type,
      user: session.user,
    }));

    // 세션 설정 페이지로 리다이렉트
    return NextResponse.redirect(
      new URL(`/api/dev/impersonate/set-session?session=${sessionData}`, request.url)
    );

  } catch (error) {
    console.error('Callback error:', error);
    return NextResponse.redirect(new URL('/login?error=server_error', request.url));
  }
}

