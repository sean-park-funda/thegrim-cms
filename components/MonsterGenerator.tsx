'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { generateMonsterPrompt, generateMonsterImage, MonsterStyle } from '@/lib/api/monsterGenerator';
import { Copy, Loader2, Sparkles, Image as ImageIcon, Save, CheckSquare2, X, Maximize2 } from 'lucide-react';
import { ImageViewer } from '@/components/ImageViewer';
import { Process, Episode, Cut } from '@/lib/supabase';
import { useStore } from '@/lib/store/useStore';
import { uploadFile } from '@/lib/api/files';
import { useImageModel } from '@/lib/contexts/ImageModelContext';
import { getEpisodes } from '@/lib/api/episodes';
import { getCuts } from '@/lib/api/cuts';

interface MonsterImage {
  id: string;
  fileId: string | null;
  fileUrl: string | null;
  prompt: string;
  aspectRatio: string;
  selected: boolean;
  createdAt: string;
}

interface MonsterGeneratorProps {
  cutId?: string;
  webtoonId?: string;
  processes: Process[];
  onFilesReload: () => Promise<void>;
}

export function MonsterGenerator({ cutId, webtoonId, processes, onFilesReload }: MonsterGeneratorProps) {
  const { profile } = useStore();
  const { model: globalModel } = useImageModel();
  const [monsterStyle, setMonsterStyle] = useState<MonsterStyle>('normal');
  const [imagePrompt, setImagePrompt] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<string>('1:1');
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<MonsterImage[]>([]);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [savingImages, setSavingImages] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState<string>('');
  const [generationCount, setGenerationCount] = useState<number>(4);

  // 이미지 뷰어 상태
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerImage, setViewerImage] = useState<{ url: string; name: string } | null>(null);
  const [generatingImages, setGeneratingImages] = useState<Array<{ id: string; status: 'loading' | 'success' | 'error' }>>([]);
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number } | null>(null);

  // 저장 다이얼로그용 회차/컷 선택 상태
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [episodesForSave, setEpisodesForSave] = useState<Episode[]>([]);
  const [cutsForSave, setCutsForSave] = useState<Cut[]>([]);
  const [selectedEpisodeIdForSave, setSelectedEpisodeIdForSave] = useState<string>('');
  const [selectedCutIdForSave, setSelectedCutIdForSave] = useState<string>('');
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [loadingCuts, setLoadingCuts] = useState(false);

  // 생성 히스토리 로드
  useEffect(() => {
    loadHistory();
  }, [cutId]);

  // 저장 다이얼로그가 열릴 때 회차 목록 로드 (cutId가 없는 경우에만)
  useEffect(() => {
    if (saveDialogOpen && webtoonId && !cutId) {
      setLoadingEpisodes(true);
      getEpisodes(webtoonId)
        .then((data) => {
          // episode_number 순으로 정렬 (0번 "기타"는 맨 위)
          const sorted = [...data].sort((a, b) => {
            if (a.episode_number === 0) return -1;
            if (b.episode_number === 0) return 1;
            return a.episode_number - b.episode_number;
          });
          setEpisodesForSave(sorted);
        })
        .catch((err) => console.error('회차 목록 로드 실패:', err))
        .finally(() => setLoadingEpisodes(false));
    }
  }, [saveDialogOpen, webtoonId, cutId]);

  // 회차가 선택되면 컷 목록 로드
  useEffect(() => {
    if (selectedEpisodeIdForSave) {
      setLoadingCuts(true);
      setCutsForSave([]);
      setSelectedCutIdForSave('');
      getCuts(selectedEpisodeIdForSave)
        .then((data) => {
          // cut_number 순으로 정렬
          const sorted = [...data].sort((a, b) => a.cut_number - b.cut_number);
          setCutsForSave(sorted);
        })
        .catch((err) => console.error('컷 목록 로드 실패:', err))
        .finally(() => setLoadingCuts(false));
    } else {
      setCutsForSave([]);
      setSelectedCutIdForSave('');
    }
  }, [selectedEpisodeIdForSave]);

  const loadHistory = async () => {
    try {
      const response = await fetch(`/api/regenerate-image-history?userId=${profile?.id || ''}&limit=50`);
      if (!response.ok) {
        console.error('[괴수 생성기] 히스토리 로드 실패');
        return;
      }
      const data = await response.json();
      // 괴수 생성기로 생성된 이미지만 필터링 (description에 "괴수 생성기" 포함)
      const monsterImages = (data.history || [])
        .filter((item: { description?: string }) => item.description?.includes('괴수 생성기'))
        .map((item: { fileId: string; fileUrl: string; prompt: string; createdAt: string }) => ({
          id: item.fileId,
          fileId: item.fileId,
          fileUrl: item.fileUrl,
          prompt: item.prompt || '',
          aspectRatio: '1:1', // 히스토리에는 비율 정보가 없을 수 있음
          selected: false,
          createdAt: item.createdAt,
        }));
      setGeneratedImages(monsterImages);
    } catch (error) {
      console.error('[괴수 생성기] 히스토리 로드 실패:', error);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setImagePrompt('');
    setImageError(null);
    setImageLoading(true);
    setGenerationProgress({ current: 0, total: generationCount });

    // 생성 중인 이미지 플레이스홀더 생성
    const placeholderIds = Array.from({ length: generationCount }, (_, i) => ({
      id: `placeholder-${Date.now()}-${i}`,
      status: 'loading' as const,
    }));
    setGeneratingImages(placeholderIds);

    const BATCH_SIZE = 2; // 프롬프트 생성도 배치로 처리
    let successCount = 0;
    let failCount = 0;

    try {
      // 프롬프트 생성과 이미지 생성을 배치로 처리
      for (let batchStart = 0; batchStart < generationCount; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, generationCount);
        const batchPromises: Promise<void>[] = [];

        for (let i = batchStart; i < batchEnd; i++) {
          const placeholderId = placeholderIds[i].id;

          // 프롬프트 생성 → 이미지 생성 순차 처리
          const promise = (async () => {
            try {
              // 1. 프롬프트 생성 (선택된 스타일 적용)
              const promptResult = await generateMonsterPrompt(monsterStyle);

              if (promptResult.error || !promptResult.imagePrompt) {
                setGeneratingImages(prev => prev.map(img =>
                  img.id === placeholderId ? { ...img, status: 'error' as const } : img
                ));
                failCount++;
                setGenerationProgress(prev => prev ? {
                  current: prev.current + 1,
                  total: prev.total,
                } : null);
                return;
              }

              const promptText = promptResult.imagePrompt;
              const ratio = promptResult.aspectRatio || '1:1';

              // 프롬프트는 UI에 표시하지 않음 (여러 개 생성 시 혼란 방지)

              // 2. 이미지 생성
              const imageResult = await generateMonsterImage(promptText, ratio, cutId, profile?.id, globalModel);

              if (imageResult.error) {
                setGeneratingImages(prev => prev.map(img =>
                  img.id === placeholderId ? { ...img, status: 'error' as const } : img
                ));
                failCount++;
                setGenerationProgress(prev => prev ? {
                  current: prev.current + 1,
                  total: prev.total,
                } : null);
                return;
              }

              if (imageResult.fileId && imageResult.fileUrl) {
                const newImage: MonsterImage = {
                  id: imageResult.fileId,
                  fileId: imageResult.fileId,
                  fileUrl: imageResult.fileUrl,
                  prompt: promptText,
                  aspectRatio: ratio,
                  selected: false,
                  createdAt: new Date().toISOString(),
                };

                // 생성 중인 이미지 상태 업데이트
                setGeneratingImages(prev => prev.map(img =>
                  img.id === placeholderId ? { ...img, status: 'success' as const } : img
                ));

                // 생성된 이미지를 즉시 추가
                setGeneratedImages(prev => [newImage, ...prev]);
                successCount++;
              } else {
                setGeneratingImages(prev => prev.map(img =>
                  img.id === placeholderId ? { ...img, status: 'error' as const } : img
                ));
                failCount++;
              }

              // 진행 상황 업데이트
              setGenerationProgress(prev => prev ? {
                current: prev.current + 1,
                total: prev.total,
              } : null);
            } catch (err) {
              console.error(`프롬프트/이미지 ${i + 1} 생성 실패:`, err);
              setGeneratingImages(prev => prev.map(img =>
                img.id === placeholderId ? { ...img, status: 'error' as const } : img
              ));
              failCount++;
              setGenerationProgress(prev => prev ? {
                current: prev.current + 1,
                total: prev.total,
              } : null);
            }
          })();

          batchPromises.push(promise);
        }

        // 배치 내 모든 요청이 완료될 때까지 대기
        await Promise.allSettled(batchPromises);
      }

      // 생성 완료 후 플레이스홀더 제거
      setTimeout(() => {
        setGeneratingImages([]);
        setGenerationProgress(null);
      }, 500);

      // 히스토리 새로고침
      await loadHistory();

      // 결과 피드백
      if (failCount > 0 && successCount === 0) {
        setError('모든 프롬프트/이미지 생성에 실패했습니다.');
        setImageError('모든 프롬프트/이미지 생성에 실패했습니다.');
      } else if (failCount > 0) {
        setImageError(`${successCount}개의 이미지가 생성되었습니다. ${failCount}개의 이미지 생성에 실패했습니다.`);
      } else if (successCount > 0) {
        setImageError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '프롬프트 생성 중 오류가 발생했습니다.');
      setImageError(err instanceof Error ? err.message : '프롬프트 생성 중 오류가 발생했습니다.');
      setGeneratingImages([]);
      setGenerationProgress(null);
    } finally {
      setLoading(false);
      setImageLoading(false);
    }
  };

  const handleGenerateImage = async (promptToUse?: string, ratioToUse?: string, count?: number) => {
    const promptText = promptToUse || imagePrompt;
    const ratio = ratioToUse || aspectRatio;
    const generateCount = count || generationCount;

    if (!promptText) {
      setImageError('이미지 프롬프트가 없습니다.');
      return;
    }

    setImageLoading(true);
    setImageError(null);
    setGenerationProgress({ current: 0, total: generateCount });

    // 생성 중인 이미지 플레이스홀더 생성
    const placeholderIds = Array.from({ length: generateCount }, (_, i) => ({
      id: `placeholder-${Date.now()}-${i}`,
      status: 'loading' as const,
    }));
    setGeneratingImages(placeholderIds);

    const BATCH_SIZE = 2; // Gemini API 동시 호출 제한 고려
    let successCount = 0;
    let failCount = 0;
    const newImages: MonsterImage[] = [];

    try {
      // 배치 단위로 병렬 처리
      for (let batchStart = 0; batchStart < generateCount; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, generateCount);
        const batchPromises: Promise<void>[] = [];

        for (let i = batchStart; i < batchEnd; i++) {
          const placeholderId = placeholderIds[i].id;
          const promise = generateMonsterImage(promptText, ratio, cutId, profile?.id, globalModel)
            .then((result) => {
              if (result.error) {
                setGeneratingImages(prev => prev.map(img =>
                  img.id === placeholderId ? { ...img, status: 'error' as const } : img
                ));
                failCount++;
                return;
              }

              if (result.fileId && result.fileUrl) {
                const newImage: MonsterImage = {
                  id: result.fileId,
                  fileId: result.fileId,
                  fileUrl: result.fileUrl,
                  prompt: promptText,
                  aspectRatio: ratio,
                  selected: false,
                  createdAt: new Date().toISOString(),
                };

                // 생성 중인 이미지 상태 업데이트
                setGeneratingImages(prev => prev.map(img =>
                  img.id === placeholderId ? { ...img, status: 'success' as const } : img
                ));

                // 생성된 이미지를 즉시 추가
                setGeneratedImages(prev => [newImage, ...prev]);
                newImages.push(newImage);
                successCount++;
              } else if (result.imageData) {
                // 하위 호환성: base64 데이터가 있는 경우
                setGeneratingImages(prev => prev.map(img =>
                  img.id === placeholderId ? { ...img, status: 'error' as const } : img
                ));
                failCount++;
              }

              // 진행 상황 업데이트
              setGenerationProgress(prev => prev ? {
                current: prev.current + 1,
                total: prev.total,
              } : null);
            })
            .catch((err) => {
              console.error(`이미지 ${i + 1} 생성 실패:`, err);
              setGeneratingImages(prev => prev.map(img =>
                img.id === placeholderId ? { ...img, status: 'error' as const } : img
              ));
              failCount++;
              setGenerationProgress(prev => prev ? {
                current: prev.current + 1,
                total: prev.total,
              } : null);
            });

          batchPromises.push(promise);
        }

        // 배치 내 모든 요청이 완료될 때까지 대기
        await Promise.allSettled(batchPromises);
      }

      // 생성 완료 후 플레이스홀더 제거
      setTimeout(() => {
        setGeneratingImages([]);
        setGenerationProgress(null);
      }, 500);

      // 히스토리 새로고침
      await loadHistory();

      // 결과 피드백
      if (failCount > 0 && successCount === 0) {
        setImageError('모든 이미지 생성에 실패했습니다.');
      } else if (failCount > 0) {
        // 부분 성공 시 에러 메시지 표시하되, 성공한 이미지는 정상적으로 표시됨
        setImageError(`${successCount}개의 이미지가 생성되었습니다. ${failCount}개의 이미지 생성에 실패했습니다.`);
      } else if (successCount > 0) {
        // 모든 이미지가 성공한 경우 에러 메시지 초기화
        setImageError(null);
      }
    } catch (err) {
      setImageError(err instanceof Error ? err.message : '이미지 생성 중 오류가 발생했습니다.');
      setGeneratingImages([]);
      setGenerationProgress(null);
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

  const handleImageSelect = (id: string, selected: boolean) => {
    setSelectedImageIds(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(id);
      } else {
        newSet.delete(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedImageIds(new Set(generatedImages.map(img => img.id)));
  };

  const handleDeselectAll = () => {
    setSelectedImageIds(new Set());
  };

  const handleSaveImages = async () => {
    if (selectedImageIds.size === 0) {
      alert('선택된 이미지가 없습니다.');
      return;
    }

    if (!selectedProcessId) {
      alert('공정을 선택해주세요.');
      return;
    }

    // cutId가 없으면 다이얼로그 열기
    if (!cutId) {
      setSaveDialogOpen(true);
      return;
    }

    // cutId가 있으면 바로 저장
    await saveImagesToProcess(cutId);
  };

  const saveImagesToProcess = async (targetCutId: string) => {
    const selectedImages = generatedImages.filter(img => selectedImageIds.has(img.id) && img.fileId);
    if (selectedImages.length === 0) {
      alert('선택된 이미지를 찾을 수 없습니다.');
      return;
    }

    setSavingImages(true);

    try {
      let successCount = 0;
      let failCount = 0;

      for (const img of selectedImages) {
        try {
          if (!img.fileId) continue;

          const saveResponse = await fetch('/api/regenerate-image-save', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fileId: img.fileId,
              processId: selectedProcessId,
              cutId: targetCutId,
              description: monsterStyle === 'jjk'
                ? '괴수 생성기로 생성된 이미지 (주술회전 스타일)'
                : monsterStyle === 'higanjima'
                ? '괴수 생성기로 생성된 이미지 (피안도 스타일)'
                : '괴수 생성기로 생성된 이미지',
            }),
          });

          if (!saveResponse.ok) {
            const errorData = await saveResponse.json().catch(() => ({}));
            throw new Error(errorData.error || '이미지 저장에 실패했습니다.');
          }

          successCount++;
        } catch (error) {
          failCount++;
          console.error(`이미지 저장 실패:`, error);
        }
      }

      // 파일 목록 새로고침
      await onFilesReload();

      // 선택된 이미지 ID 초기화
      setSelectedImageIds(new Set());

      // 히스토리 새로고침
      await loadHistory();

      // 다이얼로그 닫기 및 상태 초기화
      setSaveDialogOpen(false);
      setSelectedEpisodeIdForSave('');
      setSelectedCutIdForSave('');

      if (failCount > 0 && successCount === 0) {
        alert(`모든 이미지 저장에 실패했습니다.`);
      } else if (failCount > 0) {
        alert(`${successCount}개의 이미지가 저장되었습니다. ${failCount}개의 이미지 저장에 실패했습니다.`);
      } else {
        alert(`${successCount}개의 이미지가 저장되었습니다.`);
      }
    } catch (error) {
      console.error('이미지 저장 중 오류:', error);
      alert('이미지 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingImages(false);
    }
  };

  return (
    <Card className="mb-2">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" />
          괴수 생성기
        </CardTitle>
        <CardDescription className="text-xs">
          랜덤으로 선택된 생물들을 결합하여 괴수 이미지를 생성합니다.
          {monsterStyle === 'jjk' && (
            <span className="ml-1 text-purple-500 font-medium">
              (주술회전 스타일)
            </span>
          )}
          {monsterStyle === 'higanjima' && (
            <span className="ml-1 text-red-500 font-medium">
              (피안도 스타일)
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* 스타일 선택 */}
        <div className="flex gap-2">
          <Select value={monsterStyle} onValueChange={(value) => setMonsterStyle(value as MonsterStyle)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="스타일 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">
                <span className="flex items-center gap-2">
                  <span className="text-base">🖊️</span>
                  <span>일반 스타일 (흑백 펜화)</span>
                </span>
              </SelectItem>
              <SelectItem value="jjk">
                <span className="flex items-center gap-2">
                  <span className="text-base">👹</span>
                  <span>주술회전 스타일 (저주 괴수)</span>
                </span>
              </SelectItem>
              <SelectItem value="higanjima">
                <span className="flex items-center gap-2">
                  <span className="text-base">🧛</span>
                  <span>피안도 스타일 (악귀)</span>
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleGenerate}
            disabled={loading}
            className={`flex-1 ${monsterStyle === 'jjk' ? 'bg-purple-600 hover:bg-purple-700' : monsterStyle === 'higanjima' ? 'bg-red-600 hover:bg-red-700' : ''}`}
            size="sm"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                프롬프트 생성 중...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                {monsterStyle === 'jjk' ? '주령 이미지 생성' : monsterStyle === 'higanjima' ? '악귀 이미지 생성' : '괴수 이미지 생성'}
              </>
            )}
          </Button>
          <Select value={generationCount.toString()} onValueChange={(value) => setGenerationCount(parseInt(value))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1개</SelectItem>
              <SelectItem value="2">2개</SelectItem>
              <SelectItem value="4">4개</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {error && (
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {imageError && (
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive">{imageError}</p>
          </div>
        )}

        {(loading || imageLoading) && generationProgress && (
          <div className="flex items-center justify-center p-4 border border-border rounded-lg">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              프롬프트 및 이미지 생성 중 ({generationProgress.current}/{generationProgress.total})
            </span>
          </div>
        )}

        {/* 생성 중인 이미지와 생성 히스토리 */}
        {(generatingImages.length > 0 || generatedImages.length > 0) && (
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between pb-2">
              <h3 className="text-xs font-medium">생성 히스토리</h3>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  className="gap-2"
                >
                  <CheckSquare2 className="h-4 w-4" />
                  전체 선택
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeselectAll}
                  className="gap-2"
                >
                  <X className="h-4 w-4" />
                  선택 해제
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {/* 생성 중인 이미지 플레이스홀더 (히스토리 섹션에 표시) */}
              {generatingImages.map((img) => (
                <div
                  key={img.id}
                  className="relative border rounded-lg overflow-hidden aspect-square"
                >
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    {img.status === 'loading' && (
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    )}
                    {img.status === 'error' && (
                      <div className="text-xs text-destructive text-center p-2">
                        생성 실패
                      </div>
                    )}
                    {img.status === 'success' && (
                      <div className="text-xs text-muted-foreground text-center p-2">
                        완료
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {/* 생성 완료된 이미지 */}
              {generatedImages.map((img) => (
                <div
                  key={img.id}
                  className={`relative border rounded-lg overflow-hidden transition-all ${
                    selectedImageIds.has(img.id) ? 'ring-2 ring-primary' : ''
                  }`}
                >
                  <div
                    className="aspect-square relative cursor-pointer group"
                    onClick={() => {
                      if (img.fileUrl) {
                        setViewerImage({ url: img.fileUrl, name: `monster-${img.id}` });
                        setViewerOpen(true);
                      }
                    }}
                  >
                    {img.fileUrl ? (
                      <>
                        <img
                          src={img.fileUrl}
                          alt="Generated monster"
                          className="w-full h-full object-cover"
                        />
                        {/* 호버 시 확대 아이콘 표시 */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                          <Maximize2 className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  {/* 체크박스 - 별도 영역 */}
                  <div
                    className="absolute top-1 right-1 z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={selectedImageIds.has(img.id)}
                      onCheckedChange={(checked) => handleImageSelect(img.id, checked === true)}
                      className="bg-white/80 border-gray-400"
                    />
                  </div>
                </div>
              ))}
            </div>

            {selectedImageIds.size > 0 && (
              <div className="flex items-center gap-2">
                <Select value={selectedProcessId} onValueChange={setSelectedProcessId}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="공정 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {processes.map((process) => (
                      <SelectItem key={process.id} value={process.id}>
                        {process.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleSaveImages}
                  disabled={savingImages || !selectedProcessId}
                  className="gap-2"
                >
                  {savingImages ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      저장 중...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      저장하기 ({selectedImageIds.size}개)
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* 저장 위치 선택 다이얼로그 (cutId가 없을 때) */}
      <Dialog open={saveDialogOpen} onOpenChange={(open) => {
        setSaveDialogOpen(open);
        if (!open) {
          setSelectedEpisodeIdForSave('');
          setSelectedCutIdForSave('');
          setEpisodesForSave([]);
          setCutsForSave([]);
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>저장 위치 선택</DialogTitle>
            <DialogDescription>
              이미지를 저장할 위치를 선택해주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            {/* 회차 선택 */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">회차 선택</label>
              <Select
                value={selectedEpisodeIdForSave}
                onValueChange={setSelectedEpisodeIdForSave}
                disabled={loadingEpisodes}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingEpisodes ? "로딩 중..." : "회차를 선택하세요"} />
                </SelectTrigger>
                <SelectContent>
                  {episodesForSave.map((ep) => (
                    <SelectItem key={ep.id} value={ep.id}>
                      {ep.episode_number === 0 ? '기타' : `${ep.episode_number}화`} - {ep.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 컷/페이지 선택 */}
            {selectedEpisodeIdForSave && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">컷/페이지 선택</label>
                <Select
                  value={selectedCutIdForSave}
                  onValueChange={setSelectedCutIdForSave}
                  disabled={loadingCuts}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingCuts ? "로딩 중..." : "컷/페이지를 선택하세요"} />
                  </SelectTrigger>
                  <SelectContent>
                    {cutsForSave.map((cut) => (
                      <SelectItem key={cut.id} value={cut.id}>
                        {cut.cut_number}번 {cut.title ? `- ${cut.title}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cutsForSave.length === 0 && !loadingCuts && (
                  <p className="text-xs text-muted-foreground">
                    선택한 회차에 컷/페이지가 없습니다. 먼저 컷/페이지를 추가해주세요.
                  </p>
                )}
              </div>
            )}

            {/* 선택된 공정 표시 */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">선택된 공정</label>
              <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                {processes.find(p => p.id === selectedProcessId) && (
                  <>
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: processes.find(p => p.id === selectedProcessId)?.color }}
                    />
                    <span className="text-sm">{processes.find(p => p.id === selectedProcessId)?.name}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSaveDialogOpen(false);
                setSelectedEpisodeIdForSave('');
                setSelectedCutIdForSave('');
              }}
            >
              취소
            </Button>
            <Button
              onClick={() => {
                if (!selectedCutIdForSave) {
                  alert('컷/페이지를 선택해주세요.');
                  return;
                }
                saveImagesToProcess(selectedCutIdForSave);
              }}
              disabled={savingImages || !selectedCutIdForSave}
            >
              {savingImages ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  저장 중...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  저장하기 ({selectedImageIds.size}개)
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 이미지 뷰어 */}
      {viewerImage && (
        <ImageViewer
          imageUrl={viewerImage.url}
          imageName={viewerImage.name}
          open={viewerOpen}
          onOpenChange={(open) => {
            setViewerOpen(open);
            if (!open) {
              setViewerImage(null);
            }
          }}
        />
      )}
    </Card>
  );
}
