import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SEEDREAM_API_KEY = process.env.SEEDREAM_API_KEY;
// ByteDance ARK API 설정 (공식 REST API 샘플 기준)
const SEEDREAM_API_BASE_URL = process.env.SEEDREAM_API_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3';
const SEEDREAM_API_ENDPOINT = `${SEEDREAM_API_BASE_URL}/images/generations`; // 복수형!

// Seedream API 타임아웃 설정 (밀리초)
const SEEDREAM_API_TIMEOUT = 60000; // 60초

// 재시도 가능한 네트워크 에러 코드 목록
const RETRYABLE_ERROR_CODES = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN'];

/**
 * 네트워크 에러가 재시도 가능한지 확인합니다.
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // TypeError: terminated (ECONNRESET 포함)
    if (error.message === 'terminated' || error.message.includes('ECONNRESET')) {
      return true;
    }
    // cause에 에러 코드가 있는 경우
    if (error.cause && typeof error.cause === 'object' && 'code' in error.cause) {
      const code = error.cause.code as string;
      return RETRYABLE_ERROR_CODES.includes(code);
    }
  }
  return false;
}

/**
 * 지연 시간을 반환합니다 (exponential backoff).
 */
function getRetryDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 10000); // 최대 10초
}

/**
 * 타임아웃이 설정된 fetch 요청을 수행합니다.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number = SEEDREAM_API_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

// Gemini API에서 지원하는 이미지 비율 목록
const GEMINI_ASPECT_RATIOS = [
  '21:9', '16:9', '4:3', '3:2', // 가로형
  '1:1', // 정사각형
  '9:16', '3:4', '2:3', // 세로형
  '5:4', '4:5', // 유연한 비율
] as const;

// Seedream API에서 지원하는 이미지 비율 목록
const SEEDREAM_ASPECT_RATIOS = [
  '21:9', '16:9', '4:3', '3:2', // 가로형
  '1:1', // 정사각형
  '9:16', '3:4', '2:3', // 세로형
] as const;

/**
 * 원본 이미지의 비율을 계산하고, 지원되는 비율 중 가장 가까운 것을 선택합니다.
 * @param width 원본 이미지 너비
 * @param height 원본 이미지 높이
 * @param provider API 제공자 ('gemini' | 'seedream')
 * @returns 가장 가까운 지원 비율 (예: "16:9")
 */
function getClosestAspectRatio(width: number, height: number, provider: 'gemini' | 'seedream'): string {
  const originalRatio = width / height;
  const supportedRatios = provider === 'gemini' ? GEMINI_ASPECT_RATIOS : SEEDREAM_ASPECT_RATIOS;
  
  let closestRatio = '1:1';
  let minDifference = Infinity;
  
  for (const ratio of supportedRatios) {
    const [w, h] = ratio.split(':').map(Number);
    const ratioValue = w / h;
    const difference = Math.abs(originalRatio - ratioValue);
    
    if (difference < minDifference) {
      minDifference = difference;
      closestRatio = ratio;
    }
  }
  
  return closestRatio;
}

/**
 * Seedream API용 size 파라미터를 계산합니다.
 * ByteDance ARK API는 aspect_ratio 파라미터가 없고, size 파라미터에 직접 픽셀 크기를 지정합니다.
 * 원본 이미지 비율을 유지하면서 유효 범위 [1280x720, 4096x4096] 내에서 적절한 크기를 계산합니다.
 * @param width 원본 이미지 너비
 * @param height 원본 이미지 높이
 * @returns size 파라미터 값 (예: "2048x1152" 또는 "2K")
 */
function calculateSeedreamSize(width: number, height: number): string {
  const originalRatio = width / height;
  
  // 2K 해상도 기준으로 비율 유지하면서 크기 계산
  // 2K는 일반적으로 2048x2048이지만, 비율에 맞춰 조정
  const baseSize = 2048;
  
  let targetWidth: number;
  let targetHeight: number;
  
  if (originalRatio >= 1) {
    // 가로형 또는 정사각형
    targetWidth = baseSize;
    targetHeight = Math.round(baseSize / originalRatio);
  } else {
    // 세로형
    targetHeight = baseSize;
    targetWidth = Math.round(baseSize * originalRatio);
  }
  
  // 유효 범위 체크 및 조정 [1280x720, 4096x4096]
  const minWidth = 1280;
  const minHeight = 720;
  const maxWidth = 4096;
  const maxHeight = 4096;
  
  // 최소 크기 보장
  if (targetWidth < minWidth) {
    targetWidth = minWidth;
    targetHeight = Math.round(minWidth / originalRatio);
  }
  if (targetHeight < minHeight) {
    targetHeight = minHeight;
    targetWidth = Math.round(minHeight * originalRatio);
  }
  
  // 최대 크기 제한
  if (targetWidth > maxWidth) {
    targetWidth = maxWidth;
    targetHeight = Math.round(maxWidth / originalRatio);
  }
  if (targetHeight > maxHeight) {
    targetHeight = maxHeight;
    targetWidth = Math.round(maxHeight * originalRatio);
  }
  
  // 8의 배수로 반올림 (일반적인 이미지 처리 최적화)
  targetWidth = Math.round(targetWidth / 8) * 8;
  targetHeight = Math.round(targetHeight / 8) * 8;
  
  return `${targetWidth}x${targetHeight}`;
}

interface RegenerateImageRequest {
  imageUrl?: string; // 이미지 URL (imageBase64가 없을 때 사용)
  imageBase64?: string; // base64 인코딩된 이미지 데이터 (우선 사용)
  imageMimeType?: string; // base64 이미지의 MIME 타입
  stylePrompt: string;
  index?: number; // 이미지 생성 순서 (0부터 시작)
  apiProvider?: 'gemini' | 'seedream' | 'auto'; // API 제공자 선택
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[이미지 재생성] 재생성 요청 시작');

  try {
    const body: RegenerateImageRequest = await request.json();
    const { imageUrl, imageBase64: requestImageBase64, imageMimeType: requestMimeType, stylePrompt, index = 0, apiProvider = 'auto' } = body;

    // API 제공자 결정
    let useSeedream: boolean;
    if (apiProvider === 'seedream') {
      useSeedream = true;
    } else if (apiProvider === 'gemini') {
      useSeedream = false;
    } else {
      // auto: 홀수 인덱스는 Gemini, 짝수 인덱스는 Seedream 사용
      // 인덱스 0(짝수) -> Seedream, 인덱스 1(홀수) -> Gemini, 인덱스 2(짝수) -> Seedream, ...
      useSeedream = index % 2 === 0;
    }

    console.log('[이미지 재생성] 요청 파라미터:', {
      hasImageBase64: !!requestImageBase64,
      imageUrl: imageUrl || '없음',
      stylePrompt: stylePrompt.substring(0, 50) + '...',
      index,
      provider: useSeedream ? 'Seedream' : 'Gemini'
    });

    if (!requestImageBase64 && !imageUrl) {
      console.error('[이미지 재생성] 이미지 URL 또는 base64 데이터가 없음');
      return NextResponse.json(
        { error: '이미지 URL 또는 base64 데이터가 필요합니다.' },
        { status: 400 }
      );
    }

    if (!stylePrompt) {
      console.error('[이미지 재생성] 스타일 프롬프트가 없음');
      return NextResponse.json(
        { error: '스타일 프롬프트가 필요합니다.' },
        { status: 400 }
      );
    }

    let imageBase64: string;
    let mimeType: string;
    let imageSize: number;
    let imageBuffer: Buffer;

    // base64 데이터가 있으면 우선 사용, 없으면 URL에서 다운로드
    if (requestImageBase64) {
      console.log('[이미지 재생성] base64 데이터 사용');
      imageBase64 = requestImageBase64;
      mimeType = requestMimeType || 'image/png';
      // base64를 Buffer로 변환 (메타데이터 추출용)
      imageBuffer = Buffer.from(requestImageBase64, 'base64');
      imageSize = imageBuffer.length;
    } else {
      // 이미지 URL에서 이미지 데이터 가져오기
      console.log('[이미지 재생성] 이미지 다운로드 시작...');
      const imageResponse = await fetch(imageUrl!);

      console.log('[이미지 재생성] 이미지 다운로드 응답:', {
        status: imageResponse.status,
        statusText: imageResponse.statusText,
        url: imageUrl
      });

      if (!imageResponse.ok) {
        const errorText = await imageResponse.text().catch(() => '응답 본문을 읽을 수 없음');
        console.error('[이미지 재생성] 이미지 다운로드 실패:', {
          status: imageResponse.status,
          statusText: imageResponse.statusText,
          errorText,
          url: imageUrl
        });
        return NextResponse.json(
          {
            error: '이미지를 가져올 수 없습니다.',
            details: {
              status: imageResponse.status,
              statusText: imageResponse.statusText,
              url: imageUrl
            }
          },
          { status: 400 }
        );
      }

      const arrayBuffer = await imageResponse.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
      imageSize = imageBuffer.length;
      imageBase64 = imageBuffer.toString('base64');
      mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
    }

    // 원본 이미지의 크기 가져오기 (비율 계산용)
    let originalWidth = 0;
    let originalHeight = 0;
    let aspectRatio: string | undefined = undefined;
    let seedreamSize: string | undefined = undefined;
    
    try {
      const imageMetadata = await sharp(Buffer.from(imageBuffer)).metadata();
      if (imageMetadata.width && imageMetadata.height) {
        originalWidth = imageMetadata.width;
        originalHeight = imageMetadata.height;
        
        if (useSeedream) {
          // Seedream API: size 파라미터에 원본 비율을 유지하는 크기 계산
          seedreamSize = calculateSeedreamSize(originalWidth, originalHeight);
          console.log('[이미지 재생성] 원본 이미지 크기 및 Seedream size:', {
            width: originalWidth,
            height: originalHeight,
            originalRatio: `${originalWidth}:${originalHeight}`,
            calculatedSize: seedreamSize,
            provider: 'seedream'
          });
        } else {
          // Gemini API: aspect_ratio 파라미터 사용
          aspectRatio = getClosestAspectRatio(originalWidth, originalHeight, 'gemini');
          console.log('[이미지 재생성] 원본 이미지 크기 및 Gemini aspectRatio:', {
            width: originalWidth,
            height: originalHeight,
            originalRatio: `${originalWidth}:${originalHeight}`,
            selectedAspectRatio: aspectRatio,
            provider: 'gemini'
          });
        }
      }
    } catch (error) {
      console.warn('[이미지 재생성] 이미지 메타데이터 가져오기 실패:', error);
      // 메타데이터를 가져오지 못해도 계속 진행 (기본값 사용)
    }

    console.log('[이미지 재생성] 이미지 다운로드 완료:', {
      size: imageSize,
      mimeType,
      base64Length: imageBase64.length,
      aspectRatio: aspectRatio || '미지정',
      seedreamSize: seedreamSize || '미지정'
    });

    let generatedImageData: string | null = null;
    let generatedImageMimeType: string | null = null;

    if (useSeedream) {
      // Seedream API 호출
      if (!SEEDREAM_API_KEY) {
        console.error('[이미지 재생성] SEEDREAM_API_KEY가 설정되지 않음');
        return NextResponse.json(
          { error: 'SEEDREAM_API_KEY가 설정되지 않았습니다.' },
          { status: 500 }
        );
      }

      console.log('[이미지 재생성] Seedream API 호출 시작...');
      const seedreamRequestStart = Date.now();

      // Seedream API에 전달할 이미지 (base64인 경우 data URL로 변환)
      const seedreamImageInput = requestImageBase64 
        ? `data:${mimeType};base64,${requestImageBase64}`
        : imageUrl!;

      // Seedream API 요청 본문 구성
      // ByteDance ARK API 문서에 따르면:
      // - aspect_ratio 파라미터는 없음
      // - size 파라미터에 직접 픽셀 크기 지정 (예: "2048x2048") 또는 프리셋 ("1K", "2K", "4K")
      // - 유효 범위: [1280x720, 4096x4096]
      // - 비율 범위: [1/16, 16]
      const seedreamRequestBody: Record<string, unknown> = {
        model: 'seedream-4-0-250828',
        prompt: stylePrompt,
        image: [seedreamImageInput], // 이미지 편집을 위한 이미지 (URL 또는 data URL)
        sequential_image_generation: 'disabled',
        response_format: 'url',
        size: seedreamSize || '2K', // 원본 비율을 유지하는 크기 또는 기본값
        stream: false,
        watermark: true,
      };

      if (seedreamSize) {
        console.log('[이미지 재생성] Seedream API에 size 설정:', seedreamSize);
      }

      // 재시도 로직
      const maxRetries = 3;
      let lastError: unknown = null;
      let seedreamResponse: Response | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            const delay = getRetryDelay(attempt - 1);
            console.log(`[이미지 재생성] Seedream API 재시도 ${attempt}/${maxRetries} (${delay}ms 대기 후)...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }

          console.log('[이미지 재생성] Seedream API 호출:', {
            endpoint: SEEDREAM_API_ENDPOINT,
            imageInput: requestImageBase64 ? 'base64 data URL' : imageUrl,
            promptLength: stylePrompt.length,
            attempt: attempt + 1,
            maxRetries: maxRetries + 1,
          });

          seedreamResponse = await fetchWithTimeout(
            SEEDREAM_API_ENDPOINT,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SEEDREAM_API_KEY}`,
              },
              body: JSON.stringify(seedreamRequestBody),
            },
            SEEDREAM_API_TIMEOUT
          );

          // 성공적으로 응답을 받았으면 재시도 루프 종료
          break;
        } catch (error: unknown) {
          lastError = error;
          const isRetryable = isRetryableError(error);

          console.error(`[이미지 재생성] Seedream API 호출 실패 (시도 ${attempt + 1}/${maxRetries + 1}):`, {
            error: error instanceof Error ? error.message : String(error),
            isRetryable,
            willRetry: isRetryable && attempt < maxRetries,
          });

          // 재시도 불가능한 에러이거나 최대 재시도 횟수에 도달한 경우
          if (!isRetryable || attempt >= maxRetries) {
            throw error;
          }
          // 재시도 가능한 에러인 경우 루프 계속
        }
      }

      if (!seedreamResponse) {
        throw lastError || new Error('Seedream API 응답을 받을 수 없습니다.');
      }

      if (!seedreamResponse.ok) {
        const errorText = await seedreamResponse.text().catch(() => '응답 본문을 읽을 수 없음');
        console.error('[이미지 재생성] Seedream API 오류:', {
          status: seedreamResponse.status,
          statusText: seedreamResponse.statusText,
          errorText,
        });
        throw new Error(`Seedream API 오류: ${seedreamResponse.status} ${seedreamResponse.statusText}. ${errorText}`);
      }

      const seedreamData = await seedreamResponse.json();
      console.log('[이미지 재생성] Seedream API 응답:', {
        hasData: !!seedreamData,
        keys: Object.keys(seedreamData || {}),
        responseStructure: seedreamData,
      });

      // 응답 형식: Java SDK 샘플 기준 imagesResponse.getData().get(0).getUrl()
      // 응답 구조: { data: [{ url: "..." }] } 또는 { data: [{ b64_json: "..." }] }
      if (seedreamData.data && Array.isArray(seedreamData.data) && seedreamData.data[0]) {
        const imageResult = seedreamData.data[0];
        
        if (imageResult.url) {
          // URL 형식 응답: 이미지 URL에서 다운로드
          console.log('[이미지 재생성] Seedream 이미지 URL 받음:', imageResult.url);
          const imageResponse = await fetch(imageResult.url);
          if (imageResponse.ok) {
            const imageBuffer = await imageResponse.arrayBuffer();
            generatedImageData = Buffer.from(imageBuffer).toString('base64');
            generatedImageMimeType = imageResponse.headers.get('content-type') || 'image/png';
          } else {
            console.error('[이미지 재생성] Seedream 이미지 URL 다운로드 실패:', {
              status: imageResponse.status,
              statusText: imageResponse.statusText,
            });
          }
        } else if (imageResult.b64_json) {
          // base64 형식 응답: 직접 사용
          console.log('[이미지 재생성] Seedream base64 이미지 받음');
          generatedImageData = imageResult.b64_json;
          generatedImageMimeType = 'image/png';
        } else {
          console.error('[이미지 재생성] Seedream 응답에 이미지 데이터 없음:', imageResult);
        }
      } else {
        console.error('[이미지 재생성] Seedream 응답 구조가 예상과 다름:', seedreamData);
      }

      const seedreamRequestTime = Date.now() - seedreamRequestStart;
      console.log('[이미지 재생성] Seedream API 응답:', {
        requestTime: `${seedreamRequestTime}ms`,
        hasImageData: !!generatedImageData,
        mimeType: generatedImageMimeType
      });

      if (!generatedImageData) {
        console.error('[이미지 재생성] Seedream에서 생성된 이미지 데이터가 없음');
        return NextResponse.json(
          {
            error: 'Seedream에서 생성된 이미지를 받을 수 없습니다.',
            details: seedreamData
          },
          { status: 500 }
        );
      }
    } else {
      // Gemini API 호출
      if (!GEMINI_API_KEY) {
        console.error('[이미지 재생성] GEMINI_API_KEY가 설정되지 않음');
        return NextResponse.json(
          { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
          { status: 500 }
        );
      }

      console.log('[이미지 재생성] Gemini API 호출 시작...');
      const geminiRequestStart = Date.now();

      const ai = new GoogleGenAI({
        apiKey: GEMINI_API_KEY,
      });

      // 원본 이미지 비율이 계산된 경우 aspectRatio 포함
      const imageConfig: { imageSize: string; aspectRatio?: string } = {
        imageSize: '1K',
      };
      
      if (aspectRatio) {
        imageConfig.aspectRatio = aspectRatio;
        console.log('[이미지 재생성] Gemini API에 aspectRatio 설정:', aspectRatio);
      }

      const config = {
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig,
        temperature: 1.0,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 32768,
      };

      const model = 'gemini-2.5-flash-image';

      const contents = [
        {
          role: 'user' as const,
          parts: [
            {
              text: stylePrompt,
            },
            {
              inlineData: {
                mimeType: mimeType,
                data: imageBase64,
              },
            },
          ],
        },
      ];

      const response = await ai.models.generateContentStream({
        model,
        config,
        contents,
      });

      // 스트림에서 모든 chunk 수집
      for await (const chunk of response) {
        if (!chunk.candidates || !chunk.candidates[0]?.content?.parts) {
          continue;
        }

        const parts = chunk.candidates[0].content.parts;
        
        for (const part of parts) {
          if (part.inlineData) {
            const inlineData = part.inlineData;
            if (inlineData.data && typeof inlineData.data === 'string' && inlineData.data.length > 0) {
              generatedImageData = inlineData.data;
              generatedImageMimeType = inlineData.mimeType || 'image/png';
              console.log('[이미지 재생성] 이미지 데이터를 찾음:', {
                dataLength: generatedImageData.length,
                mimeType: generatedImageMimeType
              });
              break;
            }
          }
        }

        // 이미지 데이터를 찾았으면 더 이상 처리하지 않음
        if (generatedImageData) {
          break;
        }
      }

      const geminiRequestTime = Date.now() - geminiRequestStart;
      console.log('[이미지 재생성] Gemini API 응답:', {
        requestTime: `${geminiRequestTime}ms`,
        hasImageData: !!generatedImageData,
        mimeType: generatedImageMimeType
      });

      if (!generatedImageData) {
        console.error('[이미지 재생성] 생성된 이미지 데이터가 없음');
        return NextResponse.json(
          {
            error: '생성된 이미지를 받을 수 없습니다.',
          },
          { status: 500 }
        );
      }
    }

    const totalTime = Date.now() - startTime;
    console.log('[이미지 재생성] 재생성 완료:', {
      totalTime: `${totalTime}ms`,
      mimeType: generatedImageMimeType
    });

    return NextResponse.json({
      imageData: generatedImageData,
      mimeType: generatedImageMimeType || 'image/png'
    });
  } catch (error: unknown) {
    const totalTime = Date.now() - startTime;
    console.error('[이미지 재생성] 예외 발생:', {
      error,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      totalTime: `${totalTime}ms`
    });
    const errorMessage = error instanceof Error ? error.message : '이미지 재생성 중 오류가 발생했습니다.';
    return NextResponse.json(
      {
        error: errorMessage,
        details: {
          errorType: error instanceof Error ? error.constructor.name : typeof error
        }
      },
      { status: 500 }
    );
  }
}

