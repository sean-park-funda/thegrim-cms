'use client';

import { WebtoonList } from './WebtoonList';
import { EpisodeList } from './EpisodeList';
import { CutList } from './CutList';
import { FileGrid } from './FileGrid';
import { BreadcrumbNav } from './BreadcrumbNav';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useStore } from '@/lib/store/useStore';

export function WebtoonView() {
  const { selectedWebtoon, selectedEpisode, selectedCut } = useStore();

  return (
    <>
      <BreadcrumbNav />
      {/* 모바일: 세로 스택 레이아웃 (한 번에 하나의 리스트만 표시) */}
      <div className="flex flex-col lg:hidden h-full overflow-hidden">
        {!selectedWebtoon && (
          <ScrollArea className="flex-1">
            <WebtoonList />
          </ScrollArea>
        )}
        {selectedWebtoon && !selectedEpisode && (
          <ScrollArea className="flex-1">
            <EpisodeList />
          </ScrollArea>
        )}
        {selectedWebtoon && selectedEpisode && !selectedCut && (
          <div className="flex-1 overflow-hidden">
            <CutList />
          </div>
        )}
        {selectedWebtoon && selectedEpisode && selectedCut && (
          <div className="flex-1 overflow-hidden">
            <FileGrid />
          </div>
        )}
      </div>

      {/* 데스크톱: 웹툰/회차는 개별 화면, 회차 선택 후 컷+파일을 한 화면에 나란히 */}
      <div className="hidden lg:flex lg:flex-col h-full overflow-hidden">
        {!selectedWebtoon && (
          <ScrollArea className="flex-1">
            <WebtoonList />
          </ScrollArea>
        )}
        {selectedWebtoon && !selectedEpisode && (
          <ScrollArea className="flex-1">
            <EpisodeList />
          </ScrollArea>
        )}
        {selectedWebtoon && selectedEpisode && (
          <div className="flex-1 grid grid-cols-12 h-full overflow-hidden">
            <div className="col-span-2 border-r border-border/40 h-full overflow-hidden bg-background">
              <CutList />
            </div>
            <div className="col-span-10 h-full overflow-hidden bg-background">
              <FileGrid />
            </div>
          </div>
        )}
      </div>
    </>
  );
}


