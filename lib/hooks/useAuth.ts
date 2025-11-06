'use client';

import { useEffect } from 'react';
import { getSession, getCurrentUserProfile } from '@/lib/api/auth';
import { useStore } from '@/lib/store/useStore';
import { supabase } from '@/lib/supabase';

export function useAuth() {
  const { user, profile, isLoading, setUser, setProfile, setLoading } = useStore();

  useEffect(() => {
    // 초기 인증 상태 확인
    checkAuth();

    // 인증 상태 변경 감지
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const userProfile = await getCurrentUserProfile();
        setUser(session.user);
        setProfile(userProfile);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkAuth = async () => {
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
  };

  return { user, profile, isLoading };
}

