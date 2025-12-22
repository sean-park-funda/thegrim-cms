import type { GenerateImageResult, SeedreamRequest } from '../types';
import { arrayBufferToBase64, fetchWithTimeout, isRetryableNetworkError, retryAsync } from '../utils';

const DEFAULT_SEEDREAM_MODEL = 'seedream-4-5-251128';
const DEFAULT_SEEDREAM_TIMEOUT = 60000;
const DEFAULT_SEEDREAM_ENDPOINT =
  `${process.env.SEEDREAM_API_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3'}/images/generations`;

function isRetryableSeedreamError(error: unknown): boolean {
  if (isRetryableNetworkError(error)) return true;
  if (error instanceof Error) {
    if (error.message.includes('Seedream API 오류')) return true;
  }
  return false;
}

async function downloadImage(url: string, timeoutMs: number) {
  const imageResponse = await fetchWithTimeout(url, { method: 'GET' }, timeoutMs);
  if (!imageResponse.ok) {
    throw new Error(`Seedream 이미지 다운로드 실패: ${imageResponse.status} ${imageResponse.statusText}`);
  }

  const buffer = await imageResponse.arrayBuffer();
  return {
    base64: arrayBufferToBase64(buffer),
    mimeType: imageResponse.headers.get('content-type') || 'image/png',
  };
}

export async function generateSeedreamImage(request: SeedreamRequest): Promise<GenerateImageResult> {
  const {
    apiKey = process.env.SEEDREAM_API_KEY,
    endpoint = DEFAULT_SEEDREAM_ENDPOINT,
    model = DEFAULT_SEEDREAM_MODEL,
    prompt,
    images,
    size = '2K',
    responseFormat = 'url',
    stream = false,
    watermark = true,
    timeoutMs = DEFAULT_SEEDREAM_TIMEOUT,
    retries = 1,
  } = request;

  if (!apiKey) {
    throw new Error('SEEDREAM_API_KEY가 설정되지 않았습니다.');
  }

  const startedAt = Date.now();

  console.log('[image-generation][seedream] start', {
    model,
    endpoint,
    timeoutMs,
    retries,
    images: images?.length ?? 0,
    size,
    responseFormat,
    stream,
    watermark,
    promptLength: prompt?.length ?? 0,
  });

  const { base64, mimeType, raw } = await retryAsync(
    async (attempt) => {
      if (attempt > 0) {
        console.log(`[image-generation][seedream] retry ${attempt}/${retries}`);
      }

      const body: Record<string, unknown> = {
        model,
        prompt,
        response_format: responseFormat,
        size,
        stream,
        watermark,
      };

      if (images && images.length > 0) {
        body.image = images;
      }

      const response = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        },
        timeoutMs
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Seedream API 오류: ${response.status} ${response.statusText}. ${errorText}`);
      }

      const seedreamData = await response.json().catch(() => null) as {
        data?: Array<{ url?: string; b64_json?: string }>;
      } | null;

      const imageResult = seedreamData?.data?.[0];
      if (!imageResult) {
        throw new Error('Seedream 응답에 이미지 데이터가 없습니다.');
      }

      if (imageResult.url) {
        const downloaded = await downloadImage(imageResult.url, timeoutMs);
        return { base64: downloaded.base64, mimeType: downloaded.mimeType, raw: seedreamData };
      }

      if (imageResult.b64_json) {
        return { base64: imageResult.b64_json, mimeType: 'image/png', raw: seedreamData };
      }

      throw new Error('Seedream 응답에 이미지 데이터가 없습니다.');
    },
    retries,
    isRetryableSeedreamError
  );

  console.log('[image-generation][seedream] success', {
    model,
    elapsedMs: Date.now() - startedAt,
    mimeType,
    base64Length: base64.length,
  });

  return {
    base64,
    mimeType,
    provider: 'seedream',
    model,
    elapsedMs: Date.now() - startedAt,
    raw,
  };
}





