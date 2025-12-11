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
  const cutId = searchParams.get('cutId') || '';
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

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setImagePrompt('');
    setImageUrl(null);
    setImageError(null);

    try {
      const result = await generateMonsterPrompt();
      if (result.error) {
        setError(result.error);
      } else {
        setImagePrompt(result.imagePrompt || '');
        setAspectRatio(result.aspectRatio || '1:1');
        
        // Image Prompt가 있으면 자동으로 이미지 생성
        if (result.imagePrompt) {
          handleGenerateImage(result.imagePrompt, result.aspectRatio);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '프롬프트 생성 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateImage = async (promptToUse?: string, ratioToUse?: string) => {
    const promptText = promptToUse || imagePrompt;
    const ratio = ratioToUse || aspectRatio;
    if (!promptText) {
      setImageError('이미지 프롬프트가 없습니다.');
      return;
    }

    setImageLoading(true);
    setImageError(null);
    setImageUrl(null);

    if (!cutId) {
      setImageError('cutId가 필요합니다. FileGrid에서 접근해주세요.');
      setImageLoading(false);
      return;
    }

    try {
      const result = await generateMonsterImage(promptText, ratio, cutId, profile?.id);
      if (result.error) {
        setImageError(result.error);
      } else if (result.fileUrl) {
        // 파일 URL 사용 (임시 파일로 저장됨)
        setImageUrl(result.fileUrl);
      } else if (result.imageData) {
        // 하위 호환성: base64 이미지 데이터를 Blob URL로 변환
        const binaryString = atob(result.imageData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: result.mimeType });
        const url = URL.createObjectURL(blob);
        setImageUrl(url);
      }
    } catch (err) {
      setImageError(err instanceof Error ? err.message : '이미지 생성 중 오류가 발생했습니다.');
    } finally {
      setImageLoading(false);
    }
  };

  const handleCopyImagePrompt = async () => {
    if (!imagePrompt) return;

    try {
      await navigator.clipboard.writeText(imagePrompt);
      alert('이미지 프롬프트가 클립보드에 복사되었습니다.');
    } catch (err) {
      console.error('복사 실패:', err);
      alert('복사에 실패했습니다.');
    }
  };

  if (!cutId) {
    return (
      <div className="bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <Card>
            <CardContent className="p-8">
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive">cutId가 필요합니다. FileGrid에서 접근해주세요.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

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

