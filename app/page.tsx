'use client';

import { useStore } from '@/lib/store/useStore';
import { Navigation } from '@/components/Navigation';
import { WebtoonView } from '@/components/WebtoonView';
import { ProcessView } from '@/components/ProcessView';
import { SearchResults } from '@/components/SearchResults';

export default function Home() {
  const { viewMode, searchQuery } = useStore();

  const showSearchResults = searchQuery.trim().length >= 2;

  return (
    <div className="flex flex-col h-screen bg-background">
      <Navigation />
      <div className="flex-1 overflow-hidden">
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
