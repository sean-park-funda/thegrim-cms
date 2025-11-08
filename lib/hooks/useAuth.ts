'use client';

import { useEffect, useCallback, useRef } from 'react';
import { getSession, getCurrentUserProfile } from '@/lib/api/auth';
import { useStore } from '@/lib/store/useStore';
import { supabase } from '@/lib/supabase';

export function useAuth() {
  const { user, profile, isLoading, setUser, setProfile, setLoading } = useStore();
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

  // 세션 상태를 동기화하는 헬퍼 함수
  const syncSessionState = useCallback(async (session: any) => {
    if (session?.user) {
      try {
        const userProfile = await getCurrentUserProfile();
        setUser(session.user);
        setProfile(userProfile);
      } catch (profileError) {
        console.warn('프로필 조회 실패, 사용자 정보만 설정:', profileError);
        setUser(session.user);
        setProfile(null);
      }
    } else {
      setUser(null);
      setProfile(null);
    }
  }, [setUser, setProfile]);

  const checkAuth = useCallback(async () => {
    try {
      setLoading(true);
      
      // 타임아웃 설정 (10초)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('인증 확인 타임아웃')), 10000);
      });
      
      const sessionPromise = getSession();
      const session = await Promise.race([sessionPromise, timeoutPromise]).catch(() => null) as Awaited<ReturnType<typeof getSession>> | null;
      
      if (session?.user) {
        // 프로필 가져오기도 타임아웃 설정
        const profilePromise = getCurrentUserProfile();
        const profileTimeoutPromise = new Promise<null>((_, reject) => {
          setTimeout(() => reject(new Error('프로필 조회 타임아웃')), 5000);
        });
        
        try {
          const userProfile = await Promise.race([profilePromise, profileTimeoutPromise]).catch(() => null) as Awaited<ReturnType<typeof getCurrentUserProfile>> | null;
          setUser(session.user);
          setProfile(userProfile);
        } catch (profileError) {
          console.warn('프로필 조회 실패, 사용자 정보만 설정:', profileError);
          setUser(session.user);
          setProfile(null);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
    } catch (error) {
      console.error('인증 확인 오류:', error);
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [setUser, setProfile, setLoading]);

  useEffect(() => {
    // 초기 인증 상태 확인
    checkAuth();

    // 기존 리스너가 있으면 정리
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
    }

    // 인증 상태 변경 감지
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('인증 상태 변경:', event, session?.user?.id);
      
      // 세션이 있는 모든 이벤트에서 상태 갱신
      if (session?.user) {
        // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED 등 세션이 있는 경우
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          await syncSessionState(session);
        }
      } else if (event === 'SIGNED_OUT') {
        // 로그아웃 시 상태 초기화
        setUser(null);
        setProfile(null);
      }
    });

    subscriptionRef.current = subscription;

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
    };
  }, [checkAuth, syncSessionState, setUser, setProfile]);

  return { user, profile, isLoading };
}

