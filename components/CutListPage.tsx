'use client';

import { useEffect } from 'react';
import { EpisodeWithCuts } from '@/lib/supabase';
import { CutList } from './CutList';
import { useStore } from '@/lib/store/useStore';

interface CutListPageProps {
  episode: EpisodeWithCuts;
}

export function CutListPage({ episode }: CutListPageProps) {
  const { setSelectedWebtoon, setSelectedEpisode, setSelectedCut } = useStore();

  // 브레드크럼 네비게이션을 위해 store에 상태 설정
  useEffect(() => {
    setSelectedWebtoon(episode.webtoon);
    setSelectedEpisode(episode);
    setSelectedCut(null); // 컷 목록 페이지이므로 컷은 선택되지 않음
  }, [episode.id, setSelectedWebtoon, setSelectedEpisode, setSelectedCut]);

  return (
    <div className="flex-1 overflow-hidden bg-background">
      <div className="h-full">
        <CutList episode={episode} />
      </div>
    </div>
  );
}


