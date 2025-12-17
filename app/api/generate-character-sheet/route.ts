import { NextRequest, NextResponse } from 'next/server';
import { generateGeminiImage, generateSeedreamImage } from '@/lib/image-generation';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SEEDREAM_API_KEY = process.env.SEEDREAM_API_KEY;

// 캐릭터 시트 생성 프롬프트
const CHARACTER_SHEET_PROMPT = `Use the uploaded image as the main reference for the character. Recreate the character exactly — same face, hair, clothing style, colors, and details.

CRITICAL BODY PROPORTIONS - MUST FOLLOW:
- If the reference image clearly shows the FULL body from head to toe, preserve those exact proportions.
- Otherwise (if legs are cropped, cut off, or not fully visible), you MUST draw the character with EXAGGERATED FASHION MODEL proportions:
  * Head-to-body ratio: 1:8 or 1:9 (very small head compared to body)
  * EXTREMELY LONG LEGS - legs should be at least 4-5 times the length of the torso
  * For female characters: voluptuous figure with large bust
  * Think of unrealistic manga/manhwa style with impossibly long legs like a runway model

Generate four full-body images on a solid background, arranged HORIZONTALLY in a single row (side by side from left to right):
1. Front view (leftmost)
2. Right side view (second from left)
3. Back view (third from left)
4. Three-quarter (3/4) view (rightmost)

The character must be fully visible from head to toe, in a neutral standing pose, without emotions or added elements.
Final output: a single combined image with all four views arranged horizontally in one row.`;

interface GenerateCharacterSheetRequest {
  imageBase64: string;
  imageMimeType: string;
  apiProvider?: 'gemini' | 'seedream' | 'auto';
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[캐릭터 시트 생성] 요청 시작');

  try {
    const body: GenerateCharacterSheetRequest = await request.json();
    const { imageBase64, imageMimeType, apiProvider = 'gemini' } = body;

    if (!imageBase64) {
      console.error('[캐릭터 시트 생성] 이미지 데이터가 없음');
      return NextResponse.json(
        { error: '이미지 데이터가 필요합니다.' },
        { status: 400 }
      );
    }

    // API Provider 결정 (auto면 gemini 사용)
    const useSeedream = apiProvider === 'seedream';
    console.log('[캐릭터 시트 생성] API Provider:', useSeedream ? 'Seedream' : 'Gemini');

    let base64: string;
    let mimeType: string;
    const apiRequestStart = Date.now();

    if (useSeedream) {
      // Seedream API 사용
      if (!SEEDREAM_API_KEY) {
        console.error('[캐릭터 시트 생성] SEEDREAM_API_KEY가 설정되지 않음');
        return NextResponse.json(
          { error: 'SEEDREAM_API_KEY가 설정되지 않았습니다.' },
          { status: 500 }
        );
      }

      console.log('[캐릭터 시트 생성] Seedream API 호출 시작...');
      
      const imageDataUrl = `data:${imageMimeType || 'image/png'};base64,${imageBase64}`;
      
      const result = await generateSeedreamImage({
        provider: 'seedream',
        model: 'seedream-4-5-251128',
        prompt: CHARACTER_SHEET_PROMPT,
        images: [imageDataUrl],
        responseFormat: 'url',
        size: '2944x1280', // 21:9 비율에 가깝게, 최소 3686400 픽셀 충족
        stream: false,
        watermark: true,
        timeoutMs: 120000,
        retries: 3,
      });
      
      base64 = result.base64;
      mimeType = result.mimeType;
    } else {
      // Gemini API 사용
      if (!GEMINI_API_KEY) {
        console.error('[캐릭터 시트 생성] GEMINI_API_KEY가 설정되지 않음');
        return NextResponse.json(
          { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
          { status: 500 }
        );
      }

      console.log('[캐릭터 시트 생성] Gemini API 호출 시작...');

      const result = await generateGeminiImage({
        provider: 'gemini',
        model: 'gemini-3-pro-image-preview',
        contents: [
          {
            role: 'user',
            parts: [
              { text: CHARACTER_SHEET_PROMPT },
              {
                inlineData: {
                  mimeType: imageMimeType || 'image/png',
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['IMAGE', 'TEXT'],
          imageConfig: { imageSize: '1K', aspectRatio: '21:9' },
          temperature: 1.0,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 32768,
        },
        retries: 3,
        timeoutMs: 120000,
      });
      
      base64 = result.base64;
      mimeType = result.mimeType;
    }

    const apiRequestTime = Date.now() - apiRequestStart;
    console.log('[캐릭터 시트 생성] API 응답:', {
      provider: useSeedream ? 'Seedream' : 'Gemini',
      requestTime: `${apiRequestTime}ms`,
      hasImageData: !!base64,
      mimeType,
    });

    const totalTime = Date.now() - startTime;
    console.log('[캐릭터 시트 생성] 생성 완료:', {
      totalTime: `${totalTime}ms`,
      mimeType,
    });

    return NextResponse.json({
      imageData: base64,
      mimeType: mimeType || 'image/png'
    });
  } catch (error: unknown) {
    const totalTime = Date.now() - startTime;
    console.error('[캐릭터 시트 생성] 예외 발생:', {
      error,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      totalTime: `${totalTime}ms`
    });
    const errorMessage = error instanceof Error ? error.message : '캐릭터 시트 생성 중 오류가 발생했습니다.';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

