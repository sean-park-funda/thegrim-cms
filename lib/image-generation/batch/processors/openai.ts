import { generateOpenAIImage } from '../../providers/openai';
import type { GeminiProcessParams, ProcessedImage, RegenerateImageRequest, ImageData } from '../types';
import { GEMINI_API_TIMEOUT } from '../constants';
import { getClosestAspectRatio } from '../image-utils';
import { saveGeneratedImage } from '../file-storage';
import { extractErrorDetails, categorizeError } from '../error-utils';

// OpenAI는 Gemini와 동일한 파라미터 형태(GeminiProcessParams)를 사용한다 (imageBase64 기반)
const OPENAI_CONCURRENT_LIMIT = 2;

/**
 * OpenAI(GPT Image)용 이미지 준비 (data URL 배열 구성)
 */
function prepareOpenAIImages(
  imageBase64: string,
  mimeType: string,
  refImages: ImageData[],
  characterSheetImages: ImageData[]
): string[] {
  const images: string[] = [`data:${mimeType};base64,${imageBase64}`];

  for (const refImage of refImages) {
    images.push(`data:${refImage.mimeType};base64,${refImage.base64}`);
  }
  for (const sheetImage of characterSheetImages) {
    images.push(`data:${sheetImage.mimeType};base64,${sheetImage.base64}`);
  }

  return images;
}

/**
 * 단일 OpenAI 요청 처리
 */
async function processSingleOpenAIRequest(
  req: RegenerateImageRequest,
  params: GeminiProcessParams,
  openaiImages: string[],
  aspectRatio: string
): Promise<ProcessedImage> {
  const requestStartTime = Date.now();
  const { sourceFile, createdBy, isPublic } = params;

  try {
    console.log(`[openai-processor] OpenAI API 호출 시작 (인덱스 ${req.index}):`, {
      prompt: req.stylePrompt.substring(0, 200) + (req.stylePrompt.length > 200 ? '...' : ''),
      promptLength: req.stylePrompt.length,
      aspectRatio,
    });

    const { base64: generatedImageData, mimeType: generatedImageMimeType } = await generateOpenAIImage({
      provider: 'openai',
      prompt: req.stylePrompt,
      images: openaiImages,
      aspectRatio,
      timeoutMs: GEMINI_API_TIMEOUT,
    });

    const requestTime = Date.now() - requestStartTime;
    console.log(`[openai-processor] OpenAI API 호출 완료 (인덱스 ${req.index}):`, {
      requestTime: `${requestTime}ms`,
      imageDataLength: generatedImageData.length,
      mimeType: generatedImageMimeType,
    });

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
    console.error(`[openai-processor] OpenAI API 호출 실패 (인덱스 ${req.index}):`, {
      errorDetails,
      requestIndex: req.index,
      promptLength: req.stylePrompt.length,
    });
    throw error;
  }
}

/**
 * OpenAI 배치 처리
 */
export async function processOpenAIRequests(params: GeminiProcessParams): Promise<ProcessedImage[]> {
  const { requests, imageBase64, mimeType, originalWidth, originalHeight, refImages, characterSheetImages } = params;

  if (requests.length === 0) {
    return [];
  }

  console.log(`[openai-processor] OpenAI 그룹 처리 시작 (${requests.length}개 요청)...`);

  const openaiImages = prepareOpenAIImages(imageBase64, mimeType, refImages, characterSheetImages);
  // gemini 비율 셋이 OpenAI가 매핑하는 비율과 가장 가까움 (16:9, 1:1, 9:16 등)
  const aspectRatio = getClosestAspectRatio(originalWidth, originalHeight, 'gemini');

  const openaiGroupResults: ProcessedImage[] = [];

  for (let i = 0; i < requests.length; i += OPENAI_CONCURRENT_LIMIT) {
    const chunk = requests.slice(i, i + OPENAI_CONCURRENT_LIMIT);
    console.log(`[openai-processor] OpenAI 청크 처리 시작 (${chunk.length}개, 인덱스 ${i}~${i + chunk.length - 1})...`);

    const openaiPromises = chunk.map((req) =>
      processSingleOpenAIRequest(req, params, openaiImages, aspectRatio)
    );

    const chunkResults = await Promise.allSettled(openaiPromises);
    chunkResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        openaiGroupResults.push(result.value);
      } else {
        console.error(`[openai-processor] OpenAI 요청 실패:`, result.reason);
        const failedRequest = chunk[index];
        if (failedRequest) {
          const errorInfo = categorizeError(result.reason, 'gemini');
          if (!errorInfo.code || !errorInfo.message) {
            errorInfo.code = 'OPENAI_ERROR';
            errorInfo.message = '이미지 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
          }
          openaiGroupResults.push({
            index: failedRequest.index,
            apiProvider: 'openai',
            stylePrompt: failedRequest.stylePrompt,
            ...(failedRequest.styleId && { styleId: failedRequest.styleId }),
            ...(failedRequest.styleKey && { styleKey: failedRequest.styleKey }),
            ...(failedRequest.styleName && { styleName: failedRequest.styleName }),
            error: {
              code: errorInfo.code,
              message: errorInfo.message,
            },
          });
        }
      }
    });
  }

  const successCount = openaiGroupResults.filter(r => !r.error).length;
  const failCount = openaiGroupResults.filter(r => !!r.error).length;
  console.log(`[openai-processor] OpenAI 그룹 처리 완료: ${successCount}개 성공, ${failCount}개 실패`);

  return openaiGroupResults;
}
