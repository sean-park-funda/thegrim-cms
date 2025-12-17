# 인증(AUTH) 구현 요약 및 개선안

## 개요
- Supabase Auth를 사용하며, 익명 키 클라이언트(`lib/supabase.ts`)를 브라우저에서 생성해 `localStorage`로 세션을 유지하고 `autoRefreshToken`으로 토큰 갱신.
- 전역 상태는 `lib/hooks/useAuth.ts`가 초기 세션 조회(`getSession`→`getUserProfile`) 후 Zustand `useStore`에 `user/profile/isLoading`을 채워 관리.
- 인증 이벤트는 `supabase.auth.onAuthStateChange`로 감지하며, `SIGNED_IN`/`TOKEN_REFRESHED`/`SIGNED_OUT`에 맞춰 상태를 동기화.

## 주요 흐름
- **로그인**: `lib/api/auth.ts`의 `signIn`이 비밀번호 로그인 수행, 이메일 미확인 시 `confirm_user_email_by_email` RPC로 자동 확인 후 재시도. 성공 시 프로필 조회 및 역할 보정.
- **회원가입**: `signUp`이 초대 토큰 검증(`verifyInvitationToken`), 첫 사용자 자동 관리자 승격(`is_first_user_excluding`), 이메일 확인(`confirm_user_email`), 프로필 생성 폴링, 역할 보정(`update_user_role_on_signup`), 초대 사용 처리까지 수행.
- **라우팅 가드**: `app/page.tsx`가 `/`에서 로그인 여부에 따라 `/login` 또는 `/webtoons`로 리다이렉트. `components/AppLayout.tsx`가 전역적으로 `useAuth`를 호출. `/admin/page.tsx`는 클라이언트에서 `role !== 'admin'` 시 `/`로 이동.
- **권한 적용**: UI 단에서 `lib/utils/permissions.ts`와 `ROLES_GUIDE.md`를 참고해 버튼/액션 노출을 제어. 관리자 초대·역할 변경도 클라이언트에서 Supabase JS로 호출.

## 현재 문제점 / 위험 (2025-12 기준)
- **RLS 완전 개방(치명)**: `supabase-rls-policies.sql`이 웹툰/회차/컷/공정/파일 및 `webtoon-files` 버킷을 `FOR ALL USING (true)`로 공개. 프로덕션 반영 시 인증 없이 데이터·파일 탈취/변조 가능.
- **서버 API 무인증(높음)**: `app/api/**` 라우트가 `Authorization` 헤더나 Supabase 세션을 검사하지 않음. 익명 키로 호출 가능하며, RLS를 조이면 `auth.uid()`가 null이라 대부분 권한 오류.
- **클라이언트 전적 의존(중간)**: `/admin` 등 민감 기능이 서버 재검증 없이 클라이언트 검증에 의존. RLS 완화 시 우회 가능, 강화 시 동작 실패.
- **세션 전달 부재(중간)**: 서버 라우트가 사용자 액세스 토큰을 Supabase 클라이언트에 바인딩하지 않아, RLS 강화 시 기능 중단 위험. Bearer 토큰 또는 쿠키 기반 서버 클라이언트 필요.

## 개선 제안 (우선순위)
1. **RLS 재정비**: 개발용 공개 정책 제거 후 역할별 정책으로 재구성(스토리지 포함). `supabase-auth-schema.sql`의 역할 정의에 맞춰 각 테이블 정책 명시.
2. **서버 라우트 인증 추가**: `app/api/**`에서 JWT를 받아 Supabase 서버 클라이언트에 주입하거나, Next Middleware로 검증 후 요청 컨텍스트에 사용자 정보를 전달.
3. **관리자 액션 서버 검증**: 초대 생성/역할 변경 등은 서버 라우트에서 역할을 재검증한 뒤 실행하도록 이전.
4. **보조 과제**: 비밀번호 재설정·이메일 변경 플로우 추가, 외부 API 키가 쓰이는 엔드포인트에 속도 제한과 감사 로그 도입.
