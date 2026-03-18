'use client';

import { useMemo } from 'react';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Episode } from '@/lib/supabase';

interface TimelineSliderProps {
  episodes: Episode[];
  currentEpisodeId: string | null;
  changedEpisodeIds: Set<string>; // Episodes that have relationship changes
  onEpisodeSelect: (episodeId: string | null) => void;
}

export default function TimelineSlider({
  episodes,
  currentEpisodeId,
  changedEpisodeIds,
  onEpisodeSelect,
}: TimelineSliderProps) {
  const sortedEpisodes = useMemo(
    () => [...episodes].sort((a, b) => a.episode_number - b.episode_number),
    [episodes]
  );

  const currentIndex = sortedEpisodes.findIndex(
    (ep) => ep.id === currentEpisodeId
  );

  const handlePrev = () => {
    if (currentIndex > 0) {
      onEpisodeSelect(sortedEpisodes[currentIndex - 1].id);
    }
  };

  const handleNext = () => {
    if (currentIndex < sortedEpisodes.length - 1) {
      onEpisodeSelect(sortedEpisodes[currentIndex + 1].id);
    } else {
      onEpisodeSelect(null); // "현재" 모드
    }
  };

  const handleReset = () => {
    onEpisodeSelect(null); // 현재 상태로
  };

  if (sortedEpisodes.length === 0) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm border-t border-slate-200 px-4 py-3 z-10">
      <div className="flex items-center gap-3">
        {/* Controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-slate-900"
            onClick={handlePrev}
            disabled={currentIndex <= 0}
          >
            <SkipBack className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-slate-900"
            onClick={handleReset}
          >
            <SkipForward className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Current label */}
        <span className="text-xs text-slate-400 min-w-[60px]">
          {currentEpisodeId
            ? `${sortedEpisodes[currentIndex]?.episode_number}화`
            : '현재'}
        </span>

        {/* Timeline track */}
        <div className="flex-1 flex items-center gap-0.5 overflow-x-auto">
          {sortedEpisodes.map((ep, idx) => {
            const isActive = ep.id === currentEpisodeId;
            const hasChange = changedEpisodeIds.has(ep.id);
            const isPast =
              currentEpisodeId === null || currentIndex === -1
                ? true
                : idx <= currentIndex;

            return (
              <button
                key={ep.id}
                onClick={() => onEpisodeSelect(ep.id)}
                className={`
                  relative flex-shrink-0 h-6 min-w-[28px] px-1 rounded text-[10px] font-mono
                  transition-all duration-150 cursor-pointer
                  ${
                    isActive
                      ? 'bg-blue-500 text-white scale-110 z-10'
                      : isPast
                        ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                  }
                `}
                title={`${ep.episode_number}화: ${ep.title}`}
              >
                {ep.episode_number}
                {/* Red dot for episodes with relationship changes */}
                {hasChange && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>
            );
          })}

          {/* "현재" marker */}
          <button
            onClick={() => onEpisodeSelect(null)}
            className={`
              flex-shrink-0 h-6 px-2 rounded text-[10px] font-medium
              ${
                currentEpisodeId === null
                  ? 'bg-emerald-500 text-white scale-110'
                  : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
              }
            `}
          >
            현재
          </button>
        </div>
      </div>
    </div>
  );
}
