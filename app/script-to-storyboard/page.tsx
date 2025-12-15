'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScriptToStoryboard } from '@/components/ScriptToStoryboard';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

function ScriptToStoryboardForm() {
  const searchParams = useSearchParams();
  const cutId = searchParams.get('cutId') || '';
  const episodeId = searchParams.get('episodeId') || '';
  const webtoonId = searchParams.get('webtoonId') || '';

  if (!cutId) {
    return (
      <div className="h-full flex items-center justify-center">
        <Card>
          <CardContent className="p-8">
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive">cutId가 필요합니다. FileGrid에서 접근해주세요.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full">
      <ScriptToStoryboard
        cutId={cutId}
        episodeId={episodeId}
        webtoonId={webtoonId}
      />
    </div>
  );
}

export default function ScriptToStoryboardPage() {
  return (
    <Suspense fallback={
      <div className="h-full flex items-center justify-center">
        <Card>
          <CardContent className="p-8">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">로딩 중...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    }>
      <ScriptToStoryboardForm />
    </Suspense>
  );
}

