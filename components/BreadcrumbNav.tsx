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

  const handleWebtoonClick = () => {
    setSelectedWebtoon(null);
  };

  const handleEpisodeClick = () => {
    if (selectedWebtoon) {
      setSelectedEpisode(null);
    }
  };

  const handleCutClick = () => {
    if (selectedEpisode) {
      setSelectedCut(null);
    }
  };

  return (
    <nav className="border-b border-border/20 bg-foreground/95 px-4 py-2">
      <div className="flex items-center gap-1.5 text-xs">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-background/70 hover:text-background hover:bg-background/10 transition-colors duration-150"
          onClick={handleWebtoonClick}
        >
          <Home className="h-3.5 w-3.5" />
        </Button>
        {selectedWebtoon && (
          <>
            <ChevronRight className="h-3 w-3 text-background/40" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-background/70 hover:text-background hover:bg-background/10 truncate max-w-[120px] sm:max-w-none transition-colors duration-150 text-xs"
              onClick={handleWebtoonClick}
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
              className="h-7 px-2 text-background/70 hover:text-background hover:bg-background/10 truncate max-w-[120px] sm:max-w-none transition-colors duration-150 text-xs"
              onClick={handleEpisodeClick}
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
              className="h-7 px-2 text-background/70 hover:text-background hover:bg-background/10 truncate max-w-[120px] sm:max-w-none transition-colors duration-150 text-xs"
              onClick={handleCutClick}
            >
              컷 {selectedCut.cut_number}
            </Button>
          </>
        )}
      </div>
    </nav>
  );
}

