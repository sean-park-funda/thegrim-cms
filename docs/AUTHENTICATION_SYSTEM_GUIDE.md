# Next.js + Supabase 인증 시스템 구현 가이드

> **목적**: 초대 기반 회원가입, 역할 시스템, 세션 관리를 포함한 인증 시스템 구현 가이드
> **기술 스택**: Next.js (App Router) + Supabase Auth + Zustand
> **특징**: 초대 기반 가입, 첫 사용자 자동 관리자, 4단계 역할 시스템

---

## 📋 목차

1. [시스템 개요](#1-시스템-개요)
2. [필수 패키지 설치](#2-필수-패키지-설치)
3. [데이터베이스 스키마](#3-데이터베이스-스키마)
4. [Supabase 클라이언트 설정](#4-supabase-클라이언트-설정)
5. [전역 상태 관리 (Zustand)](#5-전역-상태-관리-zustand)
6. [인증 API 함수](#6-인증-api-함수)
7. [인증 훅 (useAuth)](#7-인증-훅-useauth)
8. [라우팅 가드 (AppLayout)](#8-라우팅-가드-applayout)
9. [로그인 페이지](#9-로그인-페이지)
10. [회원가입 페이지](#10-회원가입-페이지)
11. [비밀번호 재설정](#11-비밀번호-재설정)
12. [권한 체크 유틸리티](#12-권한-체크-유틸리티)
13. [관리자 페이지 (초대/사용자 관리)](#13-관리자-페이지)
14. [환경 변수](#14-환경-변수)
15. [구현 순서](#15-구현-순서)

-----

## 1. 시스템 개요

### 핵심 특징

| 특징 | 설명 |
|------|------|
| **초대 기반 가입** | 관리자가 이메일로 초대해야 가입 가능 (첫 사용자는 예외) |
| **첫 사용자 자동 관리자** | 시스템의 첫 번째 사용자는 자동으로 admin 역할 부여 |
| **4단계 역할 시스템** | admin > manager > staff > viewer |
| **클라이언트 세션 관리** | localStorage 기반 세션 저장 + 자동 토큰 갱신 |
| **전역 상태 관리** | Zustand를 통한 Single Source of Truth |

### 인증 흐름

```
[첫 사용자]
    └── /signup 접속 ─→ 회원가입 ─→ 자동 admin 역할 ─→ /login ─→ 로그인

[기존 사용자 초대]
    관리자 (/admin)
        └── 초대 생성 (email + role)
            └── 수신자: /signup?token=xxx 접속
                └── 토큰 검증 ─→ 회원가입 ─→ 역할 자동 부여 ─→ /login

[로그인 후]
    /login ─→ signInWithPassword ─→ 세션 저장 (localStorage)
         ─→ 전역 상태 동기화 (Zustand) ─→ 메인 페이지 이동
```

### 파일 구조

```
lib/
├── supabase.ts              # Supabase 클라이언트
├── api/
│   └── auth.ts              # 인증 API 함수
├── hooks/
│   └── useAuth.ts           # 인증 상태 관리 훅
├── store/
│   └── useStore.ts          # Zustand 전역 상태
└── utils/
    └── permissions.ts       # 권한 체크 유틸리티

app/
├── layout.tsx               # 루트 레이아웃 (AppLayout 포함)
├── login/page.tsx           # 로그인
├── signup/page.tsx          # 회원가입
├── forgot-password/page.tsx # 비밀번호 찾기
├── reset-password/page.tsx  # 비밀번호 재설정
└── admin/page.tsx           # 관리자 페이지

components/
└── AppLayout.tsx            # 공통 레이아웃 (라우팅 가드)
```

---

## 2. 필수 패키지 설치

```bash
npm install @supabase/supabase-js zustand
```

---

## 3. 데이터베이스 스키마

Supabase SQL Editor에서 아래 스크립트를 순서대로 실행합니다.

### 3.1 테이블 생성

```sql
-- 업데이트 타임스탬프 함수 (공통)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 사용자 프로필 테이블
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'manager', 'staff', 'viewer')),
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 초대 테이블
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'staff', 'viewer')),
  token TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::TEXT,
  invited_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);

-- 업데이트 트리거
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 3.2 자동 프로필 생성 트리거

```sql
-- 새 사용자 가입 시 프로필 자동 생성
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, role, name)
  VALUES (
    NEW.id,
    NEW.email,
    'viewer',
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 3.3 헬퍼 RPC 함수

```sql
-- 이메일 확인 자동 처리 (이메일로)
CREATE OR REPLACE FUNCTION confirm_user_email_by_email(user_email TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE auth.users
  SET email_confirmed_at = NOW()
  WHERE email = user_email AND email_confirmed_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 이메일 확인 자동 처리 (ID로)
CREATE OR REPLACE FUNCTION confirm_user_email(user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE auth.users
  SET email_confirmed_at = NOW()
  WHERE id = user_id AND email_confirmed_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 첫 번째 사용자인지 확인
CREATE OR REPLACE FUNCTION is_first_user_excluding(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count FROM auth.users WHERE id != user_id;
  RETURN user_count = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 역할 업데이트
CREATE OR REPLACE FUNCTION update_user_role_on_signup(user_id UUID, new_role TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE user_profiles
  SET role = new_role, updated_at = NOW()
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3.4 RLS (Row Level Security) 정책

```sql
-- user_profiles RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can update all profiles"
  ON user_profiles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- invitations RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage invitations"
  ON invitations FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Anyone can view invitation by token"
  ON invitations FOR SELECT
  USING (true);
```

---

## 4. Supabase 클라이언트 설정

### lib/supabase.ts

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: typeof window !== 'undefined',
    autoRefreshToken: true,
    detectSessionInUrl: typeof window !== 'undefined',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
  global: {
    fetch: (url, options = {}) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      return fetch(url, {
        ...options,
        keepalive: true,
        signal: options.signal || controller.signal,
      }).finally(() => clearTimeout(timeoutId));
    },
  },
});

// 타입 정의
export interface UserProfile {
  id: string;
  email: string;
  role: 'admin' | 'manager' | 'staff' | 'viewer';
  name?: string;
  created_at: string;
  updated_at: string;
}
```

**설정 설명:**
- `persistSession`: 브라우저에서만 세션 저장
- `autoRefreshToken`: 토큰 만료 전 자동 갱신
- `storage`: localStorage 사용
- 타임아웃: 30초 (너무 짧으면 세션 불안정)

---

## 5. 전역 상태 관리 (Zustand)

### lib/store/useStore.ts

```typescript
import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import type { UserProfile } from '../supabase';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ isLoading: loading }),
  reset: () => set({ user: null, profile: null }),
}));
```

---

## 6. 인증 API 함수

### lib/api/auth.ts

```typescript
import { supabase, UserProfile } from '../supabase';

// ============ 타입 정의 ============
export interface Invitation {
  id: string;
  email: string;
  role: 'admin' | 'manager' | 'staff' | 'viewer';
  token: string;
  invited_by?: string;
  expires_at: string;
  used_at?: string;
  created_at: string;
}

// ============ 세션 관리 ============
export async function getSession() {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('세션 조회 타임아웃')), 5000);
  });

  const result = await Promise.race([
    supabase.auth.getSession(),
    timeoutPromise
  ]).catch(() => ({ data: { session: null }, error: null }));

  return (result as any).data?.session || null;
}

export async function getUserProfile(userId: string, session?: any): Promise<UserProfile | null> {
  let currentSession = session;
  if (!currentSession) {
    const { data } = await supabase.auth.getSession();
    currentSession = data.session;
  }
  if (!currentSession) return null;

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) return null;
  return data;
}

// ============ 로그인 ============
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  // 이메일 미확인 시 자동 확인 처리
  if (error?.message?.includes('Email not confirmed')) {
    await supabase.rpc('confirm_user_email_by_email', { user_email: email });
    await new Promise((r) => setTimeout(r, 200));

    const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({ email, password });
    if (retryError) throw retryError;

    if (retryData.user) {
      const profile = await getUserProfile(retryData.user.id, retryData.session);
      return { user: retryData.user, profile };
    }
  }

  if (error) throw error;

  if (data.user) {
    let profile = await getUserProfile(data.user.id, data.session);

    // 프로필 없으면 재시도
    if (!profile) {
      let retries = 3;
      while (retries > 0 && !profile) {
        await new Promise((r) => setTimeout(r, 200));
        profile = await getUserProfile(data.user.id, data.session);
        retries--;
      }
    }
    return { user: data.user, profile };
  }

  return { user: data.user, profile: null };
}

// ============ 회원가입 ============
export async function signUp(email: string, password: string, token?: string, name?: string) {
  let role: UserProfile['role'] = 'viewer';
  let invitationId: string | null = null;

  // 초대 토큰 검증
  if (token) {
    const invitation = await verifyInvitationToken(token);
    if (!invitation) throw new Error('유효하지 않은 초대 토큰입니다.');
    if (invitation.email !== email) throw new Error('초대된 이메일과 일치하지 않습니다.');
    if (invitation.used_at) throw new Error('이미 사용된 초대 토큰입니다.');
    if (new Date(invitation.expires_at) < new Date()) throw new Error('만료된 초대 토큰입니다.');
    role = invitation.role;
    invitationId = invitation.id;
  }

  // Supabase Auth 회원가입
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name: name || email.split('@')[0] } },
  });

  if (error) throw error;
  if (!data.user) throw new Error('사용자 생성에 실패했습니다.');

  // 이메일 자동 확인
  try {
    await supabase.rpc('confirm_user_email', { user_id: data.user.id });
  } catch {}

  // 첫 사용자 확인 (토큰 없을 때)
  if (!token) {
    const { data: isFirst } = await supabase.rpc('is_first_user_excluding', { user_id: data.user.id });
    if (isFirst === true) {
      role = 'admin';
    } else {
      throw new Error('초대 토큰이 필요합니다.');
    }
  }

  // 프로필 생성 대기
  let profile: UserProfile | null = null;
  let retries = 20;
  while (retries > 0 && !profile) {
    await new Promise((r) => setTimeout(r, 500));
    const { data: p } = await supabase.from('user_profiles').select('*').eq('id', data.user.id).maybeSingle();
    if (p) profile = p;
    retries--;
  }

  // 역할 업데이트
  if (profile && profile.role !== role) {
    await supabase.rpc('update_user_role_on_signup', { user_id: data.user.id, new_role: role });
  }

  // 초대 사용 처리
  if (invitationId) {
    await markInvitationAsUsed(invitationId);
  }

  return { user: data.user, profile };
}

// ============ 로그아웃 ============
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ============ 초대 관리 ============
export async function verifyInvitationToken(token: string): Promise<Invitation | null> {
  const { data, error } = await supabase.from('invitations').select('*').eq('token', token).single();
  if (error) return null;
  return data;
}

export async function markInvitationAsUsed(invitationId: string) {
  await supabase.from('invitations').update({ used_at: new Date().toISOString() }).eq('id', invitationId);
}

export async function createInvitation(email: string, role: UserProfile['role'], invitedBy: string): Promise<Invitation> {
  const { data, error } = await supabase
    .from('invitations')
    .insert({
      email,
      role,
      invited_by: invitedBy,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getInvitations(): Promise<Invitation[]> {
  const { data } = await supabase.from('invitations').select('*').order('created_at', { ascending: false });
  return data || [];
}

// ============ 사용자 관리 ============
export async function getUsers(): Promise<UserProfile[]> {
  const { data, error } = await supabase.from('user_profiles').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateUserRole(userId: string, role: UserProfile['role']) {
  const { error } = await supabase.from('user_profiles').update({ role }).eq('id', userId);
  if (error) throw error;
}

// ============ 비밀번호 재설정 ============
export async function sendPasswordResetEmail(email: string) {
  const redirectTo = typeof window !== 'undefined'
    ? `${window.location.origin}/reset-password`
    : `${process.env.NEXT_PUBLIC_APP_URL || ''}/reset-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
```

---

## 7. 인증 훅 (useAuth)

### lib/hooks/useAuth.ts

```typescript
'use client';

import { useEffect, useCallback, useRef } from 'react';
import { getSession, getUserProfile } from '@/lib/api/auth';
import { useStore } from '@/lib/store/useStore';
import { supabase } from '@/lib/supabase';

// 전역 싱글톤으로 리스너 중복 방지
let globalSubscription: { unsubscribe: () => void } | null = null;
let isListenerRegistered = false;

export function useAuth() {
  const { user, profile, isLoading, setUser, setProfile, setLoading } = useStore();
  const isCheckingAuthRef = useRef(false);

  const syncSessionState = useCallback(async (session: any) => {
    if (isCheckingAuthRef.current) return;

    if (session?.user) {
      try {
        const userProfile = await getUserProfile(session.user.id, session);
        setUser(session.user);
        setProfile(userProfile);
      } catch {
        setUser(session.user);
        setProfile(null);
      }
    } else {
      setUser(null);
      setProfile(null);
    }
  }, [setUser, setProfile]);

  const checkAuth = useCallback(async () => {
    if (isCheckingAuthRef.current) return;

    try {
      isCheckingAuthRef.current = true;
      setLoading(true);

      const session = await Promise.race([
        getSession(),
        new Promise((_, reject) => setTimeout(() => reject(), 30000))
      ]).catch(() => null);

      if (session?.user) {
        const userProfile = await Promise.race([
          getUserProfile(session.user.id, session),
          new Promise<null>((_, reject) => setTimeout(() => reject(), 15000))
        ]).catch(() => null);

        setUser(session.user);
        setProfile(userProfile);
      } else {
        setUser(null);
        setProfile(null);
      }
    } catch {
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
      isCheckingAuthRef.current = false;
    }
  }, [setUser, setProfile, setLoading]);

  useEffect(() => {
    checkAuth();

    if (isListenerRegistered) return;
    isListenerRegistered = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') {
        if (session?.user) await syncSessionState(session);
        else { setUser(null); setProfile(null); }
        return;
      }

      if (session?.user) {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          const currentUser = useStore.getState().user;
          if (currentUser?.id === session.user.id && event !== 'USER_UPDATED') return;
          await syncSessionState(session);
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
      }
    });

    globalSubscription = subscription;

    const handleBeforeUnload = () => {
      if (globalSubscription) {
        globalSubscription.unsubscribe();
        globalSubscription = null;
        isListenerRegistered = false;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return { user, profile, isLoading };
}
```

**핵심 포인트:**
- 싱글톤 리스너: 중복 등록 방지
- 동일 사용자 체크: 불필요한 리렌더링 방지
- 타임아웃: 인증 확인 30초, 프로필 조회 15초

---

## 8. 라우팅 가드 (AppLayout)

### components/AppLayout.tsx

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { useStore } from '@/lib/store/useStore';

const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password'];

export function AppLayout({ children }: { children: React.ReactNode }) {
  useAuth(); // 여기서만 호출!

  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useStore();

  useEffect(() => {
    if (isLoading) return;
    const isPublicPath = PUBLIC_PATHS.some(path => pathname?.startsWith(path));
    if (!user && !isPublicPath) {
      router.push('/login');
    }
  }, [user, isLoading, pathname, router]);

  return <>{children}</>;
}
```

### app/layout.tsx

```typescript
import { AppLayout } from '@/components/AppLayout';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}
```

**중요 규칙:**
1. `useAuth()`는 AppLayout에서만 호출
2. 다른 페이지에서는 `useStore()`만 사용
3. 로딩 중에는 리다이렉트하지 않음

---

## 9. 로그인 페이지

### app/login/page.tsx

```typescript
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signIn } from '@/lib/api/auth';
import { useStore } from '@/lib/store/useStore';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading, setUser, setProfile } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) router.push('/');
  }, [authLoading, user, router]);

  useEffect(() => {
    const emailParam = searchParams.get('email');
    const signupSuccess = searchParams.get('signup');
    if (emailParam) setEmail(emailParam);
    if (signupSuccess === 'success') setError('');
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const { user, profile } = await signIn(email, password);
      if (user && profile) {
        setUser(user);
        setProfile(profile);
        router.push('/');
      }
    } catch (err: any) {
      setError(err.message || '로그인에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) return <div>로딩 중...</div>;
  if (user) return null;

  return (
    <form onSubmit={handleSubmit}>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <div>{error}</div>}
      <button type="submit" disabled={isLoading}>{isLoading ? '로그인 중...' : '로그인'}</button>
      <Link href="/forgot-password">비밀번호를 잊으셨나요?</Link>
    </form>
  );
}

// useSearchParams 사용 시 Suspense 필수!
export default function LoginPage() {
  return (
    <Suspense fallback={<div>로딩 중...</div>}>
      <LoginForm />
    </Suspense>
  );
}
```

---

## 10. 회원가입 페이지

### app/signup/page.tsx

```typescript
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signUp, verifyInvitationToken } from '@/lib/api/auth';
import { useStore } from '@/lib/store/useStore';

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useStore();
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [invitationInfo, setInvitationInfo] = useState<{ email: string; role: string } | null>(null);

  useEffect(() => {
    if (!authLoading && user) router.push('/');
  }, [authLoading, user, router]);

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (tokenParam) {
      setToken(tokenParam);
      verifyToken(tokenParam);
    }
  }, [searchParams]);

  const verifyToken = async (t: string) => {
    try {
      const invitation = await verifyInvitationToken(t);
      if (!invitation) { setError('유효하지 않은 초대 링크입니다.'); return; }
      if (invitation.used_at) { setError('이미 사용된 초대 링크입니다.'); return; }
      if (new Date(invitation.expires_at) < new Date()) { setError('만료된 초대 링크입니다.'); return; }
      setInvitationInfo({ email: invitation.email, role: invitation.role });
      setEmail(invitation.email);
    } catch {
      setError('초대 링크 검증에 실패했습니다.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) { setError('비밀번호가 일치하지 않습니다.'); return; }
    if (password.length < 6) { setError('비밀번호는 최소 6자 이상이어야 합니다.'); return; }
    setIsLoading(true);

    try {
      await signUp(email, password, token || undefined, name);
      router.push('/login?email=' + encodeURIComponent(email) + '&signup=success');
    } catch (err: any) {
      setError(err.message || '회원가입에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) return <div>로딩 중...</div>;
  if (user) return null;

  return (
    <form onSubmit={handleSubmit}>
      {invitationInfo && <p>{invitationInfo.email}로 {invitationInfo.role} 역할로 초대되었습니다.</p>}
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!invitationInfo} required />
      <input type="text" placeholder="이름 (선택)" value={name} onChange={(e) => setName(e.target.value)} />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
      {error && <div>{error}</div>}
      <button type="submit" disabled={isLoading}>{isLoading ? '가입 중...' : '회원가입'}</button>
    </form>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div>로딩 중...</div>}>
      <SignupForm />
    </Suspense>
  );
}
```

---

## 11. 비밀번호 재설정

### app/forgot-password/page.tsx

```typescript
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { sendPasswordResetEmail } from '@/lib/api/auth';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(email);
      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || '이메일 발송에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div>
        <p>{email}로 비밀번호 재설정 링크를 발송했습니다.</p>
        <Link href="/login">로그인으로 돌아가기</Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      {error && <div>{error}</div>}
      <button type="submit" disabled={isLoading}>{isLoading ? '발송 중...' : '재설정 링크 보내기'}</button>
      <Link href="/login">로그인으로 돌아가기</Link>
    </form>
  );
}
```

### app/reset-password/page.tsx

```typescript
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { updatePassword } from '@/lib/api/auth';
import { useStore } from '@/lib/store/useStore';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useStore();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    const errorParam = searchParams.get('error');
    if (errorParam) {
      setError(searchParams.get('error_description') || '유효하지 않은 링크입니다.');
      setIsCheckingSession(false);
      return;
    }
    if (user) setIsValidSession(true);
    setIsCheckingSession(false);
  }, [authLoading, user, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('비밀번호는 최소 6자 이상이어야 합니다.'); return; }
    if (password !== confirmPassword) { setError('비밀번호가 일치하지 않습니다.'); return; }
    setIsLoading(true);
    try {
      await updatePassword(password);
      setIsSuccess(true);
      setTimeout(() => router.push('/login'), 3000);
    } catch (err: any) {
      setError(err.message || '비밀번호 변경에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading || isCheckingSession) return <div>로딩 중...</div>;
  if (isSuccess) return <div><p>비밀번호가 변경되었습니다.</p><Link href="/login">로그인하기</Link></div>;
  if (!isValidSession) return <div><p>{error || '유효하지 않은 링크입니다.'}</p><Link href="/forgot-password">다시 요청하기</Link></div>;

  return (
    <form onSubmit={handleSubmit}>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
      {error && <div>{error}</div>}
      <button type="submit" disabled={isLoading}>{isLoading ? '변경 중...' : '비밀번호 변경'}</button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div>로딩 중...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
```

---

## 12. 권한 체크 유틸리티

### lib/utils/permissions.ts

```typescript
export type UserRole = 'admin' | 'manager' | 'staff' | 'viewer';

// 역할 계층 (높은 숫자 = 높은 권한)
const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 4,
  manager: 3,
  staff: 2,
  viewer: 1,
};

// 최소 역할 체크
export function hasMinRole(userRole: UserRole, minRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole];
}

// 관리자 권한
export function isAdmin(role: UserRole): boolean {
  return role === 'admin';
}

// 콘텐츠 생성/수정/삭제 권한 (admin, manager)
export function canManageContent(role: UserRole): boolean {
  return hasMinRole(role, 'manager');
}

// 파일 업로드 권한 (admin, manager, staff)
export function canUploadFile(role: UserRole): boolean {
  return hasMinRole(role, 'staff');
}

// 파일 삭제 권한 (admin, manager는 모두, staff는 본인 것만)
export function canDeleteFile(role: UserRole, fileOwnerId?: string, currentUserId?: string): boolean {
  if (hasMinRole(role, 'manager')) return true;
  if (role === 'staff' && fileOwnerId && currentUserId) {
    return fileOwnerId === currentUserId;
  }
  return false;
}

// 사용자 초대/관리 권한 (admin만)
export function canManageUsers(role: UserRole): boolean {
  return isAdmin(role);
}
```

**사용 예시:**

```typescript
import { canManageContent, canUploadFile, canDeleteFile } from '@/lib/utils/permissions';
import { useStore } from '@/lib/store/useStore';

function MyComponent() {
  const { profile } = useStore();

  const showEditButton = profile && canManageContent(profile.role);
  const showUploadButton = profile && canUploadFile(profile.role);
  const showDeleteButton = profile && canDeleteFile(profile.role, file.created_by, profile.id);

  return (
    <>
      {showEditButton && <button>수정</button>}
      {showUploadButton && <button>업로드</button>}
      {showDeleteButton && <button>삭제</button>}
    </>
  );
}
```

---

## 13. 관리자 페이지

### app/admin/page.tsx (핵심 부분)

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { createInvitation, getInvitations, getUsers, updateUserRole, type UserProfile } from '@/lib/api/auth';

export default function AdminPage() {
  const router = useRouter();
  const { user, profile, isLoading } = useStore();
  const [invitations, setInvitations] = useState<any[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserProfile['role']>('staff');

  // 관리자 아니면 리다이렉트
  useEffect(() => {
    if (!isLoading && (!user || profile?.role !== 'admin')) {
      router.push('/');
    }
  }, [isLoading, user, profile, router]);

  useEffect(() => {
    if (profile?.role === 'admin') {
      loadData();
    }
  }, [profile]);

  const loadData = async () => {
    const [inv, usr] = await Promise.all([getInvitations(), getUsers()]);
    setInvitations(inv);
    setUsers(usr);
  };

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !user) return;
    await createInvitation(email, role, user.id);
    setEmail('');
    loadData();
  };

  const handleUpdateRole = async (userId: string, newRole: UserProfile['role']) => {
    await updateUserRole(userId, newRole);
    loadData();
  };

  const copyInvitationLink = (token: string) => {
    const origin = process.env.NEXT_PUBLIC_APP_URL || '';
    navigator.clipboard.writeText(`${origin}/signup?token=${token}`);
  };

  if (isLoading) return <div>로딩 중...</div>;
  if (!user || profile?.role !== 'admin') return null;

  return (
    <div>
      <h1>관리자 페이지</h1>

      {/* 초대 생성 폼 */}
      <form onSubmit={handleCreateInvitation}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <select value={role} onChange={(e) => setRole(e.target.value as any)}>
          <option value="admin">관리자</option>
          <option value="manager">매니저</option>
          <option value="staff">스태프</option>
          <option value="viewer">조회자</option>
        </select>
        <button type="submit">초대 생성</button>
      </form>

      {/* 초대 목록 */}
      <h2>초대 목록</h2>
      {invitations.map((inv) => (
        <div key={inv.id}>
          <span>{inv.email} - {inv.role}</span>
          {!inv.used_at && new Date(inv.expires_at) >= new Date() && (
            <button onClick={() => copyInvitationLink(inv.token)}>링크 복사</button>
          )}
        </div>
      ))}

      {/* 사용자 목록 */}
      <h2>사용자 목록</h2>
      {users.map((u) => (
        <div key={u.id}>
          <span>{u.name || u.email}</span>
          <select
            value={u.role}
            onChange={(e) => handleUpdateRole(u.id, e.target.value as any)}
            disabled={u.id === user?.id}
          >
            <option value="admin">관리자</option>
            <option value="manager">매니저</option>
            <option value="staff">스태프</option>
            <option value="viewer">조회자</option>
          </select>
        </div>
      ))}
    </div>
  );
}
```

---

## 14. 환경 변수

### .env.local

```bash
# Supabase (필수)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# 앱 URL (초대 링크 생성에 사용)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 15. 구현 순서

### 1단계: 기본 설정
```bash
npm install @supabase/supabase-js zustand
```

### 2단계: Supabase 설정
1. Supabase 프로젝트 생성
2. SQL Editor에서 스키마 실행 (섹션 3 참고)
3. .env.local 환경 변수 설정

### 3단계: 코드 구현 순서
```
1. lib/supabase.ts
2. lib/store/useStore.ts
3. lib/api/auth.ts
4. lib/hooks/useAuth.ts
5. lib/utils/permissions.ts
6. components/AppLayout.tsx
7. app/layout.tsx (AppLayout 적용)
8. app/login/page.tsx
9. app/signup/page.tsx
10. app/forgot-password/page.tsx
11. app/reset-password/page.tsx
12. app/admin/page.tsx
```

### 4단계: 테스트
1. 첫 사용자 가입 → 자동 admin 확인
2. admin으로 초대 생성
3. 초대 링크로 가입 → 역할 확인
4. 로그인/로그아웃 테스트
5. 세션 유지 테스트 (새로고침)
6. 비밀번호 재설정 테스트

---

## 역할 권한 요약

| 기능 | admin | manager | staff | viewer |
|------|-------|---------|-------|--------|
| 데이터 조회 | ✅ | ✅ | ✅ | ✅ |
| 파일 다운로드 | ✅ | ✅ | ✅ | ✅ |
| 파일 업로드 | ✅ | ✅ | ✅ | ❌ |
| 파일 삭제 | ✅ 모두 | ✅ 모두 | ✅ 본인만 | ❌ |
| 콘텐츠 관리 | ✅ | ✅ | ❌ | ❌ |
| 사용자 초대/관리 | ✅ | ❌ | ❌ | ❌ |
| 관리자 페이지 | ✅ | ❌ | ❌ | ❌ |

---

## 세션 유지 방식 요약

| 항목 | 값 |
|------|-----|
| 저장 위치 | localStorage |
| Access Token 유효 기간 | 1시간 (Supabase 기본값) |
| Refresh Token 유효 기간 | 7일 (Supabase 기본값) |
| 자동 갱신 | 만료 1분 전 |
| 이벤트 감지 | onAuthStateChange (싱글톤) |

---

## 주의사항

1. **useAuth 호출 위치**: AppLayout에서만 호출, 다른 곳에서는 useStore 사용
2. **Suspense Boundary**: useSearchParams 사용하는 컴포넌트는 Suspense로 감싸기
3. **타임아웃**: 너무 짧으면 세션 불안정 (5초 → 30초 권장)
4. **RLS 정책**: 프로덕션 배포 전 역할별 접근 권한 설정 필수
