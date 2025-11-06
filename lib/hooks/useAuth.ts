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
      const session = await getSession();
      if (session?.user) {
        const userProfile = await getCurrentUserProfile();
        setUser(session.user);
        setProfile(userProfile);
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

