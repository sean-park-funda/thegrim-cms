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

---

## ✅ 세션 이벤트 후 데이터 로딩 실패 이슈 (2025-12 발견 → 수정 완료)

### 현상
- 서비스를 수분간 사용하다 보면 콘솔에 `인증 상태 변경: SIGNED_IN {userId}` 로그가 반복 출력됨.
- 이후 리프레시 전까지 데이터 로딩(웹툰/회차/컷 등)이 실패하거나 멈춤.
- 1시간(토큰 만료)이 아니라 **수분 간격**으로 발생.

### 원인 분석 (수정됨)

#### 1. ⭐ 5초 fetch 타임아웃이 너무 짧음 (주 원인)
`lib/supabase.ts`에서 **모든 Supabase 요청**에 5초 타임아웃이 강제됨:
```typescript
global: {
  fetch: (url, options = {}) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초!
    return fetch(url, { ...options, signal: options.signal || controller.signal })
      .finally(() => clearTimeout(timeoutId));
  },
},
```
- 네트워크 지연, 서버 부하 시 요청이 5초 안에 완료되지 않으면 **abort**됨.
- 토큰 갱신, 세션 복구, 데이터 조회 모두 영향 받음.
- abort된 요청으로 인해 세션이 불안정해지고, Supabase가 세션 복구 시도 → `SIGNED_IN` 이벤트 재발생.

#### 2. ⭐ `useAuth()` 다중 호출로 리스너 중복 (부가 원인)
`useAuth()` 훅이 여러 컴포넌트에서 동시에 호출됨:
- `components/AppLayout.tsx` (모든 페이지 감싸는 레이아웃)
- `app/page.tsx`
- `app/admin/page.tsx`
- `app/login/page.tsx`, `app/signup/page.tsx`
- `app/3d-viewer/page.tsx`

**문제**: 각 `useAuth()` 호출마다 별도의 `onAuthStateChange` 리스너가 등록됨.
- `subscriptionRef`가 훅 인스턴스마다 별도로 존재.
- `isCheckingAuthRef`도 훅 인스턴스마다 별도 → 동시성 제어 실패.
- 인증 이벤트 발생 시 **여러 리스너가 동시에** `syncSessionState` 호출.
- 동시에 여러 `getUserProfile` 요청 발생 → 충돌 및 상태 불일치.

#### 3. 브라우저 탭 전환 시 SIGNED_IN 이벤트 발생 (근본 원인 - 2025-12-17 파악)
브라우저 탭이 백그라운드 → 포그라운드로 전환될 때 Supabase 클라이언트가 세션을 재검증하면서 `SIGNED_IN` 이벤트가 발생.
- 탭이 비활성화되면 WebSocket/네트워크 연결이 끊길 수 있음
- 탭이 다시 활성화되면 Supabase가 세션 복구 시도 → `SIGNED_IN` 이벤트 발생
- 이 이벤트로 인해 상태 업데이트 → 전체 리렌더링 → 데이터 로딩 중단

#### 4. INITIAL_SESSION 무시 (기존 분석 - 부가 원인)
`INITIAL_SESSION` 이벤트를 무조건 무시하여 세션 복구 시 상태 동기화 실패.

### 재현 시나리오
1. 로그인 후 서비스 사용
2. 네트워크 지연으로 Supabase 요청이 5초 이상 걸림
3. fetch가 abort됨 → 세션 관련 요청 실패
4. Supabase가 세션을 복구하려고 시도 → `SIGNED_IN` 이벤트 발생
5. **여러 리스너가 동시에** `syncSessionState` 호출
6. 각 리스너에서 `getUserProfile` 요청 발생 (동시에 여러 개)
7. 이 요청들도 5초 안에 완료 안 되면 abort
8. 상태 불일치 + 이후 데이터 조회도 계속 실패

### 임시 해결 (사용자)
- 페이지 새로고침(F5) → `checkAuth()`가 다시 실행되어 세션 동기화됨.

---

## ✅ 수정 완료 (2025-12-17)

### 1. fetch 타임아웃 완화 ✅
**파일**: `lib/supabase.ts`
- 5초 → **30초**로 변경

### 2. useAuth() 리스너 중복 방지 ✅
**파일**: `lib/hooks/useAuth.ts`
- 전역 싱글톤 패턴 적용: `isListenerRegistered` 플래그로 중복 등록 방지
- 인증 확인 타임아웃: 10초 → **30초**
- 프로필 조회 타임아웃: 5초 → **15초**
- `INITIAL_SESSION` 이벤트 처리 수정: 무시하지 않고 세션 동기화
- **동일 사용자 중복 상태 업데이트 방지**: SIGNED_IN/TOKEN_REFRESHED 이벤트에서 이미 같은 사용자로 로그인되어 있으면 `setUser`/`setProfile` 호출 건너뜀 (불필요한 리렌더링 방지)

### 3. 다른 컴포넌트에서 useAuth() 호출 제거 ✅
`AppLayout.tsx`에서만 `useAuth()` 호출, 나머지는 `useStore()`만 사용:
- `app/page.tsx` ✅
- `app/admin/page.tsx` ✅
- `app/login/page.tsx` ✅
- `app/signup/page.tsx` ✅
- `app/3d-viewer/page.tsx` ✅

---

## 수정 방안 (참고용 - 이미 적용됨)

### 1. ⭐ fetch 타임아웃 완화 또는 제거 (필수)
`lib/supabase.ts` 수정:
```typescript
// 기존 (문제)
const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초

// 수정안 1: 타임아웃 늘리기
const timeoutId = setTimeout(() => controller.abort(), 30000); // 30초

// 수정안 2: 타임아웃 제거 (Supabase 기본 동작에 맡김)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: typeof window !== 'undefined',
    autoRefreshToken: true,
    detectSessionInUrl: typeof window !== 'undefined',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
  // global.fetch 커스텀 제거
});
```

### 2. ⭐ `useAuth()` 리스너 중복 방지 (필수)
**방법 A**: 전역 싱글톤 리스너로 변경
```typescript
// lib/auth-listener.ts (새 파일)
let isListenerRegistered = false;

export function registerAuthListener(callbacks: {
  setUser: (user: any) => void;
  setProfile: (profile: any) => void;
  setLoading: (loading: boolean) => void;
}) {
  if (isListenerRegistered) return () => {};
  isListenerRegistered = true;
  
  const { data: { subscription } } = supabase.auth.onAuthStateChange(...);
  
  return () => {
    subscription.unsubscribe();
    isListenerRegistered = false;
  };
}
```

**방법 B**: `useAuth()`를 최상위 레이아웃에서만 호출
- `AppLayout.tsx`에서만 `useAuth()` 호출
- 다른 컴포넌트에서는 `useStore()`로 상태만 읽기

### 3. INITIAL_SESSION 처리 수정
```typescript
// 기존 (버그)
if (event === 'INITIAL_SESSION') {
  return; // 무시
}

// 수정안
if (event === 'INITIAL_SESSION') {
  if (session?.user) {
    await syncSessionState(session);
  } else {
    setUser(null);
    setProfile(null);
  }
  return;
}
```

### 4. 탭 포커스 복귀 시 세션 재검증 (선택)
```typescript
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      checkAuth();
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, [checkAuth]);
```

---

## 현재 auth 방식 평가

### 장점
- Supabase Auth + RLS 조합을 전제로 한 단순한 클라이언트 세션 관리와 자동 토큰 갱신.
- 초대 기반 온보딩과 역할 매핑(최초 사용자 자동 관리자 승격, 초대 이메일 발송 Edge Function 포함).
- Zustand를 통한 단일 전역 소스로 UI 권한 제어를 일관되게 수행.

### 현재 문제점 / 위험 (2025-12 기준)
- ~~**5초 타임아웃으로 인한 세션 불안정(높음)**~~ ✅ 해결: 30초로 완화
- ~~**리스너 중복으로 인한 동시성 문제(높음)**~~ ✅ 해결: 싱글톤 패턴 적용
- ~~**세션 동기화 버그(중간)**~~ ✅ 해결: INITIAL_SESSION 처리 수정
- **RLS 완전 개방(치명)**: `supabase-rls-policies.sql`이 핵심 테이블/스토리지를 `FOR ALL USING (true)`로 공개.
- **서버 API 무인증(높음)**: `app/api/**` 라우트가 세션을 검사하지 않음.
- **클라이언트 전적 의존(중간)**: 민감 기능이 클라이언트 검증에만 의존.
- **세션 전달 부재(중간)**: 서버 라우트가 사용자 토큰을 Supabase에 바인딩하지 않음.

### 최선인가?
**현재 방식은 개발/프로토타입 단계에서는 적합하나, 프로덕션에는 부적합.**
- ~~5초 타임아웃 완화 + 리스너 중복 방지는 **즉시 수정 필요**.~~ ✅ 수정 완료
- 프로덕션 전환 시 RLS 재정비 + 서버 라우트 인증 추가가 반드시 필요.
- 대안으로 Next.js Middleware + `@supabase/ssr` 패키지를 사용한 쿠키 기반 세션 관리를 검토할 수 있음.

---

## 개선 제안 (우선순위)
1. ~~**5초 타임아웃 완화** ⭐~~ ✅ 완료
2. ~~**리스너 중복 방지** ⭐~~ ✅ 완료
3. ~~**INITIAL_SESSION 처리 수정**~~ ✅ 완료
4. **RLS 재정비**: 개발용 공개 정책 제거 후 역할별 정책으로 재구성.
5. **서버 라우트 인증 추가**: `app/api/**`에서 JWT 검증 추가.
6. **관리자 액션 서버 검증**: 초대 생성/역할 변경 등은 서버 라우트에서 역할 재검증.
7. **보조 과제**: 비밀번호 재설정·이메일 변경 플로우 추가, 속도 제한과 감사 로그 도입.

---

## 관련 파일
- `lib/supabase.ts` - Supabase 클라이언트 설정 (타임아웃 30초로 수정됨 ✅)
- `lib/hooks/useAuth.ts` - 인증 상태 관리 훅 (싱글톤 패턴 적용됨 ✅)
- `lib/api/auth.ts` - 로그인/회원가입/초대 API
- `lib/store/useStore.ts` - Zustand 전역 상태
- `lib/utils/permissions.ts` - 권한 체크 유틸리티
- `components/AppLayout.tsx` - useAuth() 유일한 호출 위치 ✅
- `supabase-auth-schema.sql` - 인증 DB 스키마
- `supabase-rls-policies.sql` - RLS 정책 (개발용, 프로덕션 전 수정 필요)
