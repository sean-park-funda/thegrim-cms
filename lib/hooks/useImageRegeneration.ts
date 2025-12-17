import { useState, useEffect } from 'react';
import { File as FileType, ApiProvider } from '@/lib/supabase';
import { uploadFile } from '@/lib/api/files';
import { generateVariedPrompt } from '@/lib/constants/imageRegeneration';

interface RegeneratedImage {
  id: string;
  url: string | null; // null이면 placeholder (생성 중), 파일 URL 또는 Blob URL
  prompt: string; // 실제 사용된 프롬프트 (변형된 프롬프트 포함)
  originalPrompt: string; // 원본 프롬프트 (사용자가 선택하거나 입력한 프롬프트)
  selected: boolean;
  fileId: string | null; // 파일 ID (DB에 저장된, is_temp = true)
  filePath: string | null; // 파일 경로 (Storage 경로)
  fileUrl: string | null; // 파일 URL (미리보기용)
  base64Data: string | null; // null이면 placeholder, 하위 호환성을 위해 유지 (임시 파일 저장 실패 시에만 사용)
  mimeType: string | null; // null이면 placeholder
  apiProvider: ApiProvider; // 이미지 생성에 사용된 API 제공자
  index?: number; // 생성 인덱스 (placeholder 매칭용)
  styleId?: string; // 스타일 ID
  styleKey?: string; // 스타일 키
  styleName?: string; // 스타일 이름
  error?: {
    code: string; // 에러 코드 ('GEMINI_OVERLOAD', 'GEMINI_TIMEOUT' 등)
    message: string; // 사용자에게 표시할 메시지
  };
}

interface ReferenceImageInfo {
  id: string; // 레퍼런스 파일 ID
}

interface CharacterSheetInfo {
  sheetId: string;
}

interface UseImageRegenerationOptions {
  fileToView: FileType | null;
  selectedCutId: string | null;
  generationCount: number;
  onFilesReload: () => Promise<void>;
  currentUserId?: string;
}

export function useImageRegeneration({
  fileToView,
  selectedCutId,
  generationCount,
  onFilesReload,
  currentUserId,
}: UseImageRegenerationOptions) {
  const [regeneratingImage, setRegeneratingImage] = useState<string | null>(null);

  // 마운트 시에만 로그 출력
  useEffect(() => {
    console.log('[useImageRegeneration] 마운트됨:', { currentUserId });
  }, []);
  const [regeneratedImages, setRegeneratedImages] = useState<RegeneratedImage[]>([]);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [savingImages, setSavingImages] = useState(false);

  // Dialog가 닫힐 때 Blob URL 정리
  useEffect(() => {
    return () => {
      regeneratedImages.forEach((img) => {
        if (img.url) {
          URL.revokeObjectURL(img.url);
        }
      });
    };
  }, [regeneratedImages]);

  const handleRegenerate = async (stylePrompt: string, count?: number, useLatestImageAsInput?: boolean, referenceImages?: ReferenceImageInfo[] | ReferenceImageInfo, targetFileId?: string, characterSheets?: CharacterSheetInfo[], apiProvider: ApiProvider = 'auto', styleId?: string, styleKey?: string, styleName?: string) => {
    // targetFileId가 제공되면 그것을 사용, 아니면 fileToView.id 사용
    const actualFileId = targetFileId || (fileToView?.id);
    if (!actualFileId || (fileToView && fileToView.file_type !== 'image')) return;

    try {
      setRegeneratingImage(actualFileId);

      // 기본값 사용 (스타일 정보는 호출 측에서 처리됨)
      const regenerateCount = count ?? generationCount;
      // 프롬프트에서 스타일 키 추론 (프롬프트 변형용)
      const styleId = stylePrompt.toLowerCase().includes('berserk') ? 'berserk'
        : stylePrompt.toLowerCase().includes('shading') || stylePrompt.toLowerCase().includes('chiaroscuro') ? 'shading'
        : '';
      
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
        prompt: stylePrompt, // placeholder에서는 원본 프롬프트 사용
        originalPrompt: stylePrompt, // 원본 프롬프트 저장
        selected: false,
        fileId: null,
        filePath: null,
        fileUrl: null,
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
      // 이 경우 base64 데이터가 있으므로 단일 이미지 API 사용 (배치 API는 파일 ID만 받음)
      let useLatestImageAsInputFileId: string | undefined = undefined;
      let useLatestImageAsInputBase64: string | undefined = undefined;
      let useLatestImageAsInputMimeType: string | undefined = undefined;

      if (useLatestImageAsInput) {
        // 최신 재생성 이미지 찾기 (완료된 이미지 중)
        const completedImages = regeneratedImages.filter(img => img.url !== null && img.base64Data !== null);
        const latestImage = completedImages[completedImages.length - 1];
        if (latestImage && latestImage.base64Data) {
          useLatestImageAsInputBase64 = latestImage.base64Data;
          useLatestImageAsInputMimeType = latestImage.mimeType || 'image/png';
          console.log('[이미지 재생성] 최신 재생성 이미지를 입력으로 사용 (base64)');
        } else {
          console.warn('[이미지 재생성] 최신 재생성 이미지를 찾을 수 없음, 원본 이미지 사용');
        }
      }

      // 배치 API 사용 (파일 ID 기반)
      const fileId = actualFileId;
      // referenceImages가 배열이면 배열로, 단일 객체면 배열로 변환, 없으면 undefined
      const referenceFileIds = referenceImages 
        ? Array.isArray(referenceImages) 
          ? referenceImages.map(img => img.id)
          : [referenceImages.id]
        : undefined;

      const useCharacterSheets = characterSheets && characterSheets.length > 0;
      // 헤더 전역 모델 설정을 그대로 사용 (캐릭터시트 여부와 무관하게)
      const finalApiProvider: ApiProvider = apiProvider;

      // 디버깅: fileId 확인
      console.log('[이미지 재생성] 배치 API 준비:', {
        fileId,
        fileIdType: typeof fileId,
        referenceFileIds,
        referenceFileIdsCount: referenceFileIds?.length || 0,
        characterSheetsCount: characterSheets?.length || 0,
        useCharacterSheets,
      });
      // 생성할 이미지들을 provider별로 그룹화
      const batchRequests: Array<{ stylePrompt: string; index: number; apiProvider: 'gemini' | 'seedream'; styleId?: string; styleKey?: string; styleName?: string }> = [];
      
      for (let i = 0; i < regenerateCount; i++) {
        const variedPrompt = regenerateCount > 1 
          ? generateVariedPrompt(stylePrompt, styleId || '')
          : stylePrompt;

        let actualProvider: ApiProvider = finalApiProvider;
        if (finalApiProvider === 'auto') {
          // auto: 홀수 인덱스는 Gemini, 짝수 인덱스는 Seedream
          actualProvider = i % 2 === 0 ? 'seedream' : 'gemini';
        }

        batchRequests.push({
          stylePrompt: variedPrompt,
          index: i,
          apiProvider: actualProvider === 'auto' ? (i % 2 === 0 ? 'seedream' : 'gemini') : actualProvider,
          ...(styleId && { styleId }),
          ...(styleKey && { styleKey }),
          ...(styleName && { styleName }),
        });
      }

      // 캐릭터 바꾸기 모드에서는 useLatestImageAsInput을 사용하지 않음 (원본 이미지가 필요하므로)
      // base64 데이터가 있는 경우 (useLatestImageAsInput)는 단일 이미지 API 사용
      // 단, 캐릭터 바꾸기 모드가 아닐 때만
      if (useLatestImageAsInputBase64 && !useCharacterSheets) {
        // 단일 이미지 API 사용 (기존 로직 유지)
        const generateSingleImage = async (index: number): Promise<RegeneratedImage | null> => {
          try {
            const variedPrompt = regenerateCount > 1 
              ? generateVariedPrompt(stylePrompt, styleId)
              : stylePrompt;

            let actualProvider: ApiProvider = apiProvider;
            if (actualProvider === 'auto') {
              actualProvider = index % 2 === 0 ? 'seedream' : 'gemini';
            }

            const requestBody: Record<string, unknown> = {
              stylePrompt: variedPrompt,
              index: index,
              apiProvider: actualProvider,
              imageBase64: useLatestImageAsInputBase64,
              imageMimeType: useLatestImageAsInputMimeType,
            };

            if (referenceFileIds && referenceFileIds.length > 0) {
              requestBody.referenceFileIds = referenceFileIds;
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

            const byteCharacters = atob(imageData);
            const byteNumbers = new Array(byteCharacters.length);
            for (let j = 0; j < byteCharacters.length; j++) {
              byteNumbers[j] = byteCharacters.charCodeAt(j);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: mimeType || 'image/png' });
            const imageUrl_new = URL.createObjectURL(blob);

            const imageId = `${Date.now()}-${index}-${Math.random().toString(36).substring(2, 9)}`;
            
            return {
              id: imageId,
              url: imageUrl_new,
              prompt: variedPrompt,
              originalPrompt: stylePrompt,
              selected: false,
              fileId: null,
              filePath: null,
              fileUrl: null,
              base64Data: imageData,
              mimeType: mimeType || 'image/png',
              apiProvider: actualProvider,
              index: index,
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

        const updateImageOnComplete = (image: RegeneratedImage | null, index: number, isSuccess: boolean) => {
          if (isSuccess && image) {
            setRegeneratedImages(prev => {
              const newImages = [...prev];
              // 임시 파일을 사용하는 경우 base64Data가 null일 수 있으므로 url만 확인
              const placeholderIndex = newImages.findIndex(
                img => img.url === null && img.index === index
              );
              if (placeholderIndex !== -1) {
                newImages[placeholderIndex] = image;
              } else {
                const fallbackIndex = newImages.findIndex(img => img.url === null);
                if (fallbackIndex !== -1) {
                  newImages[fallbackIndex] = image;
                } else {
                  newImages.push(image);
                }
              }
              return newImages;
            });
            successCount++;
          } else if (!isSuccess) {
            console.error(`이미지 ${index + 1} 생성 실패`);
            setRegeneratedImages(prev => {
              const newImages = [...prev];
              // 임시 파일을 사용하는 경우 base64Data가 null일 수 있으므로 url만 확인
              const placeholderIndex = newImages.findIndex(
                img => img.url === null && img.index === index
              );
              if (placeholderIndex !== -1) {
                newImages.splice(placeholderIndex, 1);
              }
              return newImages;
            });
            failCount++;
          }
        };

        for (let batchStart = 0; batchStart < regenerateCount; batchStart += BATCH_SIZE) {
          const batchEnd = Math.min(batchStart + BATCH_SIZE, regenerateCount);
          const batchPromises: Promise<void>[] = [];
          
          for (let i = batchStart; i < batchEnd; i++) {
            const actualIndex = i;
            const promise = generateSingleImage(actualIndex)
              .then((image) => {
                if (image) {
                  updateImageOnComplete(image, actualIndex, true);
                } else {
                  updateImageOnComplete(null, actualIndex, false);
                }
              })
              .catch((error) => {
                console.error(`이미지 ${actualIndex + 1} 생성 실패:`, error);
                updateImageOnComplete(null, actualIndex, false);
              });
            
            batchPromises.push(promise);
          }
          
          await Promise.allSettled(batchPromises);
        }

        if (failCount > 0) {
          console.log(`이미지 재생성 완료: ${successCount}개 성공, ${failCount}개 실패`);
          if (successCount === 0) {
            alert('모든 이미지 재생성에 실패했습니다.');
          } else {
            alert(`${successCount}개의 이미지가 생성되었습니다. ${failCount}개의 이미지 생성에 실패했습니다.`);
          }
        }
      } else {
        // 배치 API 사용 (파일 ID 기반) - 4개씩 배치로 나누어 순차 요청
        const BATCH_SIZE = 4;
        let totalSuccessCount = 0;
        let totalFailCount = 0;
        const errorMessages: string[] = []; // 에러 메시지 수집

        console.log('[이미지 재생성] 배치 API 호출 시작 (4개씩 배치 처리)...', {
          fileId,
          referenceFileIds: referenceFileIds || '없음',
          referenceFileIdsCount: referenceFileIds?.length || 0,
          totalRequestCount: batchRequests.length,
          batchCount: Math.ceil(batchRequests.length / BATCH_SIZE),
        });

        // 전체 요청을 4개씩 배치로 나누어 순차 처리
        for (let i = 0; i < batchRequests.length; i += BATCH_SIZE) {
          const batch = batchRequests.slice(i, i + BATCH_SIZE);
          const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
          const totalBatches = Math.ceil(batchRequests.length / BATCH_SIZE);

          console.log(`[이미지 재생성] 배치 ${batchNumber}/${totalBatches} 처리 시작 (${batch.length}개 요청)...`);

          // fileId가 올바른지 확인 (문자열이어야 함)
          if (!fileId || typeof fileId !== 'string') {
            console.error('[이미지 재생성] fileId가 올바르지 않음:', { 
              fileId, 
              type: typeof fileId,
              isArray: Array.isArray(fileId),
              actualFileId,
            });
            throw new Error(`원본 파일 ID가 필요합니다. 현재 값: ${JSON.stringify(fileId)}`);
          }

          const batchRequestBody = {
            fileId: String(fileId), // 명시적으로 문자열로 변환
            referenceFileIds: referenceFileIds || undefined,
            requests: batch,
            ...(useCharacterSheets && characterSheets ? { characterSheets } : {}),
            ...(currentUserId && { createdBy: currentUserId }),
          };
          
          // 디버깅: 요청 본문 확인
          console.log('[이미지 재생성] 배치 요청 본문 구조:', {
            fileId: batchRequestBody.fileId,
            fileIdType: typeof batchRequestBody.fileId,
            hasCharacterSheets: 'characterSheets' in batchRequestBody,
            characterSheetsType: 'characterSheets' in batchRequestBody 
              ? (Array.isArray(batchRequestBody.characterSheets) ? 'array' : typeof batchRequestBody.characterSheets)
              : '없음',
            hasCreatedBy: 'createdBy' in batchRequestBody,
            createdBy: batchRequestBody.createdBy,
            currentUserId: currentUserId,
            requestsCount: batch.length,
          });

          try {
            const batchResponse = await fetch('/api/regenerate-image-batch', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(batchRequestBody),
            });

            if (!batchResponse.ok) {
              const errorData = await batchResponse.json().catch(() => ({}));
              throw new Error(errorData.error || '배치 이미지 재생성에 실패했습니다.');
            }

            const batchData = await batchResponse.json();
            const { images } = batchData;
            console.log('[이미지 재생성] 배치 응답 받음:', {
              imagesCount: images?.length,
              images: images?.map((img: { index: number; error?: unknown }) => ({
                index: img.index,
                hasError: !!img.error,
                error: img.error,
              })),
            });

            // 배치 응답을 개별 이미지로 변환하고 즉시 UI 업데이트
            images.forEach((result: { 
              index: number; 
              fileId?: string;
              filePath?: string;
              fileUrl?: string;
              imageData?: string; 
              mimeType?: string; 
              apiProvider: 'gemini' | 'seedream';
              stylePrompt?: string;
              styleId?: string;
              styleKey?: string;
              styleName?: string;
              error?: {
                code: string;
                message: string;
              };
            }) => {
              try {
                const imageId = `${Date.now()}-${result.index}-${Math.random().toString(36).substring(2, 9)}`;
                const request = batch.find(r => r.index === result.index);
                
                // 에러가 있는 경우
                if (result.error && typeof result.error === 'object') {
                  // result.error의 속성에 직접 접근
                  const errorAny = result.error as any;
                  const errorCode = errorAny?.code;
                  const errorMessage = errorAny?.message;
                  
                  // code와 message가 모두 있고 문자열인지 확인
                  if (errorCode && errorMessage && typeof errorCode === 'string' && typeof errorMessage === 'string') {
                    // 정보성 로그로만 남기기 (브라우저 콘솔 에러로 표시되지 않도록)
                    console.log(`[이미지 재생성] 이미지 생성 실패 (인덱스 ${result.index}):`, {
                      code: errorCode,
                      message: errorMessage,
                    });
                    const errorImage: RegeneratedImage = {
                      id: imageId,
                      url: null,
                      prompt: result.stylePrompt || request?.stylePrompt || stylePrompt,
                      originalPrompt: stylePrompt,
                      selected: false,
                      fileId: null,
                      filePath: null,
                      fileUrl: null,
                      base64Data: null,
                      mimeType: null,
                      apiProvider: result.apiProvider,
                      index: result.index,
                      styleId: result.styleId || request?.styleId,
                      styleKey: result.styleKey || request?.styleKey,
                      styleName: result.styleName || request?.styleName,
                      error: {
                        code: errorCode,
                        message: errorMessage,
                      },
                    };
                    setRegeneratedImages(prev => {
                      const newImages = [...prev];
                      const placeholderIndex = newImages.findIndex(
                        img => img.url === null && img.index === result.index
                      );
                      if (placeholderIndex !== -1) {
                        newImages[placeholderIndex] = errorImage;
                      } else {
                        const fallbackIndex = newImages.findIndex(img => img.url === null);
                        if (fallbackIndex !== -1) {
                          newImages[fallbackIndex] = errorImage;
                        } else {
                          newImages.push(errorImage);
                        }
                      }
                      return newImages;
                    });
                    totalFailCount++; // 에러가 있으면 실패 카운트 증가
                    errorMessages.push(errorMessage); // 에러 메시지 수집
                    return; // 에러가 있으면 여기서 종료
                  }
                }
                
                let imageUrl_new: string | null = null;
                let base64Data: string | null = null;

                // 파일이 있으면 파일 URL 사용, 없으면 base64 데이터 사용 (하위 호환성)
                if (result.fileId && result.fileUrl) {
                  imageUrl_new = result.fileUrl;
                  console.log(`[이미지 재생성] 파일 사용 (인덱스 ${result.index}):`, {
                    fileId: result.fileId,
                    filePath: result.filePath,
                    fileUrl: result.fileUrl,
                  });
                } else if (result.imageData) {
                  // 하위 호환성: base64 데이터가 있으면 Blob URL 생성
                  const byteCharacters = atob(result.imageData);
                  const byteNumbers = new Array(byteCharacters.length);
                  for (let j = 0; j < byteCharacters.length; j++) {
                    byteNumbers[j] = byteCharacters.charCodeAt(j);
                  }
                  const byteArray = new Uint8Array(byteNumbers);
                  const blob = new Blob([byteArray], { type: result.mimeType || 'image/png' });
                  imageUrl_new = URL.createObjectURL(blob);
                  base64Data = result.imageData;
                  console.log(`[이미지 재생성] base64 데이터 사용 (인덱스 ${result.index}, fallback)`);
                }

                const image: RegeneratedImage = {
                  id: imageId,
                  url: imageUrl_new,
                  prompt: result.stylePrompt || request?.stylePrompt || stylePrompt,
                  originalPrompt: stylePrompt,
                  selected: false,
                  fileId: result.fileId || null,
                  filePath: result.filePath || null,
                  fileUrl: result.fileUrl || null,
                  base64Data: base64Data,
                  mimeType: result.mimeType || 'image/png',
                  apiProvider: result.apiProvider,
                  index: result.index,
                  styleId: result.styleId || request?.styleId,
                  styleKey: result.styleKey || request?.styleKey,
                  styleName: result.styleName || request?.styleName,
                };

                setRegeneratedImages(prev => {
                  const newImages = [...prev];
                  // 임시 파일을 사용하는 경우 base64Data가 null일 수 있으므로 url만 확인
                  const placeholderIndex = newImages.findIndex(
                    img => img.url === null && img.index === result.index
                  );
                  if (placeholderIndex !== -1) {
                    newImages[placeholderIndex] = image;
                  } else {
                    // 임시 파일을 사용하는 경우 base64Data가 null일 수 있으므로 url만 확인
                    const fallbackIndex = newImages.findIndex(img => img.url === null);
                    if (fallbackIndex !== -1) {
                      newImages[fallbackIndex] = image;
                    } else {
                      newImages.push(image);
                    }
                  }
                  return newImages;
                });
                totalSuccessCount++;
              } catch (error) {
                console.error(`이미지 ${result.index + 1} 처리 실패:`, error);
                setRegeneratedImages(prev => {
                  const newImages = [...prev];
                  // 임시 파일을 사용하는 경우 base64Data가 null일 수 있으므로 url만 확인
                  const placeholderIndex = newImages.findIndex(
                    img => img.url === null && img.index === result.index
                  );
                  if (placeholderIndex !== -1) {
                    newImages.splice(placeholderIndex, 1);
                  }
                  return newImages;
                });
                totalFailCount++;
              }
            });

            // 실패한 요청 처리 (배치 응답에 없는 인덱스)
            const successIndices = new Set(images.map((img: { index: number }) => img.index));
            batch.forEach(req => {
              if (!successIndices.has(req.index)) {
                totalFailCount++;
                setRegeneratedImages(prev => {
                  const newImages = [...prev];
                  // 임시 파일을 사용하는 경우 base64Data가 null일 수 있으므로 url만 확인
                  const placeholderIndex = newImages.findIndex(
                    img => img.url === null && img.index === req.index
                  );
                  if (placeholderIndex !== -1) {
                    newImages.splice(placeholderIndex, 1);
                  }
                  return newImages;
                });
              }
            });

            // 실제 성공한 개수만 카운트 (에러가 없는 것만)
            const actualSuccessCount = images.filter((img: { error?: unknown }) => !img.error).length;
            const actualFailCount = images.filter((img: { error?: unknown }) => !!img.error).length;
            console.log(`[이미지 재생성] 배치 ${batchNumber}/${totalBatches} 완료: ${actualSuccessCount}개 성공${actualFailCount > 0 ? `, ${actualFailCount}개 실패` : ''}`);
          } catch (error) {
            console.error(`[이미지 재생성] 배치 ${batchNumber}/${totalBatches} 실패:`, error);
            // 실패한 배치의 모든 요청을 실패로 처리
            batch.forEach(req => {
              totalFailCount++;
              setRegeneratedImages(prev => {
                const newImages = [...prev];
                const placeholderIndex = newImages.findIndex(
                  img => img.url === null && img.base64Data === null && img.index === req.index
                );
                if (placeholderIndex !== -1) {
                  newImages.splice(placeholderIndex, 1);
                }
                return newImages;
              });
            });
          }
        }

        if (totalFailCount > 0) {
          console.log(`이미지 재생성 완료: ${totalSuccessCount}개 성공, ${totalFailCount}개 실패`);
          // 중복 제거한 에러 메시지
          const uniqueErrorMessages = Array.from(new Set(errorMessages));
          const errorMessageText = uniqueErrorMessages.length > 0 
            ? `\n\n오류 내용:\n${uniqueErrorMessages.join('\n')}`
            : '';
          
          if (totalSuccessCount === 0) {
            alert(`모든 이미지 재생성에 실패했습니다.${errorMessageText}`);
          } else {
            alert(`${totalSuccessCount}개의 이미지가 생성되었습니다. ${totalFailCount}개의 이미지 생성에 실패했습니다.${errorMessageText}`);
          }
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

  const handleSaveImages = async (processId?: string) => {
    if (selectedImageIds.size === 0 || !fileToView || !selectedCutId) {
      alert('선택된 이미지가 없습니다.');
      return;
    }

    // 공정 ID가 지정되지 않으면 원본 파일의 공정 사용
    const targetProcessId = processId || fileToView.process_id;

    const selectedImages = regeneratedImages.filter(
      img => selectedImageIds.has(img.id) && (img.fileId !== null || img.base64Data !== null) && img.mimeType !== null
    );
    
    if (selectedImages.length === 0) {
      alert('선택된 이미지를 찾을 수 없거나 아직 생성 중인 이미지입니다. 완성된 이미지를 선택해주세요.');
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
      // 선택된 이미지들을 순차적으로 저장
      for (let i = 0; i < selectedImages.length; i++) {
        const img = selectedImages[i];
        
        try {
          if (!img.mimeType) {
            throw new Error('이미지 MIME 타입이 없습니다.');
          }

          // 고유한 파일명 생성 (타임스탬프 + 인덱스 + 랜덤)
          const timestamp = Date.now();
          const randomStr = Math.random().toString(36).substring(2, 8);
          const extension = getExtensionFromMimeType(img.mimeType) || originalExtension || '.png';
          const newFileName = `regenerated-${baseFileName}-${timestamp}-${i}-${randomStr}${extension}`;

          // 파일이 있으면 DB에서 is_temp = false로 업데이트
          if (img.fileId) {
            console.log(`[이미지 저장] 임시 파일을 영구 파일로 전환 (인덱스 ${i}):`, img.fileId);
            
            const saveResponse = await fetch('/api/regenerate-image-save', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                fileId: img.fileId,
                processId: targetProcessId,
                fileName: newFileName,
                description: `AI 재생성: ${fileToView.file_name}`,
              }),
            });

            if (!saveResponse.ok) {
              const errorData = await saveResponse.json().catch(() => ({}));
              throw new Error(errorData.error || '이미지 저장에 실패했습니다.');
            }

            successCount++;
          } else if (img.base64Data) {
            // 하위 호환성: base64 데이터가 있으면 API 방식으로 업로드
            console.log(`[이미지 저장] base64 데이터로 API 업로드 (인덱스 ${i}, fallback)`);
            
            // API를 통해 업로드 (Supabase Storage 네트워크 이슈 회피)
            const response = await fetch('/api/files/upload', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                imageData: img.base64Data,
                mimeType: img.mimeType,
                fileName: newFileName,
                cutId: selectedCutId,
                processId: targetProcessId,
                description: `AI 재생성: ${fileToView.file_name}`,
                createdBy: currentUserId,
                sourceFileId: fileToView.id,
                prompt: img.prompt,
                styleId: img.styleId,
                styleKey: img.styleKey,
                styleName: img.styleName,
              }),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(errorData.error || '이미지 저장에 실패했습니다.');
            }

            successCount++;
          } else {
            throw new Error('이미지 데이터가 없습니다.');
          }
        } catch (error) {
          failCount++;
          const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
          errors.push(`이미지 ${i + 1}: ${errorMessage}`);
          console.error(`이미지 ${i + 1} 저장 실패:`, error);
          // 개별 파일 실패해도 계속 진행
        }
      }

      // 파일 목록 새로고침
      await onFilesReload();

      // 선택된 이미지 ID 초기화
      setSelectedImageIds(new Set());

      // 실패한 경우에만 메시지 표시
      if (failCount > 0 && successCount === 0) {
        alert(`모든 이미지 등록에 실패했습니다.\n\n오류:\n${errors.join('\n')}`);
      } else if (failCount > 0) {
        alert(`${failCount}개의 이미지 등록에 실패했습니다.\n\n실패한 이미지:\n${errors.join('\n')}`);
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
      // 지정되지 않은 경우 원본 이미지 파일 ID 사용
      let imageBase64: string | undefined = undefined;
      let imageMimeType: string | undefined = undefined;
      let fileId: string | undefined = undefined;

      if (targetImageId) {
        // 재생성할 이미지를 찾아서 base64 데이터 사용
        const targetImage = regeneratedImages.find(img => img.id === targetImageId);
        if (targetImage && targetImage.base64Data && targetImage.mimeType) {
          imageBase64 = targetImage.base64Data;
          imageMimeType = targetImage.mimeType;
          console.log('[이미지 재생성] 재생성된 이미지를 입력으로 사용 (base64):', targetImageId);
        } else {
          console.warn('[이미지 재생성] 재생성할 이미지를 찾을 수 없거나 아직 생성 중입니다, 원본 이미지 사용:', targetImageId);
          fileId = fileToView.id;
        }
      } else {
        // 원본 이미지 파일 ID 사용
        fileId = fileToView.id;
      }

      const requestBody: Record<string, unknown> = {
        stylePrompt: prompt,
        index: 0,
        apiProvider: apiProvider,
      };

      if (imageBase64) {
        // base64 데이터가 있는 경우 (메모리에만 있는 경우)
        requestBody.imageBase64 = imageBase64;
        requestBody.imageMimeType = imageMimeType;
      } else if (fileId) {
        // 파일 ID 사용
        requestBody.fileId = fileId;
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
        prompt: prompt, // 실제 사용된 프롬프트
        originalPrompt: prompt, // 원본 프롬프트 저장
        selected: false,
        fileId: null,
        filePath: null,
        fileUrl: null,
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

