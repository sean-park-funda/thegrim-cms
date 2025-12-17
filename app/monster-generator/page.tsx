'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { MonsterGenerator } from '@/components/MonsterGenerator';
import { useStore } from '@/lib/store/useStore';
import { getProcesses } from '@/lib/api/processes';
import { useEffect, useState } from 'react';
import { Process } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

function MonsterGeneratorForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const cutId = searchParams.get('cutId') || undefined;
  const webtoonId = searchParams.get('webtoonId') || undefined;
  const { processes, setProcesses } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProcesses = async () => {
      try {
        const data = await getProcesses();
        setProcesses(data);
      } catch (error) {
        console.error('공정 목록 로드 실패:', error);
      } finally {
        setLoading(false);
      }
    };
    loadProcesses();
  }, [setProcesses]);

  const handleFilesReload = async () => {
    // 페이지에서는 파일 목록을 새로고침할 필요가 없으므로 빈 함수
    // 저장 후 FileGrid로 돌아가려면 router.push를 사용할 수 있음
  };

  if (loading) {
    return (
      <div className="bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <Card>
            <CardContent className="p-8">
              <div className="flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">로딩 중...</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <MonsterGenerator
          cutId={cutId}
          webtoonId={webtoonId}
          processes={processes}
          onFilesReload={handleFilesReload}
        />
      </div>
    </div>
  );
}

export default function MonsterGeneratorPage() {
  return (
    <Suspense fallback={
      <div className="bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <Card>
            <CardContent className="p-8">
              <div className="flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">로딩 중...</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    }>
      <MonsterGeneratorForm />
    </Suspense>
  );
}

