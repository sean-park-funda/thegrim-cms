import { generateGeminiImage } from '../../providers/gemini';
import type { GeminiContent, GeminiContentPart } from '../../types';
import type { GeminiProcessParams, ProcessedImage, RegenerateImageRequest } from '../types';
import { GEMINI_API_TIMEOUT, GEMINI_CONCURRENT_LIMIT, GEMINI_MODEL } from '../constants';
import { getClosestAspectRatio } from '../image-utils';
import { saveGeneratedImage } from '../file-storage';
import { extractErrorDetails, categorizeError } from '../error-utils';

/**
 * 단일 Gemini 요청 처리
 */
async function processSingleGeminiRequest(
  req: RegenerateImageRequest,
  params: GeminiProcessParams,
  config: {
    responseModalities: Array<'IMAGE' | 'TEXT'>;
    imageConfig: { imageSize: string; aspectRatio?: string };
    temperature: number;
    topP: number;
    topK: number;
    maxOutputTokens: number;
  }
): Promise<ProcessedImage> {
  const requestStartTime = Date.now();
  const {
    sourceFile,
    imageBase64,
    mimeType,
    refImages,
    characterSheetImages,
    createdBy,
  } = params;

  try {
    console.log(`[gemini-processor] Gemini API 호출 시작 (인덱스 ${req.index}):`, {
      prompt: req.stylePrompt.substring(0, 200) + (req.stylePrompt.length > 200 ? '...' : ''),
      promptLength: req.stylePrompt.length,
    });

    const contentParts: GeminiContentPart[] = [];

    if (characterSheetImages.length > 0) {
      // 캐릭터 바꾸기: 프롬프트 + 원본 이미지(1번) + 캐릭터시트 이미지들(2번 이후)
      contentParts.push({ text: req.stylePrompt });
      contentParts.push({
        inlineData: {
          mimeType: mimeType,
          data: imageBase64,
        },
      });
      for (const sheetImage of characterSheetImages) {
        contentParts.push({
          inlineData: {
            mimeType: sheetImage.mimeType,
            data: sheetImage.base64,
          },
        });
      }
    } else if (refImages.length > 0) {
      contentParts.push({ text: req.stylePrompt });
      contentParts.push({
        inlineData: {
          mimeType: mimeType,
          data: imageBase64,
        },
      });
      // 여러 레퍼런스 이미지 추가
      for (const refImage of refImages) {
        contentParts.push({
          inlineData: {
            mimeType: refImage.mimeType,
            data: refImage.base64,
          },
        });
      }
      console.log(`[gemini-processor] Gemini API 호출 (인덱스 ${req.index}): 레퍼런스 이미지 포함`, { count: refImages.length });
    } else {
      contentParts.push({ text: req.stylePrompt });
      contentParts.push({
        inlineData: {
          mimeType: mimeType,
          data: imageBase64,
        },
      });
    }

    const contents: GeminiContent[] = [{
      role: 'user',
      parts: contentParts,
    }];

    console.log(`[gemini-processor] Gemini API 호출 (인덱스 ${req.index}):`, {
      timeout: `${GEMINI_API_TIMEOUT}ms`,
    });

    const { base64: finalImageData, mimeType: finalMimeType } = await generateGeminiImage({
      provider: 'gemini',
      model: GEMINI_MODEL,
      contents,
      config,
      timeoutMs: GEMINI_API_TIMEOUT,
      retries: 3,
    });

    const requestTime = Date.now() - requestStartTime;
    console.log(`[gemini-processor] Gemini API 호출 완료 (인덱스 ${req.index}):`, {
      requestTime: `${requestTime}ms`,
      imageDataLength: finalImageData.length,
      mimeType: finalMimeType,
    });

    // 파일 저장
    return await saveGeneratedImage(
      finalImageData,
      finalMimeType,
      sourceFile,
      req,
      createdBy
    );
  } catch (error: unknown) {
    const errorDetails = extractErrorDetails(error);
    const isTimeout = error instanceof Error && error.message.toLowerCase().includes('timeout');
    const errorType = isTimeout ? '타임아웃' : '일반 에러';

    console.error(`[gemini-processor] Gemini API 호출 실패 (인덱스 ${req.index}, ${errorType}):`, {
      errorDetails,
      requestIndex: req.index,
      promptLength: req.stylePrompt.length,
      promptPreview: req.stylePrompt.substring(0, 200) + (req.stylePrompt.length > 200 ? '...' : ''),
      errorType,
    });
    throw error;
  }
}

/**
 * Gemini 배치 처리
 */
export async function processGeminiRequests(params: GeminiProcessParams): Promise<ProcessedImage[]> {
  const { requests, originalWidth, originalHeight } = params;

  if (requests.length === 0) {
    return [];
  }

  console.log(`[gemini-processor] Gemini 그룹 처리 시작 (${requests.length}개 요청)...`);

  const aspectRatio = getClosestAspectRatio(originalWidth, originalHeight, 'gemini');
  console.log('[gemini-processor] Gemini aspectRatio 계산:', aspectRatio);

  const imageConfig: { imageSize: string; aspectRatio?: string } = {
    imageSize: '1K',
  };
  if (aspectRatio) {
    imageConfig.aspectRatio = aspectRatio;
  }

  const config = {
    responseModalities: ['IMAGE', 'TEXT'] as Array<'IMAGE' | 'TEXT'>,
    imageConfig,
    temperature: 1.0,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 32768,
  };

  const geminiGroupResults: ProcessedImage[] = [];

  // 청크 단위로 처리
  for (let i = 0; i < requests.length; i += GEMINI_CONCURRENT_LIMIT) {
    const chunk = requests.slice(i, i + GEMINI_CONCURRENT_LIMIT);
    console.log(`[gemini-processor] Gemini 청크 처리 시작 (${chunk.length}개, 인덱스 ${i}~${i + chunk.length - 1})...`);

    const geminiPromises = chunk.map((req) =>
      processSingleGeminiRequest(req, params, config)
    );

    const chunkResults = await Promise.allSettled(geminiPromises);
    chunkResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        geminiGroupResults.push(result.value);
      } else {
        console.error(`[gemini-processor] Gemini 요청 실패:`, result.reason);
        // 실패한 요청도 결과에 포함 (에러 정보와 함께)
        const failedRequest = chunk[index];
        if (failedRequest) {
          const errorInfo = categorizeError(result.reason, 'gemini');
          if (!errorInfo.code || !errorInfo.message) {
            console.error(`[gemini-processor] categorizeError 반환값이 유효하지 않음 (인덱스 ${failedRequest.index}):`, errorInfo);
            errorInfo.code = 'GEMINI_ERROR';
            errorInfo.message = '이미지 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
          }
          const errorResult: ProcessedImage = {
            index: failedRequest.index,
            apiProvider: 'gemini',
            stylePrompt: failedRequest.stylePrompt,
            ...(failedRequest.styleId && { styleId: failedRequest.styleId }),
            ...(failedRequest.styleKey && { styleKey: failedRequest.styleKey }),
            ...(failedRequest.styleName && { styleName: failedRequest.styleName }),
            error: {
              code: errorInfo.code,
              message: errorInfo.message,
            },
          };
          console.log(`[gemini-processor] Gemini 에러 결과 생성 (인덱스 ${failedRequest.index}):`, {
            errorCode: errorResult.error?.code,
            errorMessage: errorResult.error?.message,
          });
          geminiGroupResults.push(errorResult);
        }
      }
    });
  }

  const geminiSuccessCount = geminiGroupResults.filter(r => !r.error).length;
  const geminiFailCount = geminiGroupResults.filter(r => !!r.error).length;
  console.log(`[gemini-processor] Gemini 그룹 처리 완료: ${geminiSuccessCount}개 성공, ${geminiFailCount}개 실패`);

  return geminiGroupResults;
}





