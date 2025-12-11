'use client';

import { Suspense } from 'react';
import { FileGrid } from './FileGrid';

interface FileGridWithSuspenseProps {
  cutId: string;
}

export function FileGridWithSuspense({ cutId }: FileGridWithSuspenseProps) {
  return (
    <div className="h-full flex flex-col">
      <Suspense fallback={<div className="p-4 text-center text-muted-foreground text-sm">로딩 중...</div>}>
        <FileGrid cutId={cutId} />
      </Suspense>
    </div>
  );
}

