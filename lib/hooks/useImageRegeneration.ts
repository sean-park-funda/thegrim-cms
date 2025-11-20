import { useState, useEffect } from 'react';
import { File as FileType } from '@/lib/supabase';
import { uploadFile } from '@/lib/api/files';
import { generateVariedPrompt, styleOptions, ApiProvider } from '@/lib/constants/imageRegeneration';

interface RegeneratedImage {
  id: string;
  url: string | null; // null이면 placeholder (생성 중)
  prompt: string;
  selected: boolean;
  base64Data: string | null; // null이면 placeholder
  mimeType: string | null; // null이면 placeholder
  apiProvider: ApiProvider; // 이미지 생성에 사용된 API 제공자
  index?: number; // 생성 인덱스 (placeholder 매칭용)
}

interface UseImageRegenerationOptions {
  fileToView: FileType | null;
  selectedCutId: string | null;
  generationCount: number;
  onFilesReload: () => Promise<void>;
}

export function useImageRegeneration({
  fileToView,
  selectedCutId,
  generationCount,
  onFilesReload,
}: UseImageRegenerationOptions) {
  const [regeneratingImage, setRegeneratingImage] = useState<string | null>(null);
  const [regeneratedImages, setRegeneratedImages] = useState<RegeneratedImage[]>([]);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [savingImages, setSavingImages] = useState(false);

  // Dialog가 닫힐 때 Blob URL 정리
  useEffect(() => {
    return () => {
      regeneratedImages.forEach((img) => {
        URL.revokeObjectURL(img.url);
      });
    };
  }, [regeneratedImages]);

  const handleRegenerate = async (stylePrompt: string, count?: number, useLatestImageAsInput?: boolean) => {
    if (!fileToView || fileToView.file_type !== 'image') return;

    try {
      setRegeneratingImage(fileToView.id);
      
      // 스타일 옵션 찾기
      const styleOption = styleOptions.find(opt => opt.prompt === stylePrompt);
      const defaultCount = styleOption?.defaultCount || generationCount;
      const regenerateCount = count ?? defaultCount;
      const styleId = styleOption?.id || '';
      const apiProvider: ApiProvider = styleOption?.apiProvider || 'auto';
      
      // count가 지정되지 않았으면 (새로 생성하는 경우) 기존 이미지 초기화
      // 단, useLatestImageAsInput이 true면 기존 이미지 유지 (선화 결과를 사용하기 위해)
      if (count === undefined && !useLatestImageAsInput) {
        setRegeneratedImages([]);
        setSelectedImageIds(new Set());
      }

      // 생성할 개수만큼 placeholder 이미지 미리 추가
      const placeholderImages: RegeneratedImage[] = Array.from({ length: regenerateCount }, (_, index) => ({
        id: `placeholder-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 9)}`,
        url: null,
        prompt: stylePrompt,
        selected: false,
        base64Data: null,
        mimeType: null,
        apiProvider: apiProvider === 'auto' ? (index % 2 === 0 ? 'seedream' : 'gemini') : apiProvider,
        index: index, // 인덱스 저장
      }));

      setRegeneratedImages(prev => {
        // 새로 생성하는 경우 placeholder만, 기존 이미지가 있으면 기존 이미지 + placeholder
        return count === undefined ? placeholderImages : [...prev, ...placeholderImages];
      });

      // 입력 이미지 결정: useLatestImageAsInput이 true면 최신 재생성 이미지 사용
      let imageUrl: string | undefined = undefined;
      let imageBase64: string | undefined = undefined;
      let imageMimeType: string | undefined = undefined;

      if (useLatestImageAsInput) {
        // 최신 재생성 이미지 찾기 (완료된 이미지 중)
        const completedImages = regeneratedImages.filter(img => img.url !== null && img.base64Data !== null);
        const latestImage = completedImages[completedImages.length - 1];
        if (latestImage && latestImage.base64Data) {
          imageBase64 = latestImage.base64Data;
          imageMimeType = latestImage.mimeType || 'image/png';
          console.log('[이미지 재생성] 최신 재생성 이미지를 입력으로 사용');
        } else {
          console.warn('[이미지 재생성] 최신 재생성 이미지를 찾을 수 없음, 원본 이미지 사용');
        }
      }

      // base64 데이터가 없으면 원본 이미지 URL 사용
      if (!imageBase64) {
        imageUrl = fileToView.file_path?.startsWith('http')
          ? fileToView.file_path
          : fileToView.file_path?.startsWith('/')
            ? fileToView.file_path
            : `https://${fileToView.file_path}`;
      }

      // 단일 이미지 생성 함수
      const generateSingleImage = async (index: number): Promise<RegeneratedImage | null> => {
        try {
          // 변형된 프롬프트 생성 (여러 장 생성 시 각각 다른 변형 적용)
          const variedPrompt = regenerateCount > 1 
            ? generateVariedPrompt(stylePrompt, styleId)
            : stylePrompt;

          // auto인 경우 실제 사용할 provider 결정
          let actualProvider: ApiProvider = apiProvider;
          if (apiProvider === 'auto') {
            // auto: 홀수 인덱스는 Gemini, 짝수 인덱스는 Seedream
            actualProvider = index % 2 === 0 ? 'seedream' : 'gemini';
          }

          const requestBody: Record<string, unknown> = {
            stylePrompt: variedPrompt,
            index: index,
            apiProvider: actualProvider, // 실제 사용할 provider 전달
          };

          if (imageBase64) {
            requestBody.imageBase64 = imageBase64;
            requestBody.imageMimeType = imageMimeType;
          } else {
            requestBody.imageUrl = imageUrl;
          }

          const response = await fetch('/api/regenerate-image', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `이미지 재생성에 실패했습니다. (${index + 1}/${regenerateCount})`);
          }

          const data = await response.json();
          const { imageData, mimeType } = data;

          // base64 데이터를 Blob URL로 변환
          const byteCharacters = atob(imageData);
          const byteNumbers = new Array(byteCharacters.length);
          for (let j = 0; j < byteCharacters.length; j++) {
            byteNumbers[j] = byteCharacters.charCodeAt(j);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: mimeType || 'image/png' });
          const imageUrl_new = URL.createObjectURL(blob);

          // 고유한 ID 생성 (타임스탬프 + 인덱스 + 랜덤)
          const imageId = `${Date.now()}-${index}-${Math.random().toString(36).substring(2, 9)}`;
          
          return {
            id: imageId,
            url: imageUrl_new,
            prompt: variedPrompt,
            selected: false,
            base64Data: imageData,
            mimeType: mimeType || 'image/png',
            apiProvider: actualProvider, // 실제 사용된 provider 저장
            index: index, // 인덱스 저장
          };
        } catch (error) {
          console.error(`이미지 ${index + 1} 생성 실패:`, error);
          return null;
        }
      };

      // 배치 처리: 최대 4개씩 동시 처리
      const BATCH_SIZE = 4;
      let successCount = 0;
      let failCount = 0;

      for (let batchStart = 0; batchStart < regenerateCount; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, regenerateCount);
        const batchPromises: Promise<RegeneratedImage | null>[] = [];
        
        // 배치 내 모든 이미지 생성 작업 시작
        for (let i = batchStart; i < batchEnd; i++) {
          batchPromises.push(generateSingleImage(i));
        }
        
        // 배치 내 모든 작업 완료 대기 (일부 실패해도 계속 진행)
        const results = await Promise.allSettled(batchPromises);
        
        // 각 결과 처리 및 실시간 UI 업데이트
        results.forEach((result, idx) => {
          const actualIndex = batchStart + idx;
          if (result.status === 'fulfilled' && result.value) {
            // 성공한 이미지: 해당 인덱스의 placeholder를 실제 이미지로 교체
            setRegeneratedImages(prev => {
              const newImages = [...prev];
              // 인덱스로 정확한 placeholder 찾기
              const placeholderIndex = newImages.findIndex(
                img => img.url === null && img.base64Data === null && img.index === actualIndex
              );
              if (placeholderIndex !== -1) {
                // placeholder를 실제 이미지로 교체
                newImages[placeholderIndex] = result.value!;
              } else {
                // 인덱스로 찾지 못한 경우 첫 번째 placeholder 찾기
                const fallbackIndex = newImages.findIndex(img => img.url === null && img.base64Data === null);
                if (fallbackIndex !== -1) {
                  newImages[fallbackIndex] = result.value!;
                } else {
                  // placeholder를 찾지 못한 경우 (이상한 경우) 맨 뒤에 추가
                  newImages.push(result.value!);
                }
              }
              return newImages;
            });
            successCount++;
          } else {
            failCount++;
            if (result.status === 'rejected') {
              console.error(`이미지 ${actualIndex + 1} 생성 실패:`, result.reason);
              // 실패한 placeholder 제거 (인덱스로 찾기)
              setRegeneratedImages(prev => {
                const newImages = [...prev];
                const placeholderIndex = newImages.findIndex(
                  img => img.url === null && img.base64Data === null && img.index === actualIndex
                );
                if (placeholderIndex !== -1) {
                  newImages.splice(placeholderIndex, 1);
                }
                return newImages;
              });
            }
          }
        });
      }

      // 최종 결과 로그
      if (failCount > 0) {
        console.log(`이미지 재생성 완료: ${successCount}개 성공, ${failCount}개 실패`);
        if (successCount === 0) {
          alert('모든 이미지 재생성에 실패했습니다.');
        } else {
          alert(`${successCount}개의 이미지가 생성되었습니다. ${failCount}개의 이미지 생성에 실패했습니다.`);
        }
      }
    } catch (error: unknown) {
      console.error('이미지 재생성 실패:', error);
      const errorMessage = error instanceof Error ? error.message : '이미지 재생성에 실패했습니다.';
      alert(errorMessage);
    } finally {
      setRegeneratingImage(null);
    }
  };

  const handleSaveImages = async () => {
    if (selectedImageIds.size === 0 || !fileToView || !selectedCutId) {
      alert('선택된 이미지가 없습니다.');
      return;
    }

    const selectedImages = regeneratedImages.filter(img => selectedImageIds.has(img.id));
    
    if (selectedImages.length === 0) {
      alert('선택된 이미지를 찾을 수 없습니다. 다시 선택해주세요.');
      return;
    }

    setSavingImages(true);

    // mimeType에서 확장자 추출하는 헬퍼 함수
    const getExtensionFromMimeType = (mimeType: string): string => {
      const mimeToExt: Record<string, string> = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/gif': '.gif',
        'image/webp': '.webp',
      };
      return mimeToExt[mimeType] || '.png';
    };

    // 원본 파일명에서 확장자 추출 (fallback)
    const originalFileName = fileToView.file_name;
    const originalExtension = originalFileName.includes('.') 
      ? originalFileName.substring(originalFileName.lastIndexOf('.'))
      : '';
    const baseFileName = originalExtension 
      ? originalFileName.replace(originalExtension, '')
      : originalFileName;

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    try {
      // 선택된 이미지들을 순차적으로 업로드
      for (let i = 0; i < selectedImages.length; i++) {
        const img = selectedImages[i];
        
        try {
          // base64 데이터를 Blob으로 변환
          const byteCharacters = atob(img.base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let j = 0; j < byteCharacters.length; j++) {
            byteNumbers[j] = byteCharacters.charCodeAt(j);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: img.mimeType });

          // 고유한 파일명 생성 (타임스탬프 + 인덱스 + 랜덤)
          const timestamp = Date.now();
          const randomStr = Math.random().toString(36).substring(2, 8);
          const extension = getExtensionFromMimeType(img.mimeType) || originalExtension || '.png';
          const newFileName = `regenerated-${baseFileName}-${timestamp}-${i}-${randomStr}${extension}`;

          // Blob을 File 객체로 변환
          const file = new File([blob], newFileName, { type: img.mimeType });

          // 원본 파일과 같은 공정에 업로드
          await uploadFile(file, selectedCutId, fileToView.process_id, `AI 재생성: ${fileToView.file_name}`);
          successCount++;
        } catch (error) {
          failCount++;
          const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
          errors.push(`이미지 ${i + 1}: ${errorMessage}`);
          console.error(`이미지 ${i + 1} 업로드 실패:`, error);
          // 개별 파일 실패해도 계속 진행
        }
      }

      // 파일 목록 새로고침
      await onFilesReload();

      // 선택된 이미지 ID 초기화
      setSelectedImageIds(new Set());

      // 결과 메시지 표시
      if (successCount > 0 && failCount === 0) {
        alert(`${successCount}개의 재생성된 이미지가 파일로 등록되었습니다.`);
      } else if (successCount > 0 && failCount > 0) {
        alert(`${successCount}개의 이미지가 등록되었습니다. ${failCount}개의 이미지 등록에 실패했습니다.\n\n실패한 이미지:\n${errors.join('\n')}`);
      } else {
        alert(`모든 이미지 등록에 실패했습니다.\n\n오류:\n${errors.join('\n')}`);
      }
    } catch (error) {
      console.error('재생성된 이미지 저장 중 오류:', error);
      const errorMessage = error instanceof Error ? error.message : '이미지 저장에 실패했습니다.';
      alert(`이미지 저장 중 오류가 발생했습니다: ${errorMessage}`);
    } finally {
      setSavingImages(false);
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

  const handleRegenerateSingle = async (prompt: string, apiProvider: ApiProvider, targetImageId?: string) => {
    if (!fileToView || fileToView.file_type !== 'image') return;

    try {
      // 재생성 중인 이미지 ID 설정 (특정 이미지 재생성 시 해당 이미지 ID, 아니면 null)
      setRegeneratingImage(targetImageId || null);

      // 재생성할 이미지가 지정된 경우 해당 이미지의 base64 데이터 사용
      // 지정되지 않은 경우 원본 이미지 URL 사용
      let imageUrl: string | undefined = undefined;
      let imageBase64: string | undefined = undefined;
      let imageMimeType: string | undefined = undefined;

      if (targetImageId) {
        // 재생성할 이미지를 찾아서 base64 데이터 사용
        const targetImage = regeneratedImages.find(img => img.id === targetImageId);
        if (targetImage) {
          imageBase64 = targetImage.base64Data;
          imageMimeType = targetImage.mimeType;
          console.log('[이미지 재생성] 재생성된 이미지를 입력으로 사용:', targetImageId);
        } else {
          console.warn('[이미지 재생성] 재생성할 이미지를 찾을 수 없음, 원본 이미지 사용:', targetImageId);
        }
      }

      // base64 데이터가 없으면 원본 이미지 URL 사용
      if (!imageBase64) {
        imageUrl = fileToView.file_path?.startsWith('http')
          ? fileToView.file_path
          : fileToView.file_path?.startsWith('/')
            ? fileToView.file_path
            : `https://${fileToView.file_path}`;
      }

      const requestBody: Record<string, unknown> = {
        stylePrompt: prompt,
        index: 0,
        apiProvider: apiProvider, // 원래 사용한 provider 사용
      };

      if (imageBase64) {
        requestBody.imageBase64 = imageBase64;
        requestBody.imageMimeType = imageMimeType;
      } else {
        requestBody.imageUrl = imageUrl;
      }

      const response = await fetch('/api/regenerate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '이미지 재생성에 실패했습니다.');
      }

      const data = await response.json();
      const { imageData, mimeType } = data;

      // base64 데이터를 Blob URL로 변환
      const byteCharacters = atob(imageData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let j = 0; j < byteCharacters.length; j++) {
        byteNumbers[j] = byteCharacters.charCodeAt(j);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType || 'image/png' });
      const imageUrl_new = URL.createObjectURL(blob);

      // 고유한 ID 생성
      const imageId = `${Date.now()}-0-${Math.random().toString(36).substring(2, 9)}`;
      
      const newImage: RegeneratedImage = {
        id: imageId,
        url: imageUrl_new,
        prompt: prompt,
        selected: false,
        base64Data: imageData,
        mimeType: mimeType || 'image/png',
        apiProvider: apiProvider,
      };

      // 기존 이미지 목록에 새 이미지 추가 (기존 이미지는 유지)
      // 사용자 요구사항: 4장 생성 -> 그 중 한 장 재생성 -> 5장이 되어야 함
      setRegeneratedImages(prev => {
        // 기존 목록에 새 이미지 추가
        return [...prev, newImage];
      });
    } catch (error: unknown) {
      console.error('이미지 재생성 실패:', error);
      const errorMessage = error instanceof Error ? error.message : '이미지 재생성에 실패했습니다.';
      alert(errorMessage);
    } finally {
      setRegeneratingImage(null);
    }
  };

  return {
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
  };
}

