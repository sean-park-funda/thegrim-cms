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
    <nav className="border-b bg-background px-4 py-2 sm:py-3">
      <div className="flex items-center gap-1 sm:gap-2 text-sm">
        <Button
          variant="ghost"
          size="sm"
          className="h-auto p-1 sm:p-2 text-muted-foreground hover:text-foreground"
          onClick={handleWebtoonClick}
        >
          <Home className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>
        {selectedWebtoon && (
          <>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 sm:px-3 py-1 sm:py-2 text-muted-foreground hover:text-foreground truncate max-w-[120px] sm:max-w-none"
              onClick={handleWebtoonClick}
            >
              {selectedWebtoon.title}
            </Button>
          </>
        )}
        {selectedEpisode && (
          <>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 sm:px-3 py-1 sm:py-2 text-muted-foreground hover:text-foreground truncate max-w-[120px] sm:max-w-none"
              onClick={handleEpisodeClick}
            >
              {selectedEpisode.episode_number}화
            </Button>
          </>
        )}
        {selectedCut && (
          <>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 sm:px-3 py-1 sm:py-2 text-muted-foreground hover:text-foreground truncate max-w-[120px] sm:max-w-none"
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

