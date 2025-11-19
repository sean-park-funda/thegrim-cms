import { useState, useEffect } from 'react';
import { File as FileType } from '@/lib/supabase';
import { uploadFile } from '@/lib/api/files';
import { generateVariedPrompt, styleOptions } from '@/lib/constants/imageRegeneration';

interface RegeneratedImage {
  id: string;
  url: string;
  prompt: string;
  selected: boolean;
  base64Data: string;
  mimeType: string;
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

  // Dialog가 닫힐 때 Blob URL 정리
  useEffect(() => {
    return () => {
      regeneratedImages.forEach((img) => {
        URL.revokeObjectURL(img.url);
      });
    };
  }, [regeneratedImages]);

  const handleRegenerate = async (stylePrompt: string, count?: number) => {
    if (!fileToView || fileToView.file_type !== 'image') return;

    try {
      setRegeneratingImage(fileToView.id);
      const regenerateCount = count ?? generationCount;
      
      // count가 지정되지 않았으면 (새로 생성하는 경우) 기존 이미지 초기화
      if (count === undefined) {
        setRegeneratedImages([]);
        setSelectedImageIds(new Set());
      }

      const imageUrl = fileToView.file_path?.startsWith('http')
        ? fileToView.file_path
        : fileToView.file_path?.startsWith('/')
          ? fileToView.file_path
          : `https://${fileToView.file_path}`;

      const newImages: RegeneratedImage[] = [];

      // 생성 개수만큼 반복하여 API 호출
      for (let i = 0; i < regenerateCount; i++) {
        // 스타일 ID 찾기 (베르세르크 변형을 위해)
        const styleOption = styleOptions.find(opt => opt.prompt === stylePrompt);
        const styleId = styleOption?.id || '';
        
        // 변형된 프롬프트 생성 (여러 장 생성 시 각각 다른 변형 적용)
        const variedPrompt = regenerateCount > 1 
          ? generateVariedPrompt(stylePrompt, styleId)
          : stylePrompt;

        const response = await fetch('/api/regenerate-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imageUrl,
            stylePrompt: variedPrompt,
            index: i, // 홀수는 Gemini, 짝수는 Seedream
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `이미지 재생성에 실패했습니다. (${i + 1}/${regenerateCount})`);
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
        const imageId = `${Date.now()}-${i}-${Math.random().toString(36).substring(2, 9)}`;
        newImages.push({
          id: imageId,
          url: imageUrl_new,
          prompt: variedPrompt, // 변형된 프롬프트 저장
          selected: false,
          base64Data: imageData,
          mimeType: mimeType || 'image/png',
        });

        // 진행 상태 업데이트를 위해 중간 결과도 반영
        if (count === undefined) {
          // 새로 생성하는 경우에만 중간 결과 반영 (함수형 업데이트로 최신 상태 보장)
          setRegeneratedImages(prev => {
            // 기존 이미지 중 현재 생성 중인 이미지들을 제외하고 새 이미지 추가
            const existingIds = new Set(newImages.map(img => img.id));
            const filtered = prev.filter(img => !existingIds.has(img.id));
            return [...filtered, ...newImages];
          });
        }
      }

      // count가 지정된 경우 (다시그리기) 기존 배열에 추가, 아니면 새로 설정
      if (count !== undefined) {
        setRegeneratedImages(prev => [...prev, ...newImages]);
      } else {
        // 모든 이미지 생성 완료 후 최종 상태 설정
        setRegeneratedImages(newImages);
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
      return;
    }

    try {
      const selectedImages = regeneratedImages.filter(img => selectedImageIds.has(img.id));
      
      if (selectedImages.length === 0) {
        alert('선택된 이미지를 찾을 수 없습니다. 다시 선택해주세요.');
        return;
      }
      
      // 선택된 이미지들을 순차적으로 업로드
      for (const img of selectedImages) {
        // base64 데이터를 Blob으로 변환
        const byteCharacters = atob(img.base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: img.mimeType });

        // 원본 파일명에서 확장자 추출
        const originalFileName = fileToView.file_name;
        const fileExtension = originalFileName.substring(originalFileName.lastIndexOf('.'));
        const baseFileName = originalFileName.replace(fileExtension, '');
        const timestamp = Date.now();
        const newFileName = `regenerated-${baseFileName}-${timestamp}${fileExtension}`;

        // Blob을 File 객체로 변환
        const file = new File([blob], newFileName, { type: img.mimeType });

        // 원본 파일과 같은 공정에 업로드
        await uploadFile(file, selectedCutId, fileToView.process_id, `AI 재생성: ${fileToView.file_name}`);
      }

      // 파일 목록 새로고침
      await onFilesReload();

      // 선택된 이미지 ID 초기화
      setSelectedImageIds(new Set());

      alert(`${selectedImages.length}개의 재생성된 이미지가 파일로 등록되었습니다.`);
    } catch (error) {
      console.error('재생성된 이미지 저장 실패:', error);
      alert('이미지 저장에 실패했습니다.');
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

  return {
    regeneratingImage,
    regeneratedImages,
    selectedImageIds,
    handleRegenerate,
    handleSaveImages,
    handleImageSelect,
    setRegeneratedImages,
    setSelectedImageIds,
  };
}

