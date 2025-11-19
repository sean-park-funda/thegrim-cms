import { useState, useCallback, useEffect } from 'react';
import { File as FileType } from '@/lib/supabase';
import { getFilesByCut, getThumbnailUrl } from '@/lib/api/files';

interface UseFileGridOptions {
  selectedCutId: string | null;
}

export function useFileGrid({ selectedCutId }: UseFileGridOptions) {
  const [files, setFiles] = useState<FileType[]>([]);
  const [loading, setLoading] = useState(false);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [pendingAnalysisFiles, setPendingAnalysisFiles] = useState<Set<string>>(new Set());

  const loadFiles = useCallback(async () => {
    if (!selectedCutId) return;

    try {
      setLoading(true);
      setImageErrors(new Set()); // 파일 로드 시 이미지 에러 상태 초기화
      const data = await getFilesByCut(selectedCutId);
      setFiles(data);

      // 이미지 파일들의 썸네일 URL 가져오기 (비동기)
      const imageFiles = data.filter(f => f.file_type === 'image');
      const thumbnailUrlPromises = imageFiles.map(async (file) => {
        try {
          const thumbnailUrl = await getThumbnailUrl(file);
          return { fileId: file.id, thumbnailUrl };
        } catch (error) {
          console.error(`썸네일 URL 가져오기 실패 (${file.id}):`, error);
          return null;
        }
      });

      const thumbnailResults = await Promise.all(thumbnailUrlPromises);
      const thumbnailUrlMap: Record<string, string> = {};
      thumbnailResults.forEach((result) => {
        if (result) {
          thumbnailUrlMap[result.fileId] = result.thumbnailUrl;
        }
      });
      setThumbnailUrls(thumbnailUrlMap);
    } catch (error) {
      console.error('파일 목록 로드 실패:', error);
      setImageErrors(new Set());
    } finally {
      setLoading(false);
    }
  }, [selectedCutId]);

  useEffect(() => {
    if (selectedCutId) {
      loadFiles();
    } else {
      setFiles([]);
      setThumbnailUrls({});
    }
    // 컷이 변경되면 대기 목록 초기화
    setPendingAnalysisFiles(new Set());
  }, [selectedCutId, loadFiles]);

  const getFilesByProcess = useCallback((processId: string) => {
    return files.filter(file => file.process_id === processId);
  }, [files]);

  const setThumbnailUrl = useCallback((fileId: string, url: string) => {
    setThumbnailUrls(prev => ({ ...prev, [fileId]: url }));
  }, []);

  return {
    files,
    loading,
    thumbnailUrls,
    imageErrors,
    pendingAnalysisFiles,
    setFiles,
    setImageErrors,
    setPendingAnalysisFiles,
    setThumbnailUrl,
    loadFiles,
    getFilesByProcess,
  };
}

