'use client';

import { EpisodeWithCuts } from '@/lib/supabase';
import { CutList } from './CutList';

interface CutListPageProps {
  episode: EpisodeWithCuts;
}

export function CutListPage({ episode }: CutListPageProps) {
  return (
    <div className="flex-1 overflow-hidden bg-background">
      <div className="h-full">
        <CutList episode={episode} />
      </div>
    </div>
  );
}

