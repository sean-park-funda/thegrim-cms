import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import type { GenerateImageResult, GeminiRequest, GeminiRequestConfig } from '../types';
import { isRetryableNetworkError, retryAsync, withTimeout } from '../utils';

const DEFAULT_GEMINI_MODEL = 'gemini-3-pro-image-preview';
const DEFAULT_GEMINI_TIMEOUT = 120000;

// 안전 설정 - 가능한 한 제한을 낮춤
// 참고: 아동 안전 등 일부 콘텐츠는 항상 차단됨
const SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.OFF,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.OFF,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.OFF,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.OFF,
  },
  {
    category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
    threshold: HarmBlockThreshold.OFF,
  },
];

function buildConfig(config?: GeminiRequestConfig): GeminiRequestConfig {
  const imageConfig = {
    imageSize: config?.imageConfig?.imageSize ?? '1K',
    ...(config?.imageConfig?.aspectRatio ? { aspectRatio: config.imageConfig.aspectRatio } : {}),
  };

  return {
    responseModalities: config?.responseModalities ?? ['IMAGE', 'TEXT'],
    imageConfig,
    temperature: config?.temperature ?? 1.0,
    topP: config?.topP ?? 0.95,
    topK: config?.topK ?? 40,
    maxOutputTokens: config?.maxOutputTokens ?? 32768,
    safetySettings: [...SAFETY_SETTINGS],
  };
}

async function extractInlineImage(
  response: AsyncIterable<any>,
  timeoutMs: number
): Promise<{ base64: string; mimeType: string }> {
  let base64: string | null = null;
  let mimeType: string | null = null;
  const allChunks: any[] = [];
  let textContent = '';
  let lastFinishReason: string | null = null;
  let lastSafetyRatings: any[] | null = null;

  try {
    await withTimeout(
      (async () => {
        for await (const chunk of response) {
          // 모든 chunk를 저장 (로깅용)
          allChunks.push(JSON.parse(JSON.stringify(chunk))); // 깊은 복사
          
          // finishReason과 safetyRatings 추적
          const candidate = chunk.candidates?.[0];
          if (candidate?.finishReason) {
            lastFinishReason = candidate.finishReason;
          }
          if (candidate?.safetyRatings) {
            lastSafetyRatings = candidate.safetyRatings;
          }
          
          const parts = candidate?.content?.parts;
          if (!parts) {
            // parts가 없는 경우에도 로깅
            console.log('[image-generation][gemini] chunk without parts:', {
              hasCandidates: !!chunk.candidates,
              candidatesLength: chunk.candidates?.length,
              firstCandidate: candidate ? {
                hasContent: !!candidate.content,
                hasParts: !!candidate.content?.parts,
                finishReason: candidate.finishReason,
                safetyRatings: candidate.safetyRatings,
              } : null,
            });
            continue;
          }

          for (const part of parts) {
            // 텍스트 내용 수집
            if (part.text) {
              textContent += part.text;
            }
            
            if (part.inlineData?.data) {
              base64 = part.inlineData.data as string;
              mimeType = part.inlineData.mimeType || 'image/png';
              break;
            }
          }

          if (base64) {
            break;
          }
        }
      })(),
      timeoutMs,
      `Gemini stream read timeout after ${timeoutMs}ms`
    );
  } catch (error) {
    console.error('[image-generation][gemini] extractInlineImage 에러:', {
      error: error instanceof Error ? error.message : String(error),
      chunksReceived: allChunks.length,
      textContent: textContent.substring(0, 500), // 처음 500자만
      lastChunk: allChunks[allChunks.length - 1],
      lastFinishReason,
      lastSafetyRatings,
    });
    throw error;
  }

  if (!base64 || !mimeType) {
    // 이미지 데이터를 찾지 못한 경우 전체 응답 로깅
    console.error('[image-generation][gemini] 이미지 데이터를 찾지 못함 - 전체 응답:', {
      chunksCount: allChunks.length,
      textContent: textContent || '(텍스트 없음)',
      lastFinishReason,
      lastSafetyRatings,
      chunks: allChunks.map((chunk, idx) => ({
        index: idx,
        hasCandidates: !!chunk.candidates,
        candidatesCount: chunk.candidates?.length ?? 0,
        firstCandidate: chunk.candidates?.[0] ? {
          finishReason: chunk.candidates[0].finishReason,
          safetyRatings: chunk.candidates[0].safetyRatings,
          hasContent: !!chunk.candidates[0].content,
          partsCount: chunk.candidates[0].content?.parts?.length ?? 0,
          parts: chunk.candidates[0].content?.parts?.map((p: any, pIdx: number) => ({
            index: pIdx,
            hasText: !!p.text,
            textLength: p.text?.length ?? 0,
            textPreview: p.text?.substring(0, 200) ?? null,
            hasInlineData: !!p.inlineData,
            inlineDataType: p.inlineData?.mimeType ?? null,
            inlineDataLength: p.inlineData?.data?.length ?? null,
          })) ?? [],
        } : null,
      })),
    });
    
    // finishReason에 따른 구체적인 에러 메시지
    let errorMessage = 'Gemini 응답에서 이미지 데이터를 찾지 못했습니다.';
    if (lastFinishReason) {
      const reasonMessages: Record<string, string> = {
        'IMAGE_SAFETY': '이미지 안전 정책 위반 (IMAGE_SAFETY)',
        'PROHIBITED_CONTENT': '금지된 콘텐츠 (PROHIBITED_CONTENT)',
        'SAFETY': '안전 정책 위반 (SAFETY)',
        'RECITATION': '저작권 관련 차단 (RECITATION)',
        'OTHER': '기타 이유로 차단됨 (OTHER)',
        'BLOCKLIST': '차단 목록 콘텐츠 (BLOCKLIST)',
        'SPII': '개인정보 관련 차단 (SPII)',
      };
      const reasonDesc = reasonMessages[lastFinishReason] || lastFinishReason;
      errorMessage = `이미지 생성 실패: ${reasonDesc}`;
    }
    
    throw new Error(errorMessage);
  }

  return { base64, mimeType };
}

function isRetryableGeminiError(error: unknown): boolean {
  if (isRetryableNetworkError(error)) return true;
  if (error instanceof Error) {
    if (error.message.includes('INTERNAL')) return true;
    if (error.message.includes('Request timeout')) return true;
  }
  return false;
}

export async function generateGeminiImage(request: GeminiRequest): Promise<GenerateImageResult> {
  const {
    apiKey = process.env.GEMINI_API_KEY,
    model = DEFAULT_GEMINI_MODEL,
    contents,
    config,
    timeoutMs = DEFAULT_GEMINI_TIMEOUT,
    retries = 2,
  } = request;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const mergedConfig = buildConfig(config);
  const startedAt = Date.now();

  console.log('[image-generation][gemini] start', {
    model,
    timeoutMs,
    retries,
    partsCount: contents?.[0]?.parts?.length ?? 0,
    modalities: mergedConfig.responseModalities,
    imageSize: mergedConfig.imageConfig?.imageSize,
    aspectRatio: mergedConfig.imageConfig?.aspectRatio,
  });

  let lastError: unknown = null;
  const { base64, mimeType } = await retryAsync(
    async (attempt) => {
      if (attempt > 0) {
        console.log(`[image-generation][gemini] retry ${attempt}/${retries}`);
      }

      try {
        const response = await withTimeout(
          ai.models.generateContentStream({
            model,
            config: mergedConfig,
            contents,
          }),
          timeoutMs,
          `Gemini API timeout after ${timeoutMs}ms`
        );

        const inline = await extractInlineImage(response, timeoutMs);
        return inline;
      } catch (error) {
        lastError = error;
        console.error(`[image-generation][gemini] attempt ${attempt + 1} failed:`, {
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          requestConfig: {
            model,
            modalities: mergedConfig.responseModalities,
            imageSize: mergedConfig.imageConfig?.imageSize,
            aspectRatio: mergedConfig.imageConfig?.aspectRatio,
            promptPreview: (contents?.[0]?.parts?.[0] as { text?: string })?.text?.substring(0, 300) ?? '(프롬프트 없음)',
            promptLength: (contents?.[0]?.parts?.[0] as { text?: string })?.text?.length ?? 0,
          },
        });
        throw error;
      }
    },
    retries,
    isRetryableGeminiError
  ).catch((error) => {
    console.error('[image-generation][gemini] 최종 실패:', {
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      lastError: lastError instanceof Error ? lastError.message : String(lastError),
      requestConfig: {
        model,
        modalities: mergedConfig.responseModalities,
        imageSize: mergedConfig.imageConfig?.imageSize,
        aspectRatio: mergedConfig.imageConfig?.aspectRatio,
        promptPreview: (contents?.[0]?.parts?.[0] as { text?: string })?.text?.substring(0, 500) ?? '(프롬프트 없음)',
        promptLength: (contents?.[0]?.parts?.[0] as { text?: string })?.text?.length ?? 0,
      },
    });
    throw error;
  });

  console.log('[image-generation][gemini] success', {
    model,
    elapsedMs: Date.now() - startedAt,
    mimeType,
    base64Length: base64.length,
  });

  return {
    base64,
    mimeType,
    provider: 'gemini',
    model,
    elapsedMs: Date.now() - startedAt,
  };
}








