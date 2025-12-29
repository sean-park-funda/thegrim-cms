import { generateSeedreamImage } from '../../providers/seedream';
import type { SeedreamProcessParams, ProcessedImage, RegenerateImageRequest, ImageData } from '../types';
import { SEEDREAM_API_TIMEOUT, SEEDREAM_CONCURRENT_LIMIT, SEEDREAM_MODEL } from '../constants';
import { calculateSeedreamSize, resizeImageWithCache } from '../image-utils';
import { saveGeneratedImage } from '../file-storage';
import { extractErrorDetails, categorizeError } from '../error-utils';

/**
 * Seedream용 이미지 준비 (리사이징 + Data URL 변환)
 */
export async function prepareSeedreamImages(
  imageBuffer: Buffer,
  imageBase64: string,
  mimeType: string,
  refImages: ImageData[],
  characterSheetImages: ImageData[]
): Promise<{ seedreamImages: string[]; seedreamSize: string }> {
  console.log('[seedream-processor] Seedream용 이미지 리사이징 준비 시작...');

  // 이미지 메타데이터 가져오기 (사이즈 계산용)
  const sharp = (await import('sharp')).default;
  const metadata = await sharp(imageBuffer).metadata();
  const originalWidth = metadata.width || 1920;
  const originalHeight = metadata.height || 1080;

  // 원본 이미지 리사이징
  const { resizeImageIfNeeded } = await import('../image-utils');
  const resizeResult = await resizeImageIfNeeded(imageBuffer);

  const seedreamImageBase64 = resizeResult.resized ? resizeResult.base64 : imageBase64;
  const seedreamMimeType = resizeResult.resized ? resizeResult.mimeType : mimeType;
  const seedreamImageInput = `data:${seedreamMimeType};base64,${seedreamImageBase64}`;

  const seedreamImages = [seedreamImageInput];

  // 레퍼런스 이미지 리사이징
  if (refImages.length > 0) {
    console.log('[seedream-processor] 레퍼런스 이미지 리사이징 시작 (Seedream용)...', { count: refImages.length });

    for (const refImage of refImages) {
      const refResizeResult = await resizeImageWithCache(refImage.base64, refImage.mimeType, 'base64');
      const finalRefBase64 = refResizeResult.resized ? refResizeResult.base64 : refImage.base64;
      const finalRefMimeType = refResizeResult.resized ? refResizeResult.mimeType : refImage.mimeType;
      const refDataUrl = `data:${finalRefMimeType};base64,${finalRefBase64}`;
      seedreamImages.push(refDataUrl);
    }

    console.log('[seedream-processor] Seedream API에 레퍼런스 이미지 포함', { count: refImages.length });
  }

  // 캐릭터시트 이미지 리사이징
  if (characterSheetImages.length > 0) {
    console.log('[seedream-processor] 캐릭터시트 이미지 리사이징 시작 (Seedream용)...', { count: characterSheetImages.length });

    for (const sheetImage of characterSheetImages) {
      const sheetResizeResult = await resizeImageWithCache(sheetImage.base64, sheetImage.mimeType, 'sheet');
      const finalSheetBase64 = sheetResizeResult.resized ? sheetResizeResult.base64 : sheetImage.base64;
      const finalSheetMimeType = sheetResizeResult.resized ? sheetResizeResult.mimeType : sheetImage.mimeType;
      const sheetDataUrl = `data:${finalSheetMimeType};base64,${finalSheetBase64}`;
      seedreamImages.push(sheetDataUrl);
    }

    console.log('[seedream-processor] Seedream API에 캐릭터시트 이미지 포함', { count: characterSheetImages.length });
  }

  const seedreamSize = calculateSeedreamSize(originalWidth, originalHeight);
  console.log('[seedream-processor] Seedream size 계산:', seedreamSize);

  return { seedreamImages, seedreamSize };
}

/**
 * 단일 Seedream 요청 처리
 */
async function processSingleSeedreamRequest(
  req: RegenerateImageRequest,
  params: SeedreamProcessParams,
  seedreamImages: string[],
  seedreamSize: string
): Promise<ProcessedImage> {
  const requestStartTime = Date.now();
  const { sourceFile, createdBy, isPublic } = params;

  try {
    console.log(`[seedream-processor] Seedream API 호출 시작 (인덱스 ${req.index}):`, {
      prompt: req.stylePrompt.substring(0, 200) + (req.stylePrompt.length > 200 ? '...' : ''),
      promptLength: req.stylePrompt.length,
    });

    const { base64: generatedImageData, mimeType: generatedImageMimeType } = await generateSeedreamImage({
      provider: 'seedream',
      model: SEEDREAM_MODEL,
      prompt: req.stylePrompt,
      images: seedreamImages,
      responseFormat: 'url',
      size: seedreamSize,
      stream: false,
      watermark: true,
      timeoutMs: SEEDREAM_API_TIMEOUT,
      retries: 3,
    });

    const requestTime = Date.now() - requestStartTime;
    console.log(`[seedream-processor] Seedream API 호출 완료 (인덱스 ${req.index}):`, {
      requestTime: `${requestTime}ms`,
      imageDataLength: generatedImageData.length,
      mimeType: generatedImageMimeType,
    });

    // 파일 저장
    return await saveGeneratedImage(
      generatedImageData,
      generatedImageMimeType,
      sourceFile,
      req,
      createdBy,
      isPublic
    );
  } catch (error: unknown) {
    const errorDetails = extractErrorDetails(error);
    console.error(`[seedream-processor] Seedream API 호출 실패 (인덱스 ${req.index}):`, {
      errorDetails,
      requestIndex: req.index,
      promptLength: req.stylePrompt.length,
      promptPreview: req.stylePrompt.substring(0, 200) + (req.stylePrompt.length > 200 ? '...' : ''),
    });
    throw error;
  }
}

/**
 * Seedream 배치 처리
 */
export async function processSeedreamRequests(params: SeedreamProcessParams): Promise<ProcessedImage[]> {
  const { requests, imageBuffer, imageBase64, mimeType, refImages, characterSheetImages } = params;

  if (requests.length === 0) {
    return [];
  }

  console.log(`[seedream-processor] Seedream 그룹 처리 시작 (${requests.length}개 요청)...`);

  // Seedream용 이미지 준비
  const { seedreamImages, seedreamSize } = await prepareSeedreamImages(
    imageBuffer,
    imageBase64,
    mimeType,
    refImages,
    characterSheetImages
  );

  const seedreamGroupResults: ProcessedImage[] = [];

  // 청크 단위로 처리
  for (let i = 0; i < requests.length; i += SEEDREAM_CONCURRENT_LIMIT) {
    const chunk = requests.slice(i, i + SEEDREAM_CONCURRENT_LIMIT);
    console.log(`[seedream-processor] Seedream 청크 처리 시작 (${chunk.length}개, 인덱스 ${i}~${i + chunk.length - 1})...`);

    const seedreamPromises = chunk.map((req) =>
      processSingleSeedreamRequest(req, params, seedreamImages, seedreamSize)
    );

    const chunkResults = await Promise.allSettled(seedreamPromises);
    chunkResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        seedreamGroupResults.push(result.value);
      } else {
        console.error(`[seedream-processor] Seedream 요청 실패:`, result.reason);
        // 실패한 요청도 결과에 포함 (에러 정보와 함께)
        const failedRequest = chunk[index];
        if (failedRequest) {
          const errorInfo = categorizeError(result.reason, 'seedream');
          if (!errorInfo.code || !errorInfo.message) {
            console.error(`[seedream-processor] categorizeError 반환값이 유효하지 않음 (인덱스 ${failedRequest.index}):`, errorInfo);
            errorInfo.code = 'SEEDREAM_ERROR';
            errorInfo.message = '이미지 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
          }
          const errorResult: ProcessedImage = {
            index: failedRequest.index,
            apiProvider: 'seedream',
            stylePrompt: failedRequest.stylePrompt,
            ...(failedRequest.styleId && { styleId: failedRequest.styleId }),
            ...(failedRequest.styleKey && { styleKey: failedRequest.styleKey }),
            ...(failedRequest.styleName && { styleName: failedRequest.styleName }),
            error: {
              code: errorInfo.code,
              message: errorInfo.message,
            },
          };
          console.log(`[seedream-processor] Seedream 에러 결과 생성 (인덱스 ${failedRequest.index}):`, {
            errorCode: errorResult.error?.code,
            errorMessage: errorResult.error?.message,
          });
          seedreamGroupResults.push(errorResult);
        }
      }
    });
  }

  const seedreamSuccessCount = seedreamGroupResults.filter(r => !r.error).length;
  const seedreamFailCount = seedreamGroupResults.filter(r => !!r.error).length;
  console.log(`[seedream-processor] Seedream 그룹 처리 완료: ${seedreamSuccessCount}개 성공, ${seedreamFailCount}개 실패`);

  return seedreamGroupResults;
}
