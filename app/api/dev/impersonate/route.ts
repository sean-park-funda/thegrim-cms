/**
 * 개발용 사용자 Impersonation API
 * 
 * ⚠️ 주의: 이 API는 개발 환경에서만 사용해야 합니다!
 * 프로덕션 환경에서는 자동으로 비활성화됩니다.
 * 
 * 사용법:
 * POST /api/dev/impersonate
 * Body: { "userId": "user-uuid" } 또는 { "email": "user@example.com" }
 * 
 * 응답: { loginUrl: "...", user: { id, email, role, name } }
 * 
 * 해당 URL을 브라우저에서 열면 즉시 해당 사용자로 로그인됩니다.
 */

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  // 프로덕션 환경에서는 사용 불가
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: '이 API는 프로덕션 환경에서 사용할 수 없습니다.' },
      { status: 403 }
    );
  }

  // Service Role Key 확인
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { 
        error: 'SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.',
        hint: '.env.local 파일에 SUPABASE_SERVICE_ROLE_KEY를 추가하세요. Supabase Dashboard > Settings > API에서 확인할 수 있습니다.'
      },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { userId, email } = body;

    if (!userId && !email) {
      return NextResponse.json(
        { error: 'userId 또는 email 중 하나는 필수입니다.' },
        { status: 400 }
      );
    }

    // Service Role Key로 Admin 클라이언트 생성
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      { 
        auth: { 
          autoRefreshToken: false, 
          persistSession: false 
        } 
      }
    );

    let targetUser;

    if (userId) {
      // userId로 사용자 조회
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (error || !data.user) {
        return NextResponse.json(
          { error: `사용자를 찾을 수 없습니다: ${userId}` },
          { status: 404 }
        );
      }
      targetUser = data.user;
    } else {
      // email로 사용자 조회
      const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
      if (error) {
        return NextResponse.json(
          { error: `사용자 목록 조회 실패: ${error.message}` },
          { status: 500 }
        );
      }
      targetUser = users.find(u => u.email === email);
      if (!targetUser) {
        return NextResponse.json(
          { error: `사용자를 찾을 수 없습니다: ${email}` },
          { status: 404 }
        );
      }
    }

    // 사용자 프로필 조회 (역할 정보)
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('role, name')
      .eq('id', targetUser.id)
      .single();

    // Magic Link 생성
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: targetUser.email!,
    });

    if (linkError) {
      return NextResponse.json(
        { error: `Magic Link 생성 실패: ${linkError.message}` },
        { status: 500 }
      );
    }

    // 원본 action_link에서 token_hash 추출하여 로컬 URL 생성
    const actionLink = linkData.properties.action_link;
    const url = new URL(actionLink);
    const token = url.searchParams.get('token');
    const type = url.searchParams.get('type');
    
    // 로컬 개발 서버 URL로 변환
    const localUrl = `http://localhost:3000/api/dev/impersonate/callback?token=${token}&type=${type}`;

    return NextResponse.json({
      loginUrl: localUrl,
      originalUrl: actionLink,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        role: profile?.role || 'unknown',
        name: profile?.name || targetUser.email,
      },
      hint: '위 loginUrl을 브라우저에서 열면 해당 사용자로 로그인됩니다.'
    });

  } catch (error) {
    console.error('Impersonation error:', error);
    return NextResponse.json(
      { error: `오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}` },
      { status: 500 }
    );
  }
}

// 등록된 모든 사용자 목록 조회 (개발용)
export async function GET() {
  // 프로덕션 환경에서는 사용 불가
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: '이 API는 프로덕션 환경에서 사용할 수 없습니다.' },
      { status: 403 }
    );
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { 
        error: 'SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.',
        hint: '.env.local 파일에 SUPABASE_SERVICE_ROLE_KEY를 추가하세요.'
      },
      { status: 500 }
    );
  }

  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 사용자 목록과 프로필 조회
    const { data: profiles, error } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email, role, name, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: `프로필 조회 실패: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      users: profiles,
      count: profiles.length,
      hint: 'POST /api/dev/impersonate에 { userId: "..." } 또는 { email: "..." }를 전송하여 해당 사용자로 로그인하세요.'
    });

  } catch (error) {
    return NextResponse.json(
      { error: `오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}` },
      { status: 500 }
    );
  }
}




