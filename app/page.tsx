'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { useAuth } from '@/lib/hooks/useAuth';
import { Navigation } from '@/components/Navigation';
import { WebtoonView } from '@/components/WebtoonView';
import { ProcessView } from '@/components/ProcessView';
import { SearchResults } from '@/components/SearchResults';

export default function Home() {
  const router = useRouter();
  const { viewMode, searchQuery, isLoading, user } = useStore();
  useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [isLoading, user, router]);

  const showSearchResults = searchQuery.trim().length >= 2;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground text-sm">로딩 중...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <Navigation />
      <div className="flex-1 overflow-hidden bg-background">
        {showSearchResults ? (
          <SearchResults />
        ) : viewMode === 'webtoon' ? (
          <WebtoonView />
        ) : (
          <ProcessView />
        )}
      </div>
    </div>
  );
}
