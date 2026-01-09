import { GoogleGenAI } from '@google/genai';
import type { GenerateImageResult, GeminiRequest, GeminiRequestConfig } from '../types';
import { isRetryableNetworkError, retryAsync, withTimeout } from '../utils';

const DEFAULT_GEMINI_MODEL = 'gemini-3-pro-image-preview';
const DEFAULT_GEMINI_TIMEOUT = 120000;

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
  };
}

async function extractInlineImage(
  response: AsyncIterable<any>,
  timeoutMs: number
): Promise<{ base64: string; mimeType: string }> {
  let base64: string | null = null;
  let mimeType: string | null = null;

  await withTimeout(
    (async () => {
      for await (const chunk of response) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (!parts) continue;

        for (const part of parts) {
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

  if (!base64 || !mimeType) {
    throw new Error('Gemini 응답에서 이미지 데이터를 찾지 못했습니다.');
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

  const { base64, mimeType } = await retryAsync(
    async (attempt) => {
      if (attempt > 0) {
        console.log(`[image-generation][gemini] retry ${attempt}/${retries}`);
      }

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
    },
    retries,
    isRetryableGeminiError
  );

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








