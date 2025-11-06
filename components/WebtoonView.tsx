'use client';

import { WebtoonList } from './WebtoonList';
import { EpisodeList } from './EpisodeList';
import { CutList } from './CutList';
import { FileGrid } from './FileGrid';
import { ScrollArea } from '@/components/ui/scroll-area';

export function WebtoonView() {
  return (
    <div className="grid grid-cols-12 h-full divide-x">
      <div className="col-span-2 border-r h-full overflow-hidden">
        <ScrollArea className="h-full">
          <div>
            <WebtoonList />
          </div>
        </ScrollArea>
      </div>
      <div className="col-span-2 border-r h-full overflow-hidden">
        <ScrollArea className="h-full">
          <div>
            <EpisodeList />
          </div>
        </ScrollArea>
      </div>
      <div className="col-span-2 border-r h-full overflow-hidden">
        <ScrollArea className="h-full">
          <div>
            <CutList />
          </div>
        </ScrollArea>
      </div>
      <div className="col-span-6 h-full overflow-hidden">
        <FileGrid />
      </div>
    </div>
  );
}


