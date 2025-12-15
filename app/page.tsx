'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { useAuth } from '@/lib/hooks/useAuth';

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoading, user } = useStore();
  const hasRedirected = useRef(false);
  useAuth();

  useEffect(() => {
    // 현재 경로가 '/'가 아니면 리다이렉트하지 않음
    if (pathname !== '/') {
      return;
    }
    
    // 이미 리다이렉트했으면 다시 리다이렉트하지 않음
    if (hasRedirected.current) {
      return;
    }
    
    // 로딩 중이 아니고 사용자 상태가 확정되었을 때만 리다이렉트
    if (!isLoading) {
      if (!user) {
        hasRedirected.current = true;
        router.push('/login');
      } else {
        hasRedirected.current = true;
        router.push('/webtoons');
      }
    }
  }, [isLoading, user, router, pathname]);

  // 현재 경로가 '/'가 아니면 아무것도 렌더링하지 않음
  if (pathname !== '/') {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground text-sm">로딩 중...</div>
      </div>
    );
  }

  return null;
}
