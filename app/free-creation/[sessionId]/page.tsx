'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useParams } from 'next/navigation';
import { FreeCreationPlayground } from '@/components/free-creation';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

function FreeCreationPlaygroundContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params?.sessionId as string;
  const webtoonId = searchParams.get('webtoonId');

  if (!webtoonId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">웹툰을 선택해주세요.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">세션을 찾을 수 없습니다.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <FreeCreationPlayground webtoonId={webtoonId} sessionId={sessionId} />
    </div>
  );
}

export default function FreeCreationPlaygroundPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <FreeCreationPlaygroundContent />
    </Suspense>
  );
}
