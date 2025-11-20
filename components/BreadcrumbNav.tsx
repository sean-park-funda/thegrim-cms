'use client';

import { useStore } from '@/lib/store/useStore';
import { ChevronRight, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function BreadcrumbNav() {
  const { selectedWebtoon, selectedEpisode, selectedCut, setSelectedWebtoon, setSelectedEpisode, setSelectedCut } = useStore();

  // 모바일에서만 표시
  if (!selectedWebtoon && !selectedEpisode && !selectedCut) {
    return null;
  }

  // 맨 하위 단계 판단: 컷 > 회차 > 웹툰 순서
  const isWebtoonLowest = !!(selectedWebtoon && !selectedEpisode && !selectedCut);
  const isEpisodeLowest = !!(selectedEpisode && !selectedCut);
  const isCutLowest = !!selectedCut;

  const unitType = selectedWebtoon?.unit_type || 'cut';
  const unitLabel = unitType === 'cut' ? '컷' : '페이지';

  const handleHomeClick = () => {
    // 홈 버튼 클릭 시 모든 선택 해제
    setSelectedCut(null);
    setSelectedEpisode(null);
    setSelectedWebtoon(null);
  };

  const handleWebtoonClick = () => {
    // 웹툰을 클릭하면 회차가 선택되어 있으면 회차만 해제하고 웹툰은 유지 (회차 리스트로 이동)
    if (selectedEpisode) {
      setSelectedEpisode(null);
    }
    // 회차가 없으면 웹툰 리스트로 이동
    else {
      setSelectedWebtoon(null);
    }
  };

  const handleEpisodeClick = () => {
    // 회차를 클릭하면 컷이 선택되어 있으면 컷만 해제하고 회차는 유지 (컷 리스트로 이동)
    if (selectedCut) {
      setSelectedCut(null);
    }
    // 컷이 없으면 회차 리스트로 이동
    else {
      setSelectedEpisode(null);
    }
  };

  const handleCutClick = () => {
    // 컷을 클릭하면 컷만 해제하여 컷 리스트로 이동
    setSelectedCut(null);
  };

  return (
    <nav className="border-b border-border/20 bg-foreground/95 px-4 py-2">
      <div className="flex items-center gap-1.5 text-xs">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-background/70 hover:text-background hover:bg-background/10 transition-colors duration-150"
          onClick={handleHomeClick}
        >
          <Home className="h-3.5 w-3.5" />
        </Button>
        {selectedWebtoon && (
          <>
            <ChevronRight className="h-3 w-3 text-background/40" />
            <Button
              variant="ghost"
              size="sm"
              disabled={isWebtoonLowest}
              className="h-7 px-2 text-background/70 hover:text-background hover:bg-background/10 truncate max-w-[120px] sm:max-w-none transition-colors duration-150 text-xs disabled:opacity-50 disabled:cursor-default disabled:hover:text-background/70 disabled:hover:bg-transparent"
              onClick={isWebtoonLowest ? undefined : handleWebtoonClick}
            >
              {selectedWebtoon.title}
            </Button>
          </>
        )}
        {selectedEpisode && (
          <>
            <ChevronRight className="h-3 w-3 text-background/40" />
            <Button
              variant="ghost"
              size="sm"
              disabled={isEpisodeLowest}
              className="h-7 px-2 text-background/70 hover:text-background hover:bg-background/10 truncate max-w-[120px] sm:max-w-none transition-colors duration-150 text-xs disabled:opacity-50 disabled:cursor-default disabled:hover:text-background/70 disabled:hover:bg-transparent"
              onClick={isEpisodeLowest ? undefined : handleEpisodeClick}
            >
              {selectedEpisode.episode_number}화
            </Button>
          </>
        )}
        {selectedCut && (
          <>
            <ChevronRight className="h-3 w-3 text-background/40" />
            <Button
              variant="ghost"
              size="sm"
              disabled={isCutLowest}
              className="h-7 px-2 text-background/70 hover:text-background hover:bg-background/10 truncate max-w-[120px] sm:max-w-none transition-colors duration-150 text-xs disabled:opacity-50 disabled:cursor-default disabled:hover:text-background/70 disabled:hover:bg-transparent"
              onClick={isCutLowest ? undefined : handleCutClick}
            >
              {unitLabel} {selectedCut.cut_number}
            </Button>
          </>
        )}
      </div>
    </nav>
  );
}

