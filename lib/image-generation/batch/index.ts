import type {
  RegenerateImageBatchRequest,
  RegenerateImageBatchResponse,
  RegenerateImageRequest,
  ProcessedImage,
  GeminiProcessParams,
  SeedreamProcessParams,
} from './types';
import { loadSourceFile, loadReferenceFiles, downloadImages } from './data-loader';
import { processGeminiRequests } from './processors/gemini';
import { processSeedreamRequests } from './processors/seedream';

// 타입 및 유틸리티 재내보내기
export * from './types';
export * from './constants';
export { extractErrorDetails, categorizeError } from './error-utils';
export {
  getClosestAspectRatio,
  resizeImageIfNeeded,
  calculateSeedreamSize,
  getExtensionFromMimeType,
} from './image-utils';
export { loadSourceFile, loadReferenceFiles, loadCharacterSheets, downloadImages } from './data-loader';
export { saveTempFile, saveGeneratedImage } from './file-storage';
export { processGeminiRequests } from './processors/gemini';
export { processSeedreamRequests } from './processors/seedream';

/**
 * 이미지 배치 재생성 처리
 *
 * 1. 소스 파일 및 레퍼런스 파일 정보 조회
 * 2. 이미지 다운로드 (원본 + 레퍼런스 + 캐릭터시트)
 * 3. Provider별 그룹화 (Gemini / Seedream)
 * 4. 병렬 처리
 * 5. 결과 병합
 */
export async function processImageBatch(
  request: RegenerateImageBatchRequest
): Promise<RegenerateImageBatchResponse> {
  const startTime = Date.now();
  const { fileId, requests, characterSheets, createdBy } = request;

  // referenceFileIds가 있으면 사용, 없으면 referenceFileId를 배열로 변환 (하위 호환성)
  const finalReferenceFileIds = request.referenceFileIds ||
    (request.referenceFileId ? [request.referenceFileId] : undefined);

  console.log('[batch] 배치 재생성 요청 시작:', {
    fileId,
    referenceFileIds: finalReferenceFileIds || '없음',
    referenceFileIdsCount: finalReferenceFileIds?.length || 0,
    requestCount: requests.length,
    hasCharacterSheets: !!(characterSheets && characterSheets.length > 0),
    createdBy: createdBy || '없음 (원본 파일 생성자 사용)',
  });

  // apiProvider가 비어있는 요청에 대해 기본값 설정 (전역 기본: Seedream)
  const defaultProvider: 'gemini' | 'seedream' = 'seedream';
  const normalizedRequests: RegenerateImageRequest[] = requests.map(req => ({
    ...req,
    apiProvider: req.apiProvider || defaultProvider,
  }));

  // 1. 소스 파일 정보 조회
  const sourceFile = await loadSourceFile(fileId);

  // 2. 레퍼런스 파일 정보 조회
  const referenceFiles = await loadReferenceFiles(finalReferenceFileIds || []);

  // 3. 이미지 다운로드 (원본 + 레퍼런스 + 캐릭터시트)
  const downloadedImages = await downloadImages(sourceFile, referenceFiles, characterSheets);

  // 4. Provider별로 그룹화
  const geminiRequests = normalizedRequests.filter(r => r.apiProvider === 'gemini');
  const seedreamRequests = normalizedRequests.filter(r => r.apiProvider === 'seedream');

  console.log('[batch] Provider별 그룹화 완료:', {
    geminiCount: geminiRequests.length,
    seedreamCount: seedreamRequests.length,
    totalCount: normalizedRequests.length,
  });

  // 5. 공통 파라미터 준비
  const geminiParams: GeminiProcessParams = {
    requests: geminiRequests,
    sourceFile,
    imageBase64: downloadedImages.imageBase64,
    mimeType: downloadedImages.mimeType,
    originalWidth: downloadedImages.originalWidth,
    originalHeight: downloadedImages.originalHeight,
    refImages: downloadedImages.refImages,
    characterSheetImages: downloadedImages.characterSheetImages,
    createdBy,
  };

  const seedreamParams: SeedreamProcessParams = {
    requests: seedreamRequests,
    sourceFile,
    imageBuffer: downloadedImages.imageBuffer,
    imageBase64: downloadedImages.imageBase64,
    mimeType: downloadedImages.mimeType,
    originalWidth: downloadedImages.originalWidth,
    originalHeight: downloadedImages.originalHeight,
    refImages: downloadedImages.refImages,
    characterSheetImages: downloadedImages.characterSheetImages,
    createdBy,
  };

  // 6. Gemini와 Seedream 그룹을 병렬 처리
  console.log('[batch] Gemini와 Seedream 그룹 병렬 처리 시작...');
  const [geminiResults, seedreamResults] = await Promise.all([
    geminiRequests.length > 0
      ? processGeminiRequests(geminiParams).catch((error) => {
          console.error('[batch] Gemini 그룹 처리 실패:', error);
          return [] as ProcessedImage[];
        })
      : Promise.resolve([] as ProcessedImage[]),
    seedreamRequests.length > 0
      ? processSeedreamRequests(seedreamParams).catch((error) => {
          console.error('[batch] Seedream 그룹 처리 실패:', error);
          return [] as ProcessedImage[];
        })
      : Promise.resolve([] as ProcessedImage[]),
  ]);

  // 7. 결과 합치기
  const results: ProcessedImage[] = [...geminiResults, ...seedreamResults];

  const totalTime = Date.now() - startTime;
  const successCount = results.filter(r => !r.error).length;
  const failCount = results.filter(r => !!r.error).length;

  console.log('[batch] 배치 재생성 완료:', {
    totalTime: `${totalTime}ms`,
    totalRequests: normalizedRequests.length,
    successCount,
    failCount,
    geminiCount: geminiRequests.length,
    seedreamCount: seedreamRequests.length,
  });

  // 최종 결과 로깅 (에러 확인용)
  const resultsWithErrors = results.filter(r => r.error);
  if (resultsWithErrors.length > 0) {
    console.log('[batch] 에러가 포함된 결과:', JSON.stringify(resultsWithErrors, null, 2));
  }

  return {
    images: results,
  };
}
