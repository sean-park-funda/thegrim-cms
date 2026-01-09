/**
 * 세션 설정 핸들러
 * 
 * 서버에서 받은 세션을 클라이언트 localStorage에 저장하기 위한
 * HTML 페이지를 반환합니다.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // 프로덕션 환경에서는 사용 불가
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not allowed in production', { status: 403 });
  }

  const sessionData = request.nextUrl.searchParams.get('session');

  if (!sessionData) {
    return NextResponse.redirect(new URL('/login?error=no_session', request.url));
  }

  // Supabase 프로젝트 ID 추출 (URL에서)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'unknown';

  // 세션을 localStorage에 설정하는 HTML 페이지 반환
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>로그인 중...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: rgba(255,255,255,0.1);
      border-radius: 16px;
      backdrop-filter: blur(10px);
    }
    .spinner {
      width: 50px;
      height: 50px;
      border: 3px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .success {
      color: #4ade80;
    }
    .error {
      color: #f87171;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner" id="spinner"></div>
    <h2 id="status">로그인 중...</h2>
    <p id="message">잠시만 기다려주세요.</p>
  </div>
  <script>
    (function() {
      const sessionData = ${sessionData};
      const storageKey = 'sb-${projectRef}-auth-token';
      
      try {
        // 기존 세션 제거
        localStorage.removeItem(storageKey);
        
        // 새 세션 저장
        localStorage.setItem(storageKey, JSON.stringify(sessionData));
        
        // 성공 표시
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('status').textContent = '✓ 로그인 성공!';
        document.getElementById('status').className = 'success';
        document.getElementById('message').textContent = 
          sessionData.user.email + ' 계정으로 로그인되었습니다.';
        
        // 메인 페이지로 리다이렉트
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
        
      } catch (error) {
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('status').textContent = '✗ 로그인 실패';
        document.getElementById('status').className = 'error';
        document.getElementById('message').textContent = error.message;
      }
    })();
  </script>
</body>
</html>
`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}




