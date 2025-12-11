'use client';

import { useState, useEffect } from 'react';
import { WebtoonList } from './WebtoonList';
import { EpisodeList } from './EpisodeList';
import { CutList } from './CutList';
import { FileGrid } from './FileGrid';
import { BreadcrumbNav } from './BreadcrumbNav';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useStore } from '@/lib/store/useStore';

export function WebtoonView() {
  const { selectedWebtoon, selectedEpisode, selectedCut } = useStore();
  const [isDesktop, setIsDesktop] = useState(false);

  // 화면 크기에 따라 데스크톱 여부 결정
  useEffect(() => {
    const checkScreenSize = () => {
      setIsDesktop(window.innerWidth >= 1024); // lg breakpoint
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // FileGrid는 하나의 인스턴스만 사용 (같은 key로 React가 같은 컴포넌트로 인식)
  const fileGridKey = selectedCut ? `filegrid-${selectedCut.id}` : null;

  return (
    <>
      <BreadcrumbNav />
      {/* 모바일: 세로 스택 레이아웃 (한 번에 하나의 리스트만 표시) */}
      {!isDesktop && (
        <div className="flex flex-col h-full min-h-0">
          {!selectedWebtoon && (
            <div className="flex-1 min-h-0">
              <WebtoonList />
            </div>
          )}
          {selectedWebtoon && !selectedEpisode && (
            <ScrollArea className="flex-1">
              <EpisodeList webtoon={{ ...selectedWebtoon, episodes: [] }} />
            </ScrollArea>
          )}
          {selectedWebtoon && selectedEpisode && !selectedCut && (
            <div className="flex-1 overflow-hidden">
              <CutList episode={{ ...selectedEpisode, cuts: [], webtoon: selectedWebtoon }} />
            </div>
          )}
          {selectedWebtoon && selectedEpisode && selectedCut && fileGridKey && (
            <div className="flex-1 min-h-0">
              <FileGrid key={fileGridKey} cutId={selectedCut.id} />
            </div>
          )}
        </div>
      )}

      {/* 데스크톱: 웹툰/회차는 개별 화면, 회차 선택 후 컷+파일을 한 화면에 나란히 */}
      {isDesktop && (
        <div className="flex flex-col h-full min-h-0">
          {!selectedWebtoon && (
            <ScrollArea className="flex-1">
              <WebtoonList />
            </ScrollArea>
          )}
          {selectedWebtoon && !selectedEpisode && (
            <ScrollArea className="flex-1">
              <EpisodeList webtoon={{ ...selectedWebtoon, episodes: [] }} />
            </ScrollArea>
          )}
          {selectedWebtoon && selectedEpisode && (
            <div className="flex-1 grid grid-cols-12 h-full min-h-0">
              <div className="col-span-2 border-r border-border/40 h-full min-h-0 bg-background">
                <CutList episode={{ ...selectedEpisode, cuts: [], webtoon: selectedWebtoon }} />
              </div>
              <div className="col-span-10 h-full min-h-0 bg-background">
                {fileGridKey && selectedCut && <FileGrid key={fileGridKey} cutId={selectedCut.id} />}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}


