'use client';

import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { ChevronRight, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function BreadcrumbNav() {
  const router = useRouter();
  const { selectedWebtoon, selectedEpisode, selectedCut, setSelectedWebtoon, setSelectedEpisode, setSelectedCut } = useStore();

  // 맨 하위 단계 판단: 컷 > 회차 > 웹툰 순서
  const isWebtoonLowest = !!(selectedWebtoon && !selectedEpisode && !selectedCut);
  const isEpisodeLowest = !!(selectedEpisode && !selectedCut);
  const isCutLowest = !!selectedCut;

  const unitType = selectedWebtoon?.unit_type || 'cut';
  const unitLabel = unitType === 'cut' ? '컷' : '페이지';

  const handleHomeClick = () => {
    // 홈 버튼 클릭 시 웹툰 리스트로 이동
    router.push('/webtoons');
    setSelectedCut(null);
    setSelectedEpisode(null);
    setSelectedWebtoon(null);
  };

  const handleWebtoonClick = () => {
    if (!selectedWebtoon) return;
    
    // 웹툰을 클릭하면 회차가 선택되어 있으면 회차 리스트로 이동
    if (selectedEpisode) {
      router.push(`/webtoons/${selectedWebtoon.id}`);
      setSelectedCut(null);
      setSelectedEpisode(null);
    }
    // 회차가 없으면 웹툰 리스트로 이동
    else {
      router.push('/webtoons');
      setSelectedWebtoon(null);
    }
  };

  const handleEpisodeClick = () => {
    if (!selectedWebtoon || !selectedEpisode) return;
    
    // 회차를 클릭하면 컷이 선택되어 있으면 컷 리스트로 이동
    if (selectedCut) {
      router.push(`/webtoons/${selectedWebtoon.id}/episodes/${selectedEpisode.id}`);
      setSelectedCut(null);
    }
    // 컷이 없으면 회차 리스트로 이동
    else {
      router.push(`/webtoons/${selectedWebtoon.id}`);
      setSelectedEpisode(null);
    }
  };

  const handleCutClick = () => {
    if (!selectedWebtoon || !selectedEpisode) return;
    
    // 컷을 클릭하면 컷 리스트로 이동
    router.push(`/webtoons/${selectedWebtoon.id}/episodes/${selectedEpisode.id}`);
    setSelectedCut(null);
  };

  return (
    <nav className="border-b border-border/30 bg-muted/50 px-4 py-2">
      <div className="flex items-center gap-1.5 text-xs">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-foreground/70 hover:text-foreground hover:bg-foreground/10 transition-colors duration-150"
          onClick={handleHomeClick}
        >
          <Home className="h-3.5 w-3.5" />
        </Button>
        {selectedWebtoon && (
          <>
            <ChevronRight className="h-3 w-3 text-foreground/40" />
            <Button
              variant="ghost"
              size="sm"
              disabled={isWebtoonLowest}
              className="h-7 px-2 text-foreground/70 hover:text-foreground hover:bg-foreground/10 truncate max-w-[120px] sm:max-w-none transition-colors duration-150 text-xs disabled:opacity-50 disabled:cursor-default disabled:hover:text-foreground/70 disabled:hover:bg-transparent"
              {...(!isWebtoonLowest && { onClick: handleWebtoonClick })}
            >
              {selectedWebtoon.title}
            </Button>
          </>
        )}
        {selectedEpisode && (
          <>
            <ChevronRight className="h-3 w-3 text-foreground/40" />
            <Button
              variant="ghost"
              size="sm"
              disabled={isEpisodeLowest}
              className="h-7 px-2 text-foreground/70 hover:text-foreground hover:bg-foreground/10 truncate max-w-[120px] sm:max-w-none transition-colors duration-150 text-xs disabled:opacity-50 disabled:cursor-default disabled:hover:text-foreground/70 disabled:hover:bg-transparent"
              {...(!isEpisodeLowest && { onClick: handleEpisodeClick })}
            >
              {selectedEpisode.episode_number}화
            </Button>
          </>
        )}
        {selectedCut && (
          <>
            <ChevronRight className="h-3 w-3 text-foreground/40" />
            <Button
              variant="ghost"
              size="sm"
              disabled={isCutLowest}
              className="h-7 px-2 text-foreground/70 hover:text-foreground hover:bg-foreground/10 truncate max-w-[120px] sm:max-w-none transition-colors duration-150 text-xs disabled:opacity-50 disabled:cursor-default disabled:hover:text-foreground/70 disabled:hover:bg-transparent"
              {...(!isCutLowest && { onClick: handleCutClick })}
            >
              {unitLabel} {selectedCut.cut_number}
            </Button>
          </>
        )}
      </div>
    </nav>
  );
}

