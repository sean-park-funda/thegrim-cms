'use client';

import { WebtoonList } from './WebtoonList';
import { EpisodeList } from './EpisodeList';
import { CutList } from './CutList';
import { FileGrid } from './FileGrid';
import { ScrollArea } from '@/components/ui/scroll-area';

export function WebtoonView() {
  return (
    <div className="grid grid-cols-12 h-full divide-x">
      <div className="col-span-2 border-r">
        <ScrollArea className="h-full">
          <WebtoonList />
        </ScrollArea>
      </div>
      <div className="col-span-2 border-r">
        <ScrollArea className="h-full">
          <EpisodeList />
        </ScrollArea>
      </div>
      <div className="col-span-2 border-r">
        <ScrollArea className="h-full">
          <CutList />
        </ScrollArea>
      </div>
      <div className="col-span-6">
        <FileGrid />
      </div>
    </div>
  );
}


