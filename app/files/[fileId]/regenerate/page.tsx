'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getFileById } from '@/lib/api/files';
import { getProcesses } from '@/lib/api/processes';
import { FileWithRelations, Process } from '@/lib/supabase';
import { ImageRegenerationWorkspace } from '@/components/ImageRegenerationWorkspace';
import { useImageRegeneration } from '@/lib/hooks/useImageRegeneration';
import { useStore } from '@/lib/store/useStore';

export default function RegeneratePage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useStore();
  const fileId = params.fileId as string;
  const [file, setFile] = useState<FileWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [generationCount, setGenerationCount] = useState<number>(2);

  useEffect(() => {
    if (fileId) {
      loadFile();
      loadProcesses();
    }
  }, [fileId]);

  const loadFile = async () => {
    try {
      setLoading(true);
      const data = await getFileById(fileId);
      if (!data) {
        router.push('/webtoons');
        return;
      }
      setFile(data);
    } catch (error) {
      console.error('파일 로드 실패:', error);
      router.push('/webtoons');
    } finally {
      setLoading(false);
    }
  };

  const loadProcesses = async () => {
    try {
      const data = await getProcesses();
      setProcesses(data);
    } catch (error) {
      console.error('공정 목록 로드 실패:', error);
    }
  };

  const {
    regeneratingImage,
    regeneratedImages,
    selectedImageIds,
    savingImages,
    handleRegenerate,
    handleSaveImages,
    handleImageSelect,
    handleRegenerateSingle,
    setRegeneratedImages,
    setSelectedImageIds,
  } = useImageRegeneration({
    fileToView: file,
    selectedCutId: file?.cut_id || null,
    generationCount,
    onFilesReload: () => {},
    currentUserId: profile?.id,
  });

  const handleSelectAll = () => {
    setSelectedImageIds(new Set(regeneratedImages.map(img => img.id)));
  };

  const handleDeselectAll = () => {
    setSelectedImageIds(new Set());
  };

  const handleImageViewerOpen = (imageUrl: string, imageName: string) => {
    // TODO: 이미지 뷰어 구현
    window.open(imageUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-hidden bg-background p-4">
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground text-sm">로딩 중...</div>
        </div>
      </div>
    );
  }

  if (!file) {
    return (
      <div className="flex-1 overflow-hidden bg-background p-4">
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground text-sm">파일을 찾을 수 없습니다.</div>
        </div>
      </div>
    );
  }

  const canUpload = profile && profile.role !== 'viewer';

  return (
    <div className="flex-1 h-full bg-background">
      <div className="h-full flex flex-col">
        {/* 재생성 워크스페이스 */}
        <div className="flex-1 min-h-0" style={{ flex: '1 1 0' }}>
          <ImageRegenerationWorkspace
            file={file}
            webtoonId={file.cut?.episode?.webtoon_id}
            currentUserId={profile?.id}
            regeneratedImages={regeneratedImages}
            selectedImageIds={selectedImageIds}
            regeneratingImage={regeneratingImage}
            savingImages={savingImages}
            generationCount={generationCount}
            onGenerationCountChange={setGenerationCount}
            onRegenerate={handleRegenerate}
            onRegenerateSingle={handleRegenerateSingle}
            onImageSelect={handleImageSelect}
            onSaveImages={handleSaveImages}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            onImageViewerOpen={handleImageViewerOpen}
            processes={processes}
            canUpload={!!canUpload}
            onBack={() => router.back()}
            onSaveComplete={(processId) => {
              router.back();
            }}
          />
        </div>
      </div>
    </div>
  );
}
